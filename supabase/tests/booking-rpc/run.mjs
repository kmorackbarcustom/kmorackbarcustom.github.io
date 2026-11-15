import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(testDir, '../../..');
const pgBin = 'D:/AI-Workspace/tools/pg17/pgsql/bin';
const tempRoot = 'D:/AI-Workspace/runtime/cache/temp';
const dataDir = await mkdtemp(path.join(tempRoot, 'kmo-pg17-'));
const port = '54329';
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

async function snapshotBaseline() {
  sql(`CREATE TABLE test_support.functions_before AS SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args, md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
    CREATE TABLE test_support.generate_job_id_before AS SELECT p.proargtypes::text argtypes, p.prorettype, p.prosecdef, coalesce(p.proconfig::text,'NULL') proconfig, coalesce(p.proacl::text,'NULL') proacl, md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='generate_job_id';
    CREATE TABLE test_support.triggers_before AS SELECT c.relname, t.tgname, md5(pg_get_triggerdef(t.oid)) hash FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal;
    CREATE TABLE test_support.policies_before AS SELECT schemaname, tablename, policyname, permissive, roles::text roles, cmd, coalesce(qual,'') qual, coalesce(with_check,'') check_expr, md5(concat_ws('|',permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,''))) hash FROM pg_policies WHERE schemaname='public' AND tablename IN ('bookings','holidays');
    INSERT INTO public.bookings(job_id, appointment_date, pickup_date) VALUES ('BASELINE-AVAILABILITY', date '2026-11-16', date '2026-11-18');
    CREATE TABLE test_support.availability_before AS SELECT * FROM public.get_booking_availability(date '2026-11-16', date '2026-11-18');`);
}
async function snapshotPostT3() {
  sql(`CREATE TABLE test_support.functions_before_t3b AS SELECT p.oid, p.proname, md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
    CREATE TABLE test_support.create_booking_before AS SELECT p.proargtypes::text argtypes, p.prorettype, p.prosecdef, coalesce(p.proconfig::text,'NULL') proconfig, coalesce(p.proacl::text,'NULL') proacl, md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.oid='public.create_booking(jsonb,uuid)'::regprocedure;`);
}
function createBookingMetaMatches() {
  return sql(`SELECT count(*) FROM test_support.create_booking_before b JOIN pg_proc p ON p.oid='public.create_booking(jsonb,uuid)'::regprocedure WHERE p.proargtypes::text=b.argtypes AND p.prorettype=b.prorettype AND p.prosecdef=b.prosecdef AND coalesce(p.proconfig::text,'NULL')=b.proconfig AND coalesce(p.proacl::text,'NULL')=b.proacl`) === '1';
}
async function comparePostT3(label) {
  const changed = sql(`SELECT
    (SELECT count(*) FROM test_support.functions_before_t3b b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE (p.oid IS NULL OR md5(pg_get_functiondef(p.oid))<>b.hash) AND b.proname NOT IN ('create_booking','generate_job_id')) +
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN test_support.functions_before_t3b b ON b.oid=p.oid WHERE n.nspname='public' AND b.oid IS NULL AND p.proname NOT IN ('create_booking','generate_job_id'));`);
  record(`${label}: non-target functions unchanged`, changed === '0', `changed/added/removed=${changed}`);
}
function createBookingHashMatches() {
  return sql(`SELECT md5(pg_get_functiondef('public.create_booking(jsonb,uuid)'::regprocedure))=(SELECT hash FROM test_support.create_booking_before);`) === 't';
}
async function compareBaseline(label, ignoreGenerateJobId = false) {
  const generateFilter = ignoreGenerateJobId ? "AND f.proname <> 'generate_job_id'" : '';
  const diffs = sql(`SELECT
   (SELECT count(*) FROM test_support.functions_before f LEFT JOIN pg_proc p ON p.oid=f.oid WHERE (p.oid IS NULL OR md5(pg_get_functiondef(p.oid))<>f.hash) ${generateFilter}) +
   (SELECT count(*) FROM test_support.triggers_before t LEFT JOIN pg_trigger g ON g.tgname=t.tgname LEFT JOIN pg_class c ON c.oid=g.tgrelid AND c.relname=t.relname WHERE g.oid IS NULL OR md5(pg_get_triggerdef(g.oid))<>t.hash) +
   (SELECT count(*) FROM test_support.policies_before b LEFT JOIN pg_policies p ON p.schemaname=b.schemaname AND p.tablename=b.tablename AND p.policyname=b.policyname WHERE p.policyname IS NULL OR md5(concat_ws('|',p.permissive,p.roles::text,p.cmd,coalesce(p.qual,''),coalesce(p.with_check,'')))<>b.hash) +
   (SELECT count(*) FROM pg_policies p LEFT JOIN test_support.policies_before b ON p.schemaname=b.schemaname AND p.tablename=b.tablename AND p.policyname=b.policyname WHERE p.schemaname='public' AND p.tablename IN ('bookings','holidays') AND b.policyname IS NULL);`);
  const availability = sql(`SELECT count(*) FROM ((SELECT * FROM test_support.availability_before EXCEPT SELECT * FROM public.get_booking_availability(date '2026-11-16', date '2026-11-18')) UNION ALL (SELECT * FROM public.get_booking_availability(date '2026-11-16', date '2026-11-18') EXCEPT SELECT * FROM test_support.availability_before)) x;`);
  record(`${label}: legacy definitions unchanged`, diffs === '0', `changed definitions=${diffs}`);
  record(`${label}: legacy availability unchanged`, availability === '0', `row differences=${availability}`);
}
async function migrateTwice(migration) {
  fileSql(migration); fileSql(migration);
  record('migration applies twice', true, 'two PostgreSQL 17 executions completed');
}
function functionMetaMatches() {
  return sql(functionMetaSql()) === '1';
}
function functionMetaSql() {
  return `SELECT count(*) FROM test_support.generate_job_id_before b JOIN pg_proc p ON p.proname='generate_job_id' JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public' WHERE p.proargtypes::text=b.argtypes AND p.prorettype=b.prorettype AND p.prosecdef=b.prosecdef AND coalesce(p.proconfig::text,'NULL')=b.proconfig AND coalesce(p.proacl::text,'NULL')=b.proacl`;
}
function originalGenerateDefinition(functions) {
  const block = sectionBlocks(functions).find(b => b.startsWith('-- ==== function public.generate_job_id(p_platform text)'));
  if (!block) throw new Error('Cannot find baseline generate_job_id block');
  return block.slice(block.indexOf('CREATE OR REPLACE FUNCTION'));
}
async function clearFixtures() {
  sql('TRUNCATE public.bookings, public.booking_requests, public.booking_job_counters, public.holidays RESTART IDENTITY CASCADE; TRUNCATE net._calls RESTART IDENTITY; UPDATE net._config SET fail=false;');
}
async function parallelBatch(date, count, startId) {
  const results = await Promise.all(Array.from({ length: count }, (_, i) => asyncPsql(call(date, plus(date, 3), uuid(startId + i)))));
  const successes = results.filter(r => r.code === 0);
  const full = results.filter(r => checkExpectedError(r, 'KMO_DAY_FULL'));
  return { successes, full, results };
}
async function runConcurrency(today) {
  let start = findDow(today, 1); // Monday; all dates are fresh and valid.
  let roundsOK = true;
  for (let round = 0; round < 5; round++) {
    await clearFixtures();
    const date = plus(start, round * 7);
    const r = await parallelBatch(date, 20, 1000 + round * 100);
    const ok = r.successes.length === 3 && r.full.length === 17;
    roundsOK &&= ok;
    record(`D2 parallel round ${round + 1}`, ok, `success=${r.successes.length}, KMO_DAY_FULL=${r.full.length}`);
    if (!ok) raw.push(`D2 round ${round + 1} raw errors\n${r.results.filter(x => x.code !== 0).slice(0, 3).map(x => x.stderr).join('\n')}`);
  }
  record('D2 five rounds exact 3/17', roundsOK, '20 independent psql sessions per round');

  await clearFixtures();
  const seeded = plus(start, 42);
  sql(`INSERT INTO public.bookings(job_id, appointment_date, pickup_date) VALUES ('SEED-1','${seeded}','${plus(seeded, 3)}'),('SEED-2','${seeded}','${plus(seeded, 3)}');`);
  const withTwo = await parallelBatch(seeded, 20, 2000);
  record('D2 two existing slots', withTwo.successes.length === 1 && withTwo.full.length === 19,
    `success=${withTwo.successes.length}, KMO_DAY_FULL=${withTwo.full.length}`);

  await clearFixtures();
  const canceled = plus(start, 49);
  sql(`INSERT INTO public.bookings(job_id, appointment_date, pickup_date, queue_status, production_status) VALUES ('CANCEL-1','${canceled}','${plus(canceled, 3)}',${sqlText('ยกเลิก')},${sqlText('ยกเลิก')}),('CANCEL-2','${canceled}','${plus(canceled, 3)}','ยืนยัน',${sqlText('ยกเลิก')});`);
  const afterCanceled = await parallelBatch(canceled, 20, 3000);
  record('D2 canceled rows release slots', afterCanceled.successes.length === 3 && afterCanceled.full.length === 17,
    `success=${afterCanceled.successes.length}, KMO_DAY_FULL=${afterCanceled.full.length}`);

  // Prove the capacity assertion catches a deliberately broken shared predicate.
  await clearFixtures();
  const mutantDay = plus(start, 56);
  const mutant = `BEGIN; CREATE OR REPLACE FUNCTION public.booking_uses_slot(queue_status text, production_status text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$; INSERT INTO public.bookings(job_id,appointment_date,pickup_date) VALUES ('M1','${mutantDay}','${plus(mutantDay,3)}'),('M2','${mutantDay}','${plus(mutantDay,3)}'),('M3','${mutantDay}','${plus(mutantDay,3)}'); SELECT test_support.expect_error(${sqlLiteral(call(mutantDay, plus(mutantDay, 3), uuid(9999)))}, 'KMO_DAY_FULL'); ROLLBACK;`;
  const detector = tool(psql, psqlArgs(['-c', mutant]), { allowFailure: true });
  const caught = detector.status !== 0 && detector.out.includes('ASSERTION_FAILED') && detector.out.includes('call succeeded');
  record('intentional mutant rejected by D2 assertion', caught, `expected failing command exit=${detector.status}; assertion caught bad capacity predicate`);
  await migrateTwice(path.join(repo, 'supabase/migrations/20261116090000_booking_rpc_hardening.sql'));

  // Distinct dates exercise the atomic prefix/month counters independently of the per-day lock.
  await clearFixtures();
  const dates = [];
  let d = plus(today, 1);
  while (dates.length < 20) { if (dow(d) !== 2) dates.push(d); d = plus(d, 1); }
  const ids = await Promise.all(dates.map((date, i) => asyncPsql(call(date, plus(date, 3), uuid(4000 + i)))));
  const parsed = ids.filter(r => r.code === 0).map(r => { try { return JSON.parse(r.stdout); } catch { return null; } });
  const uniqueIds = new Set(parsed.map(x => x?.job_id));
  record('job ID concurrency: 20 distinct days', parsed.length === 20 && uniqueIds.size === 20,
    `success=${parsed.length}, unique=${uniqueIds.size}`);
  return { start, roundsOK };
}

