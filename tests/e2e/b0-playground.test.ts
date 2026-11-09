// tests/e2e/b0-playground.test.ts
// REQ-04 (B0), редакция S-DELIVERY 3.0.0: внешний проект → init → doctor/call;
// состав набора — 9 агентов без лиц и плагинов, onboarding v4; re-init (--yes)
// поверх живого проекта не возвращает legacy-иерархию и не теряет локальные
// правки файлов набора (mutated-skip).
//
// Отступление от буквы S-33: playground-lab — незакоммиченное состояние
// основного чекаута (вне allowlist worktree), его мутация из параллельного
// воркера небезопасна. REQ-04 явно разрешает альтернативу: «tmp-каталог с
// wolf init --full --platform opencode» — внешняя форма проекта та же
// (README + package.json, не-волчий контент).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync, realpathSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');
const MODEL = 'zai-coding-plan/glm-5.3';
const AGENTS = [
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
const LEGACY = [
  'executor-lead.md',
  'steward.md',
  'worker-implementer.md',
  'worker-researcher.md',
  'worker-reviewer.md',
  'worker-expert.md',
];
// doctor чистит записи под os.tmpdir() как sandbox (2.14 §8.2) — «: ok»
// наблюдаемо только вне tmpdir; фикстура живёт в untracked-каталоге tests/
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function runCli(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): { stdout: string; stderr: string; status: number | null } {
  const { npm_command: _drop, ...base } = process.env;
  const r = spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...base, ...env },
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

describe('wolf B0 на внешнем проекте: init → doctor/call (S-33) + upgrade re-init (S-35/S-80)', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(REPO, 'tests', '.b0-playground-'));
    // форма внешнего проекта: не-волчий README + маркер корня
    writeFileSync(join(dir, 'README.md'), '# External lab project\n\nNot a wolf repo.\n');
    writeFileSync(join(dir, 'package.json'), '{ "name": "b0-playground-lab" }');
    const res = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir);
    expect(res.status).toBe(0);
  }, 120_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('S-33: init без ошибок; структура набора на месте (9 агентов, без плагинов и лиц)', () => {
    for (const sub of ['agents', 'skills', 'command']) {
      expect(readdirSync(join(dir, '.opencode', sub)).length, sub).toBeGreaterThan(0);
    }
    const installed = readdirSync(join(dir, '.opencode/agents'))
      .filter((f) => f.endsWith('.md'))
      .sort();
    expect(installed).toEqual(
      AGENTS.slice()
        .sort()
        .map((a) => `${a}.md`)
    );
    // R-12b: плагины не доставляются; R-08: лица не сеются
    expect(existsSync(join(dir, '.opencode/plugins')), 'plugins не создаются').toBe(false);
    expect(existsSync(join(dir, '.wolf/memory/shared/faces')), 'faces не сеются').toBe(false);
    // onboarding-блок v4
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toContain('<!-- wolf:onboarding v4 -->');
  });

  it('S-33: wolf doctor — зелёный (проект ok, без issues)', () => {
    const res = runCli(['doctor'], dir);
    expect(res.status).toBe(0);
    // registry хранит realpath (macOS tmp — симлинк /var → /private/var)
    const real = realpathSync(dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(res.stdout).toMatch(new RegExp(`- ${real}: ok \\(schema`));
    expect(res.stdout).not.toMatch(/^  ! /m);
  });

  it('S-33: wolf call — честный пустой пул на свежем проекте', () => {
    const res = runCli(['call'], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('No active call injections.');
  });

  it('S-33: list --type face пуст — набор поставляется без лиц (R-08)', () => {
    const res = runCli(['list', '--type', 'face'], dir);
    expect(res.status).toBe(0);
    expect(res.stdout.match(/\[face\]/g)).toBeNull();
  });

  it('S-35/S-80 (NFR-04): re-init поверх живого проекта — legacy-иерархия не возвращается, локальная правка mutated-skip, потерь нет', () => {
    // «проект жил»: пользователь правит файл набора до обновления
    const agentFile = join(dir, '.opencode/agents/wolf-researcher.md');
    writeFileSync(agentFile, `${readFileSync(agentFile, 'utf-8')}\n<!-- S-35: локальная правка перед upgrade -->\n`);

    const res = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL, '--yes'], dir);
    expect(res.status).toBe(0);
    // локальная правка файла набора — mutated-skip
    expect(res.stdout).toContain('.opencode/agents/wolf-researcher.md skipped');
    expect(res.stdout).toContain('mutated');
    expect(readFileSync(agentFile, 'utf-8')).toContain('S-35: локальная правка перед upgrade');

    // старая иерархия не возвращается; лица/плагины не появляются
    const installed = readdirSync(join(dir, '.opencode/agents'));
    for (const legacy of LEGACY) expect(installed, legacy).not.toContain(legacy);
    expect(existsSync(join(dir, '.opencode/plugins'))).toBe(false);
    expect(existsSync(join(dir, '.wolf/memory/shared/faces'))).toBe(false);
    // вывод re-init — без face/playbook/steward-строк
    expect(res.stdout).not.toMatch(/face|playbook|steward/i);
  }, 120_000);
});
