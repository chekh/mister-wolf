// tests/integration/b0-init.test.ts
// REQ-04 (B0), редакция S-DELIVERY 3.0.0: init --full создаёт набор из 9 агентов
// (mr-wolf + wolf-*) без лиц и без плагинов; legacy-иерархия не возвращается;
// установленные .opencode/agents/*.md побайтово равны рендеру templates/base/agents;
// AGENTS.md доставляет онбординг-блок v4 (append / подъём v2 → v4 / эталон M-1).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { insertStamp } from '../../src/adapters/render/stamp.js';
import { sha256 } from '../../src/adapters/render/sync-state.js';
import { normalizeManaged } from '../../src/domain/protect-key.js';
import { substitute, OPENCODE_MANIFEST } from '../../src/adapters/render/manifest.js';
import { wolfVersion } from '../../src/adapters/render/templates-root.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cliPath = join(REPO, 'dist', 'bootstrap', 'cli.js');
const MODEL = 'zai-coding-plan/glm-5.3';

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  // npm_command срезаем: `npx vitest` проставляет 'exec' → isNpxRun() true → набор не пишется
  const { npm_command: _drop, ...env } = process.env;
  const r = spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf-8', timeout: 60_000, env });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

/** Ожидаемый рендер шаблона агента (тот же конвейер, что в OpencodeBaseSetRenderer). */
function expectedAgentRender(tplName: string): string {
  const raw = readFileSync(join(REPO, 'templates/base/agents', tplName), 'utf-8');
  const rendered = substitute(raw, OPENCODE_MANIFEST, { primary: MODEL, worker: MODEL });
  return insertStamp(rendered, { base: tplName, set: wolfVersion() }, tplName);
}

const BASE_AGENTS = [
  'mr-wolf',
  'wolf-architect',
  'wolf-developer',
  'wolf-editor',
  'wolf-expert',
  'wolf-release-engineer',
  'wolf-researcher',
  'wolf-reviewer',
  'wolf-tester',
];
const LEGACY_AGENTS = [
  'executor-lead',
  'steward',
  'worker-implementer',
  'worker-researcher',
  'worker-reviewer',
  'worker-expert',
];

describe('wolf init: B0 базовый набор без лиц (S-DELIVERY 3.0.0)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-b0-init-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "b0-init-it" }');
    expect(runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir).status).toBe(0);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('S-30: создаёт .opencode/agents/*.md ровно для 9 агентов нового набора; legacy-иерархия не возвращается', () => {
    const agentsDir = join(dir, '.opencode/agents');
    const installed = readdirSync(agentsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => basename(f, '.md'))
      .sort();
    expect(installed).toEqual(BASE_AGENTS.slice().sort());
    for (const legacy of LEGACY_AGENTS) expect(installed, legacy).not.toContain(legacy);
    // тела содержат agent-id (маркер plugin-доставки) и штамп рендера
    for (const a of BASE_AGENTS) {
      const body = readFileSync(join(agentsDir, `${a}.md`), 'utf-8');
      expect(body, a).toContain(`agent-id: ${a}`);
      expect(body, a).toContain('wolf:rendered base=');
    }
    // R-12b: плагины не рендерятся; файлы зарезервированы вне автозагрузки
    expect(existsSync(join(dir, '.opencode/plugins')), '.opencode/plugins не создаются').toBe(false);
    expect(existsSync(join(REPO, 'templates/opencode/plugins-reserved/wolf-session-start.js'))).toBe(true);
    expect(existsSync(join(REPO, 'templates/opencode/plugins-reserved/wolf-router.ts'))).toBe(true);
  });

  it('S-31 (R-08): лица не сеются — faces-каталога нет, list --type face пуст, в выводе нет face/playbook/steward', () => {
    const res = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL, '--yes'], dir);
    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(join(dir, '.wolf/memory/shared/faces')), 'faces не сеются').toBe(false);
    const list = runCli(['list', '--type', 'face'], dir);
    expect(list.status).toBe(0);
    expect(list.stdout.match(/\[face\]/g)).toBeNull();
    expect(res.stdout, 'init без лиц не пишет face-строки').not.toMatch(/face|playbook|steward/i);
  });

  it('S-32: установленные .opencode/agents/*.md побайтово равны рендеру templates/base/agents', () => {
    const templates = readdirSync(join(REPO, 'templates/base/agents')).filter((f) => f.endsWith('.md'));
    expect(templates.map((t) => basename(t, '.md')).sort()).toEqual(BASE_AGENTS.slice().sort());
    for (const t of templates) {
      const installed = readFileSync(join(dir, '.opencode/agents', t), 'utf-8');
      expect(installed, t).toBe(expectedAgentRender(t));
    }
  });

  it('повторный init: всё skipped, face-guard следов нет', () => {
    const res = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL, '--yes'], dir);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).not.toMatch(/- base set: \S+ created/); // всё skipped (wx-политика)
    expect(res.stdout).toMatch(/- base set: \S+ skipped/);
    expect(res.stdout).not.toContain('(base set faces)');
  });
});

