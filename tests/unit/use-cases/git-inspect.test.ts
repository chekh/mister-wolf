import { describe, expect, it } from 'vitest';
import {
  LS_REMOTE_TIMEOUT_MS,
  runGitInspect,
  computeVerdict,
  gitInspectExitCode,
  sanitizeGitUrl,
  type GitFacts,
  type GitInspectReport,
  type GitRunner,
} from '../../../src/app/use-cases/git-inspect.js';

/**
 * Оракул — таблица решений design.md (B0.5) и NFR-01/02: логика проверяется на
 * фейковом GitRunner без реального git и сети.
 */

const FIXED_NOW = new Date('2026-11-03T12:00:00.000Z');
const NOW_ISO = FIXED_NOW.toISOString();

type ScriptEntry = string | { code: number; stdout?: string };

interface FakeGit {
  runner: GitRunner;
  calls: Array<{ args: string[]; timeoutMs?: number }>;
}

/** Скриптовый раннер: ключ — args.join(' '), значение — stdout или {code, stdout}. */
function fakeGit(script: Record<string, ScriptEntry>): FakeGit {
  const calls: FakeGit['calls'] = [];
  const runner: GitRunner = async (args, opts) => {
    calls.push({ args, timeoutMs: opts.timeoutMs });
    const entry = script[args.join(' ')] ?? { code: 0, stdout: '' };
    return typeof entry === 'string'
      ? { code: 0, stdout: entry, stderr: '' }
      : { code: entry.code, stdout: entry.stdout ?? '', stderr: '' };
  };
  return { runner, calls };
}

/** База чистого репозитория: main в /repo, upstream origin/main, HEAD aaa111. */
const BASE: Record<string, ScriptEntry> = {
  'rev-parse --git-dir': '.git',
  'rev-parse --show-toplevel': '/repo',
  'rev-parse --is-bare-repository': 'false',
  'rev-parse HEAD': 'aaa111',
  'branch --show-current': 'main',
  'status --porcelain': '',
  'worktree list --porcelain': 'worktree /repo\nHEAD aaa111\nbranch refs/heads/main\n',
  'remote -v': 'origin\thttps://github.com/o/r.git (fetch)\norigin\thttps://github.com/o/r.git (push)\n',
  'rev-parse --symbolic-full-name @{u}': 'refs/remotes/origin/main',
  'ls-remote origin refs/heads/main': 'aaa111\trefs/heads/main\n',
};

type InspectOptions = { baseline?: string; target?: string; owner?: string };

async function inspect(
  script: Record<string, ScriptEntry>,
  opts: InspectOptions = {},
  exists: (path: string) => boolean = () => false,
  cwd = '/repo'
): Promise<{ git: FakeGit; report: GitInspectReport }> {
  const git = fakeGit(script);
  const report = await runGitInspect({ runner: git.runner, exists, now: () => FIXED_NOW }, { cwd, ...opts });
  return { git, report };
}

/** Факты по умолчанию — чистый in-sync репозиторий; переопределения — по строкам таблицы. */
function facts(overrides: Partial<GitFacts> = {}): GitFacts {
  return {
    repository: { root: '/repo', is_bare: false, origin_url_sanitized: null },
    worktree: { path: '/repo', kind: 'main' },
    branch: 'main',
    head: 'aaa111',
    baseline: null,
    target: null,
    dirty: { value: false, entries: 0 },
    unfinished_git_operation: null,
    local_vs_remote: {
      upstream: 'refs/remotes/origin/main',
      remote: 'origin',
      relation: 'in-sync',
      ahead: 0,
      behind: 0,
      remote_head: 'aaa111',
    },
    branch_owner: null,
    freshness_of_remote_observation: { observed_at: NOW_ISO, method: 'ls-remote', reachable: true },
    collection_error: null,
    ...overrides,
  };
}

