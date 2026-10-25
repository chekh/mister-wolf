// U-10 (test-plan волны 2.16.2): e2e CLI uninstall — план по умолчанию (без записей),
// --yes исполняет (чужой контент нетронут, .wolf/ сохраняется), идемпотентность, --purge.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureBuilt } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');

function env(xdg: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: xdg };
}

function run(args: string[], cwd: string, xdg: string) {
  const r = spawnSync('node', [cli, ...args], { cwd, env: env(xdg), encoding: 'utf-8', timeout: 120_000 });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

describe('wolf uninstall e2e (REQ-03)', () => {
  let project: string;
  let xdg: string;

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'wolf-uninstall-e2e-'));
    xdg = mkdtempSync(join(tmpdir(), 'wolf-uninstall-e2e-xdg-'));
    writeFileSync(join(project, 'package.json'), '{ "name": "uninstall-e2e" }');
    const init = run(['init', '--full', '--platform', 'opencode', '--model', 'zai-coding-plan/glm-5.3'], project, xdg);
    expect(init.status).toBe(0);
    // Чужой файл в зоне Wolf — неприкосновенен (NFR-02).
    mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
    writeFileSync(join(project, '.opencode/plugins/my-own.ts'), '// my own plugin\n');
  });
  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(xdg, { recursive: true, force: true });
  });

  it('план по умолчанию ничего не удаляет, exit 0', () => {
    const before = readdirSync(join(project, '.opencode'), { recursive: true }).sort().join('\n');
    const res = run(['uninstall'], project, xdg);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('plan only');
    expect(res.stdout).toContain('[remove]');
    expect(readdirSync(join(project, '.opencode'), { recursive: true }).sort().join('\n')).toBe(before);
  });

  it('--yes удаляет wolf-контент; чужой файл, AGENTS.md и .wolf/ нетронуты; конфиг чист', () => {
    const res = run(['uninstall', '--yes'], project, xdg);
    expect(res.status).toBe(0);
    expect(existsSync(join(project, '.opencode/agents'))).toBe(false);
    expect(existsSync(join(project, '.opencode/skills'))).toBe(false);
    expect(existsSync(join(project, '.opencode/plugins/my-own.ts'))).toBe(true);
    expect(existsSync(join(project, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(project, '.wolf'))).toBe(true);
    expect(res.stdout).toMatch(/\.wolf — kept/);
    expect(res.stdout).toContain('npm uninstall -g mister-wolf');
    const cfg = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp).toBeUndefined(); // нативная и легаси формы удалены, пустой mcp не остаётся
    expect(cfg.default_agent).toBeUndefined();
    expect(cfg.experimental).toBeUndefined(); // пустая experimental не остаётся
    expect(cfg.subagent_depth).toBeUndefined();
  });

  it('повторный --yes — nothing to remove, exit 0 (идемпотентность)', () => {
    const res = run(['uninstall', '--yes'], project, xdg);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('nothing to remove');
  });

  it('--purge с --yes стирает .wolf/', () => {
    const res = run(['uninstall', '--yes', '--purge'], project, xdg);
    expect(res.status).toBe(0);
    expect(existsSync(join(project, '.wolf'))).toBe(false);
    expect(res.stdout).toContain('.wolf — removed');
  });
});