// Deterministic proofs (no reliance on scheduling luck): session A holds its transaction open
// (implicit tx of a multi-statement -c, pg_sleep before commit) while session B arrives.
const holdOpen = (statement, seconds = 2) => asyncPsql(`${statement} SELECT pg_sleep(${seconds});`);
const delay = ms => new Promise(r => setTimeout(r, ms));
async function runLockProofs(today) {
  await clearFixtures();
  const day = plus(findDow(today, 1), 63);
  sql(`INSERT INTO public.bookings(job_id, appointment_date, pickup_date) VALUES ('LOCK-1','${day}','${plus(day, 3)}'),('LOCK-2','${day}','${plus(day, 3)}');`);
  const a = holdOpen(call(day, plus(day, 3), uuid(8001)));
  await delay(700);
  const b = await asyncPsql(call(day, plus(day, 3), uuid(8002)));
  const aRes = await a;
  const active = sql(`SELECT count(*) FROM public.bookings WHERE appointment_date='${day}';`);
  record('lock proof: B waits for uncommitted A and sees the full day', aRes.code === 0 && checkExpectedError(b, 'KMO_DAY_FULL') && active === '3',
    `A=${aRes.code}, B full=${checkExpectedError(b, 'KMO_DAY_FULL')}, rows=${active}`);

  // Lock key must not depend on DateStyle: B uses a different DateStyle than A yet must still serialize behind A.
  await clearFixtures();
  const dsDay = plus(findDow(today, 1), 77);
  sql(`INSERT INTO public.bookings(job_id, appointment_date, pickup_date) VALUES ('DS-1','${dsDay}','${plus(dsDay, 3)}'),('DS-2','${dsDay}','${plus(dsDay, 3)}');`);
  const dsA = holdOpen(`SET DateStyle='ISO, YMD'; ${call(dsDay, plus(dsDay, 3), uuid(8004))}`);
  await delay(700);
  const dsB = await asyncPsql(`SET DateStyle='SQL, DMY'; ${call(dsDay, plus(dsDay, 3), uuid(8005))}`);
  const dsARes = await dsA;
  record('lock proof: advisory lock key is DateStyle-independent', dsARes.code === 0 && checkExpectedError(dsB, 'KMO_DAY_FULL'),
    `A=${dsARes.code}, B full=${checkExpectedError(dsB, 'KMO_DAY_FULL')}`);

  await clearFixtures();
  const dayA = plus(findDow(today, 1), 70);
  const dayB = plus(dayA, 7);
  const req = uuid(8003);
  const first = holdOpen(call(dayA, plus(dayA, 3), req));
  await delay(700);
  const second = await asyncPsql(call(dayB, plus(dayB, 3), req));
  await first;
  const replay = parseJsonOutput(second.stdout);
  const rowsB = sql(`SELECT count(*) FROM public.bookings WHERE appointment_date='${dayB}';`);
  const reqRows = sql(`SELECT count(*) FROM public.booking_requests WHERE request_id='${req}';`);
  record('idempotency proof: same request_id on two days concurrently replays, no duplicate row',
    second.code === 0 && replay?.replay === true && rowsB === '0' && reqRows === '1', `B replay=${replay?.replay}, dayB rows=${rowsB}, request rows=${reqRows}`);
}