describe('computeVerdict: decision table (design)', () => {
  it('row 1: collection error -> UNKNOWN', () => {
    const out = computeVerdict(facts({ collection_error: 'not a git repository: git rev-parse --git-dir failed' }));
    expect(out.verdict).toBe('UNKNOWN');
    expect(out.reasons[0]).toContain('not a git repository');
    expect(out.allowed_next_actions).toContain('verify the working directory is a git repository');
  });

  it('row 2: upstream exists, ls-remote unreachable -> UNKNOWN', () => {
    const out = computeVerdict(
      facts({ freshness_of_remote_observation: { observed_at: null, method: 'none', reachable: false } })
    );
    expect(out.verdict).toBe('UNKNOWN');
    expect(out.reasons.join('\n')).toContain('remote unreachable');
    expect(out.allowed_next_actions).toContain('verify network/remote access; do not assume clean');
  });

  it('row 2 outranks row 3: unreachable + dirty -> UNKNOWN, not VIOLATION', () => {
    const out = computeVerdict(
      facts({
        dirty: { value: true, entries: 2 },
        freshness_of_remote_observation: { observed_at: null, method: 'none', reachable: false },
      })
    );
    expect(out.verdict).toBe('UNKNOWN');
  });

  it('row 3: dirty -> VIOLATION', () => {
    const out = computeVerdict(facts({ dirty: { value: true, entries: 3 } }));
    expect(out.verdict).toBe('VIOLATION');
    expect(out.reasons).toContain('dirty: 3 uncommitted change(s)');
    expect(out.allowed_next_actions).toContain('commit or discard changes before handoff (if authorized)');
  });

  it('row 4: unfinished git operation -> VIOLATION', () => {
    const out = computeVerdict(facts({ unfinished_git_operation: 'rebase' }));
    expect(out.verdict).toBe('VIOLATION');
    expect(out.reasons).toContain('unfinished git operation: rebase in progress');
  });

  it('row 5: baseline diverged -> VIOLATION', () => {
    const out = computeVerdict(facts({ baseline: { sha: 'bbb000', relationship: 'diverged' } }));
    expect(out.verdict).toBe('VIOLATION');
    expect(out.reasons).toContain('baseline bbb000: diverged');
  });

  it('row 6: diverged / behind / remote-ahead-unfetched -> VIOLATION', () => {
    const relation = (r: string, ahead: number | null, behind: number | null) =>
      facts({
        local_vs_remote: {
          upstream: 'refs/remotes/origin/main',
          remote: 'origin',
          relation: r,
          ahead,
          behind,
          remote_head: 'ccc999',
        },
      });
    expect(computeVerdict(relation('diverged', 1, 2)).verdict).toBe('VIOLATION');
    expect(computeVerdict(relation('behind', 0, 4)).verdict).toBe('VIOLATION');
    expect(computeVerdict(relation('remote-ahead-unfetched', null, null)).verdict).toBe('VIOLATION');
    expect(computeVerdict(relation('remote-ahead-unfetched', null, null)).reasons.join('\n')).toContain('unfetched');
  });

  it('row 7: ahead -> PASS with "unpublished commits present"', () => {
    const out = computeVerdict(
      facts({
        local_vs_remote: {
          upstream: 'refs/remotes/origin/main',
          remote: 'origin',
          relation: 'ahead',
          ahead: 2,
          behind: 0,
          remote_head: 'fff000',
        },
      })
    );
    expect(out.verdict).toBe('PASS');
    expect(out.reasons.join('\n')).toContain('unpublished commits present');
    expect(out.allowed_next_actions).toEqual(['publish if authorized']);
  });

  it('row 8: no-remote / no-upstream -> PASS "not applicable"; --target requires remote -> UNKNOWN', () => {
    const noRemote = facts({
      local_vs_remote: {
        upstream: null,
        remote: null,
        relation: 'no-remote',
        ahead: null,
        behind: null,
        remote_head: null,
      },
      freshness_of_remote_observation: { observed_at: null, method: 'none', reachable: null },
    });
    expect(computeVerdict(noRemote).verdict).toBe('PASS');
    expect(computeVerdict(noRemote).reasons.join('\n')).toContain('not applicable');

    const noUpstream = facts({
      local_vs_remote: {
        upstream: null,
        remote: 'origin',
        relation: 'no-upstream',
        ahead: null,
        behind: null,
        remote_head: null,
      },
      freshness_of_remote_observation: { observed_at: null, method: 'none', reachable: null },
    });
    expect(computeVerdict(noUpstream).verdict).toBe('PASS');
    expect(computeVerdict(noUpstream).reasons.join('\n')).toContain('not applicable');

    expect(computeVerdict({ ...noUpstream, target: 'origin/main' }).verdict).toBe('UNKNOWN');
  });

  it('row 9: in-sync -> PASS with no-action reason; every check is mentioned', () => {
    const out = computeVerdict(facts());
    expect(out.verdict).toBe('PASS');
    expect(out.allowed_next_actions).toEqual(['read-only observation complete; no git action required']);
    expect(out.reasons.some((r) => r.startsWith('dirty:'))).toBe(true);
    expect(out.reasons.some((r) => r.startsWith('unfinished git operation:'))).toBe(true);
    expect(out.reasons.some((r) => r.startsWith('local vs remote'))).toBe(true);
  });
});

