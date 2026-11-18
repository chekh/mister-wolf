import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { JsonlMicroNoteDeliveryLog } from '../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { indexPath } from '../../src/adapters/fs/project-paths.js';
import { rebuildMemoryIndex } from '../../src/app/use-cases/rebuild-memory-index.js';
import { getCallInjections } from '../../src/app/use-cases/get-call-injections.js';
import { memoryContradictCommand } from '../../src/adapters/cli/commands/memory-contradict.js';
import {
  reportMicroNoteContradiction,
  resolveMicroNoteSuppression,
  reconcileMicroNoteObservations,
} from '../../src/app/use-cases/micro-note-contradiction.js';
import { learningSignalRevision } from '../../src/domain/learning-signals.js';
import { MICRO_NOTE_TAG } from '../../src/app/use-cases/micro-note-delivery.js';
import { UserFacingError } from '../../src/domain/errors.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';
import type { SignalEvent } from '../../src/adapters/fs/session-metrics-log.js';

// Патч 3.3.1 (REQ-331-1/2/5, главный критерий D2): идентичность записей
// противоречия, постоянный носитель журнала вне .wolf/cache и наблюдаемость
// `contradict list`. T-1.1, T-1.3, T-1.5, T-2.1–T-2.3, T-5.4 и E2E §8 тест-плана.

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

