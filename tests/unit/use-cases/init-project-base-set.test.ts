// tests/unit/use-cases/init-project-base-set.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProject } from '../../../src/app/use-cases/init-project.js';
import type { BaseSetOutcome, InitProjectDeps } from '../../../src/app/use-cases/init-project.js';
import type { ProjectInitializer } from '../../../src/ports/project-initializer.port.js';
import type { PlatformAdapter, McpCommand } from '../../../src/ports/platform-adapter.port.js';
import type { ModelContext } from '../../../src/ports/base-set-renderer.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

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
  async writeConfig() {
    return { action: 'written' as const };
  }
  async removeWolf(): Promise<boolean> {
    return true;
  }
}
class FakeRegistry {
  async register(): Promise<void> {}
}

class FakeMemoryStore {
  objects: MemoryObject[] = [];
  async save(o: MemoryObject): Promise<void> {
    this.objects.push(o);
  }
  async get(id: string): Promise<MemoryObject | null> {
    return this.objects.find((o) => o.id === id) ?? null;
  }
  async list(filters?: { type?: string }): Promise<MemoryObject[]> {
    return filters?.type ? this.objects.filter((o) => o.type === filters.type) : [...this.objects];
  }
  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    const o = this.objects.find((x) => x.id === id);
    if (!o) throw new Error(`not found: ${id}`);
    Object.assign(o, patch);
    return o;
  }
}

const MODELS: ModelContext = { primary: 'zai-coding-plan/glm-5.3', worker: 'zai-coding-plan/glm-5.3' };

function makeDeps(
  baseSet?: { render: InitProjectDeps['baseSet'] extends undefined ? never : NonNullable<InitProjectDeps['baseSet']> },
  npx = false
) {
  const deps: InitProjectDeps = {
    initializer: new FakeInitializer(),
    registry: new FakeRegistry(),
    adapters: [new FakeAdapter('opencode')],
    mcpCommand: { command: 'wolf', args: ['mcp'] } as McpCommand,
    npx,
    markSchemaCurrent: async () => {},
    store: new FakeMemoryStore() as unknown as InitProjectDeps['store'],
    log: { append: async () => {} } as InitProjectDeps['log'],
    clock: { now: () => new Date('2026-09-01T00:00:00Z') },
    idGen: { generateMemoryId: () => 'mem_20260901_x_000001', generateEventId: () => 'evt_1' },
    ...(baseSet ? { baseSet } : {}),
  };
  return deps;
}

const baseSet = {
  render: async () => [
    { file: '.opencode/agents/mr-wolf.md', action: 'created' as const },
    { file: '.opencode/agents/steward.md', action: 'created' as const },
  ],
  seed: async () => [{ file: '.opencode/skills/steward-nastavnik/SKILL.md', action: 'created' as const }],
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-init-bs-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('initProject + baseSet (Task 6 + §4.5: модели — в рендер)', () => {
  it('вызывает render с models и seed, возвращает baseSetOutcomes', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const seen: (ModelContext | undefined)[] = [];
    const spyingBaseSet = {
      ...baseSet,
      render: async (_d: string, opts?: { models?: ModelContext }) => {
        seen.push(opts?.models);
        return baseSet.render();
      },
    };
    const result = await initProject(makeDeps(spyingBaseSet), dir, { models: MODELS });
    expect(seen).toEqual([MODELS]);
    expect(result.baseSetOutcomes).toEqual([
      { file: '.opencode/agents/mr-wolf.md', action: 'created' },
      { file: '.opencode/agents/steward.md', action: 'created' },
      { file: '.opencode/skills/steward-nastavnik/SKILL.md', action: 'created' },
    ]);
  });

  it('npx: true — один outcome skipped/npx try-out, render/seed не вызываются', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    let renderCalled = false;
    const npxBaseSet = {
      render: async () => {
        renderCalled = true;
        return [] as BaseSetOutcome[];
      },
      seed: baseSet.seed,
    };
    const result = await initProject(makeDeps(npxBaseSet, true), dir, { models: MODELS });
    expect(result.baseSetOutcomes).toEqual([
      { file: '(base set)', action: 'skipped', reason: 'npx try-out не пишет набор (спека §7)' },
    ]);
    expect(renderCalled).toBe(false);
  });

  it('без baseSet — пустой baseSetOutcomes (обратная совместимость)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const result = await initProject(makeDeps(), dir, { models: MODELS });
    expect(result.baseSetOutcomes).toEqual([]);
  });
});
