import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CLAIM_TTL_MS,
  ClaimHeldError,
  acquireClaim,
  releaseClaim,
  listClaims,
  requireClaim,
  claimsDir,
  claimFilePath,
  type ClaimRecord,
  type ClaimIdentity,
  type ClaimRegistryDeps,
} from '../../../src/adapters/fs/claim-registry.js';
import { UserFacingError } from '../../../src/domain/errors.js';

// 2.17.1 REQ-05 (R06), design §3.5 / ADR-5: файловый claim-реестр —
// атомарный wx-захват, stale по PID-liveness/TTL 24h, перехват с сохранением
// следа <slug>.<epochMs>.json, guard requireClaim. Юнит-слой: реальные
// tmp-каталоги, инъекция часов/liveness (прецедент memory-lock.test.ts).

const T0 = new Date('2026-10-14T10:00:00.000Z');
const ISO = T0.toISOString();
const HELLO: ClaimIdentity = { owner: 'agent:l1a', sessionId: 'ses-a', pid: 4242 };
const OTHER: ClaimIdentity = { owner: 'agent:l1b', sessionId: 'ses-b', pid: 5252 };

function claim(seed: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    artifact: 'dev:2026-10-14-demo',
    owner: HELLO.owner,
    session_id: HELLO.sessionId,
    pid: HELLO.pid,
    cwd: '/tmp/wt',
    acquired_at: ISO,
    ...seed,
  };
}

function deps(root: string, over: Partial<ClaimRegistryDeps> = {}): ClaimRegistryDeps {
  return { root, now: () => T0, isAlive: () => true, ...over };
}

function seedClaimFile(root: string, rec: ClaimRecord): string {
  const p = claimFilePath(root, rec.artifact);
  mkdirSync(claimsDir(root), { recursive: true });
  writeFileSync(p, JSON.stringify(rec), 'utf-8');
  return p;
}

describe('claim-registry: захват (REQ-05 AC-1, design §3.5)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-claims-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('создаёт .wolf/shared/claims/<slug>.json с who/when/what (AC-2)', () => {
    const rec = acquireClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO, cwd: '/tmp/wt' });
    expect(rec).toEqual(claim());
    const onDisk = JSON.parse(readFileSync(join(claimsDir(root), 'dev_2026-10-14-demo.json'), 'utf-8'));
    expect(onDisk).toEqual(claim());
  });

  it('второй claim при живом владельце — ClaimHeldError с идентификатором владельца (AC-1)', () => {
    acquireClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO, cwd: '/tmp/wt' });
    let err: unknown;
    try {
      acquireClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: OTHER, cwd: '/tmp/wt2' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ClaimHeldError);
    const held = err as ClaimHeldError;
    expect(held.owner).toBe(HELLO.owner);
    expect(held.claimPath).toBe(claimFilePath(root, 'dev:2026-10-14-demo'));
    // файл не тронут: владелец прежний
    expect(JSON.parse(readFileSync(held.claimPath, 'utf-8')).owner).toBe(HELLO.owner);
  });

  it('CLAIM_TTL = 24h', () => {
    expect(CLAIM_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('слэг безопасен для ФС; разным артефактам — разные файлы', () => {
    const a = claimFilePath(root, 'plan:docs/dev/2026-10-13-x/plan.md');
    const b = claimFilePath(root, 'worktree:w-0123456789ab');
    expect(a).toBe(join(claimsDir(root), 'plan_docs_dev_2026-10-13-x_plan.md.json'));
    expect(b).toBe(join(claimsDir(root), 'worktree_w-0123456789ab.json'));
    expect(a).not.toBe(b);
  });
});

describe('claim-registry: stale и перехват (design §3.5, §5; NFR-02)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-claims-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('мёртвый PID (ESRCH) → перехват, исходный файл в следе <slug>.<epochMs>.json', () => {
    const path = seedClaimFile(root, claim({ pid: 99999 }));
    const original = readFileSync(path, 'utf-8');
    const rec = acquireClaim(deps(root, { isAlive: () => false }), {
      artifact: 'dev:2026-10-14-demo',
      identity: OTHER,
      cwd: '/tmp/wt2',
    });
    expect(rec.owner).toBe(OTHER.owner);
    // новый claim занял основной путь, исходные байты — в следе (NFR-02)
    expect(JSON.parse(readFileSync(path, 'utf-8')).owner).toBe(OTHER.owner);
    const trail = join(claimsDir(root), `dev_2026-10-14-demo.${T0.getTime()}.json`);
    expect(readFileSync(trail, 'utf-8')).toBe(original);
  });

  it('возраст > TTL 24h → перехват; 23h — ещё держится (управляемое время)', () => {
    seedClaimFile(root, claim({ acquired_at: new Date(T0.getTime() - 25 * 3600_000).toISOString() }));
    const rec = acquireClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: OTHER, cwd: '/tmp/wt2' });
    expect(rec.owner).toBe(OTHER.owner);

    const root2 = mkdtempSync(join(tmpdir(), 'wolf-claims-'));
    try {
      seedClaimFile(root2, claim({ acquired_at: new Date(T0.getTime() - 23 * 3600_000).toISOString() }));
      expect(() =>
        acquireClaim(deps(root2), { artifact: 'dev:2026-10-14-demo', identity: OTHER, cwd: '/tmp/wt2' })
      ).toThrow(ClaimHeldError);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it('порченый claim (не JSON) трактуется stale; исходные байты сохранены в следе', () => {
    const path = claimFilePath(root, 'dev:2026-10-14-demo');
    mkdirSync(claimsDir(root), { recursive: true });
    const garbage = '{not json at all';
    writeFileSync(path, garbage, 'utf-8');
    const rec = acquireClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: OTHER, cwd: '/tmp/wt2' });
    expect(rec.owner).toBe(OTHER.owner);
    const trail = join(claimsDir(root), `dev_2026-10-14-demo.${T0.getTime()}.json`);
    expect(readFileSync(trail, 'utf-8')).toBe(garbage);
  });
});