async function runDateRules(today) {
  await clearFixtures();
  const validPickup = plus(today, 3);
  const badRequest = asyncPsql(call(plus(today, 7), plus(today, 10), uuid(5001), { customer_name: '' }));
  record('D3 KMO_BAD_REQUEST', checkExpectedError(await badRequest, 'KMO_BAD_REQUEST'));
  record('D3 KMO_PICKUP_MISSING', checkExpectedError(await asyncPsql(call(plus(today, 7), null, uuid(5002))), 'KMO_PICKUP_MISSING'));

  const past = plus(today, -1);
  record('D3 KMO_APPOINT_PAST', checkExpectedError(await asyncPsql(call(past, plus(past, 3), uuid(5003))), 'KMO_APPOINT_PAST'));
  const tuesday = findDow(plus(today, 1), 2);
  record('D3 KMO_APPOINT_CLOSED_WEEKDAY', checkExpectedError(await asyncPsql(call(tuesday, plus(tuesday, 3), uuid(5004))), 'KMO_APPOINT_CLOSED_WEEKDAY'));
  const holidayDay = findDow(plus(today, 1), 1);
  sql(`INSERT INTO public.holidays(date,reason) VALUES ('${holidayDay}','fixture');`);
  record('D3 KMO_APPOINT_HOLIDAY', checkExpectedError(await asyncPsql(call(holidayDay, plus(holidayDay, 3), uuid(5005))), 'KMO_APPOINT_HOLIDAY'));

  const monday = findDow(plus(today, 1), 1);
  const mondayOther = plus(monday, 7);
  record('D3 KMO_PICKUP_BEFORE_APPOINT', checkExpectedError(await asyncPsql(call(mondayOther, plus(mondayOther, -1), uuid(5006))), 'KMO_PICKUP_BEFORE_APPOINT'));
  const wednesday = findDow(plus(today, 1), 3);
  record('D3 KMO_MIN_WORKDAYS', checkExpectedError(await asyncPsql(call(wednesday, wednesday, uuid(5007))), 'KMO_MIN_WORKDAYS'));
  const dayFull = plus(wednesday, 7);
  sql(`INSERT INTO public.bookings(job_id,appointment_date,pickup_date) VALUES ('FULL1','${dayFull}','${plus(dayFull,3)}'),('FULL2','${dayFull}','${plus(dayFull,3)}'),('FULL3','${dayFull}','${plus(dayFull,3)}');`);
  record('D3 KMO_DAY_FULL', checkExpectedError(await asyncPsql(call(dayFull, plus(dayFull, 3), uuid(5008))), 'KMO_DAY_FULL'));

  const sameDayOk = today !== plus(findDow(today, 2), 0) && dow(today) !== 2;
  if (sameDayOk) {
    const sameDay = await asyncPsql(call(today, plus(today, 2), uuid(5009)));
    record('D3 appointment today accepted', sameDay.code === 0, sameDay.code === 0 ? sameDay.stdout : sameDay.stderr);
  } else console.log('SKIP D3 appointment today: Bangkok today is the weekly closed day');

  const monTue = plus(monday, 14);
  record('D3 Monday to Tuesday counts one workday', checkExpectedError(await asyncPsql(call(monTue, plus(monTue, 1), uuid(5013))), 'KMO_MIN_WORKDAYS'));
  record('D3 infinity date rejected as KMO_BAD_REQUEST', checkExpectedError(await asyncPsql(call('infinity', plus(today, 9), uuid(5014))), 'KMO_BAD_REQUEST'));
  const thu = findDow(plus(today, 1), 4);
  const fri = plus(thu, 1);
  const thuFri = await asyncPsql(call(thu, fri, uuid(5010)));
  record('D3 Thursday to Friday counts two workdays', thuFri.code === 0, thuFri.code === 0 ? thuFri.stdout : thuFri.stderr);
  const monWed = await asyncPsql(call(plus(monday, 7), plus(monday, 9), uuid(5011)));
  record('D3 Monday to Wednesday skips Tuesday', monWed.code === 0, monWed.code === 0 ? monWed.stdout : monWed.stderr);

  const pickupTue = findDow(plus(today, 1), 5); // next Friday
  const tuesdayPickup = plus(pickupTue, 4);
  sql(`INSERT INTO public.holidays(date,reason) VALUES ('${tuesdayPickup}','pickup-only fixture');`);
  const pickupAllowed = await asyncPsql(call(pickupTue, tuesdayPickup, uuid(5012)));
  record('D3 Tuesday and holiday pickup allowed', pickupAllowed.code === 0, pickupAllowed.code === 0 ? pickupAllowed.stdout : pickupAllowed.stderr);

  const usage = sql(`SELECT used || ':' || cap || ':' || is_closed || ':' || coalesce(closed_reason,'null') FROM public.get_booking_day_usage('${dayFull}','${dayFull}');`);
  record('calendar usage reports full day and closure reason', usage === '3:3:false:null', `got ${usage}`);
  record('calendar usage rejects ranges over 366 days', checkExpectedError(await asyncPsql(`SELECT * FROM public.get_booking_day_usage('${today}','${plus(today,366)}');`), 'KMO_BAD_RANGE'));
}

