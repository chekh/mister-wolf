import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'fs';
import { basename, dirname, isAbsolute, join, resolve } from 'path';

export interface MemoryRootInfo {
  /** Корень чекаута, владеющего общим .wolf/ (main-чекоут; вне worktree — сам baseDir). */
  root: string;
  /** Токен WT-ID linked worktree (`w-<12 hex>`) или null (main-чекоут / вне git / аномалия).
   * 2.17.1 REQ-02 (R02): токен вместо basename — одинаковые basename двух копий дают
   * разные идентификаторы; consumer подставляет его в scope как `worktree:${worktree}`. */
  worktree: string | null;
}

/** 2.17.1 REQ-02 (R02), design §3.1 (ADR-1): устойчивая идентичность linked worktree. */
export interface WorktreeIdentity {
  /** Полный scope-токен копии: `worktree:w-<12 hex sha1(realpath(baseDir))>`. */
  id: string;
  /** basename(baseDir) — маппинг legacy-токенов `worktree:<name>` (записанных до 2.17.1). */
  legacyName: string;
  /** true — ровно одна живая копия с этим basename: legacy-имя однозначно маппится на неё. */
  legacyUnique: boolean;
}

/** Токен WT-ID без префикса scope: `w-` + первые 12 hex sha1(realpath(dir)).
 * Идентичность по realpath: одинаковые basename двух копий дают разные токены;
 * переименование каталога = новая копия с новым WT-ID (ограничение ADR-1). */
export function worktreeScopeToken(dir: string): string {
  return 'w-' + createHash('sha1').update(realpathSync(dir)).digest('hex').slice(0, 12);
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
    return { root, worktree: worktreeScopeToken(baseDir) };
  } catch {
    return { root: baseDir, worktree: null };
  }
}

/** basename каждой живой записи `git worktree list --porcelain` (включая main-чекоут).
 * Дубликаты сохраняются: однозначность legacy-имени — счёт, не множество. Кэш на
 * процесс (NFR-01 (R02): ≤1 git-подпроцесса); null — сбой git-метаданных. */
const liveBasenamesCache = new Map<string, string[] | null>();
function liveWorktreeBasenames(baseDir: string): string[] | null {
  let key: string;
  try {
    key = realpathSync(baseDir);
  } catch {
    return null;
  }
  if (liveBasenamesCache.has(key)) return liveBasenamesCache.get(key)!;
  let result: string[] | null = null;
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: baseDir,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    result = [];
    for (const line of out.split('\n')) {
      if (!line.startsWith('worktree ')) continue;
      try {
        result.push(basename(realpathSync(line.slice('worktree '.length).trim())));
      } catch {
        // каталог записи исчез — git пометит prunable; в счёт живых он не входит
      }
    }
  } catch {
    result = null; // битые git-метаданные — fail-closed (design §5)
  }
  liveBasenamesCache.set(key, result);
  return result;
}

/** 2.17.1 REQ-02 (R02), design §3.1 (ADR-1): идентичность linked worktree.
 * null — main-чекоут, вне git, bare-аномалия, сбой git-метаданных (fail-closed:
 * legacy-токены не маппятся, чужой scope недоступен — §5).
 * Вызывать лениво — по встрече legacy-токена (бюджет NFR-01: ≤1 git-подпроцесса
 * на процесс, только linked worktree; main-чекоут git не запускает). */
export function resolveWorktreeIdentity(baseDir: string): WorktreeIdentity | null {
  const info = resolveMemoryRoot(baseDir);
  if (info.worktree === null) return null;
  const live = liveWorktreeBasenames(baseDir);
  if (live === null) return null;
  const legacyName = basename(baseDir);
  return {
    id: `worktree:${info.worktree}`,
    legacyName,
    legacyUnique: live.filter((n) => n === legacyName).length === 1,
  };
}

/** Каталог выглядит linked worktree (.git — файл-указатель), но метаданные не
 * резолвятся в общий root: fail-closed предупреждение доставки (REQ-02 AC-5,
 * design §5 — предупреждение в wolf call). null — не broken (main/outside git). */
export function brokenWorktreeHint(baseDir: string): string | null {
  try {
    const dotGit = join(baseDir, '.git');
    if (!existsSync(dotGit) || statSync(dotGit).isDirectory()) return null;
    const raw = readFileSync(dotGit, 'utf-8');
    if (!raw.startsWith('gitdir:')) return null;
    if (resolveMemoryRoot(baseDir).worktree !== null) return null;
    return `worktree git metadata is broken in ${baseDir} — delivery is fail-closed, worktree-scoped memory stays hidden`;
  } catch {
    return null;
  }
}