describe('claim-registry: release и передача (design §3.5, S-41)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-claims-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('владелец (owner+session+pid) освобождает — файл удалён', () => {
    const path = seedClaimFile(root, claim());
    const res = releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO });
    expect(res.action).toBe('released');
    expect(existsSync(path)).toBe(false);
  });

  it('чужой release отклонён с именем владельца и путём claim-файла; файл цел', () => {
    const path = seedClaimFile(root, claim());
    for (const who of [
      OTHER,
      { ...HELLO, sessionId: 'ses-other' },
      { ...HELLO, pid: HELLO.pid + 1 }, // живой владелец, чужой процесс — pid не совпал
    ]) {
      let err: unknown;
      try {
        releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: who });
      } catch (e) {
        err = e;
      }
      expect(err, `identity=${JSON.stringify(who)}`).toBeInstanceOf(UserFacingError);
      const msg = (err as UserFacingError).message;
      expect(msg).toContain(HELLO.owner);
      expect(msg).toContain(path);
      expect(existsSync(path)).toBe(true);
    }
  });

  it('release несуществующего claim — UserFacingError', () => {
    expect(() => releaseClaim(deps(root), { artifact: 'dev:nope', identity: HELLO })).toThrow(UserFacingError);
  });

  it('мёртвый владелец: release тем же owner+session из другого процесса — уборка', () => {
    seedClaimFile(root, claim({ pid: 99999 }));
    const res = releaseClaim(deps(root, { isAlive: () => false }), {
      artifact: 'dev:2026-10-14-demo',
      identity: { ...HELLO, pid: 777 },
    });
    expect(res.action).toBe('released');
  });

  it('--transfer-to: явная передача — запись с новым владельцем, artifact сохранён', () => {
    seedClaimFile(root, claim());
    const res = releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO, transferTo: 'agent:w1' });
    expect(res).toEqual({ action: 'transferred', owner: 'agent:w1' });
    const onDisk = JSON.parse(readFileSync(claimFilePath(root, 'dev:2026-10-14-demo'), 'utf-8'));
    expect(onDisk.owner).toBe('agent:w1');
    expect(onDisk.artifact).toBe('dev:2026-10-14-demo');
  });

  it('transfer чужим актором отклонён', () => {
    seedClaimFile(root, claim());
    expect(() =>
      releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: OTHER, transferTo: 'agent:w1' })
    ).toThrow(UserFacingError);
  });
});

describe('claim-registry: list и requireClaim (AC-2, AC-3)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-claims-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('list читает реестр (файлы), следы исключает', () => {
    acquireClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO, cwd: '/tmp/wt' });
    acquireClaim(deps(root), { artifact: 'worktree:w-0123456789ab', identity: OTHER, cwd: '/tmp/wt2' });
    // след от перехвата: stale-файл + takeover
    seedClaimFile(root, claim({ artifact: 'dev:2026-10-13-old', pid: 99999 }));
    acquireClaim(deps(root, { isAlive: () => false }), {
      artifact: 'dev:2026-10-13-old',
      identity: OTHER,
      cwd: '/tmp/wt2',
    });
    const names = readdirSync(claimsDir(root));
    expect(names.some((n) => /\.\d{13}\.json$/.test(n))).toBe(true); // след реально есть
    const list = listClaims(deps(root));
    expect(list.map((r) => r.artifact).sort()).toEqual([
      'dev:2026-10-13-old',
      'dev:2026-10-14-demo',
      'worktree:w-0123456789ab',
    ]);
  });

  it('list без каталога — пусто, не падает', () => {
    expect(listClaims(deps(root))).toEqual([]);
  });

  it('requireClaim: нет claim — UserFacingError с артефактом и путём', () => {
    let err: unknown;
    try {
      requireClaim(deps(root), 'dev:2026-10-14-demo', { owner: HELLO.owner, sessionId: HELLO.sessionId ?? null });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UserFacingError);
    const msg = (err as UserFacingError).message;
    expect(msg).toContain('dev:2026-10-14-demo');
    expect(msg).toContain(claimFilePath(root, 'dev:2026-10-14-demo'));
  });

  it('requireClaim: чужой владелец — UserFacingError с именем владельца и путём (AC-3)', () => {
    const path = seedClaimFile(root, claim());
    let err: unknown;
    try {
      requireClaim(deps(root), 'dev:2026-10-14-demo', { owner: OTHER.owner, sessionId: OTHER.sessionId });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UserFacingError);
    const msg = (err as UserFacingError).message;
    expect(msg).toContain(HELLO.owner);
    expect(msg).toContain(path);
  });

  it('requireClaim: владелец (owner+session) проходит; pid писателя не важен', () => {
    seedClaimFile(root, claim());
    expect(() =>
      requireClaim(deps(root), 'dev:2026-10-14-demo', { owner: HELLO.owner, sessionId: HELLO.sessionId })
    ).not.toThrow();
  });

  it('requireClaim: stale claim (мёртвый PID) — отказ с путём до перехвата', () => {
    seedClaimFile(root, claim({ pid: 99999 }));
    expect(() =>
      requireClaim(deps(root, { isAlive: () => false }), 'dev:2026-10-14-demo', {
        owner: HELLO.owner,
        sessionId: HELLO.sessionId,
      })
    ).toThrow(/stale/);
  });
});