function referenceWorkdays(appointment, pickup, holidays = new Set()) {
  let count = 0;
  for (let day = appointment; day <= pickup; day = plus(day, 1)) {
    if (dow(day) !== 2 && !holidays.has(day)) count++;
  }
  return count;
}
async function runHolidayWorkdays(today) {
  await clearFixtures();
  const monday = findDow(plus(today, 7), 1);
  const wed = plus(monday, 2);
  sql(`INSERT INTO public.holidays(date,reason) VALUES ('${wed}','middle pickup holiday');`);
  record('T3b special holiday inside Mon-Wed rejects with one workday', checkExpectedError(await asyncPsql(call(monday, wed, uuid(5201))), 'KMO_MIN_WORKDAYS'));

  await clearFixtures();
  const thu = plus(monday, 3), fri = plus(monday, 4), sat = plus(monday, 5);
  sql(`INSERT INTO public.holidays(date,reason) VALUES ('${plus(monday,2)}','before range'),('${sat}','after range');`);
  record('T3b holiday outside [appointment,pickup] does not reduce count', (await asyncPsql(call(thu, fri, uuid(5202)))).code === 0);

  await clearFixtures();
  sql(`INSERT INTO public.holidays(date,reason) VALUES ('${plus(monday,1)}','Tuesday overlap');`);
  record('T3b holiday overlapping Tuesday counts once', checkExpectedError(await asyncPsql(call(monday, plus(monday,1), uuid(5203))), 'KMO_MIN_WORKDAYS'));

  sql(`INSERT INTO public.holidays(date,reason) VALUES ('${wed}','removable holiday');`);
  sql(`DELETE FROM public.holidays WHERE date='${wed}';`);
  record('T3b removing holiday immediately restores normal count', (await asyncPsql(call(monday, wed, uuid(5204)))).code === 0);
  sql(`INSERT INTO public.holidays(date,reason) VALUES ('${wed}','re-added middle pickup holiday');`);
  record('T3b adding holiday immediately changes current count', checkExpectedError(await asyncPsql(call(monday, wed, uuid(5205))), 'KMO_MIN_WORKDAYS'));

  const farStarted = performance.now();
  const far = await asyncPsql(call(plus(monday, 7), '9999-12-31', uuid(5206)));
  const farMs = Math.round(performance.now() - farStarted);
  record('T3b year 9999 pickup returns under two seconds without overflow', far.code === 0 && parseJsonOutput(far.stdout)?.replay === false && farMs < 2000, `${farMs}ms; ${far.code === 0 ? far.stdout : far.stderr}`);

  const cases = [];
  for (let start = 0; start < 8; start++) for (let span = 0; span < 9; span++) {
    const appointment = plus(monday, start), pickup = plus(appointment, span);
    if (dow(appointment) === 2) continue;
    const holidaySet = new Set([plus(appointment, (start + span) % (span + 1))]);
    if (holidaySet.has(appointment)) holidaySet.clear();
    cases.push({ appointment, pickup, holidaySet, expected: referenceWorkdays(appointment, pickup, holidaySet) >= 2 });
  }
  let matched = 0;
  for (let i = 0; i < cases.length; i++) {
    const { appointment, pickup, holidaySet, expected } = cases[i];
    await clearFixtures();
    if (holidaySet.size) sql(`INSERT INTO public.holidays(date,reason) VALUES ${[...holidaySet].map(d => `('${d}','reference fixture')`).join(',')};`);
    const result = await asyncPsql(call(appointment, pickup, uuid(5300 + i)));
    if ((result.code === 0) === expected) matched++;
  }
  record('T3b fixed edge-case date table matches JS reference', matched === cases.length, `${matched}/${cases.length}`);
  const randomCases = Array.from({ length: 48 }, (_, i) => {
    const appointment = plus(monday, (i * 17) % 56), span = (i * 11) % 15, pickup = plus(appointment, span);
    const holidaySet = new Set([plus(appointment, (i * 7) % (span + 1))]);
    if (holidaySet.has(appointment)) holidaySet.clear();
    return { appointment, pickup, holidaySet, expected: referenceWorkdays(appointment, pickup, holidaySet) >= 2 };
  }).filter(c => dow(c.appointment) !== 2);
  matched = 0;
  for (let i = 0; i < randomCases.length; i++) {
    const { appointment, pickup, holidaySet, expected } = randomCases[i];
    await clearFixtures();
    if (holidaySet.size) sql(`INSERT INTO public.holidays(date,reason) VALUES ${[...holidaySet].map(d => `('${d}','fixed random fixture')`).join(',')};`);
    const result = await asyncPsql(call(appointment, pickup, uuid(5400 + i)));
    if ((result.code === 0) === expected) matched++;
  }
  record('T3b fixed-seed multiweek date table matches JS reference', matched === randomCases.length, `${matched}/${randomCases.length}`);
}

async function runIdempotencyAndIds(today) {
  await clearFixtures();
  const date = findDow(plus(today, 1), 1);
  const request = uuid(6001);
  const first = parseJsonOutput(sql(call(date, plus(date, 3), request)));
  const second = parseJsonOutput(sql(call(date, plus(date, 3), request)));
  const concurr = await Promise.all(Array.from({ length: 10 }, () => asyncPsql(call(date, plus(date, 3), request))));
  const objects = concurr.filter(r => r.code === 0).map(r => { try { return JSON.parse(r.stdout); } catch { return null; } });
  const same = objects.length === 10 && objects.every(o => o?.job_id === first.job_id && o?.booking_id === first.booking_id && o?.replay === true);
  const count = sql(`SELECT count(*) FROM public.booking_requests WHERE request_id='${request}';`);
  record('idempotency sequential + ten concurrent', first.replay === false && second.replay === true && same && count === '1',
    `same job_id=${first.job_id}, rows=${count}, concurrent replay=${objects.filter(o=>o?.replay).length}/10`);

  const ym = sql("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYMM');");
  sql(`INSERT INTO public.bookings(job_id,appointment_date,pickup_date) VALUES ('KLI-${ym}-0100','${date}','${plus(date,3)}');`);
  const next = sql("SELECT public.kmo_next_job_id('line');");
  record('job ID continues from existing max and Bangkok month', next === `KLI-${ym}-0101`, `expected KLI-${ym}-0101, got ${next}`);
  // Thai-month boundary: freeze now() inside the function copy (rolled back) and assert YYMM.
  const frozen = path.join(dataDir, 'frozen-now.sql');
  const at = ts => `BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT replace(pg_get_functiondef('public.kmo_next_job_id(text)'::regprocedure),'now()','''${ts}''::timestamptz') \\gexec
SELECT 'YM=' || substr(public.kmo_next_job_id('line'),5,4);
ROLLBACK;
`;
  await writeFile(frozen, ['2026-10-31 16:59:00+00', '2026-10-31 17:00:00+00', '2026-12-31 17:00:00+00'].map(at).join(''));
  const yms = [...tool(psql, psqlArgs(['-q', '-At', '-f', frozen])).out.matchAll(/YM=(\d{4})/g)].map(m => m[1]).join(',');
  record('job ID month follows Bangkok time across UTC boundaries', yms === '2610,2611,2701', `got ${yms}`);
  const platformMap = [['facebook','KFB'],['line','KLI'],['tiktok','KTK'],['instagram','KIG'],['หน้าร้าน','KWN'],['เพื่อนแนะนำ','KRF'],['other','KOT']];
  const mapped = platformMap.map(([platform, prefix]) => sql(`SELECT public.kmo_next_job_id(${sqlText(platform)});`).startsWith(`${prefix}-${ym}-`));
  record('job ID platform prefixes', mapped.every(Boolean), `${mapped.filter(Boolean).length}/7 mapped`);
}

async function runF8(today) {
  await clearFixtures();
  const date = findDow(plus(today, 1), 1);
  const request = uuid(8101);
  const first = parseJsonOutput(sql(call(date, plus(date, 3), request)));
  sql(`DELETE FROM public.bookings WHERE job_id=${sqlLiteral(first.job_id)};`);
  const orphanCount = sql(`SELECT count(*) FROM public.booking_requests r LEFT JOIN public.bookings b ON b.job_id=r.job_id WHERE b.job_id IS NULL;`);
  const attach = await asyncPsql(`SELECT public.attach_booking_images('${request}'::uuid, ARRAY[]::text[]);`);
  record('F8 delete cascades request row and leaves no orphan', orphanCount === '0' && sql(`SELECT count(*) FROM public.booking_requests WHERE request_id='${request}';`) === '0');
  record('F8 attach after delete returns KMO_REQUEST_NOT_FOUND', checkExpectedError(attach, 'KMO_REQUEST_NOT_FOUND'), attach.stderr);
  const retry = parseJsonOutput(sql(call(date, plus(date, 3), request)));
  record('F8 same request retries as new booking', first?.replay === false && retry?.replay === false && retry?.job_id !== first?.job_id && sql(`SELECT count(*) FROM public.booking_requests WHERE request_id='${request}';`) === '1', `first=${first?.job_id}, retry=${retry?.job_id}`);
  record('F8 retry has no raw unique violation', retry?.replay === false && retry?.job_id !== first?.job_id);
}

