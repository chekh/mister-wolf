import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  acquireArtifactClaim,
  listArtifactClaims,
  makeClaimGuard,
  releaseArtifactClaim,
} from '../../../src/app/use-cases/claim-artifact.js';
import { ClaimHeldError } from '../../../src/adapters/fs/claim-registry.js';
import { UserFacingError } from '../../../src/domain/errors.js';

// 2.17.1 REQ-05 (R06), design §3.5: use-case-слой claim — идентичность из env
// (WOLF_ACTOR/WOLF_SESSION, тот же механизм атрибуции), root — resolveMemoryRoot;
// guard для use-cases записи артефактов.

describe('claim-artifact (use-case): идентичность из env и корень реестра', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-claim-uc-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('acquire пишет claim от владельца из WOLF_ACTOR/WOLF_SESSION в <root>/.wolf/shared/claims', () => {
    const rec = acquireArtifactClaim(
      { baseDir: dir, env: { WOLF_ACTOR: 'agent:executor-lead', WOLF_SESSION: 'ses-1' }, pid: 4242 },
      'dev:2026-10-14-demo'
    );
    expect(rec.owner).toBe('agent:executor-lead');
    expect(rec.session_id).toBe('ses-1');
    expect(rec.pid).toBe(4242);
    expect(rec.cwd).toBe(process.cwd());
    const onDisk = JSON.parse(
      readFileSync(join(dir, '.wolf', 'shared', 'claims', 'dev_2026-10-14-demo.json'), 'utf-8')
    );
    expect(onDisk.artifact).toBe('dev:2026-10-14-demo');
  });

  it('без env — owner user:cli, session null', () => {
    const rec = acquireArtifactClaim({ baseDir: dir, env: {}, pid: 1 }, 'dev:x');
    expect(rec.owner).toBe('user:cli');
    expect(rec.session_id).toBeNull();
  });

  it('list через use-case читает реестр', () => {
    acquireArtifactClaim({ baseDir: dir, env: { WOLF_ACTOR: 'agent:a' }, pid: 1 }, 'dev:x');
    const list = listArtifactClaims({ baseDir: dir, env: {} });
    expect(list).toHaveLength(1);
    expect(list[0]?.owner).toBe('agent:a');
  });

  it('release через use-case: владелец освобождает', () => {
    acquireArtifactClaim({ baseDir: dir, env: { WOLF_ACTOR: 'agent:a', WOLF_SESSION: 's' }, pid: 9 }, 'dev:x');
    const res = releaseArtifactClaim(
      { baseDir: dir, env: { WOLF_ACTOR: 'agent:a', WOLF_SESSION: 's' }, pid: 9 },
      'dev:x'
    );
    expect(res.action).toBe('released');
    expect(existsSync(join(dir, '.wolf', 'shared', 'claims', 'dev_x.json'))).toBe(false);
  });

  it('makeClaimGuard: requireClaim пропускает владельца (тот же env) и отвергает чужой', () => {
    const mine = makeClaimGuard({ baseDir: dir, env: { WOLF_ACTOR: 'agent:a', WOLF_SESSION: 's' } });
    const theirs = makeClaimGuard({ baseDir: dir, env: { WOLF_ACTOR: 'agent:b', WOLF_SESSION: 's2' } });
    acquireArtifactClaim({ baseDir: dir, env: { WOLF_ACTOR: 'agent:a', WOLF_SESSION: 's' }, pid: 1 }, 'dev:x');
    expect(() => mine.requireClaim('dev:x')).not.toThrow();
    expect(() => theirs.requireClaim('dev:x')).toThrow(UserFacingError);
  });

  it('FIX-1 (CRITICAL-1): claim с pid 0 (CLI-семантика) — guard сессии проходит из другого процесса; конкурент — ClaimHeld без следа', () => {
    // CLI-процесс одноразовый, держатель — агент-сессия: pid 0 = liveness
    // неизвестна, владение живёт до TTL/передачи (pidAlive трактует pid<=0 живым)
    const envA = { WOLF_ACTOR: 'agent:a', WOLF_SESSION: 'ses-a' };
    acquireArtifactClaim({ baseDir: dir, env: envA, pid: 0 }, 'dev:2026-10-14-demo');

    // «другой процесс» той же сессии пишет под guard — не stale, не owner-lockout
    expect(() =>
      makeClaimGuard({ baseDir: dir, env: envA, pid: 777 }).requireClaim('dev:2026-10-14-demo')
    ).not.toThrow();

    // конкурент с другим actor — отказ, след перехвата не появился (AC-1)
    let err: unknown;
    try {
      acquireArtifactClaim(
        { baseDir: dir, env: { WOLF_ACTOR: 'agent:b', WOLF_SESSION: 'ses-b' }, pid: 888 },
        'dev:2026-10-14-demo'
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ClaimHeldError);
    expect((err as ClaimHeldError).owner).toBe('agent:a');
    expect(readdirSync(join(dir, '.wolf', 'shared', 'claims'))).toEqual(['dev_2026-10-14-demo.json']);
  });
});
