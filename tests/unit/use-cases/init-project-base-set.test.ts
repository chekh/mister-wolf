// tests/unit/use-cases/init-project-base-set.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProject } from '../../../src/app/use-cases/init-project.js';
import type { BaseSetOutcome } from '../../../src/app/use-cases/init-project.js';
import type { ProjectInitializer } from '../../../src/ports/project-initializer.port.js';
import type { PlatformAdapter, McpCommand } from '../../../src/ports/platform-adapter.port.js';
import type { scanProject } from '../../../src/app/use-cases/scan-project.js';
import type { ProjectSnapshot } from '../../../src/domain/schemas/project-scan-schema.js';

class FakeInitializer implements ProjectInitializer {
  async initialize(): Promise<void> {}
}
class FakeAdapter implements PlatformAdapter {
  constructor(readonly id: string) {}
  detect(): boolean {
    return false;
  }
  async readConfig() {
    return null;
  }
  async writeConfig(): Promise<'written'> {
    return 'written';
  }
  async removeWolf(): Promise<boolean> {
    return true;
  }
}
class FakeRegistry {
  async register(): Promise<void> {}
}

const emptySnapshot = {
  root: '/proj',
  projectName: 'proj',
  branch: null,
  commit: null,
  files: [],
  docs: [],
  summary: {
    languages: [],
    entryPoints: [],
    configFiles: [],
    dependencies: [],
    topLevelDirectories: [],
    fileCount: 0,
  },
} as unknown as ProjectSnapshot;

function makeDeps(
  baseSet?: { render: (d: string) => Promise<BaseSetOutcome[]>; seed: (d: string) => Promise<BaseSetOutcome[]> },
  npx = false
) {
  return {
    initializer: new FakeInitializer(),
    registry: new FakeRegistry(),
    adapters: [new FakeAdapter('opencode')],
    mcpCommand: { command: 'wolf', args: ['mcp'] } as McpCommand,
    npx,
    scanDeps: {
      store: {
        get: async () => null,
        save: async () => {},
        list: async () => [],
        update: async (_i: string, p: unknown) => p,
      },
      log: { append: async () => {} },
      clock: { now: () => new Date('2026-08-30T00:00:00Z') },
      idGen: { generateEventId: () => 'evt_1', generateObjectId: () => 'obj_1' },
      scanner: { scan: async () => emptySnapshot },
    } as unknown as Parameters<typeof scanProject>[0],
    markSchemaCurrent: async () => {},
    ...(baseSet ? { baseSet } : {}),
  };
}

const baseSet = {
  render: async () => [
    { file: 'mr-wolf.md', action: 'created' as const },
    { file: 'steward.md', action: 'created' as const },
  ],
  seed: async () => [{ file: 'steward-nastavnik.md', action: 'created' as const }],
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-init-bs-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('initProject + baseSet (Task 6)', () => {
  it('вызывает render и seed, возвращает baseSetOutcomes', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const result = await initProject(makeDeps(baseSet), dir);
    expect(result.baseSetOutcomes).toEqual([
      { file: 'mr-wolf.md', action: 'created' },
      { file: 'steward.md', action: 'created' },
      { file: 'steward-nastavnik.md', action: 'created' },
    ]);
  });

  it('npx: true — один outcome skipped/npx try-out, render/seed не вызываются', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    let renderCalled = false;
    const npxBaseSet = {
      render: async () => {
        renderCalled = true;
        return [];
      },
      seed: baseSet.seed,
    };
    const result = await initProject(makeDeps(npxBaseSet, true), dir);
    expect(result.baseSetOutcomes).toEqual([
      { file: '(base set)', action: 'skipped', reason: 'npx try-out не пишет набор (спека §7)' },
    ]);
    expect(renderCalled).toBe(false);
  });

  it('без baseSet — пустой baseSetOutcomes (обратная совместимость)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const result = await initProject(makeDeps(), dir);
    expect(result.baseSetOutcomes).toEqual([]);
  });
});
