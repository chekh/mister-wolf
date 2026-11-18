import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonlMicroNoteDeliveryLog } from '../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { FsFileSystem } from '../../src/adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../../src/adapters/fs/heuristic-project-scanner.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { getCallInjections } from '../../src/app/use-cases/get-call-injections.js';
import { generateAgentBrief } from '../../src/app/use-cases/generate-agent-brief.js';
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

// 3.2.0 T-09 (test-plan S-17/S-27, REQ-09/REQ-03) + патч 3.3.1 (REQ-331-2):
// attribution micro-notes на реальных адаптерах (markdown store + постоянный
// JSONL-журнал вне кэша) в tmp: доставка с точным id@version, журнал
// selected/delivered, подавление противоречием с сохранением обоих evidence и
// с идентичностью записей (suppression_id).

const NOW = new Date('2026-11-17T00:00:00.000Z');
const clock = { now: () => NOW };
const idGen = new HashIdGenerator();

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

function stageSignal(id: string, stage: 'cited' | 'applied'): SignalEvent {
  return {
    ts: '2026-11-17T01:00:00.000Z',
    event: 'memory_stage',
    schema_version: 2,
    session_id: 'sess-use',
    detail: { stage, memory_ids: [id] },
  } as unknown as SignalEvent;
}