async function runF9(today) {
  await clearFixtures();
  const dates = [];
  for (let d = plus(today, 1); dates.length < 20; d = plus(d, 1)) if (dow(d) !== 2) dates.push(d);
  const mixed = await Promise.all([
    ...Array.from({ length: 20 }, (_, i) => asyncPsql(`SELECT public.generate_job_id('line');`)),
    ...dates.map((d, i) => asyncPsql(call(d, plus(d, 3), uuid(8200 + i)))),
  ]);
  const generated = mixed.slice(0, 20).filter(r => r.code === 0).map(r => r.stdout.trim());
  const bookingResults = mixed.slice(20).filter(r => r.code === 0).map(r => parseJsonOutput(r.stdout));
  const allIds = [...generated, ...bookingResults.map(r => r?.job_id)];
  const noUniqueError = mixed.every(r => !`${r.stdout}\n${r.stderr}`.includes('23505'));
  record('F9 mixed 40-way generator and booking concurrency', mixed.every(r => r.code === 0) && new Set(allIds).size === 40 && noUniqueError,
    `generated=${generated.length}/20 bookings=${bookingResults.length}/20 distinct=${new Set(allIds).size}/40 unique-errors=${mixed.filter(r => `${r.stdout}\n${r.stderr}`.includes('23505')).length}`);
  record('F9 generated IDs do not collide with bookings', generated.every(id => !bookingResults.some(r => r?.job_id === id)));

  await clearFixtures();
  const ym = sql("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYMM');");
  const date = findDow(plus(today, 1), 1);
  sql(`INSERT INTO public.bookings(job_id,appointment_date,pickup_date) VALUES ('KLI-${ym}-0100','${date}','${plus(date,3)}');`);
  const next = sql("SELECT public.generate_job_id('line');");
  const nullPrefix = sql("SELECT public.generate_job_id(NULL);");
  record('F9 next ID follows maximum, keeps format, and NULL maps to KOT', next === `KLI-${ym}-0101` && /^[A-Z]{3}-[0-9]{4}-[0-9]{4}$/.test(next) && nullPrefix.startsWith('KOT-') && /^[A-Z]{3}-[0-9]{4}-[0-9]{4}$/.test(nullPrefix), `next=${next}, null=${nullPrefix}`);
  record('F9 generate_job_id signature/security/config/ACL unchanged', functionMetaMatches());
  const anonGenerate = await asyncPsql("SET ROLE anon; SELECT public.generate_job_id('line');");
  const anonCounter = await asyncPsql("SET ROLE anon; SELECT public.kmo_next_job_id('line');");
  record('F9 anon can call wrapper but not counter directly', anonGenerate.code === 0 && anonCounter.code !== 0, `wrapper=${anonGenerate.code}, counter=${anonCounter.code}`);
}

async function runMutants(migration) {
  await clearFixtures();
  const constraint = "EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.booking_requests'::regclass AND conname='booking_requests_job_id_fkey' AND confdeltype='c' AND confupdtype='c')";
  const mutant = async (name, command, detail = '') => {
    const result = tool(psql, psqlArgs(['-c', command]), { allowFailure: true });
    const caught = result.status !== 0 && result.out.includes('ASSERTION_FAILED');
    record(`mutant rejected: ${name}`, caught, detail || result.out.split(/\r?\n/).find(line => line.includes('ASSERTION_FAILED')) || `exit=${result.status}`);
  };
  await mutant('FK/CASCADE removed', `BEGIN; ALTER TABLE public.booking_requests DROP CONSTRAINT booking_requests_job_id_fkey; SELECT test_support.assert(${constraint}, 'FK cascade invariant'); ROLLBACK;`);
  await mutant('ON DELETE CASCADE removed', `BEGIN; ALTER TABLE public.booking_requests DROP CONSTRAINT booking_requests_job_id_fkey; ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_job_id_fkey FOREIGN KEY(job_id) REFERENCES public.bookings(job_id) ON DELETE RESTRICT ON UPDATE CASCADE; SELECT test_support.assert(${constraint}, 'delete cascade invariant'); ROLLBACK;`);

  const baselineFunctions = await readFile(path.join(repo, 'supabase/baseline/live-20261115/functions.sql'), 'utf8');
  const legacy = originalGenerateDefinition(baselineFunctions);
  await mutant('generate_job_id no longer shares the counter', `BEGIN; ${legacy} SELECT test_support.assert((SELECT public.kmo_next_job_id('line')) <> (SELECT public.generate_job_id('line')), 'shared counter invariant'); ROLLBACK;`);
  await mutant('generate_job_id ACL changed', `BEGIN; REVOKE ALL ON FUNCTION public.generate_job_id(text) FROM anon; SELECT test_support.assert((${functionMetaSql()}) = '1', 'ACL snapshot invariant'); ROLLBACK;`);
  await mutant('generate_job_id signature changed', `BEGIN; DROP FUNCTION public.generate_job_id(text); CREATE FUNCTION public.generate_job_id(p_platform varchar) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT 'KOT-0000-0000'::text $$; SELECT test_support.assert((${functionMetaSql()}) = '1', 'signature snapshot invariant'); ROLLBACK;`);
  await mutant('generate_job_id SECURITY DEFINER changed', `BEGIN; ALTER FUNCTION public.generate_job_id(text) SECURITY INVOKER; SELECT test_support.assert((${functionMetaSql()}) = '1', 'security snapshot invariant'); ROLLBACK;`);

  const counterMutant = `BEGIN;
SELECT replace(pg_get_functiondef('public.kmo_next_job_id(text)'::regprocedure), 'greatest(public.booking_job_counters.last_seq, EXCLUDED.last_seq - 1) + 1', 'public.booking_job_counters.last_seq') \\gexec
SELECT test_support.assert(public.kmo_next_job_id('line') <> public.kmo_next_job_id('line'), 'counter atomic increment invariant');
ROLLBACK;`;
  const counterFile = path.join(dataDir, 'mutant-counter.sql');
  await writeFile(counterFile, counterMutant);
  const counterResult = tool(psql, psqlArgs(['-f', counterFile]), { allowFailure: true });
  record('mutant rejected: counter upsert/increment removed', counterResult.status !== 0 && counterResult.out.includes('ASSERTION_FAILED'), counterResult.out.split(/\r?\n/).find(line => line.includes('ASSERTION_FAILED')) || `exit=${counterResult.status}`);

  const migrationSql = await readFile(migration, 'utf8');
  const guarded = `IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint\n    WHERE conrelid = 'public.booking_requests'::regclass\n      AND conname = 'booking_requests_job_id_fkey'\n  ) THEN`;
  const unguarded = migrationSql.replace(guarded, 'IF true THEN');
  if (unguarded === migrationSql) throw new Error('Could not build idempotency mutant');
  const migrationMutantFile = path.join(dataDir, 'mutant-migration.sql');
  await writeFile(migrationMutantFile, `BEGIN;\n${unguarded}\n${unguarded}\nROLLBACK;`);
  const migrationMutant = tool(psql, psqlArgs(['-f', migrationMutantFile]), { allowFailure: true });
  record('mutant rejected: migration is not idempotent', migrationMutant.status !== 0 && /already exists|duplicate/i.test(migrationMutant.out), migrationMutant.out.split(/\r?\n/).find(line => /already exists|duplicate/i.test(line)) || `exit=${migrationMutant.status}`);

  await mutant('rollback does not restore baseline function hash', `BEGIN; ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_job_id_fkey; SELECT test_support.assert((SELECT md5(pg_get_functiondef('public.generate_job_id(text)'::regprocedure))=hash FROM test_support.generate_job_id_before), 'rollback hash invariant'); ROLLBACK;`);
  const bookingDefinition = await readFile(migration, 'utf8');
  const rollback = await readFile(path.join(repo, 'supabase/rollback/20261116100000_booking_rpc_followup_f8_f9.down.sql'), 'utf8');
  const restoredFunction = rollback.match(/CREATE OR REPLACE FUNCTION public\.create_booking\([^)]*\)[\s\S]*?\$function\$;/)?.[0];
  if (!restoredFunction || !bookingDefinition.includes('AND NOT EXISTS (') || !bookingDefinition.includes('public.holidays h WHERE h.date = d.day::date')) throw new Error('Cannot verify create_booking holiday or rollback mutant fixtures');
  // The good migration is idempotent; this final check ensures all mutant transactions rolled back.
  record('mutant transactions leave the working definitions intact', sql(`SELECT ${constraint} AND ((${functionMetaSql()}) = 1);`) === 't');
  await runBookingMutants(migration);
}