describe('micro-note contradictions on the persistent journal (patch 3.3.1)', () => {
  let dir: string;
  let tick: number;
  const clock = { now: () => new Date(tick) };
  const idGen = new HashIdGenerator();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-contradictions-'));
    tick = Date.UTC(2026, 10, 18, 12, 0, 0);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function journal(): JsonlMicroNoteDeliveryLog {
    return new JsonlMicroNoteDeliveryLog(dir);
  }

  function freshIndex(): SQLiteSearchIndex {
    return new SQLiteSearchIndex(indexPath(dir));
  }

  function store(): MarkdownMemoryStore {
    return new MarkdownMemoryStore(dir);
  }

  async function report(noteId: string, reason: string, evidence: string) {
    return reportMicroNoteContradiction(
      { store: store(), clock, log: journal(), idGen },
      { note_id: noteId, reason, contradiction_evidence: evidence }
    );
  }

  function resolveById(suppressionId: string, resolution: string) {
    return resolveMicroNoteSuppression({ clock, log: journal() }, { suppression_id: suppressionId, resolution });
  }

  function callDelivered(): Promise<string[]> {
    return getCallInjections(
      { store: store(), clock, noteLog: journal() },
      { microNotes: { projectId: dir, version: '3.3.1' } }
    ).then((r) => r.microNotes?.delivered.map((c) => c.id) ?? []);
  }

  async function runCli(args: string[]): Promise<string[]> {
    const cmd = memoryContradictCommand(dir).exitOverride();
    for (const sub of cmd.commands) sub.copyInheritedSettings(cmd);
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.map(String).join(' ')));
    try {
      await cmd.parseAsync(args, { from: 'user' });
    } finally {
      spy.mockRestore();
    }
    return logs;
  }

  async function recreateIndex(): Promise<void> {
    // кэш мог ни разу не открыться (ленивый DDL) — «утрата» устойчива к отсутствию
    rmSync(indexPath(dir), { force: true });
    await rebuildMemoryIndex({ store: store(), index: freshIndex() });
  }

  // T-1.1 (AC-1.1): повторный report создаёт НОВУЮ запись; наблюдение и решение
  // первого противоречия не изменяются.
  it('T-1.1: a repeated report appends a new record; the first observation and its resolution stay intact', async () => {
    await store().save(microNote('n_conf') as never);
    const r1 = await report('n_conf', 'note says A', 'observed B (session s1)');
    resolveById(r1.suppression_id, 'confirmed by lead');

    const r2 = await report('n_conf', 'note says A2 (new revision)', 'observed B2 (session s2)');

    const records = journal().suppressions();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      suppression_id: r1.suppression_id,
      reason: 'note says A',
      contradiction_evidence: 'observed B (session s1)',
      resolved_at: expect.any(String),
      resolution: 'confirmed by lead',
    });
    expect(records[1]).toMatchObject({
      suppression_id: r2.suppression_id,
      reason: 'note says A2 (new revision)',
      resolved_at: null,
    });
    expect(r1.suppression_id).not.toEqual(r2.suppression_id);
  });

  // T-1.3 (AC-1.3): resolve по id снимает ровно эту запись; вторая остаётся
  // открытой и продолжает подавлять доставку.
  it('T-1.3: resolve by record id lifts exactly that record; the other open record keeps suppressing', async () => {
    await store().save(microNote('n_conf') as never);
    const r1 = await report('n_conf', 'first observation', 'evidence 1');
    const r2 = await report('n_conf', 'second observation', 'evidence 2');

    resolveById(r1.suppression_id, 'resolve the first one');

    const open = journal()
      .suppressions()
      .filter((s) => s.resolved_at === null);
    expect(open.map((s) => s.suppression_id)).toEqual([r2.suppression_id]);
    expect(await callDelivered()).toEqual([]);
    expect(await runCli(['list'])).toHaveLength(1);
  });

  // T-1.5 (AC-1.5): семантика «some» — заметка вне доставки, пока открыта
  // ХОТЯ БЫ одна запись её ревизии.
  it('T-1.5: with two open records, resolving one keeps the note out of delivery (some-semantics)', async () => {
    await store().save(microNote('n_conf') as never);
    const r1 = await report('n_conf', 'first observation', 'evidence 1');
    await report('n_conf', 'second observation', 'evidence 2');

    resolveById(r1.suppression_id, 'resolve the first one');
    expect(await callDelivered()).toEqual([]);
  });

  // T-2.1 (AC-2.1): report + resolve → удаление index.sqlite → rebuild →
  // suppressions/deliveries/observations возвращают всё; журнал вне .wolf/cache.
  it('T-2.1: recreating index.sqlite keeps every journal record; the journal lives outside .wolf/cache', async () => {
    await store().save(microNote('n_conf') as never);
    const r1 = await report('n_conf', 'note says A', 'observed B');
    resolveById(r1.suppression_id, 'confirmed by lead');

    await recreateIndex();

    const records = journal().suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ suppression_id: r1.suppression_id, resolution: 'confirmed by lead' });
    expect(existsSync(join(dir, '.wolf', 'memory', 'micro-note-delivery.jsonl'))).toBe(true);
  });

  // T-2.2 (AC-2.2): после пересоздания индекса активное подавление действует —
  // спорная ревизия не доставляется.
  it('T-2.2: an active suppression survives the index recreation — the contradicted revision is still not delivered', async () => {
    await store().save(microNote('n_act') as never);
    await report('n_act', 'note says A', 'observed B');

    await recreateIndex();

    expect(await callDelivered()).toEqual([]);
    const injections = await getCallInjections(
      { store: store(), clock, noteLog: journal() },
      { microNotes: { projectId: dir, version: '3.3.1' } }
    );
    expect(injections.microNotes!.underReview.map((u) => u.id)).toEqual(['n_act']);
  });

  // T-2.3 (AC-2.3): история атрибуции (deliveries) и наблюдения переживают
  // пересоздание индекса.
  it('T-2.3: deliveries and observations survive the index recreation', async () => {
    await store().save(microNote('n_used') as never);
    await getCallInjections(
      { store: store(), clock, noteLog: journal() },
      { microNotes: { projectId: dir, version: '3.3.1' } }
    );
    const signal = {
      ts: clock.now().toISOString(),
      event: 'memory_stage',
      schema_version: 2,
      session_id: 'sess-x',
      detail: { stage: 'cited', memory_ids: ['n_used'] },
    } as unknown as SignalEvent;
    reconcileMicroNoteObservations({ clock, log: journal() }, [signal]);
    expect(journal().deliveries()).toHaveLength(1);
    expect(journal().observations()).toHaveLength(1);

    await recreateIndex();

    expect(journal().deliveries()).toEqual([
      {
        memory_id: 'n_used',
        revision: learningSignalRevision(microNote('n_used')),
        channel: 'call',
        kind: 'delivered',
        ts: clock.now().toISOString(),
      },
    ]);
    expect(journal().observations()).toEqual([
      expect.objectContaining({ memory_id: 'n_used', observed_use: 'cited', observed_outcome: 'unknown' }),
    ]);
  });

  // T-5.4 (AC-5.4): parity-таблица list ↔ фильтр доставки — правило одно
  // (openContradiction, some по текущей ревизии).
  it('T-5.4: list actuality agrees with the delivery filter in every scenario', async () => {
    await store().save(microNote('n_par') as never);
    const rev0 = learningSignalRevision(microNote('n_par'));

    // открытая текущей ревизии → actual ⇔ доставку блокирует
    await report('n_par', 'contradiction v1', 'evidence 1');
    let lines = await runCli(['list']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('n_par');
    expect(lines[0]).toContain(`@${rev0}`);
    expect(lines[0]).toMatch(/block: actual$/);
    expect(await callDelivered()).toEqual([]);

    // правка факта → новая ревизия: старая запись — superseded ⇔ доставляет
    await store().save(microNote('n_par', { body: 'Body of n_par, revised.' }) as never);
    lines = await runCli(['list']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/block: superseded$/);
    expect(await callDelivered()).toEqual(['n_par']);

    // новая открытая запись текущей ревизии + resolve текущей → осталась
    // только устаревшая → superseded ⇔ доставляет
    const current = await report('n_par', 'contradiction v2', 'evidence 2');
    expect(await callDelivered()).toEqual([]);
    resolveById(current.suppression_id, 'fixed by the revision');
    lines = await runCli(['list']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/block: superseded$/);
    expect(await callDelivered()).toEqual(['n_par']);

    // все resolved → list пуст ⇔ доставляет
    resolveById(
      journal()
        .suppressions()
        .find((s) => s.resolved_at === null)!.suppression_id,
      'stale, closed'
    );
    expect(await runCli(['list'])).toEqual(['no open suppressions']);
    expect(await callDelivered()).toEqual(['n_par']);

    // запись без заметки в store → unknown (REQ-03), доставка не затронута
    journal().recordSuppression({
      suppression_id: 'cnr_20261118_0000ff',
      memory_id: 'n_ghost',
      revision: 'rev000',
      reason: 'ghost contradiction',
      note_evidence: 'n_ghost@rev000',
      contradiction_evidence: 'observed nothing',
      suppressed_at: clock.now().toISOString(),
      resolved_at: null,
      resolution: null,
    });
    lines = await runCli(['list']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('cnr_20261118_0000ff');
    expect(lines[0]).toMatch(/block: unknown$/);
  });

  // T-1.4 (AC-1.4): resolve по неизвестному/уже разрешённому id через CLI —
  // REQ-03-текст порта без подмены.
  it('T-1.4: CLI resolve of an unknown record id refuses with the port text', async () => {
    await expect(runCli(['resolve', '--id', 'cnr_20261118_ffffff', '--resolution', 'x'])).rejects.toThrow(
      UserFacingError
    );
    await expect(runCli(['resolve', '--id', 'cnr_20261118_ffffff', '--resolution', 'x'])).rejects.toThrow(
      'unknown or already resolved suppression for "cnr_20261118_ffffff" (REQ-03: unknown stays unknown)'
    );
  });

  // Главный E2E-сценарий приёмки (test-plan §8, критерий D2), дословно:
  // «после нескольких противоречий к одной заметке и пересоздания индекса
  // каждое наблюдение и решение сохранены, спорная ревизия остаётся вне
  // доставки, пока её противоречие открыто».
  it('D2 E2E: several contradictions to one note survive index recreation; the revision stays undelivered while a contradiction is open', async () => {
    await store().save(microNote('n_main') as never);
    const rev = learningSignalRevision(microNote('n_main'));

    // report r1/e1 → report r2/e2 (два и более противоречий к одной заметке)
    const r1 = await report('n_main', 'hint claims A', 'observed not-A (session s1)');
    const r2 = await report('n_main', 'hint claims A again', 'observed not-A (session s2)');

    // resolve ОДНОЙ записи по id
    resolveById(r1.suppression_id, 'lead confirmed: first observation addressed');

    // rm index.sqlite → rebuild-index
    await recreateIndex();

    // каждое наблюдение и решение сохранены (журнал, обе записи)
    const records = journal().suppressions();
    expect(records.map((s) => s.suppression_id)).toEqual([r1.suppression_id, r2.suppression_id]);
    expect(records[0]).toMatchObject({
      reason: 'hint claims A',
      contradiction_evidence: 'observed not-A (session s1)',
      resolved_at: expect.any(String),
      resolution: 'lead confirmed: first observation addressed',
    });
    expect(records[1]).toMatchObject({ reason: 'hint claims A again', resolved_at: null, resolution: null });

    // list показывает открытую запись с id, ревизией и актуальностью
    const lines = await runCli(['list']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(r2.suppression_id);
    expect(lines[0]).toContain(`n_main@${rev}`);
    expect(lines[0]).toContain('hint claims A again');
    expect(lines[0]).toMatch(/block: actual$/);

    // спорная ревизия вне доставки — открыта хотя бы одна запись («some»)
    expect(await callDelivered()).toEqual([]);

    // после resolve второй записи заметка доставляется
    resolveById(r2.suppression_id, 'lead confirmed: second observation addressed');
    expect(await callDelivered()).toEqual(['n_main']);
    expect(await runCli(['list'])).toEqual(['no open suppressions']);
  });
});