describe('micro-note attribution on the persistent journal (T-09, patch 3.3.1)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let journal: JsonlMicroNoteDeliveryLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-micro-note-'));
    store = new MarkdownMemoryStore(dir);
    journal = new JsonlMicroNoteDeliveryLog(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('wolf call delivers fitting micro-notes with exact id@version and records selected/delivered (S-17)', async () => {
    await store.save(microNote('n_fit', { applies: { environments: ['darwin'] } }) as any);
    await store.save(microNote('n_linux', { applies: { environments: ['linux'] } }) as any);

    const result = await getCallInjections(
      { store, clock, noteLog: journal },
      { microNotes: { environment: 'darwin' } }
    );
    const rev = learningSignalRevision(microNote('n_fit'));
    expect(result.microNotes).not.toBeNull();
    expect(result.microNotes!.delivered.map((c) => c.id)).toEqual(['n_fit']);
    expect(result.blocks.some((b) => b.includes(`[n_fit@${rev.slice(0, 12)}]`))).toBe(true);
    expect(result.deliveredIds).toContain('n_fit');

    const deliveries = journal.deliveries();
    expect(deliveries.filter((d) => d.kind === 'delivered')).toEqual([
      { memory_id: 'n_fit', revision: rev, channel: 'call', kind: 'delivered', ts: NOW.toISOString() },
    ]);
    // env-inapplicable note never became a candidate: nothing selected beyond the delivery
    expect(deliveries.filter((d) => d.kind === 'selected')).toEqual([]);
  });

  it('no fitting micro-notes → empty micro section, no deliveries recorded (S-17)', async () => {
    await store.save(microNote('n_linux', { applies: { environments: ['linux'] } }) as any);
    const result = await getCallInjections(
      { store, clock, noteLog: journal },
      { microNotes: { environment: 'darwin' } }
    );
    expect(result.microNotes!.blocks).toEqual([]);
    expect(result.microNotes!.delivered).toEqual([]);
    expect(journal.deliveries()).toEqual([]);
  });

  it('budget-dropped optional note is recorded as selected but not delivered (S-18)', async () => {
    await store.save(microNote('n_big', { body: 'X'.repeat(2000) }) as any);
    await store.save(microNote('n_small', { body: 'tiny hint', importance: 0.4 }) as any);
    const result = await getCallInjections(
      { store, clock, noteLog: journal },
      { microNotes: { environment: 'darwin', budget: { maxChars: 600 } } }
    );
    // importance desc: n_big (0.5) first, exceeds the small budget; n_small fits
    expect(result.microNotes!.delivered.map((c) => c.id)).toEqual(['n_small']);
    expect(result.microNotes!.dropped.map((c) => c.id)).toEqual(['n_big']);
    const kinds = journal
      .deliveries()
      .map((d) => `${d.memory_id}:${d.kind}`)
      .sort();
    expect(kinds).toEqual(['n_big:selected', 'n_small:delivered']);
  });

  it('contradiction suppresses delivery, keeps both evidences across reopen; resolve by record id returns delivery (S-27)', async () => {
    const obj = microNote('n_conf');
    await store.save(obj as any);

    const report = await reportMicroNoteContradiction(
      { store, clock, log: journal, idGen },
      { note_id: 'n_conf', reason: 'note says A, observed B', contradiction_evidence: 'observed B in session sess-1' }
    );
    expect(report.memory_id).toBe('n_conf');
    expect(report.suppression_id).toMatch(/^cnr_\d{8}_[0-9a-f]{6}$/);
    expect(report.note_evidence).toBe(`n_conf@${learningSignalRevision(obj).slice(0, 12)}`);

    const before = await getCallInjections({ store, clock, noteLog: journal }, { microNotes: {} });
    expect(before.microNotes!.delivered).toEqual([]);
    expect(before.microNotes!.underReview.map((u) => u.id)).toEqual(['n_conf']);

    // reopen the journal from the persistent file: the audit record survives
    const reopened = new JsonlMicroNoteDeliveryLog(dir);
    const records = reopened.suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]!.suppression_id).toBe(report.suppression_id);
    expect(records[0]!.note_evidence).toBe(report.note_evidence);
    expect(records[0]!.contradiction_evidence).toBe('observed B in session sess-1');
    expect(records[0]!.resolved_at).toBeNull();

    const after = await getCallInjections({ store, clock, noteLog: reopened }, { microNotes: {} });
    expect(after.microNotes!.delivered).toEqual([]);
    expect(after.microNotes!.underReview).toHaveLength(1);

    resolveMicroNoteSuppression(
      { clock, log: reopened },
      {
        suppression_id: report.suppression_id,
        resolution: 'confirmed by lead',
      }
    );
    const released = await getCallInjections({ store, clock, noteLog: reopened }, { microNotes: {} });
    expect(released.microNotes!.delivered.map((c) => c.id)).toEqual(['n_conf']);
    // audit record stays after resolution (both evidences preserved, S-27)
    expect(reopened.suppressions()[0]!.resolution).toBe('confirmed by lead');
  });

  it('suppressing an unknown micro-note id is refused (REQ-03: unknown stays unknown)', async () => {
    await expect(
      reportMicroNoteContradiction(
        { store, clock, log: journal, idGen },
        { note_id: 'nope', reason: 'x', contradiction_evidence: 'y' }
      )
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it('observed_use reconciled from existing memory_stage signals; outcome stays unknown (design §10)', async () => {
    await store.save(microNote('n_used') as any);
    await getCallInjections({ store, clock, noteLog: journal }, { microNotes: {} });
    const { observed } = reconcileMicroNoteObservations({ clock, log: journal }, [stageSignal('n_used', 'cited')]);
    expect(observed).toEqual([{ memory_id: 'n_used', observed_use: 'cited' }]);
    const obs = journal.observations();
    expect(obs).toHaveLength(1);
    expect(obs[0]!.observed_use).toBe('cited');
    expect(obs[0]!.observed_outcome).toBe('unknown');
    // delivered without use signals → no observation row (unknown stays unknown)
    await store.save(microNote('n_unobserved') as any);
    await getCallInjections({ store, clock, noteLog: journal }, { microNotes: {} });
    expect(journal.observations()).toHaveLength(1);
  });

  it('wolf brief embeds micro-notes with id@version and attributes deliveries (REQ-09)', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'brief-micro' }), 'utf-8');
    await store.save(microNote('n_brief', { applies: { environments: ['darwin'] } }) as any);

    const snapshot = await new HeuristicProjectScanner(new FsFileSystem()).scan(dir);
    const brief = await generateAgentBrief({ store, fs: new FsFileSystem(), clock, noteLog: journal }, dir, snapshot, {
      microNotes: { context: { environment: 'darwin' } },
    });
    const rev = learningSignalRevision(microNote('n_brief'));
    expect(brief.content).toContain('## Local Micro-Notes');
    expect(brief.content).toContain(`[n_brief@${rev.slice(0, 12)}]`);
    expect(brief.microNotes!.delivered.map((c) => c.id)).toEqual(['n_brief']);
    expect(brief.injectedIds).toContain('n_brief');
    expect(
      journal
        .deliveries()
        .filter((d) => d.kind === 'delivered')
        .map((d) => d.channel)
    ).toEqual(['brief']);
  });
});
