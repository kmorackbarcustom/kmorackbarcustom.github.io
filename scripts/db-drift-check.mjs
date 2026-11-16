#!/usr/bin/env node
// เช็ก drift ระหว่างฐานข้อมูลสด KMO-Booking กับ baseline ใน repo (อ่านอย่างเดียว)
//
//   node scripts/db-drift-check.mjs [--baseline <โฟลเดอร์>]   เทียบสดกับ baseline
//   node scripts/db-drift-check.mjs --write <โฟลเดอร์>         ดึงสดแล้วเขียน baseline ใหม่
//
// รหัสออก: 0 = ตรง · 1 = drift/baseline เสีย · 2 = เรียกสดไม่สำเร็จ · 3 = พบรูปแบบค่าลับในนิยาม (ไม่เขียนอะไร)
// ทุกคำขอ = Management API database/query + read_only:true · ไม่ดึง cron.job.command · ไม่ดึงแถวข้อมูลลูกค้า
// ไม่พิมพ์ token ไม่พิมพ์ตัวนิยามทั้งก้อน (พิมพ์แค่ชื่อ object + ชนิดความต่าง)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REF = "xfhpwxjywqgqefbncumm";
const TABLES = ["bookings", "holidays", "production_allocations", "orders"];
// ตัวที่ระบุชื่อเองในบรีฟ T1 (13 ตัวของสคริปต์ต้นแบบ + RPC สั่งซื้อ/สถานะ + ตัวที่ trigger เรียก)
const NAMED_FNS = [
  "get_booking_availability", "generate_job_id", "kmo_day_has_capacity", "kmo_allocate_forward", "kmo_allocate_backward",
  "kmo_today", "get_schedule_health", "get_upcoming_queue_density", "kmo_production_days", "kmo_daily_allocation_units",
  "kmo_order_effective_due", "rebuild_production_schedule", "update_order_status",
  "create_shopee_order", "create_customer_order", "kmo_insert_order_from_payload", "update_shopee_deadline",
  "notify_telegram_booking", "notify_telegram_order", "kmo_sync_customer_from_booking", "update_updated_at",
];
const FILES = ["functions.sql", "tables.sql", "policies-rls.sql", "triggers.sql", "cron-jobs.md"];
const MARK = /^-- ==== (.+) ====$/;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const WRITE = flag("--write");
const BASE = resolve(flag("--baseline") ?? WRITE ?? join(ROOT, "supabase/baseline/live-20261115"));

// ---------- token: รับจาก env อย่างเดียว ไม่พิมพ์ ----------
const TOK = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const MIN_BLOCKS = 10; // ถ้าดึงสดได้น้อยกว่านี้ = ผิดปกติ ไม่ใช่ "ตรง"
// ไม่ใช้ process.exit() (Node 24 บน Windows พังรหัส 0xC0000409 ถ้าออกทันทีหลัง HTTPS) · ตั้ง exitCode แล้วโยน Stop ให้ main() จบเอง
class Stop extends Error {}
const die = (code, msg) => { console.error(msg); process.exitCode = code; throw new Stop(msg); };

// ---------- รูปแบบค่าลับ ----------
const SECRET_RES = [
  [/AIza[0-9A-Za-z_\-]{20,}/, "AIza"], [/eyJ[0-9A-Za-z_\-]{15,}\.[0-9A-Za-z_\-]{10,}/, "JWT"], [/sbp_[0-9a-f]{20,}/, "sbp_"],
  [/sb_(secret|publishable)_[0-9A-Za-z_\-]{10,}/, "sb_key"], [/\b(sk|rk)_(live|test)_[0-9A-Za-z]{10,}/, "stripe"],
  [/Bearer\s+[A-Za-z0-9_\-.=]{20,}/, "Bearer-ค่าจริง"], [/\b\d{8,10}:[A-Za-z0-9_\-]{30,}/, "telegram-bot-token"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, "github"], [/[A-Za-z0-9+\/_\-=]{80,}/, "สตริงยาวผิดปกติ(>=80)"],
];
function secretHits(text) {
  const hits = [];
  text.split("\n").forEach((ln, i) => { for (const [re, tag] of SECRET_RES) if (re.test(ln)) hits.push(`${tag}@บรรทัด${i + 1}`); });
  return hits;
}

