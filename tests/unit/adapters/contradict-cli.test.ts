import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryContradictCommand } from '../../../src/adapters/cli/commands/memory-contradict.js';
import { JsonlMicroNoteDeliveryLog } from '../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { learningSignalRevision } from '../../../src/domain/learning-signals.js';
import { MICRO_NOTE_TAG } from '../../../src/app/use-cases/micro-note-delivery.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

// Патч 3.3.1 (REQ-331-1/4/5): CLI `wolf contradict` поверх use-case с
// идентичностью записей. report печатает suppression_id; resolve адресует запись
// (--id), переданный --note — отказ с перечнем открытых id записей заметки
// (AC-1.4); list — формат design §9: id, note_id@revision, reason,
// (suppressed at ts), block: actual|superseded|unknown (T-5.1/T-5.2); пустой
// список — «no open suppressions» без регрессии REQ-R4 AC-1.5 (T-5.3).
describe('wolf contradict (patch 3.3.1)', () => {
  let dir: string;
  let logs: string[];

  const clock = { now: () => new Date('2026-11-18T00:00:00.000Z') };

  function microNote(id: string, overrides: Partial<MemoryObject> & Record<string, unknown> = {}): MemoryObject {
    return {
      title: `Hint ${id}`,
      body: `Body of ${id}.`,
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-15T00:00:00Z',
      created_by: 'user:test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [MICRO_NOTE_TAG],
      superseded_by: null,
      // note survives per-type validation only with a dictionary facet (howto)
      facet: 'howto',
      type: 'note',
      id,
      ...overrides,
    } as MemoryObject;
  }

  function run(args: string[]): Promise<void> {
    const cmd = memoryContradictCommand(dir).exitOverride();
    // подкоманды копируют настройки родителя в момент создания (.command()) —
    // после exitOverride перенаследуем, чтобы parseAsync бросал CommanderError
    // вместо process.exit (прецедент делегирования: cli-entry)
    for (const sub of cmd.commands) sub.copyInheritedSettings(cmd);
    return cmd.parseAsync(args, { from: 'user' });
  }

  function journal(): JsonlMicroNoteDeliveryLog {
    return new JsonlMicroNoteDeliveryLog(dir);
  }

  function reportedId(): string {
    const match = logs.join('\n').match(/cnr_\d{8}_[0-9a-f]{6}/);
    if (!match) throw new Error('report output did not contain a cnr_ suppression id');
    return match[0];
  }

  function callDelivered(): Promise<string[]> {
    return getCallInjections(
      { store: new MarkdownMemoryStore(dir), clock, noteLog: journal() },
      { microNotes: {} }
    ).then((r) => r.microNotes?.delivered.map((c) => c.id) ?? []);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-contradict-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('AC-1.1/T-1.2: report prints the record id, journal keeps exact id@rev12 and verbatim evidence, delivery stops', async () => {
    const obj = microNote('n_conf');
    await new MarkdownMemoryStore(dir).save(obj as never);
    const rev12 = learningSignalRevision(obj).slice(0, 12);

    await run(['report', '--note', 'n_conf', '--reason', 'note says A', '--evidence', 'observed B in session sess-1']);

    // вывод report содержит id записи (AC-1.2)
    const id = reportedId();
    expect(logs[0]).toContain(id);
    expect(logs[0]).toContain(`n_conf@${rev12}`);
    expect(logs[0]).toContain('suppressed until resolved');
    // evidence повторяется вербатимно
    expect(logs.some((l) => l.includes('Evidence: observed B in session sess-1'))).toBe(true);

    const records = journal().suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]!.suppression_id).toBe(id);
    expect(records[0]!.note_evidence).toBe(`n_conf@${rev12}`);
    expect(records[0]!.contradiction_evidence).toBe('observed B in session sess-1');
    expect(records[0]!.resolved_at).toBeNull();

    // повторный вызов (тот же путь, что `wolf call`) НЕ доставляет заметку
    expect(await callDelivered()).toEqual([]);
  });

  it('AC-1.2: report on unknown/non-micro-note id refuses with the use-case text; journal unchanged', async () => {
    // не-micro-note: та же запись без тега micro
    await new MarkdownMemoryStore(dir).save(microNote('n_plain', { tags: [] }) as never);

    for (const target of ['n_ghost', 'n_plain']) {
      await expect(run(['report', '--note', target, '--reason', 'r', '--evidence', 'e'])).rejects.toThrow(
        UserFacingError
      );
      await expect(run(['report', '--note', target, '--reason', 'r', '--evidence', 'e'])).rejects.toThrow(
        `unknown micro-note "${target}"`
      );
    }
    expect(journal().suppressions()).toEqual([]);
  });

  it('AC-4.1: report with empty/whitespace reason or evidence refuses with the use-case text', async () => {
    await new MarkdownMemoryStore(dir).save(microNote('n_conf') as never);
    for (const [reason, evidence] of [
      ['', 'e'],
      ['   ', 'e'],
      ['r', ''],
      ['r', ' \t '],
    ]) {
      await expect(run(['report', '--note', 'n_conf', '--reason', reason, '--evidence', evidence])).rejects.toThrow(
        'report requires reason and contradiction evidence (REQ-03: unknown stays unknown)'
      );
    }
    expect(journal().suppressions()).toEqual([]);
  });

  it('AC-1.3: resolve by record id lifts exactly that record — note delivered again, audit row kept', async () => {
    const obj = microNote('n_conf');
    await new MarkdownMemoryStore(dir).save(obj as never);
    const rev12 = learningSignalRevision(obj).slice(0, 12);
    await run(['report', '--note', 'n_conf', '--reason', 'note says A', '--evidence', 'observed B']);
    const id = reportedId();
    expect(await callDelivered()).toEqual([]);

    logs = [];
    await run(['resolve', '--id', id, '--resolution', 'note fixed by edit mem_x']);
    expect(logs[0]).toContain(`n_conf@${rev12}`);
    expect(logs[0]).toContain('resolved at');

    const records = journal().suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]!.resolved_at).not.toBeNull();
    expect(records[0]!.resolution).toBe('note fixed by edit mem_x');
    // evidence пары не стирается (журнал аудита)
    expect(records[0]!.note_evidence).toBe(`n_conf@${rev12}`);
    expect(records[0]!.contradiction_evidence).toBe('observed B');

    // заметка снова доставляется
    expect(await callDelivered()).toEqual(['n_conf']);
  });

  it('AC-1.4: resolve with --note refuses and lists the OPEN record ids of that note (actual list, not a stub)', async () => {
    await new MarkdownMemoryStore(dir).save(microNote('n_conf') as never);
    await run(['report', '--note', 'n_conf', '--reason', 'first', '--evidence', 'e1']);
    const id1 = reportedId();
    logs = [];
    await run(['report', '--note', 'n_conf', '--reason', 'second', '--evidence', 'e2']);
    const id2 = reportedId();

    logs = [];
    await expect(run(['resolve', '--note', 'n_conf', '--resolution', 'r'])).rejects.toThrow(UserFacingError);
    await expect(run(['resolve', '--note', 'n_conf', '--resolution', 'r'])).rejects.toThrow(/--id/);
    await expect(run(['resolve', '--note', 'n_conf', '--resolution', 'r'])).rejects.toThrow(`"${id1}"`);
    await expect(run(['resolve', '--note', 'n_conf', '--resolution', 'r'])).rejects.toThrow(`"${id2}"`);
    // обе записи остались открытыми (отказ ничего не снял)
    expect(
      journal()
        .suppressions()
        .every((s) => s.resolved_at === null)
    ).toBe(true);
  });

  it('AC-1.4: resolve with --note on a note without open records refuses with an explicit empty list', async () => {
    await new MarkdownMemoryStore(dir).save(microNote('n_fresh') as never);
    await expect(run(['resolve', '--note', 'n_fresh', '--resolution', 'r'])).rejects.toThrow(UserFacingError);
    await expect(run(['resolve', '--note', 'n_fresh', '--resolution', 'r'])).rejects.toThrow('no open suppressions');
  });

  it('T-5.1: every list line carries id, note@revision, reason, suppressed-at and the block state', async () => {
    const a = microNote('n_a');
    await new MarkdownMemoryStore(dir).save(a as never);
    await run(['report', '--note', 'n_a', '--reason', 'reason A', '--evidence', 'e A']);
    const id = reportedId();
    const rev = learningSignalRevision(a);

    logs = [];
    await run(['list']);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(id);
    expect(logs[0]).toContain(`n_a@${rev}`);
    expect(logs[0]).toContain('reason A');
    expect(logs[0]).toMatch(/\(suppressed at [^)]+\)/);
    expect(logs[0]).toMatch(/block: actual$/);
  });

  it('T-5.2: list marks actual / superseded / unknown per the delivery rule', async () => {
    await new MarkdownMemoryStore(dir).save(microNote('n_par') as never);
    await run(['report', '--note', 'n_par', '--reason', 'contradiction v1', '--evidence', 'e1']);
    const id = reportedId();

    // actual: ревизия записи = текущей ревизии
    logs = [];
    await run(['list']);
    expect(logs[0]).toMatch(/block: actual$/);

    // superseded: заметка пересмотрена
    await new MarkdownMemoryStore(dir).save(microNote('n_par', { body: 'Body of n_par, revised.' }) as never);
    logs = [];
    await run(['list']);
    expect(logs[0]).toMatch(/block: superseded$/);

    // unknown: заметки нет в store (REQ-03) — запись в журнал вносится напрямую
    logs = [];
    journal().recordSuppression({
      suppression_id: 'cnr_20261118_0000ff',
      memory_id: 'n_ghost',
      revision: 'rev000',
      reason: 'ghost contradiction',
      note_evidence: 'n_ghost@rev000',
      contradiction_evidence: 'observed nothing',
      suppressed_at: '2026-11-18T00:00:00.000Z',
      resolved_at: null,
      resolution: null,
    });
    await run(['list']);
    expect(logs).toHaveLength(2);
    const ghostLine = logs.find((l) => l.includes('cnr_20261118_0000ff'));
    expect(ghostLine).toBeDefined();
    expect(ghostLine).toMatch(/block: unknown$/);
  });

  it('T-5.3: list on an empty journal prints an explicit "no open suppressions"', async () => {
    await run(['list']);
    expect(logs).toEqual(['no open suppressions']);
  });

  it('AC-1.6: missing required options refuse with the named option', async () => {
    await expect(run(['report', '--note', 'n_conf', '--evidence', 'e'])).rejects.toThrow(/required option '--reason/);
    await expect(run(['report', '--reason', 'r', '--evidence', 'e'])).rejects.toThrow(/required option '--note/);
    await expect(run(['report', '--note', 'n_conf', '--reason', 'r'])).rejects.toThrow(/required option '--evidence/);
    await expect(run(['resolve', '--resolution', 'r'])).rejects.toThrow(/--id/);
    await expect(run(['resolve', '--id', 'cnr_20261118_0000aa'])).rejects.toThrow(/required option '--resolution/);
  });
});
