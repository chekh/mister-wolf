// tests/e2e/upgrade-exec.e2e.ts
// T8 (волна 2.19.0, test-plan решение №1 уровень 2): само-спавн smoke на
// реальном артефакте. WOLF_UPGRADE_CHILD_BIN указывает на текущий dist wolf
// (sh-обёртка — прецедент npm-шим upgrade.e2e.ts): `wolf upgrade` при
// up-to-date (npm-шим view) делает re-exec, ребёнок наследует stdio/env и
// проходит фазу 2 по изолированному (пустому) реестру → exit 0. Плюс:
// hidden upgrade-projects отвечает help'ом; общего списка --help не содержит.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { repoRoot, tmpProject, ensureBuilt } from './helpers.js';

const cli = join(repoRoot, 'dist/bootstrap/cli.js');
let home = '';
let shimDir = '';
let childBin = '';
let repoVersion = '';

beforeAll(() => {
  ensureBuilt();
  repoVersion = (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as { version: string }).version;
  home = mkdtempSync(join(tmpdir(), 'wolf-upgrade-exec-'));
  // npm-шим: view = установлена (up-to-date → идемпотентный re-exec, без
  // install); prefix = репо — бинарник «внутри префикса», отказ linked-копии
  // не срабатывает (механика той же чести, что в upgrade.e2e); прочее — отказ
  shimDir = join(home, 'npm-shim');
  mkdirSync(shimDir, { recursive: true });
  const shim = join(shimDir, 'npm');
  writeFileSync(
    shim,
    [
      '#!/bin/sh',
      'case "$1" in',
      `  view) printf '%s\\n' '${repoVersion}'; exit 0 ;;`,
      `  prefix) printf '%s\\n' '${repoRoot}'; exit 0 ;;`,
      '  *) echo "wolf-e2e npm shim: refusing: $*" >&2; exit 1 ;;',
      'esac',
      '',
    ].join('\n')
  );
  chmodSync(shim, 0o755);
  // «новый бинарник» = текущий dist wolf через sh-обёртку (spawn без shell)
  childBin = join(home, 'wolf-child');
  writeFileSync(childBin, `#!/bin/sh\nexec node "${cli}" "$@"\n`);
  chmodSync(childBin, 0o755);
}, 180_000);

afterAll(() => {
  if (home !== '') rmSync(home, { recursive: true, force: true });
});

/** Изоляция: tmp-HOME/XDG (реестр пуст — «проектов нет»), npm-шим в PATH. */
function isolatedEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    PATH: `${shimDir}:${process.env.PATH ?? ''}`,
    WOLF_UPGRADE_CHILD_BIN: childBin,
  };
}

describe('T8: само-спавн re-exec на реальном артефакте', () => {
  it('upgrade-projects --help (hidden) отвечает help-ом, exit 0', () => {
    const res = spawnSync(childBin, ['upgrade-projects', '--help'], {
      cwd: tmpProject(),
      env: isolatedEnv(),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('--from');
    expect(res.stdout).toContain('--no-banner');
  });

  it('wolf upgrade (up-to-date) → re-exec ребёнка dist-wolf: stdio/env наследованы, empty-парк Done, exit 0', () => {
    const res = spawnSync('node', [cli, 'upgrade'], {
      cwd: tmpProject(),
      env: isolatedEnv(),
      encoding: 'utf-8',
      timeout: 120_000,
    });
    expect(res.status).toBe(0); // код родителя = код ребёнка (0)
    expect(res.stdout).toContain(`Mr Wolf upgrade ${repoVersion}`); // шапка — только фаза 1 (plain в пайпе)
    expect(res.stdout).toContain(`already the latest version (${repoVersion})`); // up-to-date → НЕ выход
    expect(res.stdout).toContain('wolf upgrade — projects'); // фаза 2 реального ребёнка, stdio inherit
    expect(res.stdout).toContain('no projects in the registry'); // изолированный реестр
    expect(res.stdout).toContain('Done: no projects');
  });

  it('общий --help НЕ содержит upgrade-projects (hidden, ADR-5)', () => {
    const res = spawnSync('node', [cli, '--help'], {
      cwd: tmpProject(),
      env: isolatedEnv(),
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('upgrade-projects');
  });
});