// ---------- เรียกสด (read_only) ----------
async function q(query) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let r;
    try {
      r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: "POST", headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, read_only: true }), signal: AbortSignal.timeout(45000),
      });
    } catch (e) { if (attempt === 2) die(2, `เรียกสดไม่สำเร็จ (${e.name})`); continue; }
    if (r.ok) { try { return JSON.parse(await r.text()); } catch { die(2, "สดตอบไม่ใช่ JSON"); } }
    await r.text().catch(() => {}); // ปิด response ให้เรียบร้อย (ไม่อ่าน/ไม่พิมพ์ body)
    if (r.status === 401 || r.status === 403) die(2, `เรียกสดไม่สำเร็จ HTTP ${r.status} (ไม่ยิงซ้ำ)`);
    if (attempt === 2) die(2, `เรียกสดไม่สำเร็จ HTTP ${r.status}`);
    await new Promise(s => setTimeout(s, 5000));
  }
}

const TLIST = `array[${TABLES.map(t => `'public.${t}'::regclass`).join(",")}]::oid[]`;
const Q_FN = `select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as secdef, p.provolatile::text as vol, coalesce(array_to_string(p.proconfig, ','), '') as cfg, coalesce(p.proacl::text, '') as acl,
  s.in_scope, case when s.in_scope then pg_get_functiondef(p.oid) end as def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join lateral (select (p.proname = any(array[${NAMED_FNS.map(f => `'${f}'`).join(",")}])
  or p.oid in (select tgfoid from pg_trigger where not tgisinternal and tgrelid = any(${TLIST}))
  or pg_get_functiondef(p.oid) ~* '\\m(${TABLES.join("|")})\\M') as in_scope) s
where n.nspname = 'public' and p.prokind in ('f','p')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1, 2`;
const Q_REST = `select 'column' as kind, c.relname as tbl, a.attname::text as name, a.attnum as ord,
  format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' NOT NULL' else '' end ||
  case when a.attgenerated <> '' then ' GENERATED ALWAYS AS (' || pg_get_expr(d.adbin, d.adrelid) || ') STORED'
       when a.attidentity <> '' then ' GENERATED ' || case a.attidentity when 'a' then 'ALWAYS' else 'BY DEFAULT' end || ' AS IDENTITY'
       when d.adbin is not null then ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) else '' end as body
  from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where c.oid = any(${TLIST})
union all select 'constraint', conrelid::regclass::text, conname::text, 0, pg_get_constraintdef(oid) from pg_constraint where conrelid = any(${TLIST})
union all select 'index', tablename::text, indexname::text, 0, indexdef from pg_indexes where schemaname = 'public' and tablename = any(array[${TABLES.map(t => `'${t}'`).join(",")}])
union all select 'rls', relname::text, '', 0, 'rls_enabled=' || relrowsecurity::text || ' force_rls=' || relforcerowsecurity::text || ' owner=' || pg_get_userbyid(relowner) || ' acl=' || coalesce(relacl::text, '') from pg_class where oid = any(${TLIST})
union all select 'policy', tablename::text, policyname::text, 0, 'permissive=' || permissive || ' cmd=' || cmd || ' roles=' || roles::text || E'\\nUSING: ' || coalesce(qual, '-') || E'\\nWITH CHECK: ' || coalesce(with_check, '-') from pg_policies where schemaname = 'public' and tablename = any(array[${TABLES.map(t => `'${t}'`).join(",")}])
union all select 'trigger', tgrelid::regclass::text, tgname::text, 0, pg_get_triggerdef(oid) || E'\\n-- enabled=' || tgenabled::text from pg_trigger where not tgisinternal and tgrelid = any(${TLIST})
order by 1, 2, 4, 3`;
const Q_CRON = `select jobname, schedule, active from cron.job order by jobname`; // ห้ามเลือก command (มี JWT)

// ---------- สร้างบล็อก ----------
const norm = s => String(s).replace(/\r\n?/g, "\n").split("\n").map(l => l.trimEnd()).join("\n").replace(/^\n+|\n+$/g, "");
const sha = s => createHash("sha256").update(s, "utf8").digest("hex");
const bare = t => t.replace(/^public\./, "");

