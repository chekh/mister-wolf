import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanProjectCached, type ScanSnapshotEntry } from '../../../src/app/use-cases/scan-project.js';
import { FsScanSnapshotCache, openScanSnapshotCache } from '../../../src/adapters/fs/scan-snapshot-cache.js';
import type { ProjectSnapshot } from '../../../src/domain/schemas/project-scan-schema.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { Clock } from '../../../src/ports/clock.port.js';
import type { IdGenerator } from '../../../src/ports/id-generator.port.js';
import type { ProjectScanner } from '../../../src/ports/project-scanner.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeSnapshot(): ProjectSnapshot {
  return {
    projectName: 'cached-test',
    root: '.',
    generatedAt: '2026-09-28T00:00:00.000Z',
    summary: {
      languages: ['ts'],
      entryPoints: [],
      configFiles: [],
      dependencies: [],
      topLevelDirectories: ['src'],
      fileCount: 0,
    },
    files: [],
    docs: [{ path: 'docs/guide.md', title: 'Guide' }],
  };
}

function makeDeps() {
  const objects = new Map<string, MemoryObject>();
  const scanner: ProjectScanner = { scan: vi.fn(async () => makeSnapshot()) };
  const store: MemoryStore = {
    save: vi.fn(async (o) => {
      objects.set(o.id, o);
    }),
    get: vi.fn(async (id) => objects.get(id) ?? null),
    list: vi.fn(async (filters?: { type?: string }) =>
      [...objects.values()].filter((o) => !filters?.type || o.type === filters.type)
    ),
    update: vi.fn(async () => {
      throw new Error('not used');
    }),
  };
  const log: EventLog = { append: vi.fn(async () => {}), readAll: vi.fn(async () => []) };
  const clock: Clock = { now: () => new Date('2026-09-28T00:00:00.000Z') };
  const idGen: IdGenerator = { generateMemoryId: () => 'mem-1', generateEventId: () => 'evt-1' };
  return { deps: { store, log, clock, idGen, scanner }, scanner };
}

/** In-memory фейк персистного кэша (read/write сигнатурно совместимы с FsScanSnapshotCache). */
function fakeCache() {
  let entry: ScanSnapshotEntry | null = null;
  return {
    read: vi.fn(async (): Promise<ScanSnapshotEntry | null> => entry),
    write: vi.fn(async (e: ScanSnapshotEntry) => {
      entry = e;
    }),
    peek: () => entry,
  };
}

describe('scanProjectCached (P105: персистный snapshot-кэш)', () => {
  it('сигнатура совпала → scanner.scan не вызван, результат восстановлен из кэша, ноль записей в store', async () => {
    const { deps, scanner } = makeDeps();
    const cache = fakeCache();
    const cached = { ...deps, treeSignature: vi.fn(async () => 'sig-a'), snapshotCache: cache };

    const r1 = await scanProjectCached(cached, '/fake/r1');
    expect(scanner.scan).toHaveBeenCalledTimes(1);
    const savesAfterFirst = (deps.store.save as ReturnType<typeof vi.fn>).mock.calls.length;

    const r2 = await scanProjectCached(cached, '/fake/r1');

    expect(scanner.scan).toHaveBeenCalledTimes(1); // обход дерева пропущен
    expect((deps.store.save as ReturnType<typeof vi.fn>).mock.calls.length).toBe(savesAfterFirst);
    expect(r2.object.id).toBe('project-scan-latest');
    expect(r2.snapshot.projectName).toBe(r1.snapshot.projectName);
    expect(r2.documents.map((d) => d.id)).toEqual(r1.documents.map((d) => d.id));
    expect(r2.object.body).toContain('# Project Scan: cached-test');
  });

  it('сигнатура изменилась → полный скан, кэш перезаписан, существующие id doc-ref сохранены', async () => {
    const { deps, scanner } = makeDeps();
    const cache = fakeCache();
    const cached = { ...deps, treeSignature: vi.fn(async () => 'sig-a'), snapshotCache: cache };

    const r1 = await scanProjectCached(cached, '/fake/r2');
    (cached.treeSignature as ReturnType<typeof vi.fn>).mockResolvedValue('sig-b');
    const r2 = await scanProjectCached(cached, '/fake/r2');

    expect(scanner.scan).toHaveBeenCalledTimes(2);
    expect(cache.write).toHaveBeenCalledTimes(2);
    expect(cache.peek()?.sig).toBe('sig-b');
    // doc-ref существовал (по source.path) → id сохранён
    expect(r2.documents).toHaveLength(1);
    expect(r2.documents[0].id).toBe(r1.documents[0].id);
    expect(r2.documents[0].source.path).toBe('docs/guide.md');
  });

  it('без treeSignature → всегда полный скан (обратная совместимость)', async () => {
    const { deps, scanner } = makeDeps();
    const cache = fakeCache();
    await scanProjectCached({ ...deps, snapshotCache: cache }, '/fake/r3');
    await scanProjectCached({ ...deps, snapshotCache: cache }, '/fake/r3');
    expect(scanner.scan).toHaveBeenCalledTimes(2);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('битый JSON кэша (реальный fs) → полный скан без ошибок, кэш перезаписан валидным файлом', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-scan-cache-'));
    try {
      mkdirSync(join(dir, '.wolf', 'cache'), { recursive: true });
      const cacheFile = join(dir, '.wolf', 'cache', 'scan-snapshot.json');
      writeFileSync(cacheFile, '{not json');

      const cache = openScanSnapshotCache(dir);
      expect(await cache.read()).toBeNull();

      const { deps, scanner } = makeDeps();
      const r = await scanProjectCached({ ...deps, treeSignature: async () => 'sig-a', snapshotCache: cache }, dir);
      expect(scanner.scan).toHaveBeenCalledTimes(1);
      expect(r.snapshot.projectName).toBe('cached-test');

      // кэш перезаписан валидным JSON формата {sig, snapshot, object, documents}
      expect(existsSync(cacheFile)).toBe(true);
      const persisted = JSON.parse(readFileSync(cacheFile, 'utf-8')) as ScanSnapshotEntry;
      expect(persisted.sig).toBe('sig-a');
      expect(persisted.object.id).toBe('project-scan-latest');
      expect(persisted.snapshot.projectName).toBe('cached-test');
      expect(persisted.documents).toHaveLength(1);

      // roundtrip: hit по той же сигнатуре
      const r2 = await scanProjectCached({ ...deps, treeSignature: async () => 'sig-a', snapshotCache: cache }, dir);
      expect(scanner.scan).toHaveBeenCalledTimes(1);
      expect(r2.documents[0].id).toBe(r.documents[0].id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('FsScanSnapshotCache: запись во временный каталог создаёт .wolf/cache рекурсивно', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-scan-cache-mkdir-'));
    try {
      const cache = new FsScanSnapshotCache(join(dir, '.wolf', 'cache', 'scan-snapshot.json'));
      await cache.write({ sig: 's', object: { id: 'x' } as never, snapshot: makeSnapshot(), documents: [] });
      expect((await cache.read())?.sig).toBe('s');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