describe('collectGitFacts via fake GitRunner', () => {
  it('clean repo in sync with remote: full report per contract', async () => {
    const { report } = await inspect(BASE);
    expect(report.schema_version).toBe(1);
    expect(report.observed_at).toBe(NOW_ISO);
    expect(report.repository).toEqual({
      root: '/repo',
      is_bare: false,
      origin_url_sanitized: 'https://github.com/o/r.git',
    });
    expect(report.worktree).toEqual({ path: '/repo', kind: 'main' });
    expect(report.branch).toBe('main');
    expect(report.head).toBe('aaa111');
    expect(report.dirty).toEqual({ value: false, entries: 0 });
    expect(report.unfinished_git_operation).toBeNull();
    expect(report.local_vs_remote).toMatchObject({
      upstream: 'refs/remotes/origin/main',
      remote: 'origin',
      relation: 'in-sync',
      ahead: 0,
      behind: 0,
      remote_head: 'aaa111',
    });
    expect(report.freshness_of_remote_observation).toEqual({
      observed_at: NOW_ISO,
      method: 'ls-remote',
      reachable: true,
    });
    expect(report.branch_owner).toBeNull();
    expect(report.verdict).toBe('PASS');
    expect('collection_error' in report).toBe(false);
  });

  it('linked worktree detected by worktree list', async () => {
    const porcelain =
      'worktree /repo\nHEAD aaa111\nbranch refs/heads/main\n\nworktree /repo/wt\nHEAD aaa111\nbranch refs/heads/wt\n';
    const { report } = await inspect(
      { ...BASE, 'worktree list --porcelain': porcelain, 'rev-parse --show-toplevel': '/repo/wt' },
      {},
      () => false,
      '/repo/wt'
    );
    expect(report.worktree).toEqual({ path: '/repo/wt', kind: 'linked' });
  });

  it('ahead of remote: PASS, counts from rev-list', async () => {
    const { report } = await inspect({
      ...BASE,
      'ls-remote origin refs/heads/main': 'fff000\trefs/heads/main\n',
      'rev-list --left-right --count aaa111...fff000': '2\t0\n',
    });
    expect(report.local_vs_remote).toMatchObject({ relation: 'ahead', ahead: 2, behind: 0, remote_head: 'fff000' });
    expect(report.verdict).toBe('PASS');
  });

  it('behind remote: VIOLATION with behind count', async () => {
    const { report } = await inspect({
      ...BASE,
      'ls-remote origin refs/heads/main': 'fff000\trefs/heads/main\n',
      'rev-list --left-right --count aaa111...fff000': '0\t3\n',
    });
    expect(report.local_vs_remote).toMatchObject({ relation: 'behind', ahead: 0, behind: 3 });
    expect(report.verdict).toBe('VIOLATION');
  });

  it('diverged from remote: VIOLATION', async () => {
    const { report } = await inspect({
      ...BASE,
      'ls-remote origin refs/heads/main': 'fff000\trefs/heads/main\n',
      'rev-list --left-right --count aaa111...fff000': '1\t2\n',
    });
    expect(report.local_vs_remote).toMatchObject({ relation: 'diverged', ahead: 1, behind: 2 });
    expect(report.verdict).toBe('VIOLATION');
  });

  it('remote sha not in local storage: remote-ahead-unfetched, counts null (ADR-2)', async () => {
    const { report } = await inspect({
      ...BASE,
      'ls-remote origin refs/heads/main': 'ccc999\trefs/heads/main\n',
      'rev-parse --verify --quiet ccc999^{commit}': { code: 1 },
    });
    expect(report.local_vs_remote).toMatchObject({
      relation: 'remote-ahead-unfetched',
      ahead: null,
      behind: null,
      remote_head: 'ccc999',
    });
    expect(report.verdict).toBe('VIOLATION');
  });

  it('ls-remote failure: UNKNOWN, freshness reachable=false, timeout 10s forwarded (NFR-02)', async () => {
    const { git, report } = await inspect({ ...BASE, 'ls-remote origin refs/heads/main': { code: 128 } });
    expect(report.verdict).toBe('UNKNOWN');
    expect((report.reasons as string[]).join('\n')).toContain('remote unreachable');
    expect(report.freshness_of_remote_observation).toEqual({ observed_at: null, method: 'none', reachable: false });
    const lsCall = git.calls.find((c) => c.args[0] === 'ls-remote');
    expect(lsCall?.timeoutMs).toBe(LS_REMOTE_TIMEOUT_MS);
    expect(LS_REMOTE_TIMEOUT_MS).toBe(10_000);
  });

  it('ls-remote killed by timeout (runner throws): UNKNOWN, no hang', async () => {
    const git = fakeGit(BASE);
    const throwing: GitRunner = async (args, opts) => {
      if (args[0] === 'ls-remote') throw new Error('spawn ENOENT/killed: timeout');
      return git.runner(args, opts);
    };
    const report = await runGitInspect(
      { runner: throwing, exists: () => false, now: () => FIXED_NOW },
      { cwd: '/repo' }
    );
    expect(report.verdict).toBe('UNKNOWN');
    expect(report.freshness_of_remote_observation.reachable).toBe(false);
  });

  it('outside a git repository: UNKNOWN with reason, report still emitted (REQ-01)', async () => {
    const { report } = await inspect({ ...BASE, 'rev-parse --git-dir': { code: 128 } });
    expect(report.verdict).toBe('UNKNOWN');
    expect((report.reasons as string[])[0]).toContain('not a git repository');
    expect(report.worktree).toEqual({ path: null, kind: null });
  });

  it('dirty worktree: VIOLATION with entry count', async () => {
    const { report } = await inspect({ ...BASE, 'status --porcelain': 'M src/a.ts\n?? notes.txt\n' });
    expect(report.dirty).toEqual({ value: true, entries: 2 });
    expect(report.verdict).toBe('VIOLATION');
  });

  it('unfinished rebase detected via git-dir files: VIOLATION', async () => {
    const { report } = await inspect(BASE, {}, (p) => p.endsWith('rebase-merge'));
    expect(report.unfinished_git_operation).toBe('rebase');
    expect(report.verdict).toBe('VIOLATION');
  });

  it('remote url with embedded token is sanitized (NFR-01)', async () => {
    const { report } = await inspect({
      ...BASE,
      'remote -v': 'origin\thttps://ci:ghp_SECRETTOKEN@github.com/o/r.git (fetch)\n',
      'rev-parse --symbolic-full-name @{u}': { code: 1 },
    });
    expect(report.repository).toMatchObject({ origin_url_sanitized: 'https://***@github.com/o/r.git' });
    expect(JSON.stringify(report)).not.toContain('ghp_SECRETTOKEN');
  });

  it('baseline relationships: equal / ancestor-of-head / unresolved (diverged covered in table test)', async () => {
    const equal = await inspect(
      { ...BASE, 'rev-parse --verify --quiet aaa111^{commit}': 'aaa111\n' },
      { baseline: 'aaa111' }
    );
    expect(equal.report.baseline).toMatchObject({ sha: 'aaa111', relationship: 'equal' });

    const ancestor = await inspect(
      {
        ...BASE,
        'rev-parse --verify --quiet bbb000^{commit}': 'bbb000\n',
        'merge-base --is-ancestor bbb000 aaa111': { code: 0, stdout: '' },
      },
      { baseline: 'bbb000' }
    );
    expect(ancestor.report.baseline).toMatchObject({ sha: 'bbb000', relationship: 'ancestor-of-head' });
    expect(ancestor.report.verdict).toBe('PASS');

    const unresolved = await inspect(
      { ...BASE, 'rev-parse --verify --quiet zzz999^{commit}': { code: 1 } },
      { baseline: 'zzz999' }
    );
    expect(unresolved.report.baseline).toMatchObject({ sha: 'zzz999', relationship: 'unresolved' });
  });

  it('no remote at all: PASS with "not applicable" reason (ADR-4)', async () => {
    const { report } = await inspect({
      ...BASE,
      'remote -v': '',
      'rev-parse --symbolic-full-name @{u}': { code: 1 },
    });
    expect(report.local_vs_remote).toMatchObject({ relation: 'no-remote', upstream: null, remote: null });
    expect(report.verdict).toBe('PASS');
    expect((report.reasons as string[]).join('\n')).toContain('not applicable');
  });

  it('branch_owner comes only from --owner (ADR-1)', async () => {
    const { report } = await inspect(BASE, { owner: 'agent:worker-1' });
    expect(report.branch_owner).toBe('agent:worker-1');
    expect(report.target).toBeNull();
    const withTarget = await inspect(BASE, { target: 'origin/release' });
    expect(withTarget.report.target).toBe('origin/release');
  });
});

describe('sanitizeGitUrl (NFR-01)', () => {
  it('masks user:token credentials in https urls', () => {
    expect(sanitizeGitUrl('https://ci:ghp_SECRETTOKEN@github.com/o/r.git')).toBe('https://***@github.com/o/r.git');
    expect(sanitizeGitUrl('https://user@github.com/o/r.git')).toBe('https://***@github.com/o/r.git');
  });

  it('masks credentials in scp-like syntax and leaves clean urls untouched', () => {
    expect(sanitizeGitUrl('user:tok@github.com:o/r.git')).toBe('***@github.com:o/r.git');
    expect(sanitizeGitUrl('ssh://git@github.com/o/r.git')).toBe('ssh://***@github.com/o/r.git');
    expect(sanitizeGitUrl('https://github.com/o/r.git')).toBe('https://github.com/o/r.git');
  });
});

describe('exit codes (ADR-3)', () => {
  it('PASS=0, VIOLATION=1, UNKNOWN=2', () => {
    expect(gitInspectExitCode('PASS')).toBe(0);
    expect(gitInspectExitCode('VIOLATION')).toBe(1);
    expect(gitInspectExitCode('UNKNOWN')).toBe(2);
  });
});