async function fetchLive() {
  const [fn, rest, cron] = [await q(Q_FN), await q(Q_REST), await q(Q_CRON)];
  const blocks = new Map(); // key -> {file, body}
  const put = (key, file, body) => blocks.set(key, { file, body: norm(body) });
  const outOfScope = [];
  for (const f of fn) {
    const sig = `public.${f.proname}(${f.args})`;
    if (!f.in_scope) { outOfScope.push(sig); continue; }
    put(`function ${sig}`, "functions.sql",
      `-- owner=${f.owner} security_definer=${f.secdef} volatility=${f.vol} config=${f.cfg || "-"} acl=${f.acl || "-"}\n${f.def};`);
  }
  const cols = new Map();
  for (const r of rest) {
    const t = bare(r.tbl);
    if (r.kind === "column") cols.set(t, [...(cols.get(t) ?? []), `  ${r.name} ${r.body}`]);
    else if (r.kind === "constraint") put(`constraint public.${t} ${r.name}`, "tables.sql", `ALTER TABLE public.${t} ADD CONSTRAINT ${r.name} ${r.body};`);
    else if (r.kind === "index") put(`index public.${t} ${r.name}`, "tables.sql", `${r.body};`);
    else if (r.kind === "rls") put(`rls public.${t}`, "policies-rls.sql", `-- ${r.body}`);
    else if (r.kind === "policy") put(`policy public.${t} ${r.name}`, "policies-rls.sql", `-- ${r.name}: ${r.body.replace(/\n/g, "\n-- ")}`);
    else if (r.kind === "trigger") put(`trigger public.${t} ${r.name}`, "triggers.sql", `${r.body.replace(/\n-- enabled=/, ";\n-- enabled=")}`);
  }
  for (const [t, c] of cols) put(`columns public.${t}`, "tables.sql", `CREATE TABLE public.${t} (\n${c.join(",\n")}\n);`);
  for (const j of cron) put(`cron ${j.jobname}`, "cron-jobs.md", `schedule: ${j.schedule}\nactive: ${j.active}`);
  return { blocks, outOfScope };
}

// ---------- อ่าน baseline จากไฟล์ ----------
function parseBaseline(dir) {
  const blocks = new Map();
  for (const file of FILES) {
    const p = join(dir, file);
    if (!existsSync(p)) die(2, `baseline ไม่มีไฟล์ ${file} ใน ${dir}`);
    let key = null, buf = [];
    const flush = () => { if (key !== null) blocks.set(key, { file, body: norm(buf.join("\n")) }); };
    for (const line of readFileSync(p, "utf8").replace(/\r\n?/g, "\n").split("\n")) {
      const m = MARK.exec(line);
      if (m) { flush(); key = m[1]; buf = []; } else buf.push(line);
    }
    flush();
  }
  return blocks;
}

