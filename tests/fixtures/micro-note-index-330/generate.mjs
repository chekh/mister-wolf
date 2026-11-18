// Детерминированный генератор фикстуры index.sqlite формата 3.3.0
// (патч 3.3.1, REQ-331-3, test-plan §4). Запуск из корня репо:
//   node tests/fixtures/micro-note-index-330/generate.mjs
// Пересоздаёт бинарник index.sqlite рядом с собой: схема 3.3.0 (таблицы
// micro_note_suppressions / micro_note_deliveries / micro_note_observations)
// со строками: открытая, разрешённая (resolved_at + resolution), несколько
// заметок и ревизий, оба evidence, NULL-поля. Значения фиксированы — повторный
// запуск даёт то же логическое содержимое.
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(here, 'index.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS micro_note_deliveries (
    memory_id TEXT NOT NULL,
    revision TEXT NOT NULL,
    channel TEXT NOT NULL,
    kind TEXT NOT NULL,
    ts TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_micro_note_deliveries_id ON micro_note_deliveries(memory_id);

  CREATE TABLE IF NOT EXISTS micro_note_suppressions (
    memory_id TEXT PRIMARY KEY,
    revision TEXT NOT NULL,
    reason TEXT NOT NULL,
    note_evidence TEXT NOT NULL,
    contradiction_evidence TEXT NOT NULL,
    suppressed_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT
  );

  CREATE TABLE IF NOT EXISTS micro_note_observations (
    memory_id TEXT PRIMARY KEY,
    revision TEXT NOT NULL,
    observed_use TEXT,
    observed_outcome TEXT NOT NULL DEFAULT 'unknown',
    updated_at TEXT NOT NULL
  );
`);

db.exec(
  'DELETE FROM micro_note_suppressions; DELETE FROM micro_note_deliveries; DELETE FROM micro_note_observations;'
);

// suppressions: порядок миграции = suppressed_at, затем memory_id →
//   1) 09:00 mem_a (разрешённая)  2) 10:00 mem_b (открытая)  3) 10:00 mem_c (тай-брейк по memory_id).
// Схема 3.3.0 держит не более одной строки на заметку (PK memory_id — сам дефект
// P1-1), поэтому «несколько записей» в фикстуре — это разные заметки.
const insSup = db.prepare(
  `INSERT INTO micro_note_suppressions
     (memory_id, revision, reason, note_evidence, contradiction_evidence, suppressed_at, resolved_at, resolution)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
insSup.run('mem_a', 'rev_a1', 'note says A', 'mem_a@rev_a1', 'observed B (session s1)', '2026-11-01T09:00:00.000Z', '2026-11-02T09:00:00.000Z', 'confirmed by lead');
insSup.run('mem_b', 'rev_b1', 'note says B', 'mem_b@rev_b1', 'observed C (session s2)', '2026-11-01T10:00:00.000Z', null, null);
insSup.run('mem_c', 'rev_c1', 'note says C', 'mem_c@rev_c1', 'observed D (session s3)', '2026-11-01T10:00:00.000Z', null, null);

// deliveries: одинаковый ts у первых двух → детерминизм по rowid (порядок INSERT)
const insDel = db.prepare(
  'INSERT INTO micro_note_deliveries (memory_id, revision, channel, kind, ts) VALUES (?, ?, ?, ?, ?)'
);
insDel.run('mem_a', 'rev_a0', 'call', 'selected', '2026-10-31T08:00:00.000Z');
insDel.run('mem_a', 'rev_a0', 'call', 'delivered', '2026-10-31T08:00:00.000Z');
insDel.run('mem_b', 'rev_b1', 'brief', 'delivered', '2026-11-01T07:30:00.000Z');

// observations: одна с наблюдением, одна с NULL observed_use
const insObs = db.prepare(
  'INSERT INTO micro_note_observations (memory_id, revision, observed_use, observed_outcome, updated_at) VALUES (?, ?, ?, ?, ?)'
);
insObs.run('mem_a', 'rev_a0', 'cited', 'unknown', '2026-11-01T09:30:00.000Z');
insObs.run('mem_b', 'rev_b1', null, 'unknown', '2026-11-01T07:30:00.000Z');

db.close();
console.log('fixture written: tests/fixtures/micro-note-index-330/index.sqlite');
