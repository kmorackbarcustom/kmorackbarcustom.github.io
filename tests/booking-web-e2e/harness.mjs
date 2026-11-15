// KMO T4 e2e harness (SIMULATION): PostgreSQL 17 portable + a tiny PostgREST-like HTTP proxy + storage stub.
// Offline only. Serves the page from this worktree with live URLs rewritten to 127.0.0.1 and a fake LIFF.
//   node tests/booking-web-e2e/harness.mjs [--legacy] [--port 8787]   (--legacy = baseline only, no T3 migration => RPC missing => 404 PGRST202)
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harnessDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(harnessDir, '../..');
const testDir = path.join(repo, 'supabase/tests/booking-rpc');
const pgBin = 'D:/AI-Workspace/tools/pg17/pgsql/bin';
const tempRoot = 'D:/AI-Workspace/runtime/cache/temp';
const dataDir = await mkdtemp(path.join(tempRoot, 'kmo-pg17-e2e-'));
const port = '54330';
const httpPort = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8787);
const LEGACY = process.argv.includes('--legacy');
const LIVE = 'https://xfhpwxjywqgqefbncumm.supabase.co';
const LOCAL = `http://127.0.0.1:${httpPort}`;
const psql = path.join(pgBin, 'psql.exe');
const pgCtl = path.join(pgBin, 'pg_ctl.exe');
const initdb = path.join(pgBin, 'initdb.exe');
const passed = [];
const failed = [];
const raw = [];
process.env.PGCLIENTENCODING = 'UTF8';
function tool(file, args, { input, allowFailure = false, stdio } = {}) {
  const r = spawnSync(file, args, { input, encoding: 'utf8', windowsHide: true, stdio, maxBuffer: 12 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  raw.push(`$ ${path.basename(file)} ${args.join(' ')}\n${out}`);
  if (r.error || (!allowFailure && r.status !== 0)) throw new Error(`${path.basename(file)} failed (${r.status}): ${out}`);
  return { status: r.status, out };
}

function psqlArgs(extra = []) { return ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...extra]; }
function sql(text) { return tool(psql, psqlArgs(['-At', '-c', text])).out; }
function fileSql(file) { return tool(psql, psqlArgs(['-f', file])).out; }
function record(name, ok, detail = '') {
  (ok ? passed : failed).push({ name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function sqlLiteral(s) { return `'${String(s).replaceAll("'", "''")}'`; }
function sqlText(s) { return `convert_from(decode('${Buffer.from(s, 'utf8').toString('hex')}','hex'),'UTF8')`; }
function jsonAscii(value) { return JSON.stringify(value).replace(/[\u0080-\uFFFF]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`); }
function uuid(i) { return `00000000-0000-4000-8000-${BigInt(i).toString(16).padStart(12, '0')}`; }
function plus(date, days) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function dow(date) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
function findDow(start, target, strictlyAfter = false) {
  let d = start;
  while ((strictlyAfter && d === start) || dow(d) !== target) d = plus(d, 1);
  return d;
}
function payload(appointment, pickup, extra = {}) {
  return { customer_name: 'T3 synthetic', phone: '0000000000', source: 'line', brand: 'TEST',
    product: 'T3 fixture', appointment_date: appointment, pickup_date: pickup, ...extra };
}
function call(appointment, pickup, request = randomUUID(), extra = {}) {
  const body = jsonAscii(payload(appointment, pickup, extra));
  return `SELECT public.create_booking(${sqlLiteral(body)}::jsonb, '${request}'::uuid);`;
}
function asyncPsql(statement) {
  return new Promise(resolve => {
    const child = spawn(psql, psqlArgs(['-At', '-c', statement]), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8').on('data', s => stdout += s);
    child.stderr.setEncoding('utf8').on('data', s => stderr += s);
    child.on('close', code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}
function checkExpectedError(result, code) { return result.code !== 0 && `${result.stdout}\n${result.stderr}`.includes(code); }
function parseJsonOutput(output) { try { return JSON.parse(output.trim().split(/\r?\n/).at(-1)); } catch { return null; } }
function sectionBlocks(source) {
  return source.split(/(?=^-- ==== )/m).filter(s => s.startsWith('-- ==== '));
}
function sqlId(value) { return `"${value.replaceAll('"', '""')}"`; }
function baselinePolicySql(source) {
  const statements = [];
  for (const block of sectionBlocks(source)) {
    const rls = block.match(/^-- ==== rls public\.(\w+) ====/m);
    if (rls) {
      if (!['bookings', 'holidays'].includes(rls[1])) continue;
      const meta = block.match(/rls_enabled=(true|false)[^\r\n]*acl=\{([^}]*)\}/m);
      if (!meta) throw new Error(`Cannot parse baseline RLS metadata for ${rls[1]}`);
      const table = rls[1];
      const roles = [...meta[2].matchAll(/(?:^|,)([^=,]+)=/g)].map(m => m[1]).filter(role => role !== 'postgres');
      if (meta[1] === 'true') statements.push(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      if (roles.length) statements.push(`GRANT ALL ON TABLE public.${table} TO ${roles.map(sqlId).join(', ')};`);
      continue;
    }
    const policy = block.match(/^-- ==== policy public\.(\w+) (.+) ====/m);
    if (!policy) continue;
    if (!['bookings', 'holidays'].includes(policy[1])) continue;
    const meta = block.match(/permissive=(PERMISSIVE|RESTRICTIVE) cmd=(SELECT|INSERT|UPDATE|DELETE|ALL) roles=\{([^}]*)\}/m);
    const using = block.match(/^-- USING: (.*)$/m)?.[1];
    const check = block.match(/^-- WITH CHECK: (.*)$/m)?.[1];
    if (!meta || using === undefined || check === undefined) throw new Error(`Cannot parse baseline policy ${policy[2]}`);
    const roles = meta[3].split(',').filter(Boolean).map(sqlId).join(', ');
    const clauses = [`CREATE POLICY ${sqlId(policy[2])} ON public.${policy[1]} AS ${meta[1]} FOR ${meta[2]} TO ${roles}`];
    if (using !== '-') clauses.push(`USING (${using})`);
    if (check !== '-') clauses.push(`WITH CHECK (${check})`);
    statements.push(`${clauses.join(' ')};`);
  }
  if (!statements.length) throw new Error('No baseline RLS/policy definitions parsed');
  return `${statements.join('\n')}\n`;
}
async function sha(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function loadBaseline() {
  const base = path.join(repo, 'supabase/baseline/live-20261115');
  const tables = await readFile(path.join(base, 'tables.sql'), 'utf8');
  const functions = await readFile(path.join(base, 'functions.sql'), 'utf8');
  const triggers = await readFile(path.join(base, 'triggers.sql'), 'utf8');
  const policies = await readFile(path.join(base, 'policies-rls.sql'), 'utf8');
  const tableBlocks = sectionBlocks(tables).filter(b => /^-- ==== (?:columns|constraint|index) public\.(?:bookings|holidays)\b/m.test(b));
  const constrainedIndexes = new Set(tableBlocks.filter(b => b.startsWith('-- ==== constraint ')).map(b => b.match(/^-- ==== constraint public\.\w+ ([^ ]+) ====/m)?.[1]).filter(Boolean));
  const selectedTables = tableBlocks.filter(b => !b.startsWith('-- ==== index ') || !constrainedIndexes.has(b.match(/^-- ==== index public\.\w+ ([^ ]+) ====/m)?.[1])).join('\n');
  const names = ['generate_job_id', 'get_booking_availability', 'kmo_sync_customer_from_booking', 'kmo_today', 'notify_telegram_booking', 'update_updated_at'];
  const selectedFunctions = sectionBlocks(functions).filter(b => names.some(n => b.startsWith(`-- ==== function public.${n}(`))).join('\n');
  const selectedTriggers = sectionBlocks(triggers).filter(b => /^-- ==== trigger public\.bookings\b/m.test(b)).join('\n');
  for (const [name, data] of [['baseline-tables.sql', tables], ['baseline-functions.sql', functions], ['baseline-triggers.sql', triggers],
      ['baseline-policies-rls.sql', await readFile(path.join(base, 'policies-rls.sql'), 'utf8')]]) {
    const hash = createHash('sha256').update(data).digest('hex');
    console.log(`BASELINE SHA256 ${name} ${hash}`);
  }
  for (const [label, body] of [['tables', selectedTables], ['functions', selectedFunctions], ['triggers', selectedTriggers]]) {
    if (!body.trim()) throw new Error(`No baseline ${label} blocks selected`);
  }
  const setup = await readFile(path.join(testDir, 'setup.sql'), 'utf8');
  const defs = path.join(dataDir, 'baseline-definitions.sql');
  await writeFile(defs, `${setup}\n${selectedTables}\n`);
  const policiesFile = path.join(dataDir, 'baseline-policies.sql');
  await writeFile(policiesFile, baselinePolicySql(policies));
  const remainingDefs = path.join(dataDir, 'baseline-functions-triggers.sql');
  await writeFile(remainingDefs, `${selectedFunctions}\n${selectedTriggers}\n`);
  fileSql(defs); fileSql(policiesFile); fileSql(remainingDefs);
  fileSql(path.join(testDir, 'assertions.sql'));
  const baselineRefs = await sql(`SELECT count(*) FROM public.bookings;`);
  record('baseline definitions loaded from source blocks', baselineRefs === '0', `tables/functions/triggers extracted from baseline files; bookings=${baselineRefs}`);
}


// ---------- HTTP proxy ----------
const faults = {};   // key -> {mode:'500'|'drop'|'slow', ms}
const log = [];
function runAs(role, stmtLines, vars) {
  const args = psqlArgs(['-At', '-f', '-']);
  const asciiJson = v => (/^[\[{]/.test(v) ? v.replace(/[\u0080-\uFFFF]/g, c => String.fromCharCode(92) + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0')) : v);   // Windows argv is ANSI: ship JSON as u-escapes
  for (const [k, v] of Object.entries(vars || {})) args.push('-v', `${k}=${asciiJson(v)}`);
  const script = `\\set VERBOSITY verbose\n${role ? `SET ROLE ${role};\n` : ''}${stmtLines}\n`;
  const r = spawnSync(psql, args, { input: script, encoding: 'utf8', windowsHide: true, maxBuffer: 8 << 20 });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
function pgError(err) {
  const m = err.match(/ERROR:\s+(\w{5}):\s+(.*)/);
  return { sqlstate: m?.[1] || 'XX000', message: (m?.[2] || err).split('\n')[0] };
}
const RPC = {
  create_booking: b => ({ sql: `SELECT public.create_booking(:'p_payload'::jsonb, :'p_request_id'::uuid);`, vars: { p_payload: JSON.stringify(b.p_payload), p_request_id: b.p_request_id } }),
  attach_booking_images: b => ({ sql: `SELECT public.attach_booking_images(:'p_request_id'::uuid, (SELECT array_agg(x) FROM jsonb_array_elements_text(:'imgs'::jsonb) x)); SELECT 'null';`, vars: { p_request_id: b.p_request_id, imgs: JSON.stringify((b.p_images || []).map(u => u.startsWith(LOCAL) ? LIVE + u.slice(LOCAL.length) : u)) } }),
  get_booking_day_usage: b => ({ sql: `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.day),'[]'::jsonb) FROM public.get_booking_day_usage(:'s'::date, :'e'::date) t;`, vars: { s: b.p_start, e: b.p_end } }),
  get_booking_availability: b => ({ sql: `SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.get_booking_availability(:'s'::date, :'e'::date) t;`, vars: { s: b.p_start, e: b.p_end } }),
  generate_job_id: b => ({ sql: `SELECT to_jsonb(public.generate_job_id(:'p'::text));`, vars: { p: b.p_platform } }),
};
function applyFault(key, res) {
  const f = faults[key] || faults['*'];
  if (!f) return false;
  if (f.mode === 'drop') { res.socket.destroy(); return true; }
  if (f.mode === '500') { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<html><body>502 Bad Gateway nginx</body></html>'); return true; }
  const J = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); return true; };
  if (f.mode === 'raw23505') return J(409, { code: '23505', message: 'duplicate key value violates unique constraint "bookings_job_id_key"', details: 'Key (job_id)=(KLI-2611-0007) already exists.', hint: null });
  if (f.mode === 'forbidden') return J(403, { code: '42501', message: 'permission denied for function create_booking' });
  if (f.mode === 'newcode') return J(400, { code: 'P0001', message: 'KMO_SOMETHING_NEW' });
  if (f.mode === 'garbage') return J(200, { foo: 1 });
  return false;
}
async function body(req) { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c); }
const lastLine = out => out.split('\n').filter(Boolean).at(-1) || 'null';
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, LOCAL);
  const p = u.pathname;
  const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*' }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
    if (p === '/__ctl/fault') { const k = u.searchParams.get('key'); const m = u.searchParams.get('mode'); if (m === 'off') delete faults[k]; else faults[k] = { mode: m, ms: Number(u.searchParams.get('ms') || 0) }; return send(200, { faults }); }
    if (p === '/__ctl/log') { const out = log.splice(0); return send(200, out); }
    if (p === '/__ctl/sql') { const q = (await body(req)).toString('utf8'); return send(200, runAs(null, q)); }
    if (p === '/__fake-liff.js') return send(200, `window.liff={init:async()=>{},isLoggedIn:()=>true,login(){},getProfile:async()=>({userId:'Usynthetic0000000000000000000000'}),getFriendship:async()=>({friendFlag:${u.searchParams.get('nofriend') ? 'false' : 'true'}})};`, 'application/javascript');
    if (['/booking.html', '/calendar.html', '/kmo-booking-api.js'].includes(p) || p === '/') {
      const file = p === '/' ? 'booking.html' : p.slice(1);
      let txt = await readFile(path.join(repo, file), 'utf8');
      txt = txt.replaceAll(LIVE, LOCAL).replace(/<script src="https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js"><\/script>/, '<script src="/__fake-liff.js"></script>');
      return send(200, txt, file.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8');
    }
    if (p === '/payment.jpg') return send(200, '', 'image/jpeg');
    if (p.startsWith('/storage/v1/object/')) {
      const buf = await body(req); log.push({ t: Date.now(), m: req.method, p, bytes: buf.length });
      if (applyFault('storage', res)) return;
      if (req.method === 'POST') return send(200, { Key: p });
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      res.writeHead(200, { 'content-type': 'image/png' }); return res.end(png);
    }
    if (p.startsWith('/rest/v1/')) {
      const rawBody = (await body(req)).toString('utf8'); let b = {}; try { b = rawBody ? JSON.parse(rawBody) : {}; } catch {}
      const name = p.replace('/rest/v1/', '');
      const entry = { t: Date.now(), m: req.method, p: name + u.search, body: b };
      log.push(entry);
      if (faults[name]?.mode === 'slow') await new Promise(r => setTimeout(r, faults[name].ms));
      if (applyFault(name, res)) return;
      let q;
      if (name.startsWith('rpc/')) {
        const fn = name.slice(4); const mk = RPC[fn];
        if (!mk) return send(404, { code: 'PGRST202', message: `Could not find the function public.${fn}`, hint: null, details: null });
        q = mk(b);
      } else if (name.startsWith('holidays')) q = { sql: `SELECT coalesce(jsonb_agg(jsonb_build_object('date',date)),'[]'::jsonb) FROM public.holidays;`, vars: {} };
      else if (name === 'bookings' && req.method === 'POST') { const cols = Object.keys(b).filter(k => /^[a-z_]+$/.test(k)).join(','); q = { sql: `INSERT INTO public.bookings(${cols}) SELECT ${cols} FROM jsonb_populate_record(NULL::public.bookings, :'row'::jsonb);`, vars: { row: JSON.stringify(b) } }; }
      else return send(404, { message: 'unsupported in harness' });
      const r = runAs('anon', q.sql, q.vars);
      if (r.code === 0) { entry.status = 200; return send(name === 'bookings' ? 201 : 200, name === 'bookings' ? '' : lastLine(r.out)); }
      const e = pgError(r.err);
      if (e.sqlstate === '42883') return send(404, { code: 'PGRST202', message: `Could not find the function ${name} in the schema cache`, hint: null, details: null });
      entry.status = 400; entry.pgerr = e;
      return send(e.sqlstate === '23505' ? 409 : 400, { code: e.sqlstate, message: e.message, details: null, hint: null });
    }
    send(404, 'not found', 'text/plain');
  } catch (e) { send(500, { message: String(e) }); }
});

let started = false;
const stop = async () => {
  try { server.close(); } catch {}
  if (started) { try { spawnSync(pgCtl, ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { windowsHide: true }); } catch {} }
  await rm(dataDir, { recursive: true, force: true });
  console.log('STOPPED and removed', dataDir);
  process.exit(0);
};
process.on('SIGINT', stop); process.on('SIGTERM', stop);
try {
  tool(initdb, ['-D', dataDir, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-instructions']);
  tool(pgCtl, ['-D', dataDir, '-l', path.join(dataDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  await loadBaseline();
  if (!LEGACY) fileSql(path.join(repo, 'supabase/migrations/20261116090000_booking_rpc_hardening.sql'));
  console.log(`POSTGRES ${sql('SHOW server_version;')} mode=${LEGACY ? 'LEGACY(no migration)' : 'RPC(T3 migration applied)'}`);
  server.listen(httpPort, '127.0.0.1', () => console.log(`READY ${LOCAL}`));
} catch (e) { console.error('HARNESS FAILED', e.message); await stop(); }
