// T-333-7.1 (AC-7.1, REQ-333-7, ADR-340-6): структурный guard стоимости выдачи.
// Один in-process `brief` и один `call` над журналом на 8 заметок со spy на fs:
// парс-чтений журнала ≤ 1 (плюс одно repair-чтение — граница ≤ 2 readFileSync
// журнала), appends = 1 (батч N строк одним вызовом), вызовов suppressions()
// на invocation = 1. Красный на базе: 8 appends, много чтений (per-note
// recordDelivery = лок+load+repair+append на каждую заметку).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateAgentBrief } from '../../../src/app/use-cases/generate-agent-brief.js';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { JsonlMicroNoteDeliveryLog } from '../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { FileSystem } from '../../../src/ports/file-system.port.js';
import type { Clock } from '../../../src/ports/clock.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { ProjectSnapshot } from '../../../src/domain/schemas/project-scan-schema.js';

// Счётчики IO по ПУТИ журнала; vi.mock('fs') пересчитывает только журнал,
// остальные вызовы форвардятся в оригинал без изменений.
const journalIo = vi.hoisted(() => ({
  reads: 0,
  appends: [] as string[],
  reset(): void {
    this.reads = 0;
    this.appends.length = 0;
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const isJournal = (p: unknown): boolean => typeof p === 'string' && p.includes('micro-note-delivery.jsonl');
  return {
    ...actual,
    readFileSync: ((path: unknown, ...rest: unknown[]) => {
      if (isJournal(path)) journalIo.reads++;
      return (actual.readFileSync as (p: unknown, ...r: unknown[]) => unknown)(path, ...rest);
    }) as typeof actual.readFileSync,
    appendFileSync: ((path: unknown, data: unknown, ...rest: unknown[]) => {
      if (isJournal(path)) journalIo.appends.push(typeof data === 'string' ? data : String(data));
      return (actual.appendFileSync as (p: unknown, d: unknown, ...r: unknown[]) => unknown)(path, data, ...rest);
    }) as typeof actual.appendFileSync,
  };
});

const NOW = new Date('2026-11-19T00:00:00.000Z');
const clock: Clock = { now: () => NOW };

function stubStore(objects: MemoryObject[]): MemoryStore {
  return { list: async () => objects } as unknown as MemoryStore;
}

const fsStub = {
  readSmallTextFile: async () => null,
  readFile: async () => null,
  writeFile: async () => {},
  mkdir: async () => {},
} as unknown as FileSystem;

function microNote(id: string): MemoryObject {
  return {
    title: `Guard note ${id}`,
    body: `Body of ${id} for the batch guard.`,
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
    tags: ['micro-note'],
    superseded_by: null,
    type: 'note',
    facet: 'howto',
    id,
  } as unknown as MemoryObject;
}

const snapshot: ProjectSnapshot = {
  projectName: 'batch-guard',
  root: '.',
  generatedAt: '2026-11-19T00:00:00.000Z',
  summary: {
    languages: ['ts'],
    entryPoints: [],
    configFiles: [],
    dependencies: [],
    topLevelDirectories: [],
    fileCount: 0,
  },
  files: [],
  docs: [],
};

const EIGHT = Array.from({ length: 8 }, (_, i) => microNote(`n_guard_${i}`));

describe('T-333-7.1: structural guard — one snapshot and one batched append per invocation', () => {
  let dir: string;
  let log: JsonlMicroNoteDeliveryLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-batch-guard-'));
    log = new JsonlMicroNoteDeliveryLog(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('brief: suppressions() = 1, journal readFileSync ≤ 2, appends = 1 (batch of 8 delivered rows)', async () => {
    const supSpy = vi.spyOn(log, 'suppressions');
    journalIo.reset();
    await generateAgentBrief({ store: stubStore(EIGHT), fs: fsStub, clock, noteLog: log }, dir, snapshot, {
      microNotes: {},
    });
    expect(supSpy).toHaveBeenCalledTimes(1);
    expect(journalIo.reads).toBeLessThanOrEqual(2);
    expect(journalIo.appends).toHaveLength(1);
    const rows = (journalIo.appends[0] ?? '').split('\n').filter((l) => l.includes('"kind":"delivered"'));
    expect(rows).toHaveLength(8);
  });

  it('call: suppressions() = 1, journal readFileSync ≤ 2, appends = 1 (batch of 8 delivered rows)', async () => {
    const supSpy = vi.spyOn(log, 'suppressions');
    journalIo.reset();
    await getCallInjections({ store: stubStore(EIGHT), clock, noteLog: log, baseDir: dir }, { microNotes: {} });
    expect(supSpy).toHaveBeenCalledTimes(1);
    expect(journalIo.reads).toBeLessThanOrEqual(2);
    expect(journalIo.appends).toHaveLength(1);
    const rows = (journalIo.appends[0] ?? '').split('\n').filter((l) => l.includes('"kind":"delivered"'));
    expect(rows).toHaveLength(8);
  });

  it('the batch preserves the row order: delivered first, then selected-not-delivered', async () => {
    // 12 заметок при бюджете 8: 8 delivered + 4 selected — порядок строк детерминирован
    const twelve = Array.from({ length: 12 }, (_, i) => microNote(`n_order_${String(i).padStart(2, '0')}`));
    journalIo.reset();
    await generateAgentBrief({ store: stubStore(twelve), fs: fsStub, clock, noteLog: log }, dir, snapshot, {
      microNotes: {},
    });
    expect(journalIo.appends).toHaveLength(1);
    const batch = journalIo.appends[0] ?? '';
    const lines = batch.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(12);
    const deliveredCount = lines.filter((l) => l.includes('"kind":"delivered"')).length;
    const selectedCount = lines.filter((l) => l.includes('"kind":"selected"')).length;
    expect(deliveredCount).toBe(8);
    expect(selectedCount).toBe(4);
    const lastDelivered = lines.map((l) => l.includes('"delivered"')).lastIndexOf(true);
    const firstSelected = lines.findIndex((l) => l.includes('"selected"'));
    expect(firstSelected).toBeGreaterThan(lastDelivered); // delivered раньше selected
  });
});
