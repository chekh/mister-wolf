import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from 'node:worker_threads';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  acquireClaim,
  claimFilePath,
  claimsDir,
  heartbeatFilePath,
  isStale,
  readHeartbeat,
  requireClaim,
  writeHeartbeat,
  ClaimHeldError,
  type ClaimIdentity,
  type ClaimRegistryDeps,
} from '../../src/adapters/fs/claim-registry.js';

// 2.18.0 REQ-03 (A11): heartbeat — integration S-26…S-28, S-70/S-71 (тест-план).
// S-28 требует собранного dist (worker-воркеры импортируют реестр как JS;
// прецедент claim-workflow.test.ts: dist до vitest строит npm run check).

const registryDist = pathToFileURL(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/adapters/fs/claim-registry.js')
).href;

const T0 = new Date('2026-10-14T10:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const X: ClaimIdentity = { owner: 'agent:x', sessionId: 'ses-x', pid: 4242 };
const Y: ClaimIdentity = { owner: 'agent:y', sessionId: 'ses-y', pid: 5252 };

/** Реальный параллельный писатель: worker-поток импортирует реестр из dist. */
function heartbeatViaWorker(root: string, artifact: string, writer: string): Promise<{ ok: boolean; msg?: string }> {
  return new Promise((res, rej) => {
    const worker = new Worker(
      [
        `const { parentPort, workerData } = require('node:worker_threads');`,
        `import(workerData.registryDist).then((m) => {`,
        `  try {`,
        `    m.writeHeartbeat({ root: workerData.root }, { artifact: workerData.artifact, writer: workerData.writer });`,
        `    parentPort.postMessage({ ok: true });`,
        `  } catch (e) { parentPort.postMessage({ ok: false, msg: e && e.message }); }`,
        `});`,
      ].join('\n'),
      { eval: true, workerData: { registryDist, root, artifact, writer } }
    );
    worker.on('message', (m: { ok: boolean; msg?: string }) => {
      void worker.terminate();
      res(m);
    });
    worker.on('error', rej);
  });
}

/** Claim-файл «как из 2.17.1»: вручную записанные байты, heartbeat-сущности нет. */
function seedLegacyClaim(
  root: string,
  artifact: string,
  over: Partial<{ owner: string; pid: number; acquired_at: string }> = {}
): string {
  const original = JSON.stringify({
    artifact,
    owner: over.owner ?? X.owner,
    session_id: X.sessionId,
    pid: over.pid ?? X.pid,
    cwd: root,
    acquired_at: over.acquired_at ?? new Date(T0.getTime() - HOUR).toISOString(),
  });
  mkdirSync(claimsDir(root), { recursive: true });
  const path = claimFilePath(root, artifact);
  writeFileSync(path, original, 'utf-8');
  return original;
}

describe('REQ-03 (A11): heartbeat — S-26…S-28, S-70/S-71 (integration)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-claim-hb-it-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('S-26: долгая операция удерживает claim через heartbeat (T0 acquire, T0+5min и T0+9min heartbeat)', () => {
    const artifact = 'dev:task1';
    let at = T0.getTime();
    const d: ClaimRegistryDeps = { root: dir, now: () => new Date(at), isAlive: () => true };
    const acquired = acquireClaim(d, { artifact, identity: X, cwd: dir });
    at = T0.getTime() + 5 * MIN;
    writeHeartbeat(d, { artifact, writer: X.owner });
    at = T0.getTime() + 9 * MIN;
    writeHeartbeat(d, { artifact, writer: X.owner });

    const hb = readHeartbeat(heartbeatFilePath(dir, artifact));
    expect(hb).toEqual({
      written_at: new Date(T0.getTime() + 9 * MIN).toISOString(),
      writer: X.owner,
      claim_acquired_at: acquired.acquired_at,
    });
    expect(isStale(acquired, hb, d)).toBe(false);
    expect(() => requireClaim(d, artifact, { owner: X.owner, sessionId: X.sessionId })).not.toThrow();
  });

  it('S-27: просроченный heartbeat (T0-15min при окне 10min) — перехват со следом <slug>.<epochMs>.json', () => {
    const artifact = 'dev:task1';
    const d: ClaimRegistryDeps = { root: dir, now: () => T0, isAlive: () => true };
    const original = seedLegacyClaim(dir, artifact);
    writeFileSync(
      heartbeatFilePath(dir, artifact),
      JSON.stringify({ written_at: new Date(T0.getTime() - 15 * MIN).toISOString(), writer: X.owner }),
      'utf-8'
    );

    const taken = acquireClaim(d, { artifact, identity: Y, cwd: dir });
    expect(taken.owner).toBe(Y.owner);
    expect(JSON.parse(readFileSync(claimFilePath(dir, artifact), 'utf-8')).owner).toBe(Y.owner);
    const trail = readdirSync(claimsDir(dir)).find((f) => /^dev_task1\.\d+\.json$/.test(f));
    expect(trail, `след перехвата: ${readdirSync(claimsDir(dir)).join(', ')}`).toBeDefined();
    expect(readFileSync(join(claimsDir(dir), trail!), 'utf-8')).toBe(original);
  });

  it('S-28: параллельный heartbeat (реальные воркеры) — один файл, содержимое без повреждений, без исключений', async () => {
    const artifact = 'dev:race';
    acquireClaim({ root: dir }, { artifact, identity: { ...X, pid: process.pid }, cwd: dir });
    const [x, y] = await Promise.all([
      heartbeatViaWorker(dir, artifact, X.owner),
      heartbeatViaWorker(dir, artifact, X.owner),
    ]);
    expect(x.ok, x.msg).toBe(true);
    expect(y.ok, y.msg).toBe(true);

    const hbFiles = readdirSync(claimsDir(dir)).filter((n) => n.endsWith('.heartbeat'));
    expect(hbFiles).toEqual(['dev_race.heartbeat']); // ровно один, tmp-мусора нет
    const hb = readHeartbeat(heartbeatFilePath(dir, artifact));
    expect(hb).not.toBeNull(); // JSON цел, не битый
    expect(hb!.writer).toBe(X.owner);
  }, 60_000);

  it('S-70 (NFR-03): claim 2.17.1 без heartbeat — правила 2.17.1: живой PID держит, мёртвый — перехват со следом', () => {
    const d = (alive: boolean): ClaimRegistryDeps => ({ root: dir, now: () => T0, isAlive: () => alive });
    const artifact = 'dev:legacy';

    // живой держатель (PID жив, acquired внутри TTL) — конкурент отклонён
    seedLegacyClaim(dir, artifact, { pid: 4242 });
    expect(() => acquireClaim(d(true), { artifact, identity: Y, cwd: dir })).toThrow(ClaimHeldError);

    // мёртвый PID — перехват, исходные байты в следе (NFR-02)
    const artifact2 = 'dev:legacy-dead';
    const original = seedLegacyClaim(dir, artifact2, { pid: 99999 });
    const taken = acquireClaim(d(false), { artifact: artifact2, identity: Y, cwd: dir });
    expect(taken.owner).toBe(Y.owner);
    const trail = readdirSync(claimsDir(dir)).find((f) => /^dev_legacy-dead\.\d+\.json$/.test(f));
    expect(trail, `след перехвата: ${readdirSync(claimsDir(dir)).join(', ')}`).toBeDefined();
    expect(readFileSync(join(claimsDir(dir), trail!), 'utf-8')).toBe(original);
  });

  it('S-71 (NFR-03): claim 2.17.1 + heartbeat 2.18.0: живой PID + свежий heartbeat — держит; мёртвый PID — stale (heartbeat не спасает)', () => {
    const d = (alive: boolean): ClaimRegistryDeps => ({ root: dir, now: () => T0, isAlive: () => alive });
    const freshHb = () =>
      writeFileSync(
        heartbeatFilePath(dir, 'dev:mixed'),
        JSON.stringify({ written_at: new Date(T0.getTime() - 1 * MIN).toISOString(), writer: X.owner }),
        'utf-8'
      );

    // живой PID + свежий heartbeat: claim жив, конкурент отклонён
    seedLegacyClaim(dir, 'dev:mixed', { pid: 4242 });
    freshHb();
    expect(() => requireClaim(d(true), 'dev:mixed', { owner: X.owner, sessionId: X.sessionId })).not.toThrow();
    expect(() => acquireClaim(d(true), { artifact: 'dev:mixed', identity: Y, cwd: dir })).toThrow(ClaimHeldError);

    // мёртвый PID: свежий heartbeat не спасает — перехват
    const artifact2 = 'dev:mixed-dead';
    seedLegacyClaim(dir, artifact2, { pid: 99999 });
    writeFileSync(
      heartbeatFilePath(dir, artifact2),
      JSON.stringify({ written_at: new Date(T0.getTime() - 1 * MIN).toISOString(), writer: X.owner }),
      'utf-8'
    );
    const taken = acquireClaim(d(false), { artifact: artifact2, identity: Y, cwd: dir });
    expect(taken.owner).toBe(Y.owner);
  });
});
