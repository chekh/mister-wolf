// e2e wolf upgrade (бриф 2026-09-02, критерии E1–E3, D1-help):
// реальный npm registry НЕ дёргается — npm подменяется фейком первой записью PATH.
// E1: --check при замоканном view; E2: refusal на linked-копии; E3: guard удалённого cwd.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { repoRoot, tmpProject, ensureBuilt } from './helpers.js';

const cli = join(repoRoot, 'dist/bootstrap/cli.js');
let home = '';
let shimDir = '';
let repoVersion = '';

beforeAll(() => {
  ensureBuilt();
  repoVersion = (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as { version: string }).version;
  home = mkdtempSync(join(tmpdir(), 'wolf-upgrade-home-'));
  // npm-шим: view/prefix детерминированы; install (и всё прочее) честно падает —
  // случайный незамоканный реальный вызов станет заметен
  shimDir = join(home, 'npm-shim');
  mkdirSync(shimDir, { recursive: true });
  const shim = join(shimDir, 'npm');
  writeFileSync(
    shim,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  view) printf \'%s\\n\' "${WOLF_FAKE_VERSION:-9.9.9}"; exit 0 ;;',
      "  prefix) printf '%s\\n' '/tmp/wolf-e2e-not-a-real-prefix'; exit 0 ;;",
      '  *) echo "wolf-e2e npm shim: refusing: $*" >&2; exit 1 ;;',
      'esac',
      '',
    ].join('\n')
  );
  chmodSync(shim, 0o755);
}, 180_000);

afterAll(() => {
  if (home !== '') rmSync(home, { recursive: true, force: true });
});

/** Изолированное окружение: tmp-HOME/XDG (реестр не мусорит в машину) + npm-шим в PATH. */
function isolatedEnv(fakeVersion?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    PATH: `${shimDir}:${process.env.PATH ?? ''}`,
    ...(fakeVersion ? { WOLF_FAKE_VERSION: fakeVersion } : {}),
  };
}

describe('E1: wolf upgrade --check (замоканный npm view, изолированный XDG)', () => {
  it('registry новее → exit 0, «доступна 9.9.9» с текущей версией', () => {
    const res = spawnSync('node', [cli, 'upgrade', '--check'], {
      cwd: tmpProject(),
      env: isolatedEnv(),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('available 9.9.9');
    expect(res.stdout).toContain(repoVersion); // текущая версия из package.json
  });

  it('версии равны → exit 0, «уже последняя»', () => {
    const res = spawnSync('node', [cli, 'upgrade', '--check'], {
      cwd: tmpProject(),
      env: isolatedEnv(repoVersion),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('already the latest version');
  });
});

describe('E2: refusal-path — linked/dev-копия', () => {
  it('запуск из репо dist (бинарь вне npm-префикса) → отказ с рецептом, exit 1', () => {
    // детекция честная, без подмены кода: репо-dist НЕ лежит в shim-префиксе npm
    const res = spawnSync('node', [cli, 'upgrade'], {
      cwd: tmpProject(),
      env: isolatedEnv(),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(1);
    const lines = res.stderr.trim().split('\n');
    expect(lines).toHaveLength(1); // однострочный Error: без стека
    expect(lines[0]).toMatch(/^Error: /);
    expect(lines[0]).toContain('dev/linked copy');
    expect(lines[0]).toContain('npm rm -g mister-wolf');
    expect(lines[0]).toContain(join(repoRoot, 'dist/bootstrap/cli.js')); // путь к бинарю в сообщении
  });
});

describe('E3: регресс safeCwd — удалённый каталог', () => {
  it('wolf upgrade из удалённого cwd → guard-однострочник, exit 1', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wolf-upgrade-cwd-'));
    const res = spawnSync('sh', ['-c', `cd "${tmp}" && rm -rf "${tmp}" && node "${cli}" upgrade`], {
      env: isolatedEnv(),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(1);
    const lines = res.stderr.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Error: /);
    expect(lines[0]).toContain('directory does not exist');
    expect(res.stderr).not.toContain('    at '); // стека нет — UserFacingError
  });
});

describe('D1: help', () => {
  it('wolf upgrade --help описывает команду и --check', () => {
    const res = spawnSync('node', [cli, 'upgrade', '--help'], {
      cwd: tmpProject(),
      env: isolatedEnv(),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Upgrade the global wolf installation');
    expect(res.stdout).toContain('--check');
  });
});
