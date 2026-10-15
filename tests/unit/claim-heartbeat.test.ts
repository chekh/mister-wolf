import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CLAIM_HEARTBEAT_WINDOW_MS,
  acquireClaim,
  claimsDir,
  heartbeatFilePath,
  isStale,
  readHeartbeat,
  releaseClaim,
  requireClaim,
  writeHeartbeat,
  type ClaimRecord,
  type ClaimRegistryDeps,
} from '../../src/adapters/fs/claim-registry.js';
import { acquireArtifactClaim, heartbeatArtifactClaim } from '../../src/app/use-cases/claim-artifact.js';

// 2.18.0 REQ-03 (A11), design §3.3 / ADR-7: heartbeat-файл `<slug>.heartbeat` —
// продление свежести держателя в окне CLAIM_HEARTBEAT_WINDOW_MS; isStale расширен,
// без heartbeat — правила 2.17.1 (NFR-03). Юнит-слой: tmp-каталоги, инъекция
// часов/liveness (прецедент claim-registry.test.ts).

const T0 = new Date('2026-10-14T10:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;

function rec(seed: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    artifact: 'dev:2026-10-14-demo',
    owner: 'agent:l1a',
    session_id: 'ses-a',
    pid: 4242,
    cwd: '/tmp/wt',
    acquired_at: new Date(T0.getTime() - HOUR).toISOString(), // T-1h: внутри TTL
    ...seed,
  };
}

function deps(root: string, over: Partial<ClaimRegistryDeps> = {}): ClaimRegistryDeps {
  return { root, now: () => T0, isAlive: () => true, ...over };
}

describe('claim-registry: heartbeat-файл (REQ-03 A11, design §3.3 / ADR-7)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-claims-hb-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('окно heartbeat = 10 минут (константа экспортирована)', () => {
    expect(CLAIM_HEARTBEAT_WINDOW_MS).toBe(10 * 60 * 1000);
  });

  it('S-20: writeHeartbeat создаёт <slug>.heartbeat с JSON {written_at, writer, claim_acquired_at}', () => {
    acquireClaim(deps(root), {
      artifact: 'dev:x',
      identity: { owner: 'agent:foo', sessionId: 'ses-1', pid: 123 },
      cwd: root,
    });
    const hb = writeHeartbeat(deps(root), { artifact: 'dev:x', writer: 'agent:foo' });
    expect(hb).toEqual({ written_at: T0.toISOString(), writer: 'agent:foo', claim_acquired_at: T0.toISOString() });
    const path = heartbeatFilePath(root, 'dev:x');
    expect(path).toBe(join(claimsDir(root), 'dev_x.heartbeat'));
    expect(readFileSync(path, 'utf-8')).toBe(
      JSON.stringify({ written_at: T0.toISOString(), writer: 'agent:foo', claim_acquired_at: T0.toISOString() })
    );
  });

  it('S-20b: повторный heartbeat атомарно перезаписывает — один файл, последний выигрывает, без следов', () => {
    acquireClaim(deps(root), {
      artifact: 'dev:x',
      identity: { owner: 'agent:a', sessionId: 'ses-1', pid: 123 },
      cwd: root,
    });
    writeHeartbeat(deps(root, { now: () => new Date(T0.getTime() + 5 * MIN) }), {
      artifact: 'dev:x',
      writer: 'agent:a',
    });
    const second = writeHeartbeat(deps(root, { now: () => new Date(T0.getTime() + 9 * MIN) }), {
      artifact: 'dev:x',
      writer: 'agent:a',
    });
    expect(readdirSync(claimsDir(root))).toEqual(['dev_x.heartbeat', 'dev_x.json']); // tmp-мусора нет
    expect(readHeartbeat(heartbeatFilePath(root, 'dev:x'))).toEqual(second);
  });

  it('S-20c: writeHeartbeat выбрасывает ошибку при отсутствии claim или чужом writer', () => {
    expect(() => writeHeartbeat(deps(root), { artifact: 'dev:x', writer: 'agent:foo' })).toThrow(/No claim held/);
    acquireClaim(deps(root), {
      artifact: 'dev:x',
      identity: { owner: 'agent:foo', sessionId: 'ses-1', pid: 123 },
      cwd: root,
    });
    expect(() => writeHeartbeat(deps(root), { artifact: 'dev:x', writer: 'agent:bar' })).toThrow(/owned by agent:foo/);
  });

  it('S-21: readHeartbeat null при отсутствии файла (NFR-03: нет heartbeat — правила 2.17.1)', () => {
    expect(readHeartbeat(heartbeatFilePath(root, 'dev:x'))).toBeNull();
  });

  it('S-22: readHeartbeat возвращает { corrupt: true } при повреждённом JSON (повреждение = stale)', () => {
    mkdirSync(claimsDir(root), { recursive: true });
    writeFileSync(heartbeatFilePath(root, 'dev:x'), 'not-a-json', 'utf-8');
    expect(readHeartbeat(heartbeatFilePath(root, 'dev:x'))).toEqual({ corrupt: true });
  });

  it('S-22b: readHeartbeat возвращает { corrupt: true }, когда JSON без обязательных полей', () => {
    mkdirSync(claimsDir(root), { recursive: true });
    writeFileSync(heartbeatFilePath(root, 'dev:x'), JSON.stringify({ foo: 1 }), 'utf-8');
    expect(readHeartbeat(heartbeatFilePath(root, 'dev:x'))).toEqual({ corrupt: true });
  });
});

