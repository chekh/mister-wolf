import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureBuilt, runCli } from './helpers.js';

/**
 * B0.5 e2e: `wolf git-inspect` на реальном git-состоянии во временных
 * каталогах. Remote — локальный bare-репозиторий по файловому пути (офлайн,
 * детерминированно). Оракул — таблица решений design.md и test-plan.md
 * (REQ-01..06, NFR-01/02). Сценарии одной фикстуры идут по порядку и сами
 * возвращают состояние к нужной фазе.
 */

interface GitResult {
  status: number;
  stdout: string;
}

function git(args: string[], cwd: string): GitResult {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return { status: r.status ?? 1, stdout: (r.stdout ?? '') as string };
}

function commit(cwd: string, message: string, file?: { name: string; content: string }): string {
  if (file) writeFileSync(join(cwd, file.name), file.content);
  git(['add', '-A'], cwd);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', message], cwd);
  return git(['rev-parse', 'HEAD'], cwd).stdout.trim();
}

/** repo-local identity: git ≥2.53 требует её и на merge, не только на commit (CI ubuntu 26) */
function gitIdentity(cwd: string): void {
  git(['config', 'user.email', 't@t'], cwd);
  git(['config', 'user.name', 't'], cwd);
}

/** bare-remote + два клона (work/work2), origin/main = c1, оба на c1. */
function makeSyncedFixture(): { base: string; bare: string; work: string; work2: string; c1: string } {
  const base = mkdtempSync(join(tmpdir(), 'wolf-gitinspect-'));
  const bare = join(base, 'remote.git');
  git(['init', '--bare', '-b', 'main', bare], base);
  const work = join(base, 'work');
  git(['clone', bare, work], base);
  gitIdentity(work);
  const c1 = commit(work, 'c1', { name: 'file.txt', content: 'one\n' });
  git(['push', '-u', 'origin', 'main'], work);
  const work2 = join(base, 'work2');
  git(['clone', bare, work2], base);
  gitIdentity(work2);
  return { base, bare, work, work2, c1 };
}

/** Репозиторий без remote: main = c3 (после c1), side = c2s (после c1) — развилка baseline. */
function makeNoRemoteFixture(): { base: string; work: string; side: string } {
  const base = mkdtempSync(join(tmpdir(), 'wolf-gitinspect-noremote-'));
  const work = join(base, 'solo');
  mkdirSync(work, { recursive: true });
  git(['init', '-b', 'main'], work);
  gitIdentity(work);
  commit(work, 'c1', { name: 'a.txt', content: 'a\n' });
  git(['checkout', '-b', 'side'], work);
  const side = commit(work, 'side', { name: 'b.txt', content: 'b\n' });
  git(['checkout', 'main'], work);
  commit(work, 'c3', { name: 'c.txt', content: 'c\n' });
  return { base, work, side };
}

function inspect(cwd: string, args: string[] = []): { report: any; status: number | null } {
  const r = runCli(['git-inspect', ...args], cwd);
  let report: any = null;
  try {
    report = JSON.parse(r.stdout);
  } catch {
    report = null;
  }
  return { report, status: r.status };
}

