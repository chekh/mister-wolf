import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProject, looksLikeProjectRoot, recreateConfig } from '../../../src/app/use-cases/init-project.js';
import { ProjectInitializer } from '../../../src/ports/project-initializer.port.js';
import { PlatformAdapter, PlatformConfig, McpCommand } from '../../../src/ports/platform-adapter.port.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import { scanProject } from '../../../src/app/use-cases/scan-project.js';
import type { ProjectSnapshot } from '../../../src/domain/schemas/project-scan-schema.js';

/* ---------- fakes ---------- */

class FakeInitializer implements ProjectInitializer {
  calls = 0;
  async initialize(): Promise<void> {
    this.calls += 1;
  }
}

class FakeAdapter implements PlatformAdapter {
  writeCalls = 0;
  removeCalls = 0;
  constructor(
    readonly id: string,
    private readonly detected: boolean
  ) {}
  detect(): boolean {
    return this.detected;
  }
  async readConfig(): Promise<PlatformConfig | null> {
    return null;
  }
  async writeConfig(): Promise<'written' | 'replaced' | 'unchanged'> {
    this.writeCalls += 1;
    return 'written';
  }
  async removeWolf(): Promise<boolean> {
    this.removeCalls += 1;
    return true;
  }
}

class FakeRegistry {
  registered: { path: string; schemaVersion: number }[] = [];
  async register(path: string, schemaVersion: number): Promise<void> {
    this.registered.push({ path, schemaVersion });
  }
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

const markSpy = { calls: 0 };

function makeDeps(adapters: FakeAdapter[], opts: { npx?: boolean } = {}) {
  return {
    initializer: new FakeInitializer(),
    registry: new FakeRegistry(),
    adapters,
    mcpCommand: { command: 'wolf', args: ['mcp'] } as McpCommand,
    npx: opts.npx ?? false,
    scanDeps: {
      store: {
        get: async () => null,
        save: async () => {},
        list: async () => [],
        update: async (_id: string, patch: unknown) => patch,
      },
      log: { append: async () => {} },
      clock: { now: () => new Date('2026-08-30T00:00:00Z') },
      idGen: { generateEventId: () => 'evt_1', generateObjectId: () => 'obj_1' },
      scanner: { scan: async () => emptySnapshot },
    } as unknown as Parameters<typeof scanProject>[0],
    markSchemaCurrent: async () => {
      markSpy.calls += 1;
    },
  };
}

/* ---------- env ---------- */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-init-uc-'));
  markSpy.calls = 0;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/* ---------- tests ---------- */

describe('looksLikeProjectRoot (спека §6: init вне проекта → диагностика, ничего не создаётся)', () => {
  it('empty dir is not a project root', () => {
    expect(looksLikeProjectRoot(dir)).toBe(false);
  });

  it('package.json makes it a project root', () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    expect(looksLikeProjectRoot(dir)).toBe(true);
  });
});

describe('initProject', () => {
  it('outside a project: throws UserFacingError, nothing created', async () => {
    const deps = makeDeps([]);
    await expect(initProject(deps, dir)).rejects.toThrow(/Not a project root/);
    expect(deps.initializer.calls).toBe(0);
    expect(deps.registry.registered).toHaveLength(0);
  });

  it('auto-detect: writes only detected platforms, marks schema, registers project', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const claude = new FakeAdapter('claude', false);
    const deps = makeDeps([oc, claude]);
    const result = await initProject(deps, dir);
    expect(result.platformOutcomes).toEqual([{ platform: 'opencode', action: 'written' }]);
    expect(oc.writeCalls).toBe(1);
    expect(claude.writeCalls).toBe(0);
    expect(markSpy.calls).toBe(1);
    expect(deps.registry.registered).toEqual([{ path: dir, schemaVersion: CURRENT_SCHEMA_VERSION }]);
    expect(result.documentCount).toBe(0);
  });

  it('no platform detected: warning+skip outcome, init still succeeds (память создана)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const deps = makeDeps([new FakeAdapter('opencode', false), new FakeAdapter('claude', false)]);
    const result = await initProject(deps, dir);
    expect(result.platformOutcomes).toEqual([
      { platform: 'none', action: 'skipped', reason: 'no platform detected; use --platform opencode|claude' },
    ]);
    expect(deps.registry.registered).toHaveLength(1);
  });

  it('explicit --platform list REPLACES the set: non-listed detected platform loses its wolf entry', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const claude = new FakeAdapter('claude', true);
    const deps = makeDeps([oc, claude]);
    const result = await initProject(deps, dir, { platformIds: ['opencode'] });
    expect(result.platformOutcomes).toEqual([
      { platform: 'opencode', action: 'written' },
      { platform: 'claude', action: 'removed', reason: 'wolf entry removed (--platform list)' },
    ]);
    expect(oc.removeCalls).toBe(0);
    expect(claude.removeCalls).toBe(1);
  });

  it('explicit --platform works even without markers (forced write)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false);
    const deps = makeDeps([oc]);
    const result = await initProject(deps, dir, { platformIds: ['opencode'] });
    expect(result.platformOutcomes).toEqual([{ platform: 'opencode', action: 'written' }]);
    expect(oc.writeCalls).toBe(1);
  });

  it('npx run: NEVER writes MCP configs, honest warning outcome', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const deps = makeDeps([oc], { npx: true });
    const result = await initProject(deps, dir);
    expect(result.npx).toBe(true);
    expect(result.platformOutcomes).toEqual([
      { platform: 'npx', action: 'skipped', reason: 'npx try-out never writes MCP configs' },
    ]);
    expect(oc.writeCalls).toBe(0);
    expect(oc.removeCalls).toBe(0);
  });
});

describe('recreateConfig (спека §6: повреждённый .wolf → восстановление без вопросов)', () => {
  it('corrupted yaml → backup + valid default config written', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), '{broken');
    await recreateConfig(dir);
    const raw = readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8');
    expect(raw).toContain('memory_types'); // валидный дефолт-рендер
    // бэкап оригинала сохранён
    const stamps = readdirSync(join(dir, '.wolf', 'backup'));
    expect(stamps).toHaveLength(1);
    expect(readFileSync(join(dir, '.wolf', 'backup', stamps[0], 'config.yaml'), 'utf-8')).toBe('{broken');
  });

  it('valid yaml config → no-op (file untouched, no backup)', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    const body = 'artifact_sources: [docs]\n';
    writeFileSync(join(dir, '.wolf', 'config.yaml'), body);
    await recreateConfig(dir);
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
    expect(existsSync(join(dir, '.wolf', 'backup'))).toBe(false);
  });

  it('missing config → no-op (init will create the skeleton)', async () => {
    await recreateConfig(dir);
    expect(existsSync(join(dir, '.wolf'))).toBe(false);
  });
});