describe('claim-registry: isStale с heartbeat (REQ-03 AC, NFR-03)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-claims-hb-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('rec = null → stale независимо от heartbeat', () => {
    expect(isStale(null, null, deps(root))).toBe(true);
    expect(isStale(null, { written_at: T0.toISOString(), writer: 'a' }, deps(root))).toBe(true);
  });

  it('S-23: без heartbeat — правила 2.17.1: acquired T-23h держится, T-25h stale (NFR-03)', () => {
    expect(isStale(rec({ acquired_at: new Date(T0.getTime() - 23 * HOUR).toISOString() }), null, deps(root))).toBe(
      false
    );
    expect(isStale(rec({ acquired_at: new Date(T0.getTime() - 25 * HOUR).toISOString() }), null, deps(root))).toBe(
      true
    );
  });

  it('S-24: heartbeat старше окна (T-15min при окне 10min) → stale; внутри окна — жив', () => {
    const hb = (minutesAgo: number) => ({
      written_at: new Date(T0.getTime() - minutesAgo * MIN).toISOString(),
      writer: 'agent:l1a',
    });
    expect(isStale(rec(), hb(15), deps(root))).toBe(true);
    expect(isStale(rec(), hb(9), deps(root))).toBe(false);
  });

  it('S-24b: heartbeat с невалидной датой → stale (повреждён)', () => {
    expect(isStale(rec(), { written_at: 'not-a-date', writer: 'agent:l1a' }, deps(root))).toBe(true);
  });

  it('F-01: corrupt heartbeat { corrupt: true } → stale', () => {
    expect(isStale(rec(), { corrupt: true }, deps(root))).toBe(true);
  });

  it('F-01: heartbeat от предыдущего владения (claim_acquired_at не совпадает) игнорируется (не stale)', () => {
    const foreignHb = {
      written_at: new Date(T0.getTime() - 20 * MIN).toISOString(),
      writer: 'agent:other',
      claim_acquired_at: new Date(T0.getTime() - 25 * MIN).toISOString(),
    };
    // Для текущего rec (acquired 1h назад, внутри 24h TTL) чужой старый heartbeat не делает claim stale
    expect(isStale(rec(), foreignHb, deps(root))).toBe(false);
  });

  it('S-25: acquired_at старше 24h → stale даже при свежем heartbeat', () => {
    const hb = { written_at: new Date(T0.getTime() - 1 * MIN).toISOString(), writer: 'agent:l1a' };
    expect(isStale(rec({ acquired_at: new Date(T0.getTime() - 25 * HOUR).toISOString() }), hb, deps(root))).toBe(true);
  });

  it('мёртвый PID → stale независимо от свежего heartbeat', () => {
    const hb = { written_at: new Date(T0.getTime() - 1 * MIN).toISOString(), writer: 'agent:l1a' };
    expect(isStale(rec(), hb, deps(root, { isAlive: () => false }))).toBe(true);
  });
});

describe('claim-artifact (use-case): heartbeatArtifactClaim', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-claim-hb-uc-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('пишет heartbeat от владельца из WOLF_ACTOR в <root>/.wolf/shared/claims/<slug>.heartbeat', () => {
    acquireArtifactClaim(
      { baseDir: dir, env: { WOLF_ACTOR: 'agent:executor-lead', WOLF_SESSION: 'ses-1' } },
      'dev:2026-10-14-demo'
    );
    const hb = heartbeatArtifactClaim(
      { baseDir: dir, env: { WOLF_ACTOR: 'agent:executor-lead', WOLF_SESSION: 'ses-1' } },
      'dev:2026-10-14-demo'
    );
    expect(hb.writer).toBe('agent:executor-lead');
    expect(typeof hb.written_at).toBe('string');
    const onDisk = JSON.parse(
      readFileSync(join(dir, '.wolf', 'shared', 'claims', 'dev_2026-10-14-demo.heartbeat'), 'utf-8')
    );
    expect(onDisk).toEqual(hb);
  });
});

describe('F-01 regression: захват A -> heartbeat -> release -> прошло 11 мин -> захват B -> requireClaim', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-claims-f01-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('захват A -> heartbeat -> release -> прошло 11 мин -> захват B -> requireClaim успешен', () => {
    let nowMs = T0.getTime();
    const d: ClaimRegistryDeps = {
      root,
      now: () => new Date(nowMs),
      isAlive: () => true,
    };
    const artifact = 'dev:shared-task';
    const idA = { owner: 'agent:A', sessionId: 'ses-A', pid: 101 };
    const idB = { owner: 'agent:B', sessionId: 'ses-B', pid: 102 };

    // 1. Захват A
    acquireClaim(d, { artifact, identity: idA, cwd: root });

    // 2. Heartbeat от A
    writeHeartbeat(d, { artifact, writer: idA.owner });

    // 3. Release A
    releaseClaim(d, { artifact, identity: idA });

    // Убеждаемся, что при release .heartbeat файл удалился
    expect(readHeartbeat(heartbeatFilePath(root, artifact))).toBeNull();

    // 4. Прошло 11 минут
    nowMs += 11 * MIN;

    // 5. Захват B
    acquireClaim(d, { artifact, identity: idB, cwd: root });

    // 6. requireClaim от B успешен и не падает из-за старого heartbeat!
    expect(() => requireClaim(d, artifact, { owner: idB.owner, sessionId: idB.sessionId })).not.toThrow();
  });
});
