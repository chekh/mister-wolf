#!/usr/bin/env node
// bench-tokens.mjs — token usage benchmark from the local OpenCode SQLite DB.
// Read-only: opens the DB with mode=ro + readOnly, writes nowhere.
//
// Usage:
//   node scripts/bench-tokens.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD]
//                                 [--top N] [--compare] [--db PATH]
//
// Weighted tokens = input + 0.1 * cache_read + 5 * output (lesson mem_20260825).
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(msg) {
  console.error(`bench-tokens: ${msg}`);
  process.exit(1);
}

function parseDate(s, name) {
  if (!DATE_RE.test(s)) fail(`--${name} expects YYYY-MM-DD, got "${s}"`);
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1, d).getTime();
  if (!Number.isFinite(t)) fail(`--${name}: invalid date "${s}"`);
  return t;
}

function isoDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ponytail: manual arg parsing — node:util parseArgs misbehaves in this env (eats declared opts)
const argv = process.argv.slice(2);
const args = { values: {} };
for (let k = 0; k < argv.length; k++) {
  const a = argv[k];
  if (a === '--compare') args.values.compare = true;
  else if (['--since', '--until', '--top', '--db'].includes(a)) args.values[a.slice(2)] = argv[++k];
  else fail(`unknown argument "${a}" (usage: --since/--until YYYY-MM-DD, --top N, --compare, --db PATH)`);
}

const today = new Date();
const defSince = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
const sinceMs = args.values.since ? parseDate(args.values.since, 'since') : defSince.getTime();
const untilMs = args.values.until ? parseDate(args.values.until, 'until') + 86400000 : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
if (untilMs <= sinceMs) fail('--until must be >= --since');
const topN = Number(args.values.top ?? 10);
if (!Number.isInteger(topN) || topN < 1) fail('--top expects a positive integer');

const dbPath = args.values.db || `${homedir()}/.local/share/opencode/opencode.db`;
let db;
try {
  // URI ?mode=ro + readOnly option: SQLite refuses any write at the engine level.
  db = new DatabaseSync(`file:${dbPath}?mode=ro`, { readOnly: true });
} catch (e) {
  fail(`cannot open ${dbPath} read-only: ${e.message}`);
}

const rows = db
  .prepare(
    `SELECT m.time_created AS t,
            json_extract(m.data, '$.tokens.input') AS i,
            json_extract(m.data, '$.tokens.output') AS o,
            json_extract(m.data, '$.tokens.cache.read') AS cr,
            coalesce(json_extract(m.data, '$.path.cwd'), s.directory) AS cwd,
            m.session_id AS sid,
            s.title AS title
     FROM message m LEFT JOIN session s ON s.id = m.session_id
     WHERE json_extract(m.data, '$.role') = 'assistant'
       AND m.time_created >= ? AND m.time_created < ?`,
  )
  .all(sinceMs, untilMs);
db.close();

const weighted = (i, o, cr) => i + 0.1 * cr + 5 * o;
const M = (x) => (x / 1e6).toFixed(2);

const byDay = new Map(); // day -> agg
const byProject = new Map(); // cwd -> agg
const bySession = new Map(); // sid -> agg
for (const r of rows) {
  const i = r.i ?? 0, o = r.o ?? 0, cr = r.cr ?? 0;
  const w = weighted(i, o, cr);
  const day = isoDate(r.t);
  const cwd = r.cwd || '(unknown)';
  for (const [map, key] of [[byDay, day], [byProject, cwd], [bySession, r.sid]]) {
    let a = map.get(key);
    if (!a) map.set(key, (a = { msgs: 0, i: 0, o: 0, cr: 0, w: 0 }));
    a.msgs++; a.i += i; a.o += o; a.cr += cr; a.w += w;
  }
  bySession.get(r.sid).title = r.title || r.sid;
  bySession.get(r.sid).cwd = cwd;
}

const header = 'msgs      input(M)  output(M)  cache_read(M)  weighted(M)';
const line = (a) =>
  `${String(a.msgs).padEnd(9)} ${M(a.i).padEnd(9)} ${M(a.o).padEnd(10)} ${M(a.cr).padEnd(14)} ${M(a.w)}`;

console.log(`=== bench-tokens: ${isoDate(sinceMs)} .. ${isoDate(untilMs - 1)} ===`);
console.log(`DB: file:${dbPath}?mode=ro (opened read-only, writes blocked by SQLite)\n`);

console.log('BY DAY');
console.log(`day         ${header}`);
for (const [day, a] of [...byDay].sort()) console.log(`${day}  ${line(a)}`);

console.log('\nBY PROJECT (path.cwd)');
console.log(`project     ${header}`);
for (const [cwd, a] of [...byProject].sort((x, y) => y[1].w - x[1].w))
  console.log(`${cwd.replace(/^.*\//, '').padEnd(11)} ${line(a)}`);

console.log(`\nTOP ${topN} SESSIONS (by weighted tokens)`);
console.log(`weighted(M)  msgs  project     title`);
for (const [, a] of [...bySession].sort((x, y) => y[1].w - x[1].w).slice(0, topN))
  console.log(`${M(a.w).padEnd(12)} ${String(a.msgs).padEnd(5)} ${(a.cwd || '').replace(/^.*\//, '').padEnd(11)} ${a.title.slice(0, 60)}`);

const tot = { msgs: 0, i: 0, o: 0, cr: 0, w: 0 };
for (const a of byDay.values()) { tot.msgs += a.msgs; tot.i += a.i; tot.o += a.o; tot.cr += a.cr; tot.w += a.w; }
const activeDays = byDay.size;
console.log('\nSUMMARY');
console.log(`assistant messages: ${tot.msgs}`);
console.log(`total weighted: ${M(tot.w)}M over ${activeDays} active day(s) -> avg ${activeDays ? M(tot.w / activeDays) : '-'}M/active-day`);
const denom = tot.i + tot.cr;
console.log(`cache hit ratio: ${denom ? ((tot.cr / denom) * 100).toFixed(1) : '-'}%  (cache_read / (input + cache_read))`);

if (args.values.compare) {
  const sess = [...bySession.values()];
  const isWolf = (a) => (a.cwd || '').includes('/mister-wolf');
  const sum = (list) => list.reduce((s, a) => ({ n: s.n + 1, w: s.w + a.w }), { n: 0, w: 0 });
  const wolf = sum(sess.filter(isWolf));
  const other = sum(sess.filter((a) => !isWolf(a)));
  console.log('\nSCENARIO COMPARE — with Wolf vs without (PROXY)');
  console.log('Caveat: observational data, NOT a controlled experiment — projects differ in task mix.');
  console.log(`with Wolf (mister-wolf):    ${String(wolf.n).padStart(4)} sessions  weighted ${M(wolf.w)}M  avg/session ${wolf.n ? M(wolf.w / wolf.n) : '-'}M`);
  console.log(`other projects:             ${String(other.n).padStart(4)} sessions  weighted ${M(other.w)}M  avg/session ${other.n ? M(other.w / other.n) : '-'}M`);
}
