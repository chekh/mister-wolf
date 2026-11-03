import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * B0.5 (roadmap v4 §11): единственный структурный сборщик Git-состояния
 * (ADR-5). Read-only: только читающие git-команды, refs не меняются, память
 * Wolf не читается. Вердикт — чистая функция computeVerdict по таблице
 * решений design; сбор фактов — через внедрённый GitRunner/fs/now.
 */

/** Порт запуска git (design §Глоссарий): без shell, опциональный таймаут. */
export type GitRunnerResult = { code: number; stdout: string; stderr: string };
export type GitRunner = (args: string[], opts: { cwd: string; timeoutMs?: number }) => Promise<GitRunnerResult>;

export type GitVerdict = 'PASS' | 'VIOLATION' | 'UNKNOWN';
export type BaselineRelationship = 'equal' | 'ancestor-of-head' | 'diverged' | 'unresolved';
export type RemoteRelation =
  | 'in-sync'
  | 'ahead'
  | 'behind'
  | 'diverged'
  | 'remote-ahead-unfetched'
  | 'no-remote'
  | 'no-upstream';
export type RemoteObservationMethod = 'ls-remote' | 'tracking-ref' | 'none';

/** NFR-02: сетевое ls-remote ограничено 10 с, после чего remote недоступен. */
export const LS_REMOTE_TIMEOUT_MS = 10_000;

export interface LocalVsRemote {
  upstream: string | null;
  remote: string | null;
  relation: RemoteRelation;
  ahead: number | null;
  behind: number | null;
  remote_head: string | null;
}

export interface FreshnessOfRemoteObservation {
  observed_at: string | null;
  method: RemoteObservationMethod;
  reachable: boolean | null;
}

export interface GitFacts {
  repository: { root: string | null; is_bare: boolean | null; origin_url_sanitized: string | null };
  worktree: { path: string | null; kind: 'main' | 'linked' | null };
  branch: string | null;
  head: string | null;
  baseline: { sha: string; relationship: BaselineRelationship } | null;
  target: string | null;
  dirty: { value: boolean; entries: number };
  unfinished_git_operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null;
  local_vs_remote: LocalVsRemote;
  branch_owner: string | null;
  freshness_of_remote_observation: FreshnessOfRemoteObservation;
  /** Внутренний маркер строки 1 таблицы решений («не репозиторий / git упал»); в JSON-отчёт не входит. */
  collection_error: string | null;
}

export type GitInspectReport = Omit<GitFacts, 'collection_error'> & {
  schema_version: 1;
  observed_at: string;
  verdict: GitVerdict;
  reasons: string[];
  allowed_next_actions: string[];
};

export interface GitInspectDeps {
  runner: GitRunner;
  /** fs-порт: проверка незавершённых git-операций по служебным файлам git-каталога. */
  exists: (path: string) => boolean;
  now: () => Date;
}

export interface GitInspectOptions {
  cwd: string;
  /** baseline SHA — вход задачи; отсутствие входа = отсутствие проверки (§6 requirements). */
  baseline?: string;
  target?: string;
  /** branch_owner — только из входа (ADR-1), память Wolf не читается. */
  owner?: string;
}

/** NFR-01: встроенные учётные данные (user:token@) замещаются целиком — ни логина, ни токена в выводе. */
export function sanitizeGitUrl(url: string): string {
  return url
    .replace(/(^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@\s]+@/, '$1***@')
    .replace(/(^|[\s/])([^/@\s:]+):([^/@\s]+)@/, '$1***@'); // scp-синтаксис user:token@host:path
}

/**
 * Вердикт/reasons/actions по таблице решений design (порядок строк — сверху
 * вниз, первое сработавшее определяет вердикт). Чистая функция — тестируется
 * без git.
 */