async function runBookingMutants(migration) {
  const source = (await readFile(migration, 'utf8')).replaceAll('\r\n', '\n');
  const fn = source.match(/CREATE OR REPLACE FUNCTION public\.create_booking\(p_payload jsonb, p_request_id uuid\)[\s\S]*?\$function\$;/)?.[0];
  const rollbackSource = (await readFile(path.join(repo, 'supabase/rollback/20261116100000_booking_rpc_followup_f8_f9.down.sql'), 'utf8')).replaceAll('\r\n', '\n');
  const rollbackFn = rollbackSource.match(/CREATE OR REPLACE FUNCTION public\.create_booking\(p_payload jsonb, p_request_id uuid\)[\s\S]*?\$function\$;/)?.[0];
  if (!fn || !rollbackFn) throw new Error('Cannot load create_booking mutant sources');
  const run = async (name, definition, body) => {
    if (definition === fn) throw new Error(`Could not construct create_booking mutant: ${name}`);
    const file = path.join(dataDir, `mutant-booking-${name.replaceAll(/[^a-z0-9]+/gi, '-')}.sql`);
    await writeFile(file, `BEGIN;\n${definition}\n${body}\nROLLBACK;\n`);
    const result = tool(psql, psqlArgs(['-f', file]), { allowFailure: true });
    record(`mutant rejected: create_booking ${name}`, result.status !== 0 && result.out.includes('ASSERTION_FAILED'), result.out.split(/\r?\n/).filter(line => /ERROR:|ASSERTION_FAILED/.test(line)).at(-1) || `exit=${result.status}`);
  };
  const appointment = findDow(plus(sql('SELECT public.kmo_today();'), 7), 1);
  const pickup = plus(appointment, 2);
  const holiday = pickup;
  const holidayFixture = `INSERT INTO public.holidays(date,reason) VALUES ('${holiday}','mutant fixture');\nSELECT test_support.expect_error(${sqlLiteral(call(appointment, pickup, uuid(5901)))}, 'KMO_MIN_WORKDAYS');`;
  const noHoliday = fn.replace('      AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.date = d.day::date)\n', '');
  await run('holiday exclusion removed', noHoliday, holidayFixture);
  const shortcut = fn.replace(/  SELECT count\(\*\)::integer INTO v_workdays[\s\S]*?  \) AS qualifying_workdays;/, `  IF v_pickup - v_appointment >= 2 THEN\n    v_workdays := public.kmo_min_booking_workdays();\n  ELSE\n    SELECT count(*)::integer INTO v_workdays FROM generate_series(v_appointment, v_pickup, interval '1 day') AS d(day) WHERE extract(dow FROM d.day)::integer <> ALL(public.kmo_closed_weekdays());\n  END IF;`);
  await run('shortcut restored', shortcut, holidayFixture);
  const thu = plus(appointment, 3), fri = plus(appointment, 4);
  const acceptedFixture = `DO $test$ BEGIN BEGIN PERFORM public.create_booking(${sqlLiteral(jsonAscii(payload(thu, fri)))}::jsonb, '${uuid(5902)}'::uuid); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ASSERTION_FAILED: two inclusive workdays should pass'; END; END $test$;`;
  await run('appointment boundary excluded', fn.replace('generate_series(v_appointment, v_pickup, interval', 'generate_series(v_appointment + 1, v_pickup, interval'), acceptedFixture);
  await run('pickup boundary excluded', fn.replace('generate_series(v_appointment, v_pickup, interval', 'generate_series(v_appointment, v_pickup - 1, interval'), acceptedFixture);
  const monday = findDow(plus(sql('SELECT public.kmo_today();'), 7), 1), tuesday = plus(monday, 1);
  await run('Tuesday exclusion removed', fn.replace('extract(dow FROM d.day)::integer <> ALL(public.kmo_closed_weekdays())', 'true'), `SELECT test_support.expect_error(${sqlLiteral(call(monday, tuesday, uuid(5903)))}, 'KMO_MIN_WORKDAYS');`);
  const badRollbackFn = rollbackFn.replace('IF v_pickup < v_appointment THEN', 'IF v_pickup <= v_appointment THEN');
  const hashCheck = `SELECT test_support.assert(md5(pg_get_functiondef('public.create_booking(jsonb,uuid)'::regprocedure))=(SELECT hash FROM test_support.create_booking_before), 'rollback must restore c54decf1 create_booking hash');`;
  await run('rollback definition differs from c54decf1', badRollbackFn, hashCheck);
}

