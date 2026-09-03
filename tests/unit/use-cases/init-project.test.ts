import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  initProject,
  looksLikeProjectRoot,
  recreateConfig,
  findInitReport,
  INIT_REPORT_TAGS,
  type InitProjectDeps,
} from '../../../src/app/use-cases/init-project.js';
import { ProjectInitializer } from '../../../src/ports/project-initializer.port.js';
import {
  PlatformAdapter,
  PlatformConfig,
  McpCommand,
  PlatformWriteResult,
} from '../../../src/ports/platform-adapter.port.js';
import type { ModelContext } from '../../../src/ports/base-set-renderer.port.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

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
    private readonly detected: boolean,
    private readonly writeResult: PlatformWriteResult = { action: 'written' }
  ) {}
  detect(): boolean {
    return this.detected;
  }
  async readConfig(): Promise<PlatformConfig | null> {
    return null;
  }
  async writeConfig(): Promise<PlatformWriteResult> {
    this.writeCalls += 1;
    return { ...this.writeResult };
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

class FakeMemoryStore {
  objects: MemoryObject[] = [];
  updates: { id: string; patch: Partial<MemoryObject> }[] = [];
  async save(o: MemoryObject): Promise<void> {
    const i = this.objects.findIndex((x) => x.id === o.id);
    if (i >= 0) this.objects[i] = o;
    else this.objects.push(o);
  }
  async get(id: string): Promise<MemoryObject | null> {
    return this.objects.find((o) => o.id === id) ?? null;
  }
  async list(filters?: { type?: string }): Promise<MemoryObject[]> {
    return filters?.type ? this.objects.filter((o) => o.type === filters.type) : [...this.objects];
  }
  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    this.updates.push({ id, patch });
    const o = this.objects.find((x) => x.id === id);
    if (!o) throw new Error(`not found: ${id}`);
    Object.assign(o, patch);
    return o;
  }
}

let storeSeq = 0;

function makeDeps(adapters: FakeAdapter[], opts: { npx?: boolean; wolfVersion?: string } = {}) {
  const store = new FakeMemoryStore();
  const deps: InitProjectDeps = {
    initializer: new FakeInitializer(),
    registry: new FakeRegistry(),
    adapters,
    mcpCommand: { command: 'wolf', args: ['mcp'] } as McpCommand,
    npx: opts.npx ?? false,
    markSchemaCurrent: async () => {},
    store: store as unknown as InitProjectDeps['store'],
    log: { append: async () => {} } as InitProjectDeps['log'],
    clock: { now: () => new Date('2026-09-01T00:00:00Z') },
    idGen: {
      generateMemoryId: () => `mem_20260901_x_${(++storeSeq).toString().padStart(6, '0')}`,
      generateEventId: () => `evt_${++storeSeq}`,
    },
    wolfVersion: opts.wolfVersion ?? 'test-1.0.1',
  };
  return { deps, store };
}

const MODELS: ModelContext = { primary: 'zai-coding-plan/glm-5.3', worker: 'zai-coding-plan/glm-5.3' };

/* ---------- env ---------- */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-init-uc-'));
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

