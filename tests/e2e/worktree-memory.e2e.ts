import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { rmSync, existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('worktree memory (спека 2.16 §14.8, часть записи)', () => {
  let main: string;
  let wt: string;
  beforeAll(() => {
    ensureBuilt();
    main = tmpProject();
    execSync('git init -b main', { cwd: main });
    execSync('git -c user.email=t@t -c user.name=t commit -m init --allow-empty', { cwd: main });
    wt = join(main, '..', 'wt-e2e');
    execSync(`git worktree add "${wt}" -b wt-branch`, { cwd: main });
  });
  afterAll(() => {
    rmSync(wt, { recursive: true, force: true });
    rmSync(main, { recursive: true, force: true });
  });

  it('worktree init writes the common .wolf into the main checkout', () => {
    expect(runCli(['init', '--yes'], wt).status).toBe(0);
    expect(existsSync(join(main, '.wolf', 'config.yaml'))).toBe(true);
    expect(existsSync(join(wt, '.wolf'))).toBe(false);
  });

  it('note written in worktree gets scope worktree:<name> in the common store', () => {
    expect(
      runCli(['add', '--type', 'note', '--facet', 'context', '--title', 'wt only', '--created-by', 'user:t'], wt).status
    ).toBe(0);
    // layout v2: note живёт в shared/notes/<id>.md (не плоско в memory/)
    const notesDir = join(main, '.wolf', 'memory', 'shared', 'notes');
    const files = readdirSync(notesDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    // init-report (из main) scope не имеет — строка worktree:<имя> может прийти
    // только из записи, созданной в worktree
    const raw = files.map((f) => readFileSync(join(notesDir, f), 'utf-8')).join('\n');
    expect(raw).toContain(`scope: worktree:${basename(wt)}`);
  });
});
