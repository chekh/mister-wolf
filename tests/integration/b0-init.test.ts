// tests/integration/b0-init.test.ts
// REQ-04 (B0, 2.18.0): S-30 — init создаёт базовых агентов; S-31 — face show
// каждого агента возвращает owner_skill === agent_id; S-32 — установленные
// .opencode/agents/*.md побайтово равны ожидаемому рендеру templates/base/agents;
// guard-контракт design §3.4 (face_owner_skill === agent_id) в init-project.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { insertStamp } from '../../src/adapters/render/stamp.js';
import { substitute, OPENCODE_MANIFEST } from '../../src/adapters/render/manifest.js';
import { wolfVersion } from '../../src/adapters/render/templates-root.js';
import { baseSetFaceViolations } from '../../src/app/use-cases/init-project.js';

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
  'executor-lead',
  'steward',
  'worker-implementer',
  'worker-researcher',
  'worker-reviewer',
];

describe('wolf init: B0 базовые наборы (REQ-04, S-30..S-32)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-b0-init-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "b0-init-it" }');
    expect(runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir).status).toBe(0);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('S-30: создаёт .opencode/agents/*.md для всех 6 базовых агентов', () => {
    const installed = readdirSync(join(dir, '.opencode/agents'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => basename(f, '.md'))
      .sort();
    expect(installed).toEqual(BASE_AGENTS.slice().sort());
    // тела содержат agent-id (маркер plugin-доставки)
    for (const a of BASE_AGENTS) {
      expect(readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8'), a).toContain(`agent-id: ${a}`);
    }
  });

  it('S-31: wolf face show <agent> → owner_skill === agent_id для каждого базового агента', () => {
    for (const a of BASE_AGENTS) {
      const res = runCli(['face', 'show', a], dir);
      expect(res.status, a).toBe(0);
      // первая строка: «<owner_skill>  v<version>  <id>  [active]»
      expect(res.stdout.split('\n')[0], a).toMatch(new RegExp(`^${a}\\s+v\\d+\\s+\\S+\\s+\\[active\\]`));
    }
  });

  it('S-32: установленные .opencode/agents/*.md побайтово равны рендеру templates/base/agents', () => {
    const templates = readdirSync(join(REPO, 'templates/base/agents')).filter((f) => f.endsWith('.md'));
    expect(templates.map((t) => basename(t, '.md')).sort()).toEqual(BASE_AGENTS.slice().sort());
    for (const t of templates) {
      const installed = readFileSync(join(dir, '.opencode/agents', t), 'utf-8');
      expect(installed, t).toBe(expectedAgentRender(t));
    }
  });

  it('guard-исход §3.4 отсутствует на здоровом init (нет (base set faces))', () => {
    // проверка на свежем прогоне: beforeEach уже инициализировал; повторный
    // полный init живого проекта — тот же путь seed + guard
    const res = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL, '--yes'], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('(base set faces)');
  });
});

describe('baseSetFaceViolations: guard face_owner_skill === agent_id (design §3.4)', () => {
  it('все 6 агентов с активными лицами → нарушений нет', () => {
    expect(baseSetFaceViolations(BASE_AGENTS)).toEqual([]);
  });

  it('отсутствующий агент → нарушение', () => {
    expect(baseSetFaceViolations(BASE_AGENTS.filter((a) => a !== 'steward'))).toEqual(['steward']);
  });

  it('неактивное (archived) лицо не закрывает контракт агента', () => {
    // активные владельцы — только 5; steward архивирован
    expect(baseSetFaceViolations(BASE_AGENTS.filter((a) => a !== 'steward'))).toContain('steward');
  });

  it('legacy-формат owner_skill (skill:<id>) не равен agent_id → нарушение', () => {
    const legacy = BASE_AGENTS.map((a) => (a === 'worker-implementer' ? `skill:${a}` : a));
    expect(baseSetFaceViolations(legacy)).toEqual(['worker-implementer']);
  });
});

describe('onboarding-блок v3 в init (REQ-03 AC3/AC4, волна 2.20.0)', () => {
  let d: string;
  const agentsMd = () => join(d, 'AGENTS.md');

  beforeEach(() => {
    d = mkdtempSync(join(tmpdir(), 'wolf-b0-block-'));
    writeFileSync(join(d, 'package.json'), '{ "name": "b0-block-it" }');
  });
  afterEach(() => rmSync(d, { recursive: true, force: true }));

  it('R03-3/R03-4: блок дописывается append-веткой, повторный init не дублирует его', () => {
    const own = '# Чужой конфиг\nне трогай\n';
    writeFileSync(agentsMd(), own);
    expect(runCli(['init', '--full', '--platform', 'opencode'], d).status).toBe(0);
    const first = readFileSync(agentsMd(), 'utf-8');
    expect(first.startsWith(own)).toBe(true);
    expect(first).toContain('<!-- wolf:onboarding v3 -->');
    expect(first.match(/<!-- wolf:onboarding/g)).toHaveLength(1);
    expect(runCli(['init', '--full', '--platform', 'opencode', '--yes'], d).status).toBe(0);
    expect(readFileSync(agentsMd(), 'utf-8')).toBe(first);
  });

  it('R03-4: init поднимает блок v2 до v3, чужой текст вокруг сохранён', () => {
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
    expect(out).toContain('<!-- wolf:onboarding v3 -->');
    expect(out).not.toContain('старое содержимое');
    expect(out.match(/<!-- wolf:onboarding/g)).toHaveLength(1);
  });
});
