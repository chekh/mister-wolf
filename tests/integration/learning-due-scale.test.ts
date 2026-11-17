import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cpus, platform } from 'os';
import Database from 'better-sqlite3';
import { addMemoryObject, type AddMemoryObjectInput } from '../../src/app/use-cases/add-memory-object.js';
import {
  getLearningDue,
  listSignalPage,
  type LearningDueResult,
  type SignalPageResult,
} from '../../src/app/use-cases/learning-queries.js';
import { ackLearningBatch } from '../../src/app/use-cases/learning-queue-actions.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { eventsPath, indexPath } from '../../src/adapters/fs/project-paths.js';

// 3.2.0 T-05 (test-plan S-29, NFR-05): нагрузочный профиль адресной очереди.
// 100 000 индексированных сигналов (fixture заполняет learning_signals напрямую
// одним prepared-стейтментом — это те же строки, что пишет проекция), 100 новых
// сигналов через реальные addMemoryObject → проекция/seq. Проверки:
// 1) страница due bounded (LIMIT в SQL) и содержит ровно новые сигналы;
// 2) I/O-инструментирование: EXPLAIN QUERY PLAN фактического due/list SQL —
//    SEARCH по idx_learning_signals_seq, без SCAN таблицы (нет полного скана);
// 3) p95 due/list ≤ 1000 ms без LLM (NFR-05); железо и cold/warm фиксируются
//    в выводе теста — иначе порог не считается измеренным (REQ NFR-05).

const SEED = 100_000;
const NEW = 100;
const RUNS = 50;
const PAGE = 20;
const P95_BUDGET_MS = 1000;

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

describe('learning due queue under load (T-05: S-29, NFR-05)', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it(
    `100k indexed signals, ${NEW} new → bounded page, no full scan, p95 due/list ≤ ${P95_BUDGET_MS}ms`,
    { timeout: 180_000 },
    () => {
      dir = mkdtempSync(join(tmpdir(), 'wolf-learn-scale-'));
      const store = new MarkdownMemoryStore(dir);
      const log = new JsonlEventLog(eventsPath(dir));
      const index = new SQLiteSearchIndex(indexPath(dir));

      // Схема создаётся при первом обращении адаптера…
      index.getCursor();
      // …затем fixture: 100k сигналов напрямую в learning_signals (одна транзакция).
      const raw = new Database(indexPath(dir));
      raw.pragma('busy_timeout = 5000');
      const seedAll = raw.transaction(() => {
        const ins = raw.prepare(
          `INSERT INTO learning_signals (memory_id, type, status, title, revision, seq, changed_at, disposition)
           VALUES (?, 'lesson', 'open', ?, ?, ?, ?, 'pending')`
        );
        const base = Date.UTC(2026, 0, 1);
        for (let i = 1; i <= SEED; i++) {
          const rev = (i >>> 0).toString(16).padStart(8, '0').repeat(8);
          ins.run(`mem_seed_${i}`, `Seed signal ${i}`, rev, i, new Date(base + i * 1000).toISOString());
        }
      });
      seedAll();
      raw.close();

      // 100 новых сигналов — через штатный путь записи (проекция bump'ает seq).
      const idGen = new HashIdGenerator();
      const addOne = async (n: number) => {
        const { object } = await addMemoryObject({ store, log, clock: new SystemClock(), idGen, index }, {
          type: 'lesson',
          title: `Fresh signal ${n}`,
          body: 'fresh body',
          createdBy: 'user:test',
        } as AddMemoryObjectInput);
        return object;
      };

      return (async () => {
        for (let n = 1; n <= NEW; n++) await addOne(n);
        expect(index.maxSeq()).toBe(SEED + NEW);

        // Инструментирование I/O: фактический SQL ищет по индексу seq, без SCAN.
        const duePlan = index.signalQueryPlan('due').join(' | ');
        const listPlan = index.signalQueryPlan('list').join(' | ');
        expect(duePlan).toContain('SEARCH learning_signals');
        expect(duePlan).toContain('idx_learning_signals_seq');
        expect(listPlan).toContain('SEARCH learning_signals');
        expect(listPlan).toContain('idx_learning_signals_seq');
        expect(duePlan).not.toMatch(/SCAN learning_signals/);
        expect(listPlan).not.toMatch(/SCAN learning_signals/);

        // Cold: курсор ещё 0 — самая дорогая ветка (COUNT по всему диапазону).
        const t0 = performance.now();
        const cold: LearningDueResult = getLearningDue({ signals: index, mode: 'suggest' }, { limit: PAGE });
        const coldMs = performance.now() - t0;
        expect(cold.pending_count).toBe(SEED + NEW);
        expect(cold.items).toHaveLength(PAGE); // bounded response при 100k+100 pending
        expect(cold.items[0].memory_id).toBe('mem_seed_1');

        // Стационарный профиль NFR-05: история обработана (курсор на SEED),
        // в очереди ровно 100 новых сигналов.
        const ack = ackLearningBatch({ signals: index }, { seq: SEED });
        expect(ack.cursor).toBe(SEED);
        const steady: LearningDueResult = getLearningDue({ signals: index, mode: 'suggest' }, { limit: PAGE });
        expect(steady.pending_count).toBe(NEW);
        expect(steady.items).toHaveLength(PAGE);
        expect(steady.items.map((s) => s.seq)).toEqual(Array.from({ length: PAGE }, (_, i) => SEED + 1 + i));

        const dueMs: number[] = [];
        const listMs: number[] = [];
        for (let i = 0; i < RUNS; i++) {
          const a = performance.now();
          const d: LearningDueResult = getLearningDue({ signals: index, mode: 'suggest' }, { limit: PAGE });
          dueMs.push(performance.now() - a);
          expect(d.items).toHaveLength(PAGE);

          const b = performance.now();
          const p: SignalPageResult = listSignalPage(
            { signals: index },
            { limit: PAGE, after_seq: 1000 + ((i * 977) % (SEED - 2000)) }
          );
          listMs.push(performance.now() - b);
          expect(p.items).toHaveLength(PAGE);
        }

        const p95Due = p95(dueMs);
        const p95List = p95(listMs);
        // Протокол измерения (NFR-05: железо фиксируется в выводе, иначе порог
        // не считается измеренным).
        console.log(
          `[S-29 protocol] rows=${SEED} new=${NEW} page=${PAGE} runs=${RUNS} | ` +
            `cold_first_due=${coldMs.toFixed(1)}ms | p95_due=${p95Due.toFixed(1)}ms | p95_list=${p95List.toFixed(1)}ms | ` +
            `max_due=${Math.max(...dueMs).toFixed(1)}ms | max_list=${Math.max(...listMs).toFixed(1)}ms | ` +
            `host=${platform()}/${cpus()[0]?.model ?? 'unknown'} | no-LLM, in-process`
        );
        expect(p95Due).toBeLessThanOrEqual(P95_BUDGET_MS);
        expect(p95List).toBeLessThanOrEqual(P95_BUDGET_MS);
      })();
    }
  );
});