describe('§4.14 (REQ-04): init без --platform чинит mcp.wolf в существующем конфиге', () => {
  let d: string;
  const cfgPath = (): string => join(d, 'opencode.json');
  const readCfg = (): Record<string, unknown> =>
    JSON.parse(readFileSync(cfgPath(), 'utf-8')) as Record<string, unknown>;

  beforeEach(() => {
    d = mkdtempSync(join(tmpdir(), 'wolf-b0-repair-'));
    writeFileSync(join(d, 'package.json'), '{ "name": "b0-repair-it" }');
  });
  afterEach(() => rmSync(d, { recursive: true, force: true }));

  it('R04-1/R04-2: проект 2.19.0 с opencode.json без wolf-записи → запись добавлена, повторный init — no-op', () => {
    // фикстура «2.19.0-проект»: чужой конфиг opencode без mcp.wolf
    writeFileSync(
      cfgPath(),
      `${JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          theme: 'system',
          mcp: { other: { type: 'local', command: ['other-mcp'], enabled: true } },
        },
        null,
        2
      )}\n`
    );

    expect(runCli(['init', '--full'], d).status).toBe(0); // БЕЗ --platform
    const cfg = readCfg();
    expect(((cfg.mcp as Record<string, unknown>).servers as Record<string, unknown>).wolf).toEqual({
      type: 'local',
      command: ['wolf', 'mcp'],
      disabled: false,
    });
    expect((cfg.mcp as Record<string, unknown>).wolf).toBeUndefined(); // легаси-форма не пишется
    expect(cfg.$schema).toBe('https://opencode.ai/config.json');
    expect(cfg.theme).toBe('system');
    expect((cfg.mcp as Record<string, unknown>).other).toEqual({
      type: 'local',
      command: ['other-mcp'],
      enabled: true,
    });

    const once = readFileSync(cfgPath(), 'utf-8');
    expect(runCli(['init', '--full', '--yes'], d).status).toBe(0);
    expect(readFileSync(cfgPath(), 'utf-8')).toBe(once); // unchanged: ни дубля, ни перезаписи
  });

  it('R04-3: после init doctor больше не рапортует «wolf entry missing» (тот же проект)', async () => {
    writeFileSync(cfgPath(), '{"theme":"system"}\n');
    expect(runCli(['init', '--full'], d).status).toBe(0);

    // in-process doctor: реестр фикстурный (tmp-путь не должен pruning'иться как sandbox)
    const { runDoctor } = await import('../../src/app/use-cases/doctor.js');
    const { readSchemaVersion } = await import('../../src/adapters/fs/schema-version.js');
    const { OpencodeAdapter } = await import('../../src/adapters/platforms/opencode-adapter.js');
    const report = await runDoctor({
      registry: {
        list: async () => [{ path: d, schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z' }],
        remove: async () => false,
      },
      readSchema: (p: string) => readSchemaVersion(p),
      exists: async (p: string) => existsSync(p),
      adapters: [new OpencodeAdapter()],
    });
    const entry = report.entries.find((e) => e.path === d);
    expect(entry?.status).toBe('ok');
    expect(entry?.issues).not.toContain('opencode: wolf entry missing — run wolf init');
  });
});

describe('onboarding-блок v4 в init (S-DELIVERY 3.0.0)', () => {
  let d: string;
  const agentsMd = () => join(d, 'AGENTS.md');

  beforeEach(() => {
    d = mkdtempSync(join(tmpdir(), 'wolf-b0-block-'));
    writeFileSync(join(d, 'package.json'), '{ "name": "b0-block-it" }');
  });
  afterEach(() => rmSync(d, { recursive: true, force: true }));

  it('R03-3/R03-4: блок v4 дописывается append-веткой, повторный init не дублирует его', () => {
    const own = '# Чужой конфиг\nне трогай\n';
    writeFileSync(agentsMd(), own);
    expect(runCli(['init', '--full', '--platform', 'opencode'], d).status).toBe(0);
    const first = readFileSync(agentsMd(), 'utf-8');
    expect(first.startsWith(own)).toBe(true);
    expect(first).toContain('<!-- wolf:onboarding v4 -->');
    expect(first.match(/<!-- wolf:onboarding/g)).toHaveLength(1);
    expect(runCli(['init', '--full', '--platform', 'opencode', '--yes'], d).status).toBe(0);
    expect(readFileSync(agentsMd(), 'utf-8')).toBe(first);
  });

  it('R03-4: init поднимает блок v2 до v4, чужой текст вокруг сохранён', () => {
    const above = '# Мой текст\n\n';
    const below = '\n\nхвост\n';
    writeFileSync(
      agentsMd(),
      `${above}<!-- wolf:onboarding v2 -->\nстарое содержимое\n<!-- /wolf:onboarding -->${below}`
    );
    expect(runCli(['init', '--full', '--platform', 'opencode'], d).status).toBe(0);
    const out = readFileSync(agentsMd(), 'utf-8');
    expect(out.startsWith(above)).toBe(true);
    expect(out.endsWith(below)).toBe(true);
    expect(out).toContain('<!-- wolf:onboarding v4 -->');
    expect(out).not.toContain('старое содержимое');
    expect(out.match(/<!-- wolf:onboarding/g)).toHaveLength(1);
  });

  it('M-1: init на проекте 2.19.0 (штамп + блок v2) → эталон текущей базы, повторный init — no-op', () => {
    const tplRaw = readFileSync(join(REPO, 'templates/base/AGENTS.md'), 'utf-8');
    const oldBlock = tplRaw.replace('<!-- wolf:onboarding v4 -->', '<!-- wolf:onboarding v2 -->');
    const legacy = insertStamp(oldBlock, { base: 'AGENTS.md', set: '2.19.0' }, 'AGENTS.md');
    writeFileSync(agentsMd(), legacy);
    mkdirSync(join(d, '.opencode'), { recursive: true });
    writeFileSync(
      join(d, '.opencode', 'wolf-sync-state.json'),
      `${JSON.stringify(
        { files: { 'AGENTS.md': { hash: sha256(normalizeManaged(legacy)), origin: 'render', base: '2.19.0' } } },
        null,
        2
      )}\n`
    );

    expect(runCli(['init', '--full', '--platform', 'opencode'], d).status).toBe(0);
    const expected = insertStamp(tplRaw, { base: 'AGENTS.md', set: wolfVersion() }, 'AGENTS.md');
    expect(readFileSync(agentsMd(), 'utf-8')).toBe(expected);

    // повторный init и следующий проход не дают ложного mutated (NFR-02)
    expect(runCli(['init', '--full', '--platform', 'opencode', '--yes'], d).status).toBe(0);
    expect(readFileSync(agentsMd(), 'utf-8')).toBe(expected);

    const sync = runCli(['sync'], d);
    expect(sync.stdout).not.toContain('mutated');
    expect(readFileSync(agentsMd(), 'utf-8')).toBe(expected);
  });
});