export function computeVerdict(facts: GitFacts): {
  verdict: GitVerdict;
  reasons: string[];
  allowed_next_actions: string[];
} {
  const { local_vs_remote: lvr, freshness_of_remote_observation: freshness } = facts;

  // строка 1: не репозиторий / git-команда упала
  if (facts.collection_error !== null) {
    return {
      verdict: 'UNKNOWN',
      reasons: [facts.collection_error],
      allowed_next_actions: ['verify the working directory is a git repository'],
    };
  }

  const reasons: string[] = [];
  const actions: string[] = [];
  const upstreamMissing = lvr.relation === 'no-remote' || lvr.relation === 'no-upstream';

  // по одной причине на выполненную проверку (REQ-02)
  reasons.push(facts.dirty.value ? `dirty: ${facts.dirty.entries} uncommitted change(s)` : 'dirty: clean');
  if (facts.dirty.value) actions.push('commit or discard changes before handoff (if authorized)');

  reasons.push(
    facts.unfinished_git_operation !== null
      ? `unfinished git operation: ${facts.unfinished_git_operation} in progress`
      : 'unfinished git operation: none'
  );
  if (facts.unfinished_git_operation !== null) {
    actions.push('complete or abort the unfinished git operation before handoff');
  }

  if (facts.baseline !== null) {
    reasons.push(`baseline ${facts.baseline.sha}: ${facts.baseline.relationship}`);
    if (facts.baseline.relationship === 'diverged') {
      actions.push('reconcile baseline with head via rebase or merge (if authorized)');
    }
    if (facts.baseline.relationship === 'unresolved') {
      actions.push('verify the baseline commit exists in this repository');
    }
  }

  if (lvr.upstream !== null && freshness.reachable === false) {
    // строка 2: remote существует, но ls-remote недоступен
    reasons.push(`remote unreachable: ls-remote failed for ${lvr.remote ?? 'remote'}`);
    actions.push('verify network/remote access; do not assume clean');
  } else if (upstreamMissing && facts.target !== null) {
    // вход --target требует remote-сравнения, а оно неприменимо
    reasons.push(`remote comparison required by --target ${facts.target} but no upstream/remote is configured`);
    actions.push('verify remote/upstream configuration');
  } else {
    switch (lvr.relation) {
      case 'no-remote':
        reasons.push('remote comparison not applicable: no remote configured');
        break;
      case 'no-upstream':
        reasons.push('remote comparison not applicable: no upstream branch');
        break;
      case 'in-sync':
        reasons.push(`local vs remote: in sync with ${lvr.upstream}`);
        break;
      case 'ahead':
        reasons.push(`unpublished commits present: ahead of ${lvr.upstream} by ${lvr.ahead}`);
        break;
      case 'behind':
        reasons.push(`local vs remote: behind ${lvr.upstream} by ${lvr.behind}`);
        break;
      case 'diverged':
        reasons.push(`local vs remote: diverged from ${lvr.upstream} (ahead ${lvr.ahead}, behind ${lvr.behind})`);
        break;
      case 'remote-ahead-unfetched':
        reasons.push(`local vs remote: remote ${lvr.upstream} ahead with unfetched commits (count unknown)`);
        break;
    }
    if (lvr.relation === 'diverged' || lvr.relation === 'behind' || lvr.relation === 'remote-ahead-unfetched') {
      actions.push('sync with the remote before handoff (if authorized)');
    }
  }

  // вердикт — строго по таблице design сверху вниз: unreachable-строка 2,
  // затем violations (3–6), затем unknown-строки (baseline unresolved,
  // target при отсутствующем remote), иначе PASS
  let verdict: GitVerdict;
  if (lvr.upstream !== null && freshness.reachable === false) verdict = 'UNKNOWN';
  else if (facts.dirty.value) verdict = 'VIOLATION';
  else if (facts.unfinished_git_operation !== null) verdict = 'VIOLATION';
  else if (facts.baseline?.relationship === 'diverged') verdict = 'VIOLATION';
  else if (lvr.relation === 'diverged' || lvr.relation === 'behind' || lvr.relation === 'remote-ahead-unfetched') {
    verdict = 'VIOLATION';
  } else if (facts.baseline?.relationship === 'unresolved') verdict = 'UNKNOWN';
  else if (upstreamMissing && facts.target !== null) verdict = 'UNKNOWN';
  else verdict = 'PASS';

  if (verdict === 'PASS') {
    return {
      verdict,
      reasons,
      allowed_next_actions:
        lvr.relation === 'ahead'
          ? ['publish if authorized']
          : ['read-only observation complete; no git action required'],
    };
  }
  return { verdict, reasons, allowed_next_actions: actions };
}