async function main() {
if (!TOK) die(2, "ไม่มี token ใน env SUPABASE_ACCESS_TOKEN (เรียกสดไม่ได้)");
const live = await fetchLive();
if (live.blocks.size < MIN_BLOCKS) die(2, `ดึงสดได้ ${live.blocks.size} บล็อก (< ${MIN_BLOCKS}) ผิดปกติ · ไม่เชื่อผล`);

// ---------- โหมดเขียน baseline ----------
if (WRITE) {
  for (const [key, b] of live.blocks) {
    const h = secretHits(b.body);
    if (h.length) die(3, `หยุด: พบรูปแบบค่าลับใน "${key}" (${h.join(", ")}) · ไม่เขียนไฟล์ · ไม่แสดงค่า`);
  }
  mkdirSync(BASE, { recursive: true });
  const keys = [...live.blocks.keys()].sort();
  const header = { "functions.sql": "-- baseline นิยาม function ฝั่งจอง+คิวผลิต (ดึงสดแบบ read-only)", "tables.sql": "-- baseline คอลัมน์/constraint/index ของ bookings, holidays, production_allocations, orders",
    "policies-rls.sql": "-- baseline สถานะ RLS + สิทธิ์ตาราง (acl) + policy ของ 4 ตาราง", "triggers.sql": "-- baseline trigger บน 4 ตาราง (pg_get_triggerdef)", "cron-jobs.md": "# cron job: ชื่อ + ตารางเวลา + active เท่านั้น (ไม่ดึง command เพราะมี JWT)" };
  const manifest = { project_ref: REF, generated_at: new Date().toISOString(), tables: TABLES, blocks: {}, out_of_scope_functions: live.outOfScope };
  for (const file of FILES) {
    let out = header[file] + "\n";
    for (const k of keys.filter(k => live.blocks.get(k).file === file)) {
      const b = live.blocks.get(k);
      out += `\n-- ==== ${k} ====\n${b.body}\n`;
      manifest.blocks[k] = { file, sha256: sha(b.body) };
    }
    writeFileSync(join(BASE, file), out);
  }
  const counts = {}; for (const k of keys) { const t = k.split(" ")[0]; counts[t] = (counts[t] ?? 0) + 1; }
  manifest.counts = counts;
  writeFileSync(join(BASE, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(BASE, "README.md"), `# baseline ฐานข้อมูลสด KMO-Booking (${manifest.generated_at.slice(0, 10)})

สำเนานิยามจริงของฝั่งจอง+คิวผลิต ดึงแบบอ่านอย่างเดียว (Management API \`read_only:true\`) ก่อนแก้อะไรทั้งสิ้น
ตาราง: ${TABLES.join(", ")} · project ref \`${REF}\`

- \`functions.sql\` function ใน schema public ที่อ้างถึง 4 ตารางนี้ / trigger เรียก / อยู่ในรายชื่อบรีฟ T1 (บรรทัดหัวบล็อก = owner, security definer, volatility, config, acl)
- \`tables.sql\` คอลัมน์ · constraint · index · \`policies-rls.sql\` RLS + acl ตาราง + policy · \`triggers.sql\` trigger
- \`cron-jobs.md\` ชื่อ+ตารางเวลา+active เท่านั้น (ไม่มี command)
- \`manifest.json\` sha256 ของแต่ละบล็อกหลัง normalize (ตัดช่องว่างท้ายบรรทัด)

เช็กว่าสดยังตรง baseline: \`node scripts/db-drift-check.mjs\` → 0 ตรง · 1 drift · 2 เรียกสดไม่ได้ · 3 พบค่าลับ (ต้องมี token ใน env \`SUPABASE_ACCESS_TOKEN\` · สคริปต์รับ token จาก env อย่างเดียว)

ไม่ครอบคลุม: สิทธิ์ระดับคอลัมน์ · view · sequence · ตารางอื่น (เช่น customers) · cron command · edge function

## function นอกขอบเขต (ลงชื่ออย่างเดียว ไม่ดึงนิยาม) — ${live.outOfScope.length} ตัว
${live.outOfScope.map(s => `- \`${s}\``).join("\n") || "- (ไม่มี)"}
`);
  console.log(`เขียน baseline แล้ว: ${BASE}`);
  console.log(`บล็อก ${keys.length} · ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")} · นอกขอบเขต ${live.outOfScope.length}`);
  return;
}

// ---------- โหมดเทียบ ----------
const base = parseBaseline(BASE);
const manPath = join(BASE, "manifest.json");
if (!existsSync(manPath)) die(2, "baseline ไม่มี manifest.json");
let manifest = null;
try { manifest = JSON.parse(readFileSync(manPath, "utf8")); } catch { /* ตรวจรูปทรงด้านล่าง */ }
if (!manifest || typeof manifest.blocks !== "object" || manifest.blocks === null || Array.isArray(manifest.blocks)
  || Object.values(manifest.blocks).some(v => typeof v?.sha256 !== "string")) die(2, "baseline manifest.json เสีย (อ่านไม่ได้/รูปทรงผิด)");
const lines = [];
for (const k of [...new Set([...live.blocks.keys(), ...base.keys()])].sort()) {
  const l = live.blocks.get(k), b = base.get(k);
  if (l && !b) lines.push(`เพิ่ม (มีในสด ไม่มีใน baseline): ${k}`);
  else if (!l && b) lines.push(`หาย (มีใน baseline ไม่มีในสด): ${k}`);
  else if (sha(l.body) !== sha(b.body)) lines.push(`เปลี่ยน: ${k}`);
}
const integ = [];
for (const k of [...new Set([...Object.keys(manifest.blocks), ...base.keys()])].sort()) {
  const m = manifest.blocks[k], b = base.get(k);
  if (m && !b) integ.push(`ไฟล์ baseline ขาดบล็อกที่ manifest ระบุ: ${k}`);
  else if (!m && b) integ.push(`ไฟล์ baseline มีบล็อกที่ manifest ไม่ระบุ: ${k}`);
  else if (sha(b.body) !== m.sha256) integ.push(`ไฟล์ baseline ไม่ตรง manifest: ${k}`);
}
const oosNew = live.outOfScope.filter(s => !(manifest.out_of_scope_functions ?? []).includes(s));
const liveSecret = [...live.blocks].filter(([, b]) => secretHits(b.body).length).map(([k]) => k);

if (oosNew.length) console.log(`ข้อมูล (ไม่นับเป็น drift) function ใหม่นอกขอบเขต: ${oosNew.join(", ")}`);
if (liveSecret.length) console.log(`เตือน: พบรูปแบบค่าลับในนิยามสด (ไม่แสดงค่า): ${liveSecret.join(", ")}`);
if (!lines.length && !integ.length) { console.log(`ตรง: ${live.blocks.size} บล็อก ผลต่าง 0 (baseline ${BASE})`); return; }
if (lines.length) console.log(`DRIFT สด vs baseline (${lines.length}):\n  ${lines.join("\n  ")}`);
if (integ.length) console.log(`BASELINE เสีย ไฟล์ vs manifest (${integ.length}):\n  ${integ.join("\n  ")}`);
process.exitCode = 1;
}

main().catch(e => { if (!(e instanceof Stop)) { console.error(`ผิดพลาดภายใน (${e?.name ?? "Error"})`); process.exitCode = 2; } });
