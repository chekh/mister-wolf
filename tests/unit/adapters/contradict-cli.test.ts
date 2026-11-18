import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryContradictCommand } from '../../../src/adapters/cli/commands/memory-contradict.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { indexPath } from '../../../src/adapters/fs/project-paths.js';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { learningSignalRevision } from '../../../src/domain/learning-signals.js';
import { MICRO_NOTE_TAG } from '../../../src/app/use-cases/micro-note-delivery.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

// Волна R-4 (REQ-R4-1): CLI-маршрут `wolf contradict report|resolve|list` поверх
// use-case 3.2.0 T-09 (S-27). Команда зовётся напрямую через parseAsync (без
// регистрации в cli-entry), baseDir инъектится tmp-каталогом — в .wolf/memory
// репозитория ничего не пишется (прецедент: complain.test.ts).
// AC-1.1 report подавляет доставку; AC-1.2 unknown id — текст use-case;
// AC-1.3 resolve возвращает доставку, аудит сохраняется; AC-1.4 resolve без
// открытого подавления — отказ порта; AC-1.5 list — id@rev+причина/'no open
// suppressions'; AC-1.6 обязательные опции — отказ с именованной причиной.
describe('wolf contradict (REQ-R4-1)', () => {
  let dir: string;
  let logs: string[];

  const NOW = new Date('2026-11-18T00:00:00.000Z');
  const clock = { now: () => NOW };

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

  function journal(): SQLiteSearchIndex {
    return new SQLiteSearchIndex(indexPath(dir));
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

  it('AC-1.1: report suppresses the active micro-note — exact id@rev12, verbatim evidence, delivery stops', async () => {
    const obj = microNote('n_conf');
    await new MarkdownMemoryStore(dir).save(obj as never);
    const rev12 = learningSignalRevision(obj).slice(0, 12);

    await run(['report', '--note', 'n_conf', '--reason', 'note says A', '--evidence', 'observed B in session sess-1']);

    expect(logs[0]).toContain(`n_conf@${rev12}`);
    expect(logs[0]).toContain('suppressed until resolved');
    // evidence повторяется вербатимно
    expect(logs.some((l) => l.includes('Evidence: observed B in session sess-1'))).toBe(true);

    const records = journal().suppressions();
    expect(records).toHaveLength(1);
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

  it('AC-1.3: resolve lifts the suppression — note delivered again, audit row kept with evidence', async () => {
    const obj = microNote('n_conf');
    await new MarkdownMemoryStore(dir).save(obj as never);
    const rev12 = learningSignalRevision(obj).slice(0, 12);
    await run(['report', '--note', 'n_conf', '--reason', 'note says A', '--evidence', 'observed B']);
    expect(await callDelivered()).toEqual([]);

    logs = [];
    await run(['resolve', '--note', 'n_conf', '--resolution', 'note fixed by edit mem_x']);
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

  it('AC-1.4: resolve without an open suppression refuses with the port text', async () => {
    await expect(run(['resolve', '--note', 'n_ghost', '--resolution', 'r'])).rejects.toThrow(UserFacingError);
    await expect(run(['resolve', '--note', 'n_ghost', '--resolution', 'r'])).rejects.toThrow(
      'unknown or already resolved suppression for "n_ghost"'
    );
  });

  it('AC-1.5: list shows open suppressions with id@rev and reason', async () => {
    const a = microNote('n_a');
    const b = microNote('n_b');
    await new MarkdownMemoryStore(dir).save(a as never);
    await new MarkdownMemoryStore(dir).save(b as never);
    await run(['report', '--note', 'n_a', '--reason', 'reason A', '--evidence', 'e A']);
    await run(['report', '--note', 'n_b', '--reason', 'reason B', '--evidence', 'e B']);

    logs = [];
    await run(['list']);
    expect(
      logs.some((l) => l.includes(`n_a@${learningSignalRevision(a).slice(0, 12)}`) && l.includes('reason A'))
    ).toBe(true);
    expect(
      logs.some((l) => l.includes(`n_b@${learningSignalRevision(b).slice(0, 12)}`) && l.includes('reason B'))
    ).toBe(true);
  });

  it('AC-1.5: list on an empty journal prints an explicit "no open suppressions"', async () => {
    await run(['list']);
    expect(logs).toEqual(['no open suppressions']);
  });

  it('AC-1.6: missing required options refuse with the named option', async () => {
    await expect(run(['report', '--note', 'n_conf', '--evidence', 'e'])).rejects.toThrow(/required option '--reason/);
    await expect(run(['report', '--reason', 'r', '--evidence', 'e'])).rejects.toThrow(/required option '--note/);
    await expect(run(['resolve', '--note', 'n_conf'])).rejects.toThrow(/required option '--resolution/);
  });
});