/** Сбор фактов: только читающие команды (design §Контракты). */
export async function collectGitFacts(deps: GitInspectDeps, opts: GitInspectOptions): Promise<GitFacts> {
  const run = async (args: string[], timeoutMs?: number): Promise<GitRunnerResult> =>
    deps.runner(args, { cwd: opts.cwd, timeoutMs });

  const emptyRemote: LocalVsRemote = {
    upstream: null,
    remote: null,
    relation: 'no-remote',
    ahead: null,
    behind: null,
    remote_head: null,
  };
  const noFreshness: FreshnessOfRemoteObservation = { observed_at: null, method: 'none', reachable: null };
  const emptyFacts = (message: string): GitFacts => ({
    repository: { root: null, is_bare: null, origin_url_sanitized: null },
    worktree: { path: null, kind: null },
    branch: null,
    head: null,
    baseline: opts.baseline !== undefined ? { sha: opts.baseline, relationship: 'unresolved' } : null,
    target: opts.target ?? null,
    dirty: { value: false, entries: 0 },
    unfinished_git_operation: null,
    local_vs_remote: { ...emptyRemote },
    branch_owner: opts.owner ?? null,
    freshness_of_remote_observation: { ...noFreshness },
    collection_error: message,
  });

  const gitDirRes = await run(['rev-parse', '--git-dir']);
  if (gitDirRes.code !== 0) return emptyFacts('not a git repository: git rev-parse --git-dir failed');
  const gitDirRaw = gitDirRes.stdout.trim();
  const gitDir = isAbsolute(gitDirRaw) ? gitDirRaw : resolve(opts.cwd, gitDirRaw);

  const [toplevel, bareRes, headRes, branchRes, statusRes, worktreeRes, remoteRes] = await Promise.all([
    run(['rev-parse', '--show-toplevel']),
    run(['rev-parse', '--is-bare-repository']),
    run(['rev-parse', 'HEAD']),
    run(['branch', '--show-current']),
    run(['status', '--porcelain']),
    run(['worktree', 'list', '--porcelain']),
    run(['remote', '-v']),
  ]);

  const isBare = bareRes.code === 0 ? bareRes.stdout.trim() === 'true' : null;
  const root = toplevel.code === 0 ? toplevel.stdout.trim() : isBare ? resolve(gitDir) : null;
  const head = headRes.code === 0 ? headRes.stdout.trim() : null;
  const branchRaw = branchRes.code === 0 ? branchRes.stdout.trim() : '';
  const statusLines = statusRes.code === 0 ? statusRes.stdout.split('\n').filter((l) => l.trim() !== '') : [];

  // kind: ищем cwd среди блоков worktree list (первый блок — main worktree);
  // запасной признак linked — gitDir вида .git/worktrees/<name>
  const worktreePaths =
    worktreeRes.code === 0
      ? worktreeRes.stdout
          .split('\n')
          .filter((l) => l.startsWith('worktree '))
          .map((l) => resolve(l.slice('worktree '.length).trim()))
      : [];
  const worktreeIndex = worktreePaths.indexOf(resolve(opts.cwd));
  const kind: 'main' | 'linked' | null =
    worktreeIndex === 0
      ? 'main'
      : worktreeIndex > 0
        ? 'linked'
        : worktreeRes.code === 0
          ? resolve(gitDir).includes(`${join('.git', 'worktrees')}`)
            ? 'linked'
            : 'main'
          : null;

  // origin URL (fetch-строка) с санитизацией учётных данных (NFR-01)
  const remoteLines = remoteRes.code === 0 ? remoteRes.stdout.split('\n').filter((l) => l.includes('\t')) : [];
  const originLine =
    remoteLines.find((l) => l.startsWith('origin\t') && l.endsWith('(fetch)')) ??
    remoteLines.find((l) => l.endsWith('(fetch)'));
  const originUrl =
    originLine !== undefined ? sanitizeGitUrl(originLine.split('\t')[1]?.replace(/\s+\(fetch\)$/, '') ?? '') : null;
  const hasRemote = remoteLines.length > 0;

  // незавершённые операции — служебные файлы в git-каталоге (порядок design)
  const UNFINISHED: Array<[string, 'merge' | 'rebase' | 'cherry-pick' | 'revert']> = [
    ['MERGE_HEAD', 'merge'],
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
  ];
  let unfinished: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null = null;
  for (const [name, op] of UNFINISHED) {
    if (deps.exists(join(gitDir, name))) {
      unfinished = op;
      break;
    }
  }

  // baseline — вход задачи; разрешаем SHA и сравниваем ancestry
  let baseline: GitFacts['baseline'] = null;
  if (opts.baseline !== undefined) {
    const verify = await run(['rev-parse', '--verify', '--quiet', `${opts.baseline}^{commit}`]);
    if (verify.code !== 0) {
      baseline = { sha: opts.baseline, relationship: 'unresolved' };
    } else {
      const resolved = verify.stdout.trim();
      if (head !== null && resolved === head) {
        baseline = { sha: resolved, relationship: 'equal' };
      } else if (head !== null) {
        const ancestor = await run(['merge-base', '--is-ancestor', resolved, head]);
        baseline = { sha: resolved, relationship: ancestor.code === 0 ? 'ancestor-of-head' : 'diverged' };
      } else {
        baseline = { sha: resolved, relationship: 'unresolved' };
      }
    }
  }

  // remote-наблюдение (ADR-2/ADR-4): живое ls-remote с таймаутом, без fetch
  const upstreamRes = await run(['rev-parse', '--symbolic-full-name', '@{u}']);
  const upstream =
    upstreamRes.code === 0 && upstreamRes.stdout.trim().startsWith('refs/remotes/') ? upstreamRes.stdout.trim() : null;
  const branch = branchRaw !== '' ? branchRaw : null;

  // Q-2: имя remote может содержать '/' — надёжный источник %(upstream:remotename);
  // разбор upstream по первому '/' остаётся только запасной эвристикой
  let remote: string | null = null;
  if (upstream !== null && branch !== null) {
    const nameRes = await run(['for-each-ref', '--format=%(upstream:remotename)', `refs/heads/${branch}`]);
    const remoteName = nameRes.code === 0 ? nameRes.stdout.trim() : '';
    remote = remoteName !== '' ? remoteName : (upstream.split('/')[2] ?? null);
  }

  let localVsRemote: LocalVsRemote;
  let freshness: FreshnessOfRemoteObservation;
  if (upstream === null) {
    localVsRemote = { ...emptyRemote, relation: hasRemote ? 'no-upstream' : 'no-remote' };
    freshness = { ...noFreshness };
  } else {
    const remotePrefix = remote !== null ? `refs/remotes/${remote}/` : null;
    const remoteRef =
      remotePrefix !== null && upstream.startsWith(remotePrefix)
        ? `refs/heads/${upstream.slice(remotePrefix.length)}`
        : `refs/heads/${upstream.split('/').slice(3).join('/')}`;
    const tracking = await run(['rev-parse', '--verify', '--quiet', upstream]);
    const trackingSha = tracking.code === 0 ? tracking.stdout.trim() : null;

    let liveHead: string | null = null;
    let reachable = false;
    let observedAt: string | null = null;
    try {
      const ls = await run(['ls-remote', remote ?? '.', remoteRef], LS_REMOTE_TIMEOUT_MS);
      if (ls.code === 0) {
        reachable = true;
        observedAt = deps.now().toISOString();
        const match = ls.stdout
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l !== '');
        liveHead = match !== undefined ? match.split('\t')[0] : null;
      }
    } catch {
      reachable = false; // раннер упал (например, процесс убит таймаутом)
    }

    if (!reachable) {
      // недоступен → UNKNOWN (строка 2); relation считаем по tracking-ref, это наблюдение помечаем none
      freshness = { observed_at: null, method: 'none', reachable: false };
      const cmp = await compareWithRemote(run, head, trackingSha);
      localVsRemote = { upstream, remote, ...cmp, remote_head: null };
    } else if (liveHead !== null) {
      freshness = { observed_at: observedAt, method: 'ls-remote', reachable: true };
      const cmp = await compareWithRemote(run, head, liveHead);
      localVsRemote = { upstream, remote, ...cmp, remote_head: liveHead };
    } else {
      // remote доступен, но ref на нём нет — деградация до tracking-ref (REQ-04)
      freshness = { observed_at: observedAt, method: 'tracking-ref', reachable: true };
      const cmp = await compareWithRemote(run, head, trackingSha);
      localVsRemote = { upstream, remote, ...cmp, remote_head: null };
    }
  }

  return {
    repository: { root, is_bare: isBare, origin_url_sanitized: originUrl },
    worktree: { path: opts.cwd, kind },
    branch,
    head,
    baseline,
    target: opts.target ?? null,
    dirty: { value: statusLines.length > 0, entries: statusLines.length },
    unfinished_git_operation: unfinished,
    local_vs_remote: localVsRemote,
    branch_owner: opts.owner ?? null,
    freshness_of_remote_observation: freshness,
    collection_error: null,
  };
}

