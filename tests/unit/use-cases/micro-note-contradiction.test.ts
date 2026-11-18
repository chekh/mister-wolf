import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonlMicroNoteDeliveryLog } from '../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import {
  reportMicroNoteContradiction,
  resolveMicroNoteSuppression,
} from '../../../src/app/use-cases/micro-note-contradiction.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import { MICRO_NOTE_TAG } from '../../../src/app/use-cases/micro-note-delivery.js';
import type { MemoryObject, MemoryStore } from '../../../src/domain/schemas/memory-object-schema.js';

// Патч 3.3.1 (REQ-331-1/4, design §4/§8): общая trim-валидация report в use-case
// (один носитель правила для CLI и MCP), генерация suppression_id проектным
// генератором id с префиксом cnr_, resolve по записи с REQ-03-текстами.
// T-1.2 (unit-часть), T-1.4 (use-case-часть), T-4.1, T-4.2, T-4.4 тест-плана.

function microNote(id: string): MemoryObject {
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
    facet: 'howto',
    type: 'note',
    id,
  } as MemoryObject;
}

describe('micro-note contradiction use-case (patch 3.3.1)', () => {
  let dir: string;
  let tick: number;
  const clock = { now: () => new Date(tick) };
  const idGen = new HashIdGenerator();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-contradiction-uc-'));
    tick = Date.UTC(2026, 10, 18, 12, 0, 0);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function storeWith(note: MemoryObject): MemoryStore {
    return { list: async () => [note] } as unknown as MemoryStore;
  }

  function log(): JsonlMicroNoteDeliveryLog {
    return new JsonlMicroNoteDeliveryLog(dir);
  }

  function report(
    store: MemoryStore,
    logRef: JsonlMicroNoteDeliveryLog,
    input: { note_id: string; reason: string; contradiction_evidence: string }
  ) {
    return reportMicroNoteContradiction({ store, clock, log: logRef, idGen }, input);
  }

  // T-1.2 (AC-1.2): каждая запись — собственный стабильный id cnr_YYYYMMDD_<hex>;
  // повторный report даёт НОВЫЙ id (новая запись, не перезапись).
  it('T-1.2: report generates a cnr_ record id; a repeated report generates a different id', async () => {
    const store = storeWith(microNote('n1'));
    const r1 = await report(store, log(), { note_id: 'n1', reason: 'r1', contradiction_evidence: 'e1' });
    expect(r1.suppression_id).toMatch(/^cnr_\d{8}_[0-9a-f]{6}$/);
    expect(r1.suppression_id.startsWith('cnr_20261118_')).toBe(true);

    tick += 1000;
    const r2 = await report(store, log(), { note_id: 'n1', reason: 'r2', contradiction_evidence: 'e2' });
    expect(r2.suppression_id).toMatch(/^cnr_\d{8}_[0-9a-f]{6}$/);
    expect(r2.suppression_id).not.toEqual(r1.suppression_id);

    const records = log().suppressions();
    expect(records.map((s) => s.suppression_id)).toEqual([r1.suppression_id, r2.suppression_id]);
  });

  // T-4.1 (AC-4.1): пустой/whitespace-only reason ИЛИ evidence — UserFacingError
  // с названной причиной в стиле resolve; журнал не изменён.
  it('T-4.1: empty or whitespace-only reason/evidence refuses; journal unchanged', async () => {
    const store = storeWith(microNote('n1'));
    const cases: Array<{ reason: string; contradiction_evidence: string }> = [
      { reason: '', contradiction_evidence: 'e' },
      { reason: '   ', contradiction_evidence: 'e' },
      { reason: 'r', contradiction_evidence: '' },
      { reason: 'r', contradiction_evidence: ' \n\t ' },
      { reason: '', contradiction_evidence: '' },
    ];
    for (const input of cases) {
      await expect(report(store, log(), { note_id: 'n1', ...input })).rejects.toThrow(UserFacingError);
      await expect(report(store, log(), { note_id: 'n1', ...input })).rejects.toThrow(
        'report requires reason and contradiction evidence (REQ-03: unknown stays unknown)'
      );
    }
    expect(log().suppressions()).toEqual([]);
  });

  // T-4.2 (AC-4.2): значения сохраняются после trim.
  it('T-4.2: reason and evidence are trimmed before they enter the journal', async () => {
    const store = storeWith(microNote('n1'));
    await report(store, log(), { note_id: 'n1', reason: '  note says A  ', contradiction_evidence: '\tobserved B\n' });
    const record = log().suppressions()[0]!;
    expect(record.reason).toBe('note says A');
    expect(record.contradiction_evidence).toBe('observed B');
  });

  // T-4.4 (AC-4.4): resolve-валидация не регрессирует — текст как в 3.3.0.
  it('T-4.4: resolve still refuses empty/whitespace suppression id or resolution with the REQ-03 text', () => {
    for (const input of [
      { suppression_id: '', resolution: 'r' },
      { suppression_id: '   ', resolution: 'r' },
      { suppression_id: 'cnr_20261118_0000aa', resolution: '' },
      { suppression_id: 'cnr_20261118_0000aa', resolution: ' \t ' },
    ]) {
      expect(() => resolveMicroNoteSuppression({ clock, log: log() }, input)).toThrow(UserFacingError);
      expect(() => resolveMicroNoteSuppression({ clock, log: log() }, input)).toThrow(
        'resolve requires suppression id and resolution text (REQ-03: unknown stays unknown)'
      );
    }
  });

  // T-1.4 (AC-1.4): resolve по неизвестному id и по уже разрешённому — один и тот же
  // REQ-03-текст порта; результат resolve несёт id записи и заметку.
  it('T-1.4: resolve of unknown and already-resolved record ids refuses with the same port text; result names the record', async () => {
    const store = storeWith(microNote('n1'));
    const r = await report(store, log(), { note_id: 'n1', reason: 'r', contradiction_evidence: 'e' });

    const exactUnknown = `unknown or already resolved suppression for "cnr_20261118_ffffff" (REQ-03: unknown stays unknown)`;
    expect(() =>
      resolveMicroNoteSuppression({ clock, log: log() }, { suppression_id: 'cnr_20261118_ffffff', resolution: 'x' })
    ).toThrow(exactUnknown);

    const resolved = resolveMicroNoteSuppression(
      { clock, log: log() },
      { suppression_id: r.suppression_id, resolution: 'done' }
    );
    expect(resolved.suppression_id).toBe(r.suppression_id);
    expect(resolved.memory_id).toBe('n1');
    expect(resolved.resolution).toBe('done');

    const exactResolved = `unknown or already resolved suppression for "${r.suppression_id}" (REQ-03: unknown stays unknown)`;
    expect(() =>
      resolveMicroNoteSuppression({ clock, log: log() }, { suppression_id: r.suppression_id, resolution: 'again' })
    ).toThrow(exactResolved);
  });

  // REQ-03 (неизменённое поведение): unknown note — отказ use-case, журнал не изменён.
  it('unknown note id still refuses with the use-case text and touches no journal record', async () => {
    const store = storeWith(microNote('n1'));
    await expect(
      report(store, log(), { note_id: 'n_ghost', reason: 'r', contradiction_evidence: 'e' })
    ).rejects.toThrow('unknown micro-note "n_ghost"');
    expect(log().suppressions()).toEqual([]);
  });
});
