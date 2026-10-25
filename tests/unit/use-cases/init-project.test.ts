import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  initProject,
  looksLikeProjectRoot,
  recreateConfig,
  findInitReport,
  planInit,
  INIT_REPORT_TAGS,
  type InitProjectDeps,
  type InitPlanEntry,
} from '../../../src/app/use-cases/init-project.js';
import { ProjectInitializer } from '../../../src/ports/project-initializer.port.js';
import {
  PlatformAdapter,
  PlatformConfig,
  McpCommand,
  PlatformWriteResult,
  PlatformVersionInfo,
} from '../../../src/ports/platform-adapter.port.js';
import type { ModelContext } from '../../../src/ports/base-set-renderer.port.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import { OpencodeAdapter } from '../../../src/adapters/platforms/opencode-adapter.js';
import { configPath } from '../../../src/adapters/fs/project-paths.js';
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
  /** opt-in: без version detectVersion отсутствует — старые тесты не видят поле в outcome. */
  detectVersion?: (projectRoot: string) => Promise<PlatformVersionInfo>;
  constructor(
    readonly id: string,
    private readonly detected: boolean,
    private readonly writeResult: PlatformWriteResult = { action: 'written' },
    version?: PlatformVersionInfo
  ) {
    if (version) this.detectVersion = async () => ({ ...version });
  }
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

  it('WP1 (спека 2.16 §4): без --platform платформенные конфиги не пишутся (минимальный путь)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false); // детекция «не видит» — дефолт всё равно пустой
    const claude = new FakeAdapter('claude', false);
    const { deps } = makeDeps([oc, claude]);
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.platformOutcomes).toEqual([]);
    expect(oc.writeCalls).toBe(0);
    expect(claude.writeCalls).toBe(0);
    expect(deps.registry.registered).toEqual([{ path: dir, schemaVersion: CURRENT_SCHEMA_VERSION }]);
  });

  it('WP1: найденные по маркерам платформы без --platform не подключаются молча', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false);
    const claude = new FakeAdapter('claude', true);
    const { deps } = makeDeps([oc, claude]);
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.platformOutcomes).toEqual([]);
    expect(claude.writeCalls).toBe(0);
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
    const report = store.objects.find((o) => o.type === 'note' && (o as { facet?: string }).facet === 'history');
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
    const result = await initProject(deps, dir, { platformChoice: ['opencode'], models: MODELS });
    expect(result.platformOutcomes).toEqual([
      { platform: 'opencode', action: 'unchanged', reason: 'default_agent=other is taken; mr-wolf not assigned' },
    ]);
  });

  it('§4.5: рендер получает models (worker = primary); routing-объект не создаётся (волна 2.13)', async () => {
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
    expect(result).not.toHaveProperty('routing');
    expect(store.objects.filter((o) => o.type === 'rule')).toHaveLength(0);
    expect(seenModels).toEqual([MODELS]);
  });

  it("WP2 unpin (спека 2.16 §5): models = 'omit' доходит до render как 'omit'", async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps } = makeDeps([new FakeAdapter('opencode', false)]);
    const seenModels: (ModelContext | 'omit' | undefined)[] = [];
    deps.baseSet = {
      render: async (_d, opts) => {
        seenModels.push(opts?.models);
        return [];
      },
      seed: async () => [],
    };
    await initProject(deps, dir, { models: 'omit' });
    expect(seenModels).toEqual(['omit']);
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
    const reports = store.objects.filter((o) => o.type === 'note' && (o as { facet?: string }).facet === 'history');
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
    expect(
      store.objects.filter((o) => o.type === 'note' && (o as { facet?: string }).facet === 'history')
    ).toHaveLength(1);
    expect(await findInitReport(store as never)).not.toBeNull();
  });

  it('§8 идемпотентность: повторный init — отчёт skip', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps } = makeDeps([new FakeAdapter('opencode', false)]);
    await initProject(deps, dir, { models: MODELS });
    const second = await initProject(deps, dir, { models: MODELS });
    expect(second.initReport.action).toBe('skipped');
  });

  it('needs-fix (§4.1): конфликт default_agent и «подключите MCP» — actionable строки', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', false, {
      action: 'unchanged',
      reason: 'default_agent=other is taken; mr-wolf not assigned',
    });
    const { deps, store } = makeDeps([oc]);
    await initProject(deps, dir, { platformChoice: ['opencode'], models: MODELS });
    const report = store.objects.find((o) => o.type === 'note' && (o as { facet?: string }).facet === 'history');
    const needsFix = report!.body.split('## Needs fixing (needs-fix)')[1];
    expect(needsFix).toContain('default_agent=other is taken');
  });

  it('detectVersion: v2 попадает в outcome и в found-строку отчёта', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter(
      'opencode',
      false,
      { action: 'written' },
      {
        status: 'v2',
        version: '2.0.24',
        raw: 'opencode v2.0.24',
      }
    );
    const { deps, store } = makeDeps([oc]);
    const result = await initProject(deps, dir, { platformChoice: ['opencode'], models: MODELS });
    expect(result.platformOutcomes[0].version).toEqual({ status: 'v2', version: '2.0.24', raw: 'opencode v2.0.24' });
    const report = store.objects.find((o) => o.type === 'note' && (o as { facet?: string }).facet === 'history');
    const found = report!.body.split('## Detected (found)')[1].split('## Needs fixing')[0];
    expect(found).toContain('- opencode: opencode v2.0.24 (v2)');
  });

  it('detectVersion: unsupported → found-строка + предупреждение в needs-fix', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter(
      'opencode',
      false,
      { action: 'written' },
      {
        status: 'unsupported',
        version: '1.18.28',
        raw: '1.18.28',
      }
    );
    const { deps, store } = makeDeps([oc]);
    await initProject(deps, dir, { platformChoice: ['opencode'], models: MODELS });
    const report = store.objects.find((o) => o.type === 'note' && (o as { facet?: string }).facet === 'history');
    const found = report!.body.split('## Detected (found)')[1].split('## Needs fixing')[0];
    const needsFix = report!.body.split('## Needs fixing (needs-fix)')[1];
    expect(found).toContain('- opencode: 1.18.28 (unsupported)');
    expect(needsFix).toContain('unsupported');
  });

  it('detectVersion: unparseable → found-строка + предупреждение в needs-fix', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter(
      'opencode',
      false,
      { action: 'written' },
      {
        status: 'unparseable',
        raw: 'garbage',
      }
    );
    const { deps, store } = makeDeps([oc]);
    await initProject(deps, dir, { platformChoice: ['opencode'], models: MODELS });
    const report = store.objects.find((o) => o.type === 'note' && (o as { facet?: string }).facet === 'history');
    const found = report!.body.split('## Detected (found)')[1].split('## Needs fixing')[0];
    const needsFix = report!.body.split('## Needs fixing (needs-fix)')[1];
    expect(found).toContain('- opencode: garbage (unparseable)');
    expect(needsFix).toContain('could not be parsed');
  });

  it('detectVersion: absent → found-строка про PATH, needs-fix НЕ блокирует', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter(
      'opencode',
      false,
      { action: 'written' },
      {
        status: 'absent',
        message: 'spawn opencode ENOENT',
      }
    );
    const { deps, store } = makeDeps([oc]);
    await initProject(deps, dir, { platformChoice: ['opencode'], models: MODELS });
    const report = store.objects.find((o) => o.type === 'note' && (o as { facet?: string }).facet === 'history');
    const found = report!.body.split('## Detected (found)')[1].split('## Needs fixing')[0];
    const needsFix = report!.body.split('## Needs fixing (needs-fix)')[1];
    expect(found).toContain('- opencode: not found on PATH; assuming v1');
    expect(needsFix).not.toContain('not found on PATH');
  });

  it('WP1 (спека 2.16 §4): full: false → render получает scope agents-md, seed НЕ вызван', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps } = makeDeps([new FakeAdapter('opencode', false)]);
    const seenOpts: ({ models?: ModelContext | 'omit'; scope?: 'full' | 'agents-md' } | undefined)[] = [];
    let seedCalls = 0;
    deps.baseSet = {
      render: async (_d, opts) => {
        seenOpts.push(opts);
        return [];
      },
      seed: async () => {
        seedCalls += 1;
        return [];
      },
    };
    await initProject(deps, dir, { models: 'omit', full: false });
    expect(seenOpts).toEqual([{ models: 'omit', scope: 'agents-md' }]);
    expect(seedCalls).toBe(0);
  });

  it('WP1: full: true → render получает scope full, seed вызван', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps } = makeDeps([new FakeAdapter('opencode', false)]);
    const seenOpts: ({ models?: ModelContext | 'omit'; scope?: 'full' | 'agents-md' } | undefined)[] = [];
    let seedCalls = 0;
    deps.baseSet = {
      render: async (_d, opts) => {
        seenOpts.push(opts);
        return [];
      },
      seed: async () => {
        seedCalls += 1;
        return [];
      },
    };
    await initProject(deps, dir, { models: 'omit', full: true });
    expect(seenOpts).toEqual([{ models: 'omit', scope: 'full' }]);
    expect(seedCalls).toBe(1);
  });

  it('WP1: purpose сеется как note (facet context, тег project-purpose, createdBy user:init)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps, store } = makeDeps([new FakeAdapter('opencode', false)]);
    await initProject(deps, dir, { models: 'omit', purpose: 'тест' });
    const notes = store.objects.filter((o) => o.type === 'note' && (o as { facet?: string }).facet === 'context');
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Project purpose and conventions (init)');
    expect(notes[0].body).toBe('тест');
    expect(notes[0].created_by).toBe('user:init');
    expect(notes[0].tags).toContain('project-purpose');
    // интервью-ответ живёт в памяти (note с onboarding-тегом), а не в governing-инструкции
    expect(notes[0].tags).toContain('onboarding');
  });

  it('WP1: purpose пустой/undefined — note не сеется', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const { deps, store } = makeDeps([new FakeAdapter('opencode', false)]);
    await initProject(deps, dir, { models: 'omit' });
    await initProject(deps, dir, { models: 'omit', purpose: '' });
    expect(
      store.objects.filter((o) => o.type === 'note' && (o as { facet?: string }).facet === 'context')
    ).toHaveLength(0);
  });

  it('WP1 (спека 2.16 §4): platformChoice undefined → writeConfig НЕ вызывается (минимальный путь)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    const oc = new FakeAdapter('opencode', true);
    const claude = new FakeAdapter('claude', true);
    const { deps } = makeDeps([oc, claude]);
    const result = await initProject(deps, dir, { models: MODELS });
    expect(result.platformOutcomes).toEqual([]);
    expect(oc.writeCalls).toBe(0);
    expect(claude.writeCalls).toBe(0);
  });

  /* ---------- §4.14 (REQ-04): init чинит mcp.servers.wolf в существующем конфиге ---------- */

  describe('§4.14 (REQ-04): без --platform восстанавливает mcp.servers.wolf в существующем opencode.json', () => {
    const MCP: McpCommand = { command: 'wolf', args: ['mcp'] };
    const CANONICAL = { type: 'local', command: ['wolf', 'mcp'], disabled: false };
    const configFile = (): string => join(dir, 'opencode.json');
    const readCfg = (): Record<string, unknown> =>
      JSON.parse(readFileSync(configFile(), 'utf-8')) as Record<string, unknown>;

    /** Реальный OpencodeAdapter: идемпотентность и «надо ли писать» проверяются настоящим writeConfig. */
    const realDeps = (): InitProjectDeps => makeDeps([new OpencodeAdapter()]).deps;

    it('R04-1: конфиг есть, wolf-записи нет → written, прочие ключи сохранены', async () => {
      writeFileSync(join(dir, 'package.json'), '{}');
      writeFileSync(
        configFile(),
        `${JSON.stringify(
          {
            $schema: 'https://opencode.ai/config.json',
            theme: 'system',
            mcp: { other: { type: 'local', command: ['x'], enabled: true } },
          },
          null,
          2
        )}\n`
      );
      const result = await initProject(realDeps(), dir, { models: MODELS });
      expect(result.platformOutcomes).toMatchObject([
        {
          platform: 'opencode',
          action: 'written',
          reason: 'init: repaired missing/corrupted opencode wolf entry',
          configFile: 'opencode.json',
        },
      ]);
      const cfg = readCfg();
      const mcp = cfg.mcp as Record<string, unknown>;
      expect((mcp.servers as Record<string, unknown>).wolf).toEqual(CANONICAL);
      expect(mcp.wolf).toBeUndefined(); // легаси-форма не пишется
      // остальной конфиг не тронут
      expect(cfg.$schema).toBe('https://opencode.ai/config.json');
      expect(cfg.theme).toBe('system');
      expect(mcp.other).toEqual({ type: 'local', command: ['x'], enabled: true });
    });

    it('R04-2: повторный init → unchanged, файл байт-в-байт тот же (дубля нет)', async () => {
      writeFileSync(join(dir, 'package.json'), '{}');
      writeFileSync(configFile(), '{"theme":"system"}\n');
      await initProject(realDeps(), dir, { models: MODELS });
      const afterFirst = readFileSync(configFile(), 'utf-8');
      const second = await initProject(realDeps(), dir, { models: MODELS, platformChoice: undefined });
      expect(second.platformOutcomes).toMatchObject([{ platform: 'opencode', action: 'unchanged' }]);
      expect(second.platformOutcomes[0]!.reason).toBeUndefined();
      expect(readFileSync(configFile(), 'utf-8')).toBe(afterFirst);
    });

    it('R04-4: нативная запись строкой (некорректная) → replaced, канонический блок, остальное сохранено', async () => {
      writeFileSync(join(dir, 'package.json'), '{}');
      writeFileSync(
        configFile(),
        `${JSON.stringify(
          { theme: 'system', mcp: { servers: { wolf: 'wolf' }, other: { type: 'local' } } },
          null,
          2
        )}\n`
      );
      const result = await initProject(realDeps(), dir, { models: MODELS });
      expect(result.platformOutcomes).toMatchObject([
        { platform: 'opencode', action: 'replaced', reason: 'init: repaired missing/corrupted opencode wolf entry' },
      ]);
      const cfg = readCfg();
      const mcp = cfg.mcp as Record<string, unknown>;
      expect((mcp.servers as Record<string, unknown>).wolf).toEqual(CANONICAL);
      expect(mcp.other).toEqual({ type: 'local' });
      expect(cfg.theme).toBe('system');
    });

    it('R04-4b: наш легаси mcp.wolf мигрируется в нативную форму при починке', async () => {
      writeFileSync(join(dir, 'package.json'), '{}');
      writeFileSync(
        configFile(),
        `${JSON.stringify({ mcp: { wolf: { type: 'local', command: ['wolf', 'mcp'], enabled: true } } }, null, 2)}\n`
      );
      const result = await initProject(realDeps(), dir, { models: MODELS });
      expect(result.platformOutcomes).toMatchObject([{ platform: 'opencode', action: 'written' }]);
      const cfg = readCfg();
      const mcp = cfg.mcp as Record<string, unknown>;
      expect((mcp.servers as Record<string, unknown>).wolf).toEqual(CANONICAL);
      expect(mcp.wolf).toBeUndefined();
    });

    it('R04-5: битый JSONC → skipped с причиной, файл не изменён, init не падает', async () => {
      writeFileSync(join(dir, 'package.json'), '{}');
      writeFileSync(configFile(), '{"mcp": {\n');
      const result = await initProject(realDeps(), dir, { models: MODELS });
      expect(result.platformOutcomes).toEqual([
        { platform: 'opencode', action: 'skipped', reason: 'config is not valid JSONC — fix it first' },
      ]);
      expect(readFileSync(configFile(), 'utf-8')).toBe('{"mcp": {\n');
    });

    it('R04-6: конфиг-файла нет (платформа детектится по .opencode) → не создаём, записей нет', async () => {
      writeFileSync(join(dir, 'package.json'), '{}');
      mkdirSync(join(dir, '.opencode'), { recursive: true });
      const result = await initProject(realDeps(), dir, { models: MODELS });
      expect(result.platformOutcomes).toEqual([]);
      expect(existsSync(configFile())).toBe(false);
      expect(existsSync(join(dir, 'opencode.jsonc'))).toBe(false);
    });

    it('R04-7: валидная нативная запись + кастомный default_agent → unchanged, чужое значение сохранено', async () => {
      writeFileSync(join(dir, 'package.json'), '{}');
      writeFileSync(
        configFile(),
        `${JSON.stringify(
          { mcp: { servers: { wolf: CANONICAL } }, default_agent: 'my-agent', experimental: { subagent_depth: 2 } },
          null,
          2
        )}\n`
      );
      const before = readFileSync(configFile(), 'utf-8');
      const result = await initProject(realDeps(), dir, { models: MODELS });
      expect(result.platformOutcomes).toMatchObject([{ platform: 'opencode', action: 'unchanged' }]);
      expect(readFileSync(configFile(), 'utf-8')).toBe(before);
      expect(readCfg().default_agent).toBe('my-agent');
    });
  });

  it('npx (§4 п.6): конфиги и набор не пишутся, отчёт НЕ создаётся', async () => {
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
    expect(store.objects).toHaveLength(0); // пайплайн «молчит» до полноценной установки
  });
});

