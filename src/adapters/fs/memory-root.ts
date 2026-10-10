import { existsSync, readFileSync } from 'fs';
import { basename, dirname, isAbsolute, join, resolve } from 'path';

export interface MemoryRootInfo {
  /** Корень чекаута, владеющего общим .wolf/ (main-чекоут; вне worktree — сам baseDir). */
  root: string;
  /** Имя linked worktree или null (main-чекоут / вне git / аномалия). */
  worktree: string | null;
}

/** WP3 §6.1 (спека 2.16): linked worktree резолвит общий .wolf/ в main-чекоуте.
 * Механика спеки — git common-dir (`git rev-parse --git-common-dir`); здесь тот же
 * информационный fs-парс без подпроцессов (прецедент чтения .git/HEAD:
 * heuristic-project-scanner.ts:221-239) — юнит-тестируемо без git, нет подпроцесса
 * в hot-path. Любой сбой — безопасный fallback на локальный .wolf/ (риск Р5 спеки). */
export function resolveMemoryRoot(baseDir: string): MemoryRootInfo {
  try {
    const dotGit = join(baseDir, '.git');
    if (!existsSync(dotGit)) return { root: baseDir, worktree: null };
    const dotGitRaw = readFileSync(dotGit, 'utf-8');
    if (!dotGitRaw.startsWith('gitdir:')) return { root: baseDir, worktree: null }; // обычный чекаут
    const gitdir = resolve(baseDir, dotGitRaw.slice('gitdir:'.length).trim());
    const commondirFile = join(gitdir, 'commondir');
    if (!existsSync(commondirFile)) return { root: baseDir, worktree: null }; // не linked worktree
    const raw = readFileSync(commondirFile, 'utf-8').trim();
    const commonGitDir = isAbsolute(raw) ? raw : resolve(gitdir, raw);
    const root = dirname(commonGitDir);
    if (root === baseDir) return { root: baseDir, worktree: null };
    // bare-репо + linked worktree: commondir указывает мимо чекаута — fallback локальный (Р5)
    if (!existsSync(join(root, '.git'))) return { root: baseDir, worktree: null };
    return { root, worktree: basename(baseDir) };
  } catch {
    return { root: baseDir, worktree: null };
  }
}
