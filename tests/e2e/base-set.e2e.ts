// tests/e2e/base-set.e2e.ts
// E2E базового набора (спека §11.1, §11.6): init через dist CLI в tmp-проекте
// (tmp-HOME изоляция) → структура; sync-сценарии: updated / conflict / orphaned.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureBuilt } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');

/** Изоляция: tmp XDG (реестр проектов) + срез npm_command (npx-запуск теста не должен выглядеть как npx try-out CLI). */
function env(xdg: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: xdg };
}

function run(args: string[], cwd: string, xdg: string) {
  const r = spawnSync('node', [cli, ...args], { cwd, env: env(xdg), encoding: 'utf-8', timeout: 60_000 });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

describe('wolf base set: init + sync (спека §7, §11.1, §11.6)', () => {
  let project: string;
  let xdg: string;

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'wolf-base-set-e2e-'));
    writeFileSync(join(project, 'package.json'), '{ "name": "base-set-e2e" }');
    xdg = mkdtempSync(join(tmpdir(), 'wolf-base-set-e2e-xdg-'));
    const res = run(['init', '--model', 'zai-coding-plan/glm-5.3'], project, xdg);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/- base set: \S+ created/);
  });
  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(xdg, { recursive: true, force: true });
  });

  it('init: структура .opencode/ (agents/skills/command/plugins) + .wolf/ (§11.1)', () => {
    const oc = (sub: string) => readdirSync(join(project, '.opencode', sub));
    expect(oc('agents').filter((f) => f.endsWith('.md'))).toHaveLength(6);
    expect(oc('command').filter((f) => f.endsWith('.md'))).toHaveLength(3);
    expect(oc('plugins').filter((f) => /\.(js|ts)$/.test(f))).toHaveLength(2);
    expect(existsSync(join(project, '.opencode/skills/using-skills/SKILL.md'))).toBe(true);
    expect(existsSync(join(project, '.wolf'))).toBe(true);
    // плагины прошли через рендер: штамп на месте
    const plugin = readFileSync(join(project, '.opencode/plugins/wolf-session-start.js'), 'utf-8');
    expect(plugin).toContain('// wolf:rendered base=wolf-session-start.js');
  });

  it('sync: правка штампованного файла (штамп сохранён) → updated, контент перезаписан из шаблона (§11.6)', () => {
    const p = join(project, '.opencode/command/analyze-doc.md');
    const stamped = readFileSync(p, 'utf-8');
    writeFileSync(p, `${stamped}\nE2E-EDIT-LINE\n`); // правка внутри, штамп не тронут
    const res = run(['sync'], project, xdg);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('analyze-doc.md: updated');
    expect(readFileSync(p, 'utf-8')).not.toContain('E2E-EDIT-LINE');
    expect(res.stdout).toContain('Память (.wolf/) не тронута'); // sync память не трогает
  });

  it('sync: unstamped файл на месте шаблонного → conflict, файл не тронут (§11.6)', () => {
    const p = join(project, '.opencode/command/complain.md');
    writeFileSync(p, 'владелец правил руками, без штампа\n');
    const res = run(['sync'], project, xdg);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('complain.md: conflict');
    expect(readFileSync(p, 'utf-8')).toBe('владелец правил руками, без штампа\n');
  });

  it('sync: штампованный файл без шаблона-парного → orphaned в отчёте (§11.6)', () => {
    writeFileSync(
      join(project, '.opencode/agents/ghost.md'),
      '<!-- wolf:rendered base=ghost.md set=0.0.0 -->\nостался от исчезнувшего шаблона\n'
    );
    const res = run(['sync'], project, xdg);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/orphaned.*ghost\.md/); // авто-удаления нет (m3)
    expect(existsSync(join(project, '.opencode/agents/ghost.md'))).toBe(true);
  });
});
