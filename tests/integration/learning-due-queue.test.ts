import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addMemoryObject, type AddMemoryObjectInput } from '../../src/app/use-cases/add-memory-object.js';
import { saveLearningCandidate } from '../../src/app/use-cases/save-proposal.js';
import {
  getLearningDue,
  listSignalPage,
  DEFAULT_SIGNAL_PAGE_LIMIT,
  MAX_SIGNAL_PAGE_LIMIT,
} from '../../src/app/use-cases/learning-queries.js';
import { ackLearningBatch, dismissLearningSignal } from '../../src/app/use-cases/learning-queue-actions.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { eventsPath, indexPath } from '../../src/adapters/fs/project-paths.js';
import { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';
import { validCandidateInput } from '../unit/domain/learning-fixtures.js';
import { UserFacingError } from '../../src/domain/errors.js';

// 3.2.0 T-05 (test-plan S-23; REQ-03, REQ-12, NFR-01): механика адресной
// очереди сигналов с курсором. In-process: реальные адаптеры (markdown store +
// SQLite index) в tmp, вызовы use-case — без спавна CLI.
// S-23: off → нет due и работы; новая ревизия сигнала → снова due; обычное
// сообщение и идентичный ре-индекс → курсор на месте.

describe('learning due queue (T-05: S-23, REQ-03/REQ-12)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let index: SQLiteSearchIndex;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-learn-due-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    index = new SQLiteSearchIndex(indexPath(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps() {
    return { store, log, clock: new SystemClock(), idGen: new HashIdGenerator(), index };
  }

  async function addSignal(input: Partial<AddMemoryObjectInput> & { title: string }): Promise<MemoryObject> {
    const { object } = await addMemoryObject(deps(), {
      type: 'lesson',
      body: 'signal body',
      createdBy: 'user:test',
      ...input,
    } as AddMemoryObjectInput);
    return object;
  }

  /** Новая ревизия сигнала: то же содержимое памяти, изменённое тело. */
  async function reviseSignal(object: MemoryObject, newBody: string): Promise<void> {
    await index.indexObject({ ...object, body: newBody, updated_at: new Date().toISOString() });
  }

  it('new signal appears in due; page is bounded and deterministic (REQ-03, REQ-12)', async () => {
    const first = await addSignal({ title: 'First signal' });
    const second = await addSignal({ title: 'Second signal' });

    const due = getLearningDue({ signals: index, mode: 'suggest' });
    expect(due.mode).toBe('suggest');
    expect(due.has_work).toBe(true);
    expect(due.pending_count).toBe(2);
    expect(due.items.map((s) => s.memory_id)).toEqual([first.id, second.id]); // порядок по seq
    expect(due.items[0]).toMatchObject({
      type: 'lesson',
      status: first.status,
      disposition: 'pending',
      title: 'First signal',
    });

    const page = getLearningDue({ signals: index, mode: 'suggest' }, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].memory_id).toBe(first.id);
    // bounded: LIMIT в SQL, не обрезка после полного чтения
    expect(DEFAULT_SIGNAL_PAGE_LIMIT).toBe(20);
    expect(MAX_SIGNAL_PAGE_LIMIT).toBe(200);
  });

  it('complaint with required per-type fields is a signal too (REQ-03)', async () => {
    const complaint = await addSignal({
      type: 'complaint',
      title: 'Complaint about near-miss',
      extra: { about: 'wolf sync', rule: 'never rm -rf', evidence: 'log line 42', proposal: 'guard it' },
    });
    const due = getLearningDue({ signals: index, mode: 'suggest' });
    expect(due.items.map((s) => s.memory_id)).toEqual([complaint.id]);
  });

  it('S-23: off proposes no work and does not create any (REQ-12)', async () => {
    await addSignal({ title: 'Pending signal' });
    const off = getLearningDue({ signals: index, mode: 'off' });
    expect(off.mode).toBe('off');
    expect(off.has_work).toBe(false);
    expect(off.items).toEqual([]);
    expect(off.pending_count).toBe(0);
    expect(off.cursor).toBe(0);

    // off через env (тот же resolution, что CLI/MCP)
    const offEnv = getLearningDue({ signals: index, env: { WOLF_LEARNING_MODE: 'off' } as NodeJS.ProcessEnv });
    expect(offEnv.has_work).toBe(false);

    // курсор не двинулся, сигнал не исчез — включили suggest, очередь на месте
    const suggest = getLearningDue({ signals: index, mode: 'suggest' });
    expect(suggest.pending_count).toBe(1);
  });

  it('S-23: a new signal revision becomes due again; identical re-index does not (REQ-03)', async () => {
    const signal = await addSignal({ title: 'Signal v1' });
    expect(getLearningDue({ signals: index, mode: 'suggest' }).pending_count).toBe(1);

    // идентичный ре-индекс: не новая ревизия — seq не двигается, дубликата нет
    await index.indexObject(signal);
    const afterReindex = getLearningDue({ signals: index, mode: 'suggest' });
    expect(afterReindex.pending_count).toBe(1);
    const seqBefore = afterReindex.items[0].seq;
    expect(afterReindex.items[0].revision).not.toBe('');

    // ack: пакет обработан, очередь пуста
    const ack = ackLearningBatch({ signals: index }, {});
    expect(ack.advanced).toBe(true);
    expect(getLearningDue({ signals: index, mode: 'suggest' }).has_work).toBe(false);

    // новая ревизия содержимого → сигнал снова due (seq вырос, курсор не тронут)
    await reviseSignal(signal, 'signal body v2 — the workaround failed twice');
    const due2 = getLearningDue({ signals: index, mode: 'suggest' });
    expect(due2.has_work).toBe(true);
    expect(due2.items[0].memory_id).toBe(signal.id);
    expect(due2.items[0].seq).toBeGreaterThan(seqBefore);
    expect(due2.cursor).toBe(ack.cursor); // due read-only: курсор не двинулся

    // повторный просмотр того же набора: курсор на месте (REQ-12, S-23)
    const due3 = getLearningDue({ signals: index, mode: 'suggest' });
    expect(due3.cursor).toBe(ack.cursor);
    expect(due3.pending_count).toBe(due2.pending_count);
  });

  it('S-23: an ordinary (non-signal) message does not move the cursor (REQ-12)', async () => {
    await addSignal({ title: 'Real signal' });
    ackLearningBatch({ signals: index }, {});
    const before = index.getCursor();

    await addSignal({ type: 'decision', title: 'An ordinary decision, not a signal' });
    await addSignal({ type: 'decision', title: 'Another ordinary decision, not a signal' });

    const due = getLearningDue({ signals: index, mode: 'suggest' });
    expect(due.has_work).toBe(false);
    expect(index.getCursor()).toBe(before);
    // и индекс сигналов не разросся: decision/rule не сигналы
    expect(listSignalPage({ signals: index }, {}).items).toHaveLength(1);
  });

  it('ack is monotonic and empty queue gives has_work=false without work (NFR-01)', async () => {
    await addSignal({ title: 'S1' });
    const ack1 = ackLearningBatch({ signals: index }, {});
    expect(ack1.cursor).toBe(index.maxSeq());

    const ackLower = ackLearningBatch({ signals: index }, { seq: 1 });
    expect(ackLower.advanced).toBe(false); // назад не двигается (S-23)
    expect(index.getCursor()).toBe(ack1.cursor);

    const empty = getLearningDue({ signals: index, mode: 'suggest' });
    expect(empty.has_work).toBe(false);
    expect(empty.items).toEqual([]);
  });

  it('dismissed signal does not return, even after a revision; other signals stay due (REQ-03)', async () => {
    const noise = await addSignal({ title: 'Noise signal' });
    const real = await addSignal({ title: 'Real signal' });
    dismissLearningSignal({ signals: index }, { memory_id: noise.id });

    let due = getLearningDue({ signals: index, mode: 'suggest' });
    expect(due.items.map((s) => s.memory_id)).toEqual([real.id]);

    await reviseSignal(noise, 'noise body v2');
    due = getLearningDue({ signals: index, mode: 'suggest' });
    expect(due.items.map((s) => s.memory_id)).toEqual([real.id]);

    expect(() => dismissLearningSignal({ signals: index }, { memory_id: 'mem_unknown' })).toThrow(UserFacingError);
  });

  it('listSignalPage pages the whole index by seq (audit works in off too)', async () => {
    for (let i = 1; i <= 3; i++) await addSignal({ title: `Signal ${i}` });
    ackLearningBatch({ signals: index }, {});

    const page1 = listSignalPage({ signals: index }, { limit: 2 });
    expect(page1.items.map((s) => s.seq)).toEqual([1, 2]);
    expect(page1.has_more).toBe(true);
    expect(page1.next_after_seq).toBe(2);

    const page2 = listSignalPage({ signals: index }, { limit: 2, after_seq: page1.next_after_seq! });
    expect(page2.items.map((s) => s.seq)).toEqual([3]);
    expect(page2.has_more).toBe(false);

    const offAudit = listSignalPage({ signals: index, mode: 'off' }, { limit: 2 });
    expect(offAudit.items).toHaveLength(2); // аудит реестра — не подсказка работы
  });

  it('learning-change candidates (T-04) are not signals: the queue stays quiet', async () => {
    await addSignal({ title: 'Real signal' });
    const before = getLearningDue({ signals: index, mode: 'suggest' });

    const saved = await saveLearningCandidate(deps(), { envelope: validCandidateInput() });
    expect(saved.deduplicated).toBe(false);

    const after = getLearningDue({ signals: index, mode: 'suggest' });
    expect(after.pending_count).toBe(before.pending_count);
    expect(after.items.map((s) => s.memory_id)).not.toContain(saved.object.id);
  });
});
