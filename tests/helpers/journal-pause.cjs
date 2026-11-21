// Port of the repro-333 stand hook (pause333.cjs): controlled-pause fs hook for
// race-window tests through REAL spawned processes. Loaded via
// NODE_OPTIONS="--require tests/helpers/journal-pause.cjs".
// Same variables as the stand: PAUSE333_MATCH, PAUSE333_MS, PAUSE333_READ_N,
// PAUSE333_TRUNCATE_MS, PAUSE333_RENAME_MS, PAUSE333_APPEND_MS, PAUSE333_LOG.
// Test pauses stay <= 2.5 s (< the journal lock maxWait of 5 s): the second
// process waits for the lock instead of stealing it (design §11).
const fs = require('node:fs');
const MATCH = process.env.PAUSE333_MATCH || 'micro-note-delivery.jsonl';
const MS = parseInt(process.env.PAUSE333_MS || '2500', 10);
const LOGF = process.env.PAUSE333_LOG;
const SAB = new SharedArrayBuffer(4);
const sleep = (ms) => { Atomics.wait(new Int32Array(SAB), 0, 0, ms); };
const log = (m) => { if (LOGF) { try { fs.appendFileSync(LOGF, m + '\n'); } catch {} } };
const pathOf = (p) => (typeof p === 'string' ? p : Buffer.isBuffer(p) ? p.toString() : String(p));

// PAUSE333_READ_N: pause BEFORE the Nth readFileSync of the journal (0 = off)
let readN = 0;
const READ_N = parseInt(process.env.PAUSE333_READ_N || '0', 10);
const origRead = fs.readFileSync;
fs.readFileSync = function (p, ...rest) {
  const s = pathOf(p);
  if (READ_N > 0 && s.includes(MATCH)) {
    readN++;
    if (readN === READ_N) { log(`PAUSE before read #${readN} of ${s}`); sleep(MS); log(`RESUME after read #${readN} of ${s}`); }
  }
  return origRead.call(fs, p, ...rest);
};

// PAUSE333_TRUNCATE_MS: pause before truncateSync of the journal (repairTail window)
if (process.env.PAUSE333_TRUNCATE_MS) {
  const origTr = fs.truncateSync;
  fs.truncateSync = function (p, ...rest) {
    const s = pathOf(p);
    if (s.includes(MATCH)) { log(`PAUSE before truncate ${s} (arg=${rest[0]})`); sleep(parseInt(process.env.PAUSE333_TRUNCATE_MS, 10)); log(`RESUME after truncate ${s}`); }
    return origTr.call(fs, p, ...rest);
  };
}

// PAUSE333_RENAME_MS: pause before renameSync INTO the journal (import window)
if (process.env.PAUSE333_RENAME_MS) {
  const origRn = fs.renameSync;
  fs.renameSync = function (a, b) {
    const sb = pathOf(b);
    if (sb.includes(MATCH)) { log(`PAUSE before rename -> ${sb}`); sleep(parseInt(process.env.PAUSE333_RENAME_MS, 10)); log(`RESUME after rename -> ${sb}`); }
    return origRn.call(fs, a, b);
  };
}

// PAUSE333_APPEND_MS: pause before appendFileSync to the journal (write window after load)
// PAUSE333_GATE: gate mode — instead of sleeping PAUSE333_APPEND_MS, hold the
// pause point until the gate file exists (poll 50 ms, cap 120 s). Deterministic
// holder: the lock stays held for the waiter's whole lifetime on slow runners.
if (process.env.PAUSE333_APPEND_MS) {
  const origAppP = fs.appendFileSync;
  fs.appendFileSync = function (p, data, ...rest) {
    const s = pathOf(p);
    if (s.includes(MATCH)) {
      if (process.env.PAUSE333_GATE) {
        log(`PAUSE before append ${s} (gate=${process.env.PAUSE333_GATE})`);
        const cap = 120_000;
        for (let i = 0; i < cap / 50; i++) {
          try { fs.statSync(process.env.PAUSE333_GATE); break; } catch { sleep(50); }
        }
        log(`RESUME before append ${s} (gate released)`);
      } else {
        log(`PAUSE before append ${s}`);
        sleep(parseInt(process.env.PAUSE333_APPEND_MS, 10));
        log(`RESUME before append ${s}`);
      }
    }
    return origAppP.call(fs, p, data, ...rest);
  };
}

// Log every append to the journal (evidence of what each process wrote)
const origApp = fs.appendFileSync;
fs.appendFileSync = function (p, data, ...rest) {
  const s = pathOf(p);
  if (s.includes(MATCH)) {
    const n = typeof data === 'string' ? data.length : data.length;
    log(`APPEND ${s} bytes=${n} head=${String(data).slice(0, 100).replace(/\n/g, '\\n')}`);
  }
  return origApp.call(fs, p, data, ...rest);
};
log(`journal-pause loaded pid=${process.pid} READ_N=${READ_N} TRUNC=${process.env.PAUSE333_TRUNCATE_MS || '-'} RENAME=${process.env.PAUSE333_RENAME_MS || '-'}`);
