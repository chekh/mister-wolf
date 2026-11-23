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

/** Результат перечисления `git worktree list --porcelain -z`. paths —
 *  канонизированные (realpath) пути живых чекаутов; refusals — по-путевые
 *  отказы канонизации (путь НЕ включён в paths). */
export interface WorktreeEnumeration {
  paths: string[];
  refusals: string[];
}

/** Полные пути живых записей `git worktree list --porcelain -z` (REQ-333-1,
 *  ADR-340-3: перечисление источников импорта). patch 3.4.x review (F1.1):
 *  формат -z (NUL-разделители) — путь записи не может содержать NUL, поэтому
 *  путь = подстрока после префикса `worktree ` до NUL БЕЗ trim: имена
 *  каталогов с пробелами в конце валидны и не искажаются. patch 3.4.4 review
 *  (P1, директива владельца): errno-разбор realpathSync — ТОЛЬКО ENOENT
 *  означает «запись исчезла с диска» (git пометит prunable, источник
 *  пропускается, прежнее поведение); EACCES/EPERM/EIO/ENOTDIR/… — путь НЕ
 *  попадает в paths, а отказ с путём и кодом попадает в refusals: закрытый
 *  родитель зарегистрированного worktree не имеет права молча выбрасывать
 *  источник из перечисления (иначе перенос «завершается» без чужого
 *  подавления и выдаётся спорная заметка — вызывающий переносит отказ в
 *  механику отказа миграции). null — сбой git-спавна (fail-closed, design §5).
 *  Без кэша: вызывается в редких критических секциях импорта/restore, не на
 *  горячем пути доставки. */
export function listWorktreeCheckouts(baseDir: string): WorktreeEnumeration | null {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain', '-z'], {
      cwd: baseDir,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const paths: string[] = [];
    const refusals: string[] = [];
    for (const record of out.split('\0')) {
      if (!record.startsWith('worktree ')) continue;
      const raw = record.slice('worktree '.length);
      try {
        paths.push(realpathSync(raw));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; // запись исчезла — prunable
        // недоступный путь — отказ с путём и кодом (не молчаливое отсутствие)
        refusals.push(`${raw}: ${(e as Error).message}`);
      }
    }
    return { paths, refusals };
  } catch {
    return null; // битые git-метаданные — fail-closed (design §5)
  }
}

/**
 * Кэш УСПЕШНЫХ полных перечислений на процесс; ключ — realpath(корень памяти
 * baseDir): журнал миграции и identity перечисляют ОДИН repo-global список
 * `git worktree list` из разных чекаутов, общий кэш держит бюджет NFR-01
 * (≤1 git-подпроцесс на процесс) и на пути доставки (proven-check P1-1 +
 * legacy-identity — один спавн). Значения не мутировать.
 * patch 3.4.5 review (P2): кэшируются ТОЛЬКО успешные полные перечисления —
 * отказ (spawn-сбой или refusals → fail-closed null) НЕ кэшируется: временная
 * недоступность (EACCES) не должна кэшироваться до перезапуска процесса,
 * следующий доступ повторяет перечисление (сломанный путь — suspended/
 * fail-closed, повторная попытка на каждый доступ допустима).
 */
const liveEnumerationCache = new Map<string, WorktreeEnumeration>();

/**
 * patch 3.4.5 review (F-B): тёплый кэш успеха не должен экранировать
 * НАСТУПИВШИЙ отказ доступа (приёмка P2 «при неполном списке заметка скрыта»
 * — в ОБОИХ состояниях кэша). Перечисление считается устаревшим, если хотя бы
 * один закэшированный путь стал недостижим (EACCES на родителе/ENOENT/…) —
 * это тот же примитив realpathSync, чей errno порождает refusals. Только
 * файловые проверки, БЕЗ git-спавна: на чистом пути все пути достижимы и кэш
 * переиспользуется (NFR-01 не меняется), на сломанном — инвалидация и свежее
 * перечисление (его отказ не кэшируется — P2).
 */
function enumerationPathsReachable(paths: string[]): boolean {
  for (const p of paths) {
    try {
      realpathSync(p);
    } catch {
      return false;
    }
  }
  return true;
}

/** Успешное полное перечисление с кэшем на процесс (см. liveEnumerationCache);
 *  null — перечислить не удалось (не кэшируется, P2). */
export function cachedWorktreeEnumeration(baseDir: string): WorktreeEnumeration | null {
  let key: string;
  try {
    key = realpathSync(resolveMemoryRoot(baseDir).root);
  } catch {
    return null; // нерезолвимый baseDir — отказ без кэша, как раньше
  }
  const cached = liveEnumerationCache.get(key);
  if (cached !== undefined) {
    if (enumerationPathsReachable(cached.paths)) return cached;
    liveEnumerationCache.delete(key); // F-B: мир изменился — кэш устарел
  }
  const fresh = listWorktreeCheckouts(baseDir);
  if (fresh === null || fresh.refusals.length > 0) return null; // отказ не кэшируется (P2)
  liveEnumerationCache.set(key, fresh);
  return fresh;
}

/** basename каждой живой записи `git worktree list --porcelain` (включая main-чекоут).
 * Дубликаты сохраняются: однозначность legacy-имени — счёт, не множество. Кэш на
 * процесс (NFR-01 (R02): ≤1 git-подпроцесса); null — сбой git-метаданных
 * (fail-closed, НЕ кэшируется — P2). */
function liveWorktreeBasenames(baseDir: string): string[] | null {
  const enumeration = cachedWorktreeEnumeration(baseDir);
  return enumeration === null ? null : enumeration.paths.map((p) => basename(p));
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