async function runStatusAndHoliday(today) {
  await clearFixtures();
  sql(`INSERT INTO public.bookings(job_id,appointment_date,pickup_date,queue_status,production_status) VALUES
    ('SYNC-Q','${today}','${plus(today,2)}',${sqlText('\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19')},${sqlText('\u0e23\u0e2d\u0e40\u0e23\u0e34\u0e48\u0e21\u0e07\u0e32\u0e19')}),
    ('SYNC-P','${today}','${plus(today,2)}',${sqlText('\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19')},${sqlText('\u0e23\u0e2d\u0e40\u0e23\u0e34\u0e48\u0e21\u0e07\u0e32\u0e19')}),
    ('SYNC-DONE','${today}','${plus(today,2)}',${sqlText('\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19')},${sqlText('\u0e40\u0e2a\u0e23\u0e47\u0e08')}),
    ('SYNC-REOPEN','${today}','${plus(today,2)}',${sqlText('\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01')},${sqlText('\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01')});
    UPDATE public.bookings SET queue_status=${sqlText('\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01')} WHERE job_id='SYNC-Q';
    UPDATE public.bookings SET production_status=${sqlText('\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01')} WHERE job_id='SYNC-P';
    UPDATE public.bookings SET queue_status=${sqlText('\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01')} WHERE job_id='SYNC-DONE';
    UPDATE public.bookings SET queue_status=${sqlText('\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19')} WHERE job_id='SYNC-REOPEN';`);
  const stateHex = sql(`SELECT string_agg(job_id||':'||encode(convert_to(queue_status,'UTF8'),'hex')||':'||encode(convert_to(production_status,'UTF8'),'hex'),',' ORDER BY job_id) FROM public.bookings WHERE job_id LIKE 'SYNC-%';`);
  const cancelHex = Buffer.from('\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01').toString('hex');
  const doneHex = Buffer.from('\u0e40\u0e2a\u0e23\u0e47\u0e08').toString('hex');
  const confirmedHex = Buffer.from('\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19').toString('hex');
  const expectedHex = `SYNC-DONE:${cancelHex}:${doneHex},SYNC-P:${cancelHex}:${cancelHex},SYNC-Q:${cancelHex}:${cancelHex},SYNC-REOPEN:${confirmedHex}:${cancelHex}`;
  record('D4 cancellation status sync, completed preservation, and no reopen sync', stateHex === expectedHex, `exact UTF8 status values=${stateHex === expectedHex}`);
  const usage = sql(`SELECT used FROM public.get_booking_day_usage('${today}','${today}');`);
  record('D4 canceled rows release calendar slots', usage === '0', `used=${usage}`);

  await clearFixtures();
  const holiday = findDow(plus(today,1), 4);
  const pickupHit = plus(holiday, 1);
  sql(`INSERT INTO public.bookings(job_id,customer_name,phone,line_uid,brand,model,appointment_date,pickup_date) VALUES
    ('HOL-APPT','synthetic','555111','line-private','Brand','A','${holiday}','${plus(holiday,2)}'),
    ('HOL-PICKUP','synthetic','555222','line-private','Brand','B','${plus(holiday,-1)}','${holiday}');
    TRUNCATE net._calls; INSERT INTO public.holidays(date,reason) VALUES ('${holiday}','conflict');`);
  const bodyRaw = sql('SELECT body::text FROM net._calls WHERE body->>\'type\' = \'HOLIDAY_CONFLICT\';');
  let body; try { body = JSON.parse(bodyRaw); } catch { body = null; }
  const hits = body?.bookings?.map(b => b.hit).sort().join(',');
  const noPrivate = body && !JSON.stringify(body).includes('555111') && !JSON.stringify(body).includes('line-private');
  record('holiday conflict sends one privacy-safe alert for two bookings', body?.type === 'HOLIDAY_CONFLICT' && body.bookings.length === 2 && hits === 'appointment,pickup' && noPrivate,
    `calls=${sql("SELECT count(*) FROM net._calls WHERE body->>'type'='HOLIDAY_CONFLICT'")}, bookings=${body?.bookings?.length}, hits=${hits}`);
  const noConflictDay = plus(holiday, 8);
  sql(`INSERT INTO public.holidays(date,reason) VALUES ('${noConflictDay}','no conflict');`);
  record('holiday without overlapping bookings sends nothing', sql("SELECT count(*) FROM net._calls WHERE body->>'type'='HOLIDAY_CONFLICT'") === '1');
  sql('UPDATE net._config SET fail=true;');
  const failInsert = await asyncPsql(`INSERT INTO public.holidays(date,reason) VALUES ('${plus(holiday,2)}','stub fails');`);
  record('holiday insert survives notification exception', failInsert.code === 0, failInsert.code === 0 ? 'insert succeeded' : failInsert.stderr);
  sql('UPDATE net._config SET fail=false;');
}

