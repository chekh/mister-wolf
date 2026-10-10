import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveMemoryRoot } from '../../../../src/adapters/fs/memory-root.js';

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

describe('resolveMemoryRoot (WP3 §6.1)', () => {
  it('plain checkout resolves to itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-root-'));
    mkdirSync(join(dir, '.git'));
    expect(resolveMemoryRoot(dir)).toEqual({ root: dir, worktree: null });
  });

  it('linked worktree resolves to the main checkout', () => {
    const { mainRoot, wtRoot } = makeWorktree();
    expect(resolveMemoryRoot(wtRoot)).toEqual({ root: mainRoot, worktree: 'wt-task' });
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