/** Сравнение HEAD с известным SHA remote: ancestry локально, без fetch (ADR-2). */
async function compareWithRemote(
  run: (args: string[], timeoutMs?: number) => Promise<GitRunnerResult>,
  head: string | null,
  remoteSha: string | null
): Promise<Pick<LocalVsRemote, 'relation' | 'ahead' | 'behind'>> {
  if (head === null || remoteSha === null || remoteSha === '') {
    // без head/remote-SHA счёт невозможен; ближайшее честное отношение — remote впереди
    return { relation: 'remote-ahead-unfetched', ahead: null, behind: null };
  }
  if (remoteSha === head) return { relation: 'in-sync', ahead: 0, behind: 0 };
  const present = await run(['rev-parse', '--verify', '--quiet', `${remoteSha}^{commit}`]);
  if (present.code !== 0) return { relation: 'remote-ahead-unfetched', ahead: null, behind: null };
  const counts = await run(['rev-list', '--left-right', '--count', `${head}...${remoteSha}`]);
  if (counts.code !== 0) {
    // Q-1: счёт не получен — честный носитель «неизвестно» по ADR-2 (null), не выдуманный 0/0/in-sync
    return { relation: 'remote-ahead-unfetched', ahead: null, behind: null };
  }
  const [aheadRaw, behindRaw] = counts.stdout.trim().split(/\s+/);
  const ahead = Number(aheadRaw);
  const behind = Number(behindRaw);
  const safeAhead = Number.isFinite(ahead) ? ahead : 0;
  const safeBehind = Number.isFinite(behind) ? behind : 0;
  const relation: RemoteRelation =
    safeAhead > 0 && safeBehind > 0 ? 'diverged' : safeBehind > 0 ? 'behind' : safeAhead > 0 ? 'ahead' : 'in-sync';
  return { relation, ahead: safeAhead, behind: safeBehind };
}

