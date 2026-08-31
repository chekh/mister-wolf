import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { repoRoot, tmpProject, ensureBuilt } from './helpers.js';

let tarball = '';
let home = '';
let prefix = '';

beforeAll(() => {
  ensureBuilt();
  const out = execSync('npm pack --json', { cwd: repoRoot, encoding: 'utf-8' });
  tarball = join(repoRoot, JSON.parse(out)[0].filename);
  home = mkdtempSync(join(tmpdir(), 'wolf-dist-home-'));
  prefix = join(home, 'npm-prefix');
}, 180_000);

afterAll(() => {
  if (tarball !== '') rmSync(tarball, { force: true }); // tarball создаётся в repoRoot — не мусорим
  if (home !== '') rmSync(home, { recursive: true, force: true });
});

/** Изолированное окружение: tmp-HOME + XDG + PATH с bin установленного бинаря. */
function isolatedEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    PATH: `${join(prefix, 'bin')}:${process.env.PATH ?? ''}`,
  };
}

describe('tarball-assert (спека §5, §7)', () => {
  it('package contains ONLY dist/ + templates/ + README + LICENSE + package.json', () => {
    const out = execSync('npm pack --dry-run --json', { cwd: repoRoot, encoding: 'utf-8' });
    const files = (JSON.parse(out)[0].files as { path: string }[]).map((f) => f.path);
    expect(files.some((f) => f === 'dist/bootstrap/cli.js')).toBe(true);
    // ponytail: npm force-пакует все README* из корня; ru-версия — часть двуязычной витрины
    // templates/ — базовый набор (base-sets C1: рендерер читает из корня пакета)
    const allowed = (p: string) =>
      p === 'package.json' ||
      p === 'README.md' ||
      p === 'README.ru.md' ||
      p === 'LICENSE' ||
      p.startsWith('dist/') ||
      p.startsWith('templates/');
    for (const f of files) {
      expect(allowed(f), `unexpected tarball entry: ${f}`).toBe(true);
    }
  });
});

describe('global install from tarball into isolated HOME (спека §3, §7)', () => {
  it('npm install -g works without gyp (prebuild) — install itself proves it', () => {
    execSync(`npm install -g --prefix "${prefix}" "${tarball}"`, {
      encoding: 'utf-8',
      timeout: 120_000,
      env: isolatedEnv(),
    });
    // если бы пребилда не было — install упал бы или ушёл в node-gyp с ошибкой в CI
  });

  it('wolf init in a dual-platform project writes both configs + registry + brief answers', () => {
    const env = isolatedEnv();
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{ "name": "dist-e2e" }');
    writeFileSync(join(project, 'opencode.json'), '{ "$schema": "https://opencode.ai/config.json" }');
    mkdirSync(join(project, '.claude'), { recursive: true });

    const init = spawnSync(join(prefix, 'bin', 'wolf'), ['init'], {
      cwd: project,
      env,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(init.status).toBe(0);
    expect(init.stdout).toContain('platform opencode: written');
    expect(init.stdout).toContain('platform claude: written');
    expect(init.stdout).toContain('Restart your agent platform');

    const oc = JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8'));
    expect(oc.mcp.wolf).toEqual({ type: 'local', command: ['wolf', 'mcp'], enabled: true });
    const claude = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf-8'));
    expect(claude.mcpServers.wolf).toEqual({ command: 'wolf', args: ['mcp'] });

    const registry = yaml.load(readFileSync(join(home, '.config', 'wolf', 'projects.yaml'), 'utf-8')) as {
      projects: { path: string }[];
    };
    // реестр хранит резолвнутый cwd (process.cwd): на macOS tmpdir даёт /var/...,
    // cwd — /private/var/...; сравниваем с realpath
    expect(registry.projects.some((p) => p.path === realpathSync(project))).toBe(true);

    const brief = spawnSync(join(prefix, 'bin', 'wolf'), ['brief'], {
      cwd: project,
      env,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(brief.status).toBe(0);
  });

  it('re-init breaks nothing: configs byte-identical, exit 0', () => {
    const env = isolatedEnv();
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{ "name": "dist-e2e-2" }');
    writeFileSync(join(project, 'opencode.json'), '{}');
    const wolf = join(prefix, 'bin', 'wolf');
    const first = spawnSync(wolf, ['init'], { cwd: project, env, encoding: 'utf-8', timeout: 60_000 });
    expect(first.status).toBe(0);
    const before = readFileSync(join(project, 'opencode.json'), 'utf-8');
    const second = spawnSync(wolf, ['init'], { cwd: project, env, encoding: 'utf-8', timeout: 60_000 });
    expect(second.status).toBe(0);
    expect(readFileSync(join(project, 'opencode.json'), 'utf-8')).toBe(before);
  });

  it('npx try-out: init never writes MCP configs and warns honestly (спека §3)', () => {
    // Реальный npx-запуск дорог/хрупок в e2e — критерий npx детерминирован env
    // (npm_command='npx' ставит сам npx-шим), поэтому воспроизводим его напрямую.
    // XDG-изоляция обязательна: init пишет реестр в wolfUserConfigDir — без неё e2e
    // мусорил бы в реальный ~/.config/wolf дев-машины.
    const project = tmpProject();
    writeFileSync(join(project, 'package.json'), '{ "name": "npx-e2e" }');
    writeFileSync(join(project, 'opencode.json'), '{}');
    const res = spawnSync('node', [join(repoRoot, 'dist', 'bootstrap', 'cli.js'), 'init'], {
      cwd: project,
      env: { ...process.env, npm_command: 'npx', XDG_CONFIG_HOME: join(home, '.config') },
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    expect(JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8')).mcp).toBeUndefined();
    expect(res.stdout).toContain('npx try-out');
    expect(res.stdout).toContain('npm install -g mister-wolf');
    // реестр изолирован: запись в tmp-HOME, не в реальный ~/.config/wolf
    expect(existsSync(join(home, '.config', 'wolf', 'projects.yaml'))).toBe(true);
  });

  it(
    'REAL npx -y <tarball> init: MCP config NOT written, .wolf/ created, warning shown (спека §3, regression 1.0.1)',
    { timeout: 240_000 },
    () => {
      // Дефект 1.0.0: isNpxRun ждал npm_command='npx', реальный npx ставит 'exec'
      // → init писал MCP-конфиг вопреки спеке. Здесь env НЕ мокаем — npx ставит
      // npm_command сам; изоляция через tmp-HOME (реестр + npx-кеш не мусорят в дев-машину).
      const project = tmpProject();
      writeFileSync(join(project, 'opencode.json'), '{}');
      const res = spawnSync('npx', ['-y', `file:${tarball}`, 'init'], {
        cwd: project,
        env: isolatedEnv(),
        encoding: 'utf-8',
        timeout: 240_000,
      });
      expect(res.status, `npx stderr: ${res.stderr}`).toBe(0);
      // MCP-конфиг не записан — ядро спеки §3
      expect(JSON.parse(readFileSync(join(project, 'opencode.json'), 'utf-8')).mcp).toBeUndefined();
      // память создана
      expect(existsSync(join(project, '.wolf'))).toBe(true);
      // честное предупреждение о try-out
      expect(res.stdout).toContain('npx try-out');
      expect(res.stdout).toContain('npm install -g mister-wolf');
    }
  );
});
