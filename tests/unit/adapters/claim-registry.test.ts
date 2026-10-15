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
    expect(rec).toEqual(claim({ claim_token: rec.claim_token }));
    const onDisk = JSON.parse(readFileSync(join(claimsDir(root), 'dev_2026-10-14-demo.json'), 'utf-8'));
    expect(onDisk).toEqual(claim({ claim_token: rec.claim_token }));
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

  it('FIX-5: release порченого claim — честное «corrupt», не «No claim held»; файл цел', () => {
    const path = claimFilePath(root, 'dev:2026-10-14-demo');
    mkdirSync(claimsDir(root), { recursive: true });
    writeFileSync(path, '{garbage', 'utf-8');
    let err: unknown;
    try {
      releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UserFacingError);
    const msg = (err as UserFacingError).message;
    expect(msg).toContain('corrupt');
    expect(msg).not.toContain('No claim held');
    expect(msg).toContain(path);
    expect(readFileSync(path, 'utf-8')).toBe('{garbage'); // поведение не расширяем: файл не тронут
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

describe('claim-registry: MINOR-1/2/4 (FIX-раунд T5, независимое ревью)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-claims-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('MINOR-1: transfer → адресат пишет под guard (session null, pid 0); прежний/чужой — отказ', () => {
    seedClaimFile(root, claim());
    releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO, transferTo: 'agent:w1' });
    // адресат с собственной сессией проходит guard — передача не паркует запись до TTL
    expect(() =>
      requireClaim(deps(root), 'dev:2026-10-14-demo', { owner: 'agent:w1', sessionId: 'ses-w1' })
    ).not.toThrow();
    // прежний владелец больше не проходит
    expect(() =>
      requireClaim(deps(root), 'dev:2026-10-14-demo', { owner: HELLO.owner, sessionId: HELLO.sessionId })
    ).toThrow(UserFacingError);
    // чужой — отказ
    expect(() =>
      requireClaim(deps(root), 'dev:2026-10-14-demo', { owner: OTHER.owner, sessionId: OTHER.sessionId })
    ).toThrow(UserFacingError);
  });

  it('MINOR-1b (интегральное ревью): адресат transfer освобождает claim своей сессией — release зеркален requireClaim', () => {
    seedClaimFile(root, claim());
    releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO, transferTo: 'agent:w1' });
    // адресат с собственной сессией — тот же escape, что в requireClaim (transferredToWho)
    const rel = releaseClaim(deps(root), {
      artifact: 'dev:2026-10-14-demo',
      identity: { owner: 'agent:w1', sessionId: 'ses-w1', pid: 4242 },
    });
    expect(rel.action).toBe('released');
    // прежний владелец release после передачи — отказ
    seedClaimFile(root, claim());
    releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO, transferTo: 'agent:w1' });
    expect(() => releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO })).toThrow(
      UserFacingError
    );
    // чужой release — отказ
    seedClaimFile(root, claim());
    releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: HELLO, transferTo: 'agent:w1' });
    expect(() => releaseClaim(deps(root), { artifact: 'dev:2026-10-14-demo', identity: OTHER })).toThrow(
      UserFacingError
    );
  });

  it('MINOR-2: пустой claim-файл (in-flight создатель) — не takeover: ожидание видит свежий claim', () => {
    const path = claimFilePath(root, 'dev:2026-10-14-demo');
    mkdirSync(claimsDir(root), { recursive: true });
    writeFileSync(path, '', 'utf-8'); // создатель между openSync('wx') и writeFileSync
    let waited = false;
    const d = deps(root, {
      // в момент ожидания создатель дописывает запись — конкурент должен увидеть
      // свежий claim и отказаться, а не переименовать файл из-под создателя
      wait: () => {
        if (!waited) {
          waited = true;
          writeFileSync(path, JSON.stringify(claim()), 'utf-8');
        }
      },
    });
    expect(() => acquireClaim(d, { artifact: 'dev:2026-10-14-demo', identity: OTHER, cwd: '/tmp/wt2' })).toThrow(
      ClaimHeldError
    );
    expect(waited).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf-8')).owner).toBe(HELLO.owner); // файл создателя цел
    expect(readdirSync(claimsDir(root))).toEqual(['dev_2026-10-14-demo.json']); // следа нет
  });

  it('MINOR-2: пустой файл не заполняется — отказ после ограниченного ожидания, без переименования', () => {
    const path = claimFilePath(root, 'dev:2026-10-14-demo');
    mkdirSync(claimsDir(root), { recursive: true });
    writeFileSync(path, '   ', 'utf-8'); // whitespace-only — тоже in-flight, не порча
    expect(() =>
      acquireClaim(deps(root, { wait: () => {} }), {
        artifact: 'dev:2026-10-14-demo',
        identity: OTHER,
        cwd: '/tmp/wt2',
      })
    ).toThrow(ClaimHeldError);
    expect(readFileSync(path, 'utf-8')).toBe('   '); // не переименован в след
    expect(readdirSync(claimsDir(root))).toEqual(['dev_2026-10-14-demo.json']);
  });

  it('MINOR-4: slug, кончающийся на .<13 цифр> — легитимный claim, виден в list', () => {
    acquireClaim(deps(root), { artifact: 'dev:2026-10-14-x.1234567890123', identity: HELLO, cwd: '/tmp/wt' });
    const list = listClaims(deps(root));
    expect(list.map((r) => r.artifact)).toContain('dev:2026-10-14-x.1234567890123');
  });

  it('FIX-4: двойной перехват в одну мс (одинаковый epoch) — два разных следа, байты каждого целы (NFR-02)', () => {
    // последовательная гонка — регрессионная сеть механизма уникальности имени
    // следа; TOCTOU-окно exists+rename доказано стресс-прогоном (отчёт FIX-4)
    const first = 'first-stale-bytes';
    const second = 'second-stale-bytes';
    const path = claimFilePath(root, 'dev:2026-10-14-demo');
    mkdirSync(claimsDir(root), { recursive: true });
    writeFileSync(path, first, 'utf-8');
    acquireClaim(deps(root, { isAlive: () => false }), {
      artifact: 'dev:2026-10-14-demo',
      identity: OTHER,
      cwd: '/tmp/wt2',
    });
    writeFileSync(path, second, 'utf-8'); // артефакт снова stale (порченый)
    acquireClaim(deps(root, { isAlive: () => false }), {
      artifact: 'dev:2026-10-14-demo',
      identity: HELLO,
      cwd: '/tmp/wt',
    });

    const trails = readdirSync(claimsDir(root))
      .filter((n) => /^dev_2026-10-14-demo\.\d+\.json$/.test(n))
      .sort();
    expect(trails).toHaveLength(2);
    expect(trails[1]).not.toBe(trails[0]); // имена различаются — bump эпохи
    expect(readFileSync(join(claimsDir(root), trails[0]), 'utf-8')).toBe(first);
    expect(readFileSync(join(claimsDir(root), trails[1]), 'utf-8')).toBe(second);
  });

  it('FIX-4: перехватчик с устаревшим чтением не сносит чужую свежую запись и не оставляет ложный след', () => {
    // конкурент забирает артефакт в окне между чтением и сохранением следа
    // (seam isAlive) — поздний перехватчик должен отказаться, не тронув claim
    // победителя: ни подмены байтов в следе, ни двойной победы (AC-1)
    seedClaimFile(root, claim({ pid: 99999 }));
    const fresh = JSON.stringify(claim({ owner: 'agent:winner', pid: process.pid }));
    const d = deps(root, {
      isAlive: (pid) => {
        if (pid === 99999) {
          writeFileSync(claimFilePath(root, 'dev:2026-10-14-demo'), fresh, 'utf-8');
          return false; // решение принималось по старым (stale) байтам
        }
        return true;
      },
    });
    expect(() => acquireClaim(d, { artifact: 'dev:2026-10-14-demo', identity: OTHER, cwd: '/tmp/wt2' })).toThrow(
      ClaimHeldError
    );
    expect(readFileSync(claimFilePath(root, 'dev:2026-10-14-demo'), 'utf-8')).toBe(fresh);
    expect(readdirSync(claimsDir(root))).toEqual(['dev_2026-10-14-demo.json']); // следа нет
  });
});