async function runSecurity(today) {
  await clearFixtures();
  const day = findDow(plus(today,1),1);
  const req = uuid(7001);
  const suspicious = "'; drop table bookings; --";
  const spoof = await asyncPsql(call(day, plus(day,3), req, {
    customer_name: suspicious, line_uid: 'line-synthetic', model: 'Model X', color: 'Black',
    cart_meta: { estimated_total: 1234, source_page: 'booking.html' }, estimated_total: 1234, source_page: 'booking.html',
    queue_status: 'ยกเลิก', production_status: 'ยกเลิก', deposit_paid: true,
    total_amount: 999, job_id: 'ATTACK', images: ['bad'], customer_id: uuid(10), id: 99,
  }));
  let spoofObj; try { spoofObj = JSON.parse(spoof.stdout); } catch { }
  const stored = sql(`SELECT customer_name||':'||queue_status||':'||production_status||':'||deposit_paid||':'||line_uid||':'||model||':'||estimated_total||':'||source_page||':'||coalesce(job_id,'') FROM public.bookings WHERE id=${spoofObj?.booking_id ?? -1};`);
  record('anon booking.html payload stores allowed fields and ignores protected keys', spoof.code === 0 && stored === `${suspicious}:ยืนยัน:รอเริ่มงาน:false:line-synthetic:Model X:1234:booking.html:${spoofObj?.job_id}`, stored);
  for (const bad of ['NaN', '-1', 'Infinity']) {
    const r = await asyncPsql(call(day, plus(day, 3), randomUUID(), { estimated_total: bad }));
    record(`estimated_total ${bad} rejected`, checkExpectedError(r, 'KMO_BAD_REQUEST'));
  }
  const trigFnExec = sql(`SELECT has_function_privilege('anon','public.holidays_notify_conflicts()','EXECUTE') OR has_function_privilege('anon','public.bookings_status_sync()','EXECUTE') OR has_function_privilege('anon','public.kmo_next_job_id(text)','EXECUTE');`);
  record('internal functions (trigger fns, kmo_next_job_id) not executable by anon', trigFnExec === 'f', `anon execute=${trigFnExec}`);
  const forbiddenRead = await asyncPsql('SET ROLE anon; SELECT * FROM public.booking_requests;');
  const forbiddenWrite = await asyncPsql(`SET ROLE anon; INSERT INTO public.booking_job_counters(prefix,ym,last_seq) VALUES ('KOT','9912',1);`);
  record('anon cannot read/write private idempotency tables', forbiddenRead.code !== 0 && forbiddenWrite.code !== 0, `read=${forbiddenRead.code}, write=${forbiddenWrite.code}`);
  const anonRpc = await asyncPsql(`SET ROLE anon; SELECT count(*) FROM public.get_booking_day_usage('${day}','${day}');`);
  record('anon can call day usage RPC', anonRpc.code === 0, anonRpc.code === 0 ? anonRpc.stdout : anonRpc.stderr);

  const request = uuid(7002);
  const create = await asyncPsql(`SET ROLE anon; ${call(day, plus(day,3), request)}`);
  const result = parseJsonOutput(create.stdout);
  const url = 'https://xfhpwxjywqgqefbncumm.supabase.co/storage/v1/object/public/booking-images/test.png';
  const attach = await asyncPsql(`SET ROLE anon; SELECT public.attach_booking_images('${request}'::uuid, ARRAY[${sqlLiteral(url)}]);`);
  const attached = result && sql(`SELECT images[1] FROM public.bookings WHERE id=${result.booking_id};`) === url;
  record('anon attaches allowed booking image', create.code === 0 && attach.code === 0 && attached);
  record('attach rejects missing request', checkExpectedError(await asyncPsql(`SELECT public.attach_booking_images('${uuid(7999)}'::uuid, ARRAY[${sqlLiteral(url)}]);`), 'KMO_REQUEST_NOT_FOUND'));
  record('attach rejects over ten images', checkExpectedError(await asyncPsql(`SELECT public.attach_booking_images('${request}'::uuid, ARRAY[${Array.from({length:11},()=>sqlLiteral(url)).join(',')}]);`), 'KMO_TOO_MANY_IMAGES'));
  record('attach rejects URL outside public bucket', checkExpectedError(await asyncPsql(`SELECT public.attach_booking_images('${request}'::uuid, ARRAY['https://example.test/x']);`), 'KMO_IMAGE_URL_INVALID'));
  record('attach rejects second write', checkExpectedError(await asyncPsql(`SELECT public.attach_booking_images('${request}'::uuid, ARRAY[${sqlLiteral(url)}]);`), 'KMO_IMAGES_ALREADY_ATTACHED'));
  const secdef = sql(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND p.proname IN ('kmo_next_job_id','create_booking','attach_booking_images','get_booking_day_usage','holidays_notify_conflicts') AND coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=public, pg_temp%';`);
  record('new SECURITY DEFINER functions pin search_path', secdef === '5', `pinned=${secdef}/5`);
}

let started = false;
try {
  tool(initdb, ['-D', dataDir, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-instructions']);
  tool(pgCtl, ['-D', dataDir, '-l', path.join(dataDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start'], { stdio: 'ignore' });
  started = true;
  const version = sql('SHOW server_version;');
  console.log(`POSTGRES ${version} port=${port} bind=127.0.0.1`);
  if (!version.startsWith('17.')) throw new Error(`Expected PostgreSQL 17; got ${version}`);
  await loadBaseline();
  await snapshotBaseline();
  const migration = path.join(repo, 'supabase/migrations/20261116090000_booking_rpc_hardening.sql');
  await migrateTwice(migration);
  await compareBaseline('after migration');
  const today = sql('SELECT public.kmo_today();');
  console.log(`KMO_TODAY ${today}`);
  await runConcurrency(today);
  await runLockProofs(today);
  await runDateRules(today);
  await runIdempotencyAndIds(today);
  await runStatusAndHoliday(today);
  await runSecurity(today);

  const followup = path.join(repo, 'supabase/migrations/20261116100000_booking_rpc_followup_f8_f9.sql');
  const followupRollback = path.join(repo, 'supabase/rollback/20261116100000_booking_rpc_followup_f8_f9.down.sql');
  await snapshotPostT3();
  sql("INSERT INTO public.booking_requests(request_id,job_id) VALUES ('00000000-0000-4000-8000-000000008000','ORPHAN-T3B-FIXTURE');");
  fileSql(followup);
  record('T3b migration removes pre-existing orphan before FK', sql("SELECT count(*) FROM public.booking_requests WHERE request_id='00000000-0000-4000-8000-000000008000';") === '0');
  await migrateTwice(followup);
  await clearFixtures();
  sql("INSERT INTO public.bookings(job_id, appointment_date, pickup_date) VALUES ('BASELINE-AVAILABILITY', date '2026-11-16', date '2026-11-18');");
  await compareBaseline('after T3b migration', true);
  await comparePostT3('after T3b migration');
  record('T3b create_booking signature/security/config/ACL unchanged', createBookingMetaMatches());
  await runHolidayWorkdays(today);
  record('T3b preserves generate_job_id signature/security/config/ACL', functionMetaMatches());
  await runF8(today);
  await runF9(today);
  await runMutants(followup);

  await clearFixtures();
  sql("INSERT INTO public.bookings(job_id, appointment_date, pickup_date) VALUES ('BASELINE-AVAILABILITY', date '2026-11-16', date '2026-11-18');");
  await compareBaseline('after all suites', true);

  fileSql(followupRollback);
  const restored = sql(`SELECT md5(pg_get_functiondef('public.generate_job_id(text)'::regprocedure))=(SELECT hash FROM test_support.generate_job_id_before) AND coalesce((SELECT p.proacl::text FROM pg_proc p WHERE p.oid='public.generate_job_id(text)'::regprocedure),'NULL')=(SELECT proacl FROM test_support.generate_job_id_before);`);
  const fkRemain = sql("SELECT count(*) FROM pg_constraint WHERE conrelid='public.booking_requests'::regclass AND conname='booking_requests_job_id_fkey';");
  record('T3b rollback restores baseline generate_job_id hash and ACL', restored === 't');
  record('T3b rollback restores create_booking hash to post-T3 snapshot', createBookingHashMatches());
  record('T3b rollback preserves create_booking signature/security/config/ACL', createBookingMetaMatches());
  record('T3b rollback removes FK', fkRemain === '0');
  await compareBaseline('after T3b rollback');
  await comparePostT3('after T3b rollback');
  await migrateTwice(followup);
  fileSql(followupRollback);

  fileSql(path.join(repo, 'supabase/rollback/20261116090000_booking_rpc_hardening.down.sql'));
  const remaining = sql(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('kmo_closed_weekdays','kmo_booking_daily_cap','kmo_min_booking_workdays','booking_uses_slot','kmo_next_job_id','create_booking','attach_booking_images','get_booking_day_usage','bookings_status_sync','holidays_notify_conflicts')`);
  const tablesRemain = sql(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('booking_requests','booking_job_counters')`);
  record('rollback removes all new objects', remaining === '0' && tablesRemain === '0', `functions/triggers=${remaining}, tables=${tablesRemain}`);
  await compareBaseline('after rollback');
  await migrateTwice(migration);
  record('migration reapplies after rollback', sql("SELECT to_regclass('public.booking_requests') IS NOT NULL AND to_regclass('public.booking_job_counters') IS NOT NULL;") === 't');
  await migrateTwice(followup);
  record('T3 then T3b both reapply after complete rollback', sql("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.booking_requests'::regclass AND conname='booking_requests_job_id_fkey') AND public.generate_job_id('line') LIKE 'KLI-%';") === 't');
} catch (error) {
  failed.push({ name: 'harness runtime', detail: error.message });
  console.error(`HARNESS ERROR ${error.stack ?? error}`);
} finally {
  try {
    if (started) {
      const stop = tool(pgCtl, ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
      console.log(`PG_STOP ${stop.out}`);
    }
  } catch (error) {
    failed.push({ name: 'portable PostgreSQL shutdown', detail: error.message });
    console.error(`PG_STOP ERROR ${error.message}`);
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    const remaining = spawnSync(pgCtl, ['-D', dataDir, 'status'], { encoding: 'utf8', windowsHide: true });
    record('portable PostgreSQL stopped and temp data removed', remaining.status !== 0);
  }
}
console.log(`SUMMARY passed=${passed.length} failed=${failed.length}`);
console.log(`RAW EVIDENCE\n${raw.join('\n\n')}`);
if (failed.length) process.exitCode = 1;
