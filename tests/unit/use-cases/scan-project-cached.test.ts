import { describe, it, expect, vi } from 'vitest';
import { scanProjectCached } from '../../../src/app/use-cases/scan-project.js';
import type { ProjectSnapshot } from '../../../src/domain/schemas/project-scan-schema.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { Clock } from '../../../src/ports/clock.port.js';
import type { IdGenerator } from '../../../src/ports/id-generator.port.js';
import type { ProjectScanner } from '../../../src/ports/project-scanner.port.js';

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
    docs: [],
  };
}

function makeDeps() {
  const scanner: ProjectScanner = { scan: vi.fn(async () => makeSnapshot()) };
  const store: MemoryStore = {
    save: vi.fn(async () => {}),
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    update: vi.fn(async () => {
      throw new Error('not used');
    }),
  };
  const log: EventLog = { append: vi.fn(async () => {}), readAll: vi.fn(async () => []) };
  const clock: Clock = { now: () => new Date('2026-09-28T00:00:00.000Z') };
  const idGen: IdGenerator = { generateMemoryId: () => 'mem-1', generateEventId: () => 'evt-1' };
  return { deps: { store, log, clock, idGen, scanner }, scanner };
}

describe('scanProjectCached', () => {
  it('одинаковая сигнатура → scanner.scan 1 раз, результат идентичен (тот же объект)', async () => {
    const { deps, scanner } = makeDeps();
    const cached = { ...deps, treeSignature: async () => 'sig-a' };
    const r1 = await scanProjectCached(cached, '/fake/r1');
    const r2 = await scanProjectCached(cached, '/fake/r1');
    expect(scanner.scan).toHaveBeenCalledTimes(1);
    expect(r2).toBe(r1);
  });

  it('смена сигнатуры → повторный полный скан', async () => {
    const { deps, scanner } = makeDeps();
    await scanProjectCached({ ...deps, treeSignature: async () => 'sig-a' }, '/fake/r2');
    await scanProjectCached({ ...deps, treeSignature: async () => 'sig-a' }, '/fake/r2');
    await scanProjectCached({ ...deps, treeSignature: async () => 'sig-b' }, '/fake/r2');
    expect(scanner.scan).toHaveBeenCalledTimes(2);
  });

  it('без treeSignature → всегда полный скан (обратная совместимость)', async () => {
    const { deps, scanner } = makeDeps();
    await scanProjectCached(deps, '/fake/r3');
    await scanProjectCached(deps, '/fake/r3');
    expect(scanner.scan).toHaveBeenCalledTimes(2);
  });

  it('разные root → независимые записи кэша', async () => {
    const { deps, scanner } = makeDeps();
    await scanProjectCached({ ...deps, treeSignature: async () => 'sig-a' }, '/fake/r4a');
    await scanProjectCached({ ...deps, treeSignature: async () => 'sig-a' }, '/fake/r4b');
    expect(scanner.scan).toHaveBeenCalledTimes(2);
  });
});
