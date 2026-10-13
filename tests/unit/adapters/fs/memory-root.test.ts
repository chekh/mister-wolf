import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { realpathSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import {
  resolveMemoryRoot,
  resolveWorktreeIdentity,
  worktreeScopeToken,
  brokenWorktreeHint,
} from '../../../../src/adapters/fs/memory-root.js';

/** Ожидаемый WT-ID-токен копии — тот же алгоритм, что в реализации, посчитан в тесте независимо. */
function expectedToken(dir: string): string {
  return 'w-' + createHash('sha1').update(realpathSync(dir)).digest('hex').slice(0, 12);
}

function makeWorktree(name = 'wt-task'): { mainRoot: string; wtRoot: string } {
  const base = mkdtempSync(join(tmpdir(), 'wolf-root-'));
  const mainRoot = join(base, 'main');
  const wtRoot = join(base, name);
  mkdirSync(join(mainRoot, '.git'), { recursive: true });
  const wtGitDir = join(mainRoot, '.git', 'worktrees', name);
  mkdirSync(wtGitDir, { recursive: true });
  mkdirSync(wtRoot, { recursive: true });
  writeFileSync(join(wtRoot, '.git'), `gitdir: ${wtGitDir}\n`);
  writeFileSync(join(wtGitDir, 'commondir'), '../..\n');
  return { mainRoot, wtRoot };
}

/** Реальный git-репозиторий + linked worktrees (прецедент: tests/e2e/worktree-memory.e2e.ts).
 * Тест-план 2.17.1: копии для сценариев — `git worktree add` во временных каталогах. */
function makeGitRepo(worktreeRels: string[]): { base: string; main: string; wts: string[] } {
  const base = mkdtempSync(join(tmpdir(), 'wolf-wtid-'));
  const main = join(base, 'main');
  mkdirSync(main, { recursive: true });
  execSync('git init -b main', { cwd: main });
  execSync('git -c user.email=t@t -c user.name=t commit -m init --allow-empty', { cwd: main });
  const wts = worktreeRels.map((rel, i) => {
    const dir = join(base, rel);
    mkdirSync(dirname(dir), { recursive: true });
    execSync(`git worktree add "${dir}" -b wt-${i}`, { cwd: main });
    return dir;
  });
  return { base, main, wts };
}

const reposToClean: string[] = [];
afterEach(() => {
  for (const r of reposToClean) rmSync(r, { recursive: true, force: true });
  reposToClean.length = 0;
});

describe('resolveMemoryRoot (WP3 §6.1)', () => {
  it('plain checkout resolves to itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-root-'));
    mkdirSync(join(dir, '.git'));
    expect(resolveMemoryRoot(dir)).toEqual({ root: dir, worktree: null });
  });

  it('linked worktree resolves to the main checkout; worktree = WT-ID token (2.17.1 REQ-02 (R02))', () => {
    const { mainRoot, wtRoot } = makeWorktree();
    expect(resolveMemoryRoot(wtRoot)).toEqual({ root: mainRoot, worktree: expectedToken(wtRoot) });
  });

  it('pointer without commondir falls back to local .wolf', () => {
    const base = mkdtempSync(join(tmpdir(), 'wolf-root-'));
    const mainRoot = join(base, 'main');
    const wtRoot = join(base, 'wt-lonely');
    mkdirSync(join(mainRoot, '.git'), { recursive: true });
    mkdirSync(wtRoot, { recursive: true });
    writeFileSync(join(wtRoot, '.git'), `gitdir: ${join(mainRoot, '.git', 'worktrees', 'wt-lonely')}\n`);
    expect(resolveMemoryRoot(wtRoot)).toEqual({ root: wtRoot, worktree: null });
  });

  it('corrupt pointer falls back to local .wolf (Р5)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-root-'));
    writeFileSync(join(dir, '.git'), 'gitdir: /nonexistent/x');
    expect(resolveMemoryRoot(dir)).toEqual({ root: dir, worktree: null });
  });
});

describe('resolveWorktreeIdentity / worktreeScopeToken (2.17.1 REQ-02 (R02), design §3.1/ADR-1)', () => {
  it('main checkout: identity null, no broken hint (git не нужен)', () => {
    const r = makeGitRepo([]);
    reposToClean.push(r.base);
    expect(resolveWorktreeIdentity(r.main)).toBeNull();
    expect(brokenWorktreeHint(r.main)).toBeNull();
  });

  it('linked worktree: id = worktree:w-<sha1(realpath)[:12]>, legacyName = basename, имя однозначно', () => {
    const r = makeGitRepo(['task']);
    reposToClean.push(r.base);
    const wt = r.wts[0] as string;
    expect(resolveWorktreeIdentity(wt)).toEqual({
      id: `worktree:${expectedToken(wt)}`,
      legacyName: 'task',
      legacyUnique: true,
    });
    expect(resolveMemoryRoot(wt).worktree).toBe(worktreeScopeToken(wt));
  });

  it('две копии с одинаковым basename: разные WT-ID, legacy-имя неоднозначно у обеих (AC-3)', () => {
    const r = makeGitRepo(['a/task', 'b/task']);
    reposToClean.push(r.base);
    const [a, b] = r.wts as [string, string];
    const idA = resolveWorktreeIdentity(a);
    const idB = resolveWorktreeIdentity(b);
    expect(idA).not.toBeNull();
    expect(idB).not.toBeNull();
    expect(idA?.id).not.toBe(idB?.id);
    expect(idA).toMatchObject({ legacyName: 'task', legacyUnique: false });
    expect(idB).toMatchObject({ legacyName: 'task', legacyUnique: false });
  });

  it('битый .git-указатель: identity null + fail-closed предупреждение (AC-5, design §5)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-root-'));
    writeFileSync(join(dir, '.git'), 'gitdir: /nonexistent/x');
    expect(resolveWorktreeIdentity(dir)).toBeNull();
    expect(brokenWorktreeHint(dir)).toMatch(/broken/i);
  });

  it('fs-фикстура worktree без git-репозитория: сбой git — identity null (fail-closed)', () => {
    const { wtRoot } = makeWorktree();
    expect(resolveWorktreeIdentity(wtRoot)).toBeNull();
  });

  it('вне git: identity null, предупреждения нет', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-root-'));
    expect(resolveWorktreeIdentity(dir)).toBeNull();
    expect(brokenWorktreeHint(dir)).toBeNull();
  });
});