describe('wolf git-inspect (B0.5 e2e)', () => {
  let synced: ReturnType<typeof makeSyncedFixture>;
  let solo: ReturnType<typeof makeNoRemoteFixture>;

  beforeAll(() => {
    ensureBuilt();
    synced = makeSyncedFixture();
    solo = makeNoRemoteFixture();
  });
  afterAll(() => {
    rmSync(synced.base, { recursive: true, force: true });
    rmSync(solo.base, { recursive: true, force: true });
  });

  it('clean repo in sync: PASS/0, full report contract, --owner passthrough, baseline equal (REQ-01, ADR-1)', () => {
    const head = git(['rev-parse', 'HEAD'], synced.work).stdout.trim();
    const { report, status } = inspect(synced.work, ['--owner', 'agent:t2', '--baseline', head]);
    expect(status).toBe(0);
    expect(report.verdict).toBe('PASS');
    expect(Object.keys(report).sort()).toEqual(
      [
        'schema_version',
        'observed_at',
        'verdict',
        'repository',
        'worktree',
        'branch',
        'head',
        'baseline',
        'target',
        'dirty',
        'unfinished_git_operation',
        'local_vs_remote',
        'branch_owner',
        'freshness_of_remote_observation',
        'reasons',
        'allowed_next_actions',
      ].sort()
    );
    expect(report.schema_version).toBe(1);
    expect(report.repository.root).toBe(realpathSync(synced.work));
    expect(report.worktree).toEqual({ path: realpathSync(synced.work), kind: 'main' });
    expect(report.branch).toBe('main');
    expect(report.head).toBe(head);
    expect(report.dirty).toEqual({ value: false, entries: 0 });
    expect(report.unfinished_git_operation).toBeNull();
    expect(report.local_vs_remote).toMatchObject({
      upstream: 'refs/remotes/origin/main',
      remote: 'origin',
      relation: 'in-sync',
      remote_head: head,
    });
    expect(report.freshness_of_remote_observation).toMatchObject({ method: 'ls-remote', reachable: true });
    expect(report.branch_owner).toBe('agent:t2');
    expect(report.baseline).toEqual({ sha: head, relationship: 'equal' });
    expect(report.reasons.length).toBeGreaterThan(0);
  });

  it('two runs on unchanged state are deep-equal after time normalization (REQ-05)', () => {
    const first = inspect(synced.work);
    const second = inspect(synced.work);
    expect(first.status).toBe(0);
    for (const r of [first.report, second.report]) {
      delete r.observed_at;
      delete r.freshness_of_remote_observation.observed_at;
    }
    expect(second.report).toEqual(first.report);
  });

  it('read-only: refs and HEAD identical before/after run (REQ-03)', () => {
    const refs = (cwd: string) => git(['for-each-ref', '--format=%(refname) %(objectname)'], cwd).stdout;
    const before = `${refs(synced.work)}\n${git(['rev-parse', 'HEAD'], synced.work).stdout}`;
    const { status } = inspect(synced.work);
    const after = `${refs(synced.work)}\n${git(['rev-parse', 'HEAD'], synced.work).stdout}`;
    expect(status).toBe(0);
    expect(after).toBe(before);
  });

  it('dirty worktree: VIOLATION/1 with dirty reason', () => {
    writeFileSync(join(synced.work, 'file.txt'), 'modified\n');
    const { report, status } = inspect(synced.work);
    expect(status).toBe(1);
    expect(report.verdict).toBe('VIOLATION');
    expect(report.dirty).toEqual({ value: true, entries: 1 });
    expect(report.reasons.some((r: string) => r.startsWith('dirty:'))).toBe(true);
    git(['checkout', '--', 'file.txt'], synced.work);
  });

  it('unreachable remote: UNKNOWN/2, freshness {method:none, reachable:false}, no false PASS (REQ-04, NFR-02)', () => {
    git(['remote', 'set-url', 'origin', '/definitely/not/an/existing-remote.git'], synced.work);
    const { report, status } = inspect(synced.work);
    expect(status).toBe(2);
    expect(report.verdict).toBe('UNKNOWN');
    expect(report.freshness_of_remote_observation).toEqual({ observed_at: null, method: 'none', reachable: false });
    expect(report.reasons.some((r: string) => r.includes('remote unreachable'))).toBe(true);
    git(['remote', 'set-url', 'origin', synced.bare], synced.work); // вернуть remote для следующих сценариев
  });

  it('unfinished merge: VIOLATION with unfinished_git_operation=merge', () => {
    commit(synced.work, 'main-side', { name: 'conflict.txt', content: 'from main\n' });
    git(['checkout', '-b', 'feature', 'HEAD~1'], synced.work);
    commit(synced.work, 'feature-side', { name: 'conflict.txt', content: 'from feature\n' });
    git(['checkout', 'main'], synced.work);
    const merge = git(['merge', 'feature'], synced.work);
    expect(merge.status).not.toBe(0); // конфликт оставляет незавершённый merge
    // допущение фикстуры явно: merge действительно начат (git ≥2.53 требует identity до слияния)
    expect(existsSync(join(synced.work, '.git', 'MERGE_HEAD'))).toBe(true);
    const { report, status } = inspect(synced.work);
    expect(status).toBe(1);
    expect(report.verdict).toBe('VIOLATION');
    expect(report.unfinished_git_operation).toBe('merge');
    git(['merge', '--abort'], synced.work); // чистое состояние для сценариев ahead/behind
  });

  it('ahead of remote: PASS/0, relation=ahead, baseline ancestor-of-head', () => {
    commit(synced.work, 'local-only');
    const { report, status } = inspect(synced.work, ['--baseline', synced.c1]);
    expect(status).toBe(0);
    expect(report.verdict).toBe('PASS');
    expect(report.local_vs_remote).toMatchObject({ relation: 'ahead', remote_head: synced.c1 });
    expect(report.local_vs_remote.ahead).toBeGreaterThanOrEqual(1);
    expect(report.baseline).toEqual({ sha: synced.c1, relationship: 'ancestor-of-head' });
    expect(report.reasons.some((r: string) => r.includes('unpublished commits present'))).toBe(true);
    git(['push'], synced.work); // origin/main = локальный HEAD для сценариев behind
  });

  it('remote ahead without fetch: VIOLATION/1, remote-ahead-unfetched, counts null (ADR-2)', () => {
    git(['pull'], synced.work2); // work2 догоняет отправленный HEAD работы
    const c3 = commit(synced.work2, 'remote-only');
    git(['push'], synced.work2);
    const { report, status } = inspect(synced.work);
    expect(status).toBe(1);
    expect(report.verdict).toBe('VIOLATION');
    expect(report.local_vs_remote).toEqual({
      upstream: 'refs/remotes/origin/main',
      remote: 'origin',
      relation: 'remote-ahead-unfetched',
      ahead: null,
      behind: null,
      remote_head: c3,
    });
  });

  it('remote ahead after fetch: VIOLATION/1, behind with count (ADR-2)', () => {
    git(['fetch', 'origin'], synced.work);
    const { report, status } = inspect(synced.work);
    expect(status).toBe(1);
    expect(report.verdict).toBe('VIOLATION');
    expect(report.local_vs_remote.relation).toBe('behind');
    expect(report.local_vs_remote.behind).toBeGreaterThanOrEqual(1);
    expect(report.local_vs_remote.ahead).toBe(0);
  });

  it('no remote: PASS "not applicable"; --target requires remote -> UNKNOWN; baseline diverged -> VIOLATION (ADR-4)', () => {
    const plain = inspect(solo.work);
    expect(plain.status).toBe(0);
    expect(plain.report.verdict).toBe('PASS');
    expect(plain.report.local_vs_remote.relation).toBe('no-remote');
    expect(plain.report.reasons.some((r: string) => r.includes('not applicable'))).toBe(true);

    const withTarget = inspect(solo.work, ['--target', 'origin/main']);
    expect(withTarget.status).toBe(2);
    expect(withTarget.report.verdict).toBe('UNKNOWN');

    const diverged = inspect(solo.work, ['--baseline', solo.side]);
    expect(diverged.status).toBe(1);
    expect(diverged.report.verdict).toBe('VIOLATION');
    expect(diverged.report.baseline).toEqual({ sha: solo.side, relationship: 'diverged' });
  });
});