describe('initProject v2 (§4: без скана, платформы/модель до рендера, init-отчёт)', () => {
  it('outside a project: throws UserFacingError, nothing created', async () => {
    const { deps } = makeDeps([]);
    await expect(initProject(deps, dir, { models: MODELS })).rejects.toThrow(/Not a project root/);
    expect(deps.initializer.calls).toBe(0);
    expect(deps.registry.registered).toHaveLength(0);
  });

  it('D1/F8: init не сканает — document-ref в памяти не появляется', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'README.md'), '# docs'); // раньше такой файл уезжал в scan
    const { deps, store } = makeDeps([new FakeAdapter('opencode', false)]);
    const result = await initProject(deps, dir, { models: MODELS });
    expect(store.objects.filter((o) => o.type === 'document-ref')).toHaveLength(0);
    expect('documentCount' in result).toBe(false);
  });

  it('F4/§4.4 п.3: без явного выбора opencode пишется БЕЗУСЛОВНО (голый каталог, без маркеров)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false); // детекция «не видит» — больше не гейтит
    const claude = new FakeAdapter('claude', false);
    const { deps } = makeDeps([oc, claude]);
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.platformOutcomes).toEqual([{ platform: 'opencode', action: 'written' }]);
    expect(oc.writeCalls).toBe(1);
    expect(claude.writeCalls).toBe(0); // claude без маркеров молча не подключается
    expect(deps.registry.registered).toEqual([{ path: dir, schemaVersion: CURRENT_SCHEMA_VERSION }]);
  });

  it('§4.4 п.3: claude без явного выбора — по маркерам', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false);
    const claude = new FakeAdapter('claude', true);
    const { deps } = makeDeps([oc, claude]);
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.platformOutcomes).toEqual([
      { platform: 'opencode', action: 'written' },
      { platform: 'claude', action: 'written' },
    ]);
  });

  it('явный выбор (§4.4 п.1) ЗАМЕНЯЕТ набор: wolf-записи вне списка удаляются', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const claude = new FakeAdapter('claude', true);
    const { deps } = makeDeps([oc, claude]);
    const result = await initProject(deps, dir, { platformChoice: ['opencode'], models: MODELS });
    expect(result.platformOutcomes).toEqual([
      { platform: 'opencode', action: 'written' },
      { platform: 'claude', action: 'removed', reason: 'wolf entry removed (--platform list)' },
    ]);
    expect(oc.removeCalls).toBe(0);
    expect(claude.removeCalls).toBe(1);
  });

  it('§4.4 граничный случай: --platform claude (без opencode) — набор рендерится, needs-fix с подсказкой', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const claude = new FakeAdapter('claude', true);
    const { deps, store } = makeDeps([oc, claude]);
    deps.baseSet = {
      render: async () => [{ file: '.opencode/agents/mr-wolf.md', action: 'created' }],
      seed: async () => [],
    };
    const result = await initProject(deps, dir, { platformChoice: ['claude'], models: MODELS });
    // набор отрендерен, конфиг opencode не писан, wolf-запись opencode удалена
    expect(result.baseSetOutcomes[0].action).toBe('created');
    expect(result.platformOutcomes.some((o) => o.platform === 'opencode' && o.action === 'removed')).toBe(true);
    const report = store.objects.find((o) => o.type === 'report');
    expect(report?.body).toContain('## Needs fixing (needs-fix)');
    expect(report?.body).toContain('opencode not in the --platform list');
  });

  it('§6.1 reason-канал: reason из writeConfig попадает в platformOutcomes', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false, {
      action: 'unchanged',
      reason: 'default_agent=other is taken; mr-wolf not assigned',
    });
    const { deps } = makeDeps([oc]);
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.platformOutcomes).toEqual([
      { platform: 'opencode', action: 'unchanged', reason: 'default_agent=other is taken; mr-wolf not assigned' },
    ]);
  });

  it('§4.5: routing upsert ДО рендера, worker = primary; рендер получает models', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps, store } = makeDeps([new FakeAdapter('opencode', false)]);
    const seenModels: (ModelContext | undefined)[] = [];
    deps.baseSet = {
      render: async (_d, opts) => {
        seenModels.push(opts?.models);
        return [];
      },
      seed: async () => [],
    };
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.routing.action).toBe('created');
    expect(result.routing.id).toBeDefined();
    const routing = store.objects.find((o) => o.type === 'rule');
    expect(routing?.tags).toEqual(expect.arrayContaining(['wolf-routing', 'models']));
    expect(routing?.body).toContain('primary: zai-coding-plan/glm-5.3');
    expect(routing?.body).toContain('worker: zai-coding-plan/glm-5.3');
    expect(seenModels).toEqual([MODELS]);
  });

  it('§4.1/D4: init-отчёт — один объект report с тегами; body содержит made/found/needs-fix', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps, store } = makeDeps([new FakeAdapter('opencode', false)]);
    deps.baseSet = {
      render: async () => [
        { file: '.opencode/agents/mr-wolf.md', action: 'created' },
        { file: 'AGENTS.md', action: 'created' },
      ],
      seed: async () => [],
    };
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.initReport.action).toBe('created');
    const reports = store.objects.filter((o) => o.type === 'report');
    expect(reports).toHaveLength(1);
    const r = reports[0];
    expect(r.title).toBe(`Init report: ${dir.split('/').pop()}`);
    expect(r.created_by).toBe('wolf-init');
    expect(r.status).toBe('active');
    expect(r.tags).toEqual([...INIT_REPORT_TAGS]);
    expect(r.importance).toBeGreaterThan(0.5);
    expect(r.body).toContain('## Done (made)');
    expect(r.body).toContain('## Detected (found)');
    expect(r.body).toContain('## Needs fixing (needs-fix)');
    expect(r.body).toContain('.opencode/agents/mr-wolf.md — created');
    expect(r.body).toContain('AGENTS.md: created');
    expect(r.body).toContain('zai-coding-plan/glm-5.3');
    expect(r.body).toContain('wolf test-1.0.1');
  });

  it('§4.1 guard: повторный init не дублирует отчёт (skip, один активный)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps, store } = makeDeps([new FakeAdapter('opencode', false)]);
    await initProject(deps, dir, { models: MODELS });
    const second = await initProject(deps, dir, { models: MODELS });
    expect(second.initReport.action).toBe('skipped');
    expect(second.initReport.id).toBeDefined();
    expect(store.objects.filter((o) => o.type === 'report')).toHaveLength(1);
    expect(await findInitReport(store as never)).not.toBeNull();
  });

  it('§8 идемпотентность: повторный init — routing unchanged, отчёт skip', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps } = makeDeps([new FakeAdapter('opencode', false)]);
    await initProject(deps, dir, { models: MODELS });
    const second = await initProject(deps, dir, { models: MODELS });
    expect(second.routing.action).toBe('unchanged');
    expect(second.initReport.action).toBe('skipped');
  });

  it('needs-fix (§4.1): конфликт default_agent и «подключите MCP» — actionable строки', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false, {
      action: 'unchanged',
      reason: 'default_agent=other is taken; mr-wolf not assigned',
    });
    const { deps, store } = makeDeps([oc]);
    await initProject(deps, dir, { models: MODELS });
    const report = store.objects.find((o) => o.type === 'report');
    const needsFix = report!.body.split('## Needs fixing (needs-fix)')[1];
    expect(needsFix).toContain('default_agent=other is taken');
  });

  it('npx (§4 п.6): конфиги и набор не пишутся, отчёт и routing НЕ создаются', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const { deps, store } = makeDeps([oc], { npx: true });
    deps.baseSet = {
      render: async () => {
        throw new Error('render must not be called for npx');
      },
      seed: async () => [],
    };
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.npx).toBe(true);
    expect(result.platformOutcomes).toEqual([
      { platform: 'npx', action: 'skipped', reason: 'npx try-out never writes MCP configs' },
    ]);
    expect(oc.writeCalls).toBe(0);
    expect(result.initReport.action).toBe('skipped');
    expect(result.routing.action).toBe('skipped');
    expect(store.objects).toHaveLength(0); // пайплайн «молчит» до полноценной установки
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