/** Полный отчёт: факты + вердикт; внутренние поля в JSON не попадают. */
export async function runGitInspect(deps: GitInspectDeps, opts: GitInspectOptions): Promise<GitInspectReport> {
  const facts = await collectGitFacts(deps, opts);
  const { collection_error, ...reportFacts } = facts;
  void collection_error;
  return { schema_version: 1, observed_at: deps.now().toISOString(), ...reportFacts, ...computeVerdict(facts) };
}

const execFileAsync = promisify(execFile);

/** Адаптер порта GitRunner: execFile('git') без shell; таймаут — опцией execFile (NFR-02). */
export function createExecFileGitRunner(): GitRunner {
  return async (args, opts) => {
    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: opts.cwd,
        timeout: opts.timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
      return { code: 0, stdout: String(stdout), stderr: String(stderr) };
    } catch (err) {
      // ненулевой exit или убитый таймаутом процесс — единый контракт {code, stdout, stderr}
      const e = err as { code?: number | string; stdout?: string; stderr?: string };
      return {
        code: typeof e.code === 'number' ? e.code : 1,
        stdout: String(e.stdout ?? ''),
        stderr: String(e.stderr ?? ''),
      };
    }
  };
}

/** ADR-3: exit-код кодирует вердикт — UNKNOWN не возвращает 0. */
export function gitInspectExitCode(verdict: GitVerdict): 0 | 1 | 2 {
  return verdict === 'PASS' ? 0 : verdict === 'VIOLATION' ? 1 : 2;
}
