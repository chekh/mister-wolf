// tests/unit/use-cases/init-project-base-set.test.ts
// S-DELIVERY W2 (3.0.0): набор без лиц — initProject не вызывает seed и не
// добавляет face/conflict-исходы; render — единственный источник baseSetOutcomes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProject } from '../../../src/app/use-cases/init-project.js';
import type { BaseSetOutcome, InitProjectDeps } from '../../../src/app/use-cases/init-project.js';
import type { ProjectInitializer } from '../../../src/ports/project-initializer.port.js';
import type { PlatformAdapter, McpCommand } from '../../../src/ports/platform-adapter.port.js';
import type { ModelContext } from '../../../src/ports/base-set-renderer.port.js';
import { OpencodeBaseSetRenderer } from '../../../src/adapters/render/opencode/opencode-renderer.js';
import { templatesRoot, harnessTemplatesRoot } from '../../../src/adapters/render/templates-root.js';

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

const MODELS: ModelContext = { primary: 'zai-coding-plan/glm-5.3', worker: 'zai-coding-plan/glm-5.3' };

function makeDeps(baseSet?: NonNullable<InitProjectDeps['baseSet']>, npx = false) {
  const deps: InitProjectDeps = {
    initializer: new FakeInitializer(),
    registry: new FakeRegistry(),
    adapters: [new FakeAdapter('opencode')],
    mcpCommand: { command: 'wolf', args: ['mcp'] } as McpCommand,
    npx,
    markSchemaCurrent: async () => {},
    store: {
      list: async () => [],
      get: async () => null,
      save: async () => {},
      update: async (_id: string, patch: unknown) => patch,
    } as unknown as InitProjectDeps['store'],
    log: { append: async () => {} } as InitProjectDeps['log'],
    clock: { now: () => new Date('2026-09-01T00:00:00Z') },
    idGen: { generateMemoryId: () => 'mem_20260901_x_000001', generateEventId: () => 'evt_1' },
    ...(baseSet ? { baseSet } : {}),
  };
  return deps;
}

const RENDER_OUTCOMES: BaseSetOutcome[] = [
  { file: '.opencode/agents/mr-wolf.md', action: 'created' },
  { file: '.opencode/agents/steward.md', action: 'created' },
];

const baseSet = {
  render: async (): Promise<BaseSetOutcome[]> => RENDER_OUTCOMES,
  seed: async (): Promise<BaseSetOutcome[]> => [
    { file: '.opencode/skills/steward-nastavnik/SKILL.md', action: 'created' },
  ],
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-init-bs-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('initProject + baseSet (S-DELIVERY W2: набор без лиц)', () => {
  it('render вызывается с models; seed не вызывается, baseSetOutcomes — только render', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const seen: (ModelContext | undefined)[] = [];
    let seedCalls = 0;
    const spyingBaseSet = {
      render: async (_d: string, opts?: { models?: ModelContext }) => {
        seen.push(opts?.models);
        return baseSet.render();
      },
      seed: async (): Promise<BaseSetOutcome[]> => {
        seedCalls++;
        return baseSet.seed();
      },
    };
    const result = await initProject(makeDeps(spyingBaseSet), dir, { models: MODELS, full: true });
    expect(seen).toEqual([MODELS]);
    expect(seedCalls).toBe(0);
    expect(result.baseSetOutcomes).toEqual(RENDER_OUTCOMES);
  });

  it('без лиц в store — ни seed-исходов, ни (base set faces) conflict-строки', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const result = await initProject(makeDeps(baseSet), dir, { models: MODELS, full: true });
    expect(result.baseSetOutcomes).toEqual(RENDER_OUTCOMES);
    const text = JSON.stringify(result.baseSetOutcomes);
    expect(text).not.toContain('base set faces');
    expect(text).not.toContain('no active face with owner_skill');
  });

  it('npx: true — один outcome skipped/npx try-out, render/seed не вызываются', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    let renderCalled = false;
    const npxBaseSet = {
      render: async (): Promise<BaseSetOutcome[]> => {
        renderCalled = true;
        return [];
      },
      seed: baseSet.seed,
    };
    const result = await initProject(makeDeps(npxBaseSet, true), dir, { models: MODELS });
    expect(result.baseSetOutcomes).toEqual([
      { file: '(base set)', action: 'skipped', reason: 'npx try-out does not write the base set (spec §7)' },
    ]);
    expect(renderCalled).toBe(false);
  });

  it('без baseSet — пустой baseSetOutcomes (обратная совместимость)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const result = await initProject(makeDeps(), dir, { models: MODELS });
    expect(result.baseSetOutcomes).toEqual([]);
  });
});

/** Реальный рендер (интеграционный юнит): свежий контент агентов по контракту WP2 unpin. */
function realBaseSet(): NonNullable<InitProjectDeps['baseSet']> {
  return {
    render: (d, opts) =>
      new OpencodeBaseSetRenderer(templatesRoot(), {
        harnessTemplatesRoot: harnessTemplatesRoot('opencode'),
      }).renderBaseSet(d, opts),
  };
}

describe('WP2 unpin (спека 2.16 §5): init-рендер свежего контента', () => {
  it("'omit' — agent-профили без model-строк", async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    // WP1 (спека 2.16 §4): профили — часть полного набора
    await initProject(makeDeps(realBaseSet()), dir, { models: 'omit', full: true });
    const raw = readFileSync(join(dir, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(raw).not.toMatch(/^[^\S\n]*model:[^\S\n]*\{\{model\./m);
    expect(raw).not.toMatch(/^model:\s+\S+/m);
  });

  it('явный ModelContext — model-строка с подстановкой (opt-in)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    await initProject(makeDeps(realBaseSet()), dir, { models: MODELS, full: true });
    const raw = readFileSync(join(dir, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(raw).toContain('model: zai-coding-plan/glm-5.3');
  });
});
