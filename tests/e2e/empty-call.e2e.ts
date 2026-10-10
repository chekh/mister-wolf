import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { rmSync } from 'fs';
import { basename, join } from 'path';
import { ensureBuilt, runCli, tmpProject, writeLegacyInjection } from './helpers.js';

/** Изоляция: tmp XDG (реестр проектов) + срез npm_command (не npx-try-out). */
function isoEnv(dir: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: join(dir, '.wolf', 'cache', 'xdg') };
}

describe('empty call explains itself (спека 2.16 §14.4)', () => {
  beforeAll(() => {
    ensureBuilt();
  });

  it('empty store names the capture step', () => {
    const dir = tmpProject();
    expect(runCli(['init'], dir, isoEnv(dir)).status).toBe(0);
    const r = runCli(['call'], dir, isoEnv(dir));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('No active call injections.');
    expect(r.stdout).toContain('pool: 0');
    expect(r.stdout).toContain('wolf add');
    rmSync(dir, { recursive: true, force: true });
  });

  it('scope filter names the active scope and promotes as next step', () => {
    const main = tmpProject();
    execSync('git init -b main', { cwd: main });
    execSync('git -c user.email=t@t -c user.name=t commit -m init --allow-empty', { cwd: main });
    const wt = join(main, '..', 'wt-explain');
    rmSync(wt, { recursive: true, force: true }); // прелив упавшего прогона ломает worktree add
    execSync(`git worktree add "${wt}" -b wt-explain`, { cwd: main });
    expect(runCli(['init', '--yes'], wt, isoEnv(wt)).status).toBe(0);
    // Пул доставки — легаси call-injection (wave13-a/P211): plain note из `wolf add`
    // в пул не попадает, поэтому скрытый в main объект сеется в общий .wolf тем же
    // механизмом, что в worktree-memory.e2e.ts (отклонение от листинга плана — см. done-строку задачи 8)
    writeLegacyInjection(main, {
      id: 'inj_hidden',
      title: 'hidden fact',
      body: 'worktree-only fact',
      trigger_keywords: [],
      created_by: 'user:t',
      scope: `worktree:${basename(wt)}`,
    });
    const r = runCli(['call'], main, isoEnv(main));
    expect(r.stdout).toContain('pool: 1');
    expect(r.stdout).toContain('scope filter hid 1');
    expect(r.stdout).toContain('current scope: main'); // §14.4: назван активный scope (вызов из main)
    expect(r.stdout).toContain('wolf promote');
    rmSync(wt, { recursive: true, force: true });
    rmSync(main, { recursive: true, force: true });
  });
});