describe('planInit (спека 2.16 §4 K6: read-only план повторного init, ничего не пишет)', () => {
  /** Фейковые deps на Map: путь → содержимое. */
  function fsDeps(files: Map<string, string>) {
    return {
      exists: async (p: string) => files.has(p),
      readFile: async (p: string) => files.get(p) ?? null,
    };
  }
  const entry = (plan: { entries: InitPlanEntry[] }, c: InitPlanEntry['component']) =>
    plan.entries.find((e) => e.component === c)!;

  it('fresh: live=false, create-план; не-full/без --platform/без purpose — skip', async () => {
    const plan = await planInit(fsDeps(new Map()), dir, { models: 'omit' });
    expect(plan.live).toBe(false);
    expect(entry(plan, 'skeleton').action).toBe('create');
    expect(entry(plan, 'config').action).toBe('create');
    expect(entry(plan, 'agents-md').action).toBe('create');
    expect(entry(plan, 'memory-seed').action).toBe('create');
    expect(entry(plan, 'gitignore').action).toBe('create');
    expect(entry(plan, 'base-set').action).toBe('skip');
    expect(entry(plan, 'platforms').action).toBe('skip');
    expect(entry(plan, 'purpose-note').action).toBe('skip');
  });

  it('live (конфиг + маркер в AGENTS.md + штамп gitignore): skeleton/config/agents-md/gitignore — keep; --platform → update', async () => {
    const files = new Map<string, string>([
      [configPath(dir), 'schema_version: 2\n'],
      [join(dir, 'AGENTS.md'), '# Own\n\n<!-- wolf:onboarding v2 -->\n'],
      [join(dir, '.gitignore'), '# wolf-gitignore:v1\n.wolf/cache/\n'],
    ]);
    const plan = await planInit(fsDeps(files), dir, { models: 'omit', platformChoice: ['opencode'] });
    expect(plan.live).toBe(true);
    expect(entry(plan, 'skeleton').action).toBe('keep');
    expect(entry(plan, 'config').action).toBe('keep');
    expect(entry(plan, 'agents-md').action).toBe('keep');
    expect(entry(plan, 'gitignore').action).toBe('keep');
    expect(entry(plan, 'memory-seed').action).toBe('keep');
    expect(entry(plan, 'platforms').action).toBe('update');
    expect(entry(plan, 'platforms').detail).toBe('opencode');
  });

  it('live + full: base-set — keep, detail обещает fresh/mutated-skip (blind reseed запрещён)', async () => {
    const files = new Map<string, string>([[configPath(dir), 'schema_version: 2\n']]);
    const plan = await planInit(fsDeps(files), dir, { models: 'omit', full: true });
    const baseSet = entry(plan, 'base-set');
    expect(baseSet.action).toBe('keep');
    expect(baseSet.detail).toContain('never rewritten');
  });

  it('краевой случай спеки §4: пустой после trim конфиг — первый запуск (live=false, config create)', async () => {
    const files = new Map<string, string>([[configPath(dir), '  \n']]);
    const plan = await planInit(fsDeps(files), dir, { models: 'omit' });
    expect(plan.live).toBe(false);
    expect(entry(plan, 'config').action).toBe('create');
  });

  it('битый непустой yaml остаётся под гейтом: live=true (P3 — подтверждение безопаснее молчаливого прохода)', async () => {
    const files = new Map<string, string>([[configPath(dir), '{broken']]);
    const plan = await planInit(fsDeps(files), dir, { models: 'omit' });
    expect(plan.live).toBe(true);
  });
});

describe('recreateConfig (спека §6: повреждённый .wolf → восстановление без вопросов)', () => {
  it('corrupted yaml → backup + valid default config written', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), '{broken');
    await recreateConfig(dir);
    const raw = readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8');
    expect(raw).toContain('wolf_version'); // валидный дефолт-рендер (P214: штамп вместо дампа)
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
