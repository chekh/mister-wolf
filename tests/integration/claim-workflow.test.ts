import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Worker } from 'node:worker_threads';
import { acquireClaim, claimFilePath, claimsDir } from '../../src/adapters/fs/claim-registry.js';
import { scaffoldArtifact } from '../../src/app/use-cases/scaffold-artifact.js';
import { makeClaimGuard, acquireArtifactClaim, releaseArtifactClaim } from '../../src/app/use-cases/claim-artifact.js';
import { UserFacingError } from '../../src/domain/errors.js';

// 2.17.1 REQ-05 (R06): claim владения — integration S-38…S-42 (тест-план T5).
// Требует собранного dist (worker-воркеры импортируют реестр как JS;
// прецедент base-set-init.test.ts: dist до vitest строит npm run check).
//
// Детерминизм гонки: PID-liveness staleness означает, что claim, удерживаемый
// уже завершившимся процессом, перехватываем. Поэтому «ровно один успешен»
// доказывается (а) двумя реальными worker-воркерами одного процесса —
// параллелизм ОС, держатель жив детерминированно; (б) кросс-процессным
// отказом: держатель — сам тест-раннер (живой pid), претендент — CLI-процесс.

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');
const registryDist = pathToFileURL(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/adapters/fs/claim-registry.js')
).href;

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCliAsync(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<CliResult> {
  return new Promise((res, rej) => {
    const child = spawn('node', [cliPath, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', rej);
    child.on('close', (status) => res({ status, stdout, stderr }));
  });
}

/** env процесса + актор/сессия (срез npm_command — прецедент base-set-init). */
function envOf(actor: string, session: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...env } = process.env;
  return { ...env, WOLF_ACTOR: actor, WOLF_SESSION: session };
}

interface WorkerOutcome {
  ok: boolean;
  owner?: string;
  name?: string;
  msg?: string;
}

/** Реальный параллельный претендент: worker-поток импортирует реестр из dist. */
function acquireViaWorker(root: string, artifact: string, owner: string, session: string): Promise<WorkerOutcome> {
  return new Promise((res, rej) => {
    const worker = new Worker(
      [
        `const { parentPort, workerData } = require('node:worker_threads');`,
        `import(workerData.registryDist).then((m) => {`,
        `  try {`,
        `    const rec = m.acquireClaim({ root: workerData.root }, { artifact: workerData.artifact, identity: { owner: workerData.owner, sessionId: workerData.session, pid: process.pid }, cwd: workerData.root });`,
        `    parentPort.postMessage({ ok: true, owner: rec.owner });`,
        `  } catch (e) { parentPort.postMessage({ ok: false, owner: e && e.owner, name: e && e.name, msg: e && e.message }); }`,
        `});`,
      ].join('\n'),
      { eval: true, workerData: { registryDist, root, artifact, owner, session } }
    );
    worker.on('message', (m: WorkerOutcome) => {
      void worker.terminate();
      res(m);
    });
    worker.on('error', rej);
  });
}

describe('REQ-05 (R06): claim владения артефактами — S-38…S-42 (integration)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-claim-it-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('S-38: два одновременных claim (реальные параллельные воркеры) — ровно один успешен, второй ClaimHeldError с владельцем', async () => {
    const artifact = 'dev:2026-10-14-race';
    const [a, b] = await Promise.all([
      acquireViaWorker(dir, artifact, 'agent:l1a', 'ses-a'),
      acquireViaWorker(dir, artifact, 'agent:l1b', 'ses-b'),
    ]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    const loser = a.ok ? b : a;
    const winnerOwner = a.ok ? 'agent:l1a' : 'agent:l1b';
    expect(loser.ok).toBe(false);
    expect(loser.name).toBe('ClaimHeldError');
    expect(loser.owner).toBe(winnerOwner); // идентификатор владельца в отказе (AC-1)
    // реестр на диске: ровно один claim, владелец-победитель, следов нет
    const files = readdirSync(claimsDir(dir));
    expect(files).toEqual(['dev_2026-10-14-race.json']);
    expect(JSON.parse(readFileSync(join(claimsDir(dir), files[0]!), 'utf-8')).owner).toBe(winnerOwner);
  }, 60_000);

  it('S-38b: живой держатель (другой процесс) отклоняет CLI-претендента с идентификатором владельца', async () => {
    const artifact = 'dev:2026-10-14-held';
    // держатель — сам тест-раннер: pid жив на протяжении всего теста
    acquireArtifactClaim(
      { baseDir: dir, env: { WOLF_ACTOR: 'agent:holder', WOLF_SESSION: 'ses-h' }, pid: process.pid },
      artifact
    );
    const res = await runCliAsync(['claim', 'acquire', artifact], dir, envOf('agent:pretender', 'ses-p'));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Error:');
    expect(res.stderr).toContain('agent:holder');
    expect(res.stderr).toContain(claimFilePath(dir, artifact));
    // claim цел, владелец прежний
    expect(JSON.parse(readFileSync(claimFilePath(dir, artifact), 'utf-8')).owner).toBe('agent:holder');
  }, 60_000);

  it('S-39: wolf claim list показывает who/when/what из файла реестра, не из брифа', async () => {
    const artifact = 'dev:2026-10-14-demo';
    const acq = await runCliAsync(['claim', 'acquire', artifact], dir, envOf('agent:l1a', 'ses-a'));
    expect(acq.status).toBe(0);
    expect(acq.stdout).toContain('Claim acquired');
    const rec = JSON.parse(readFileSync(claimFilePath(dir, artifact), 'utf-8'));
    expect(rec.owner).toBe('agent:l1a');
    expect(rec.session_id).toBe('ses-a');
    expect(rec.pid).toBeGreaterThan(0);
    expect(rec.cwd).toBe(realpathSync(dir)); // macOS symlink /var → /private/var

    const list = await runCliAsync(['claim', 'list'], dir, envOf('agent:l1a', 'ses-a'));
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(artifact); // what
    expect(list.stdout).toContain('agent:l1a'); // who
    expect(list.stdout).toContain('ses-a');
    expect(list.stdout).toContain(String(rec.pid));
    expect(list.stdout).toContain(rec.cwd);
    expect(list.stdout).toContain(rec.acquired_at); // when
  }, 60_000);

  it('S-41: release только владельцем; --transfer-to передаёт явно; чужой release отклонён', async () => {
    const artifact = 'dev:2026-10-14-rel';
    expect((await runCliAsync(['claim', 'acquire', artifact], dir, envOf('agent:l1a', 'ses-a'))).status).toBe(0);

    // чужой release отклонён: имя владельца и путь в отказе, файл цел
    const foreign = await runCliAsync(['claim', 'release', artifact], dir, envOf('agent:l1b', 'ses-b'));
    expect(foreign.status).toBe(1);
    expect(foreign.stderr).toContain('agent:l1a');
    expect(foreign.stderr).toContain(claimFilePath(dir, artifact));
    expect(existsSync(claimFilePath(dir, artifact))).toBe(true);

    // чужая сессия того же актора тоже отклонена
    const otherSession = await runCliAsync(['claim', 'release', artifact], dir, envOf('agent:l1a', 'ses-x'));
    expect(otherSession.status).toBe(1);

    // владелец освобождает: acquirer-процесс завершился (pid из записи мёртв),
    // owner+session совпадают — уборка разрешена
    const rel = await runCliAsync(['claim', 'release', artifact], dir, envOf('agent:l1a', 'ses-a'));
    expect(rel.status).toBe(0);
    expect(rel.stdout).toContain('Released');
    expect(existsSync(claimFilePath(dir, artifact))).toBe(false);

    // transfer-to: явная передача
    expect((await runCliAsync(['claim', 'acquire', artifact], dir, envOf('agent:l1a', 'ses-a'))).status).toBe(0);
    const tr = await runCliAsync(
      ['claim', 'release', artifact, '--transfer-to', 'agent:worker1'],
      dir,
      envOf('agent:l1a', 'ses-a')
    );
    expect(tr.status).toBe(0);
    expect(tr.stdout).toContain('agent:worker1');
    const transferred = JSON.parse(readFileSync(claimFilePath(dir, artifact), 'utf-8'));
    expect(transferred.owner).toBe('agent:worker1');
    expect(transferred.artifact).toBe(artifact);
  }, 120_000);

  it('S-40: запись общего артефакта без claim отклонена в use-case (минуя CLI)', async () => {
    const fsAdapter = {
      exists: async (p: string) => existsSync(p),
      writeFile: async (p: string, c: string) => {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, c);
      },
    };
    const call = (actor: string) =>
      scaffoldArtifact(
        {
          clock: { now: () => new Date('2026-10-14T08:00:00Z') },
          fs: fsAdapter,
          baseDir: dir,
          claims: makeClaimGuard({ baseDir: dir, env: { WOLF_ACTOR: actor, WOLF_SESSION: `ses-${actor}` } }),
        },
        { slug: 'demo', fix: false }
      );

    // 1) claim нет — отказ с артефактом и путём claim-файла, записей нет
    let err: unknown;
    try {
      await call('agent:l1a');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UserFacingError);
    expect((err as UserFacingError).message).toContain('dev:2026-10-14-demo');
    expect((err as UserFacingError).message).toContain(claimFilePath(dir, 'dev:2026-10-14-demo'));
    expect(existsSync(join(dir, 'docs'))).toBe(false);

    // 2) чужой claim — отказ с именем владельца и путём (pid держателя жив: тест-раннер)
    acquireArtifactClaim(
      { baseDir: dir, env: { WOLF_ACTOR: 'agent:l1b', WOLF_SESSION: 'ses-agent:l1b' }, pid: process.pid },
      'dev:2026-10-14-demo'
    );
    let foreign: unknown;
    try {
      await call('agent:l1a');
    } catch (e) {
      foreign = e;
    }
    expect(foreign).toBeInstanceOf(UserFacingError);
    expect((foreign as UserFacingError).message).toContain('agent:l1b');
    expect((foreign as UserFacingError).message).toContain(claimFilePath(dir, 'dev:2026-10-14-demo'));

    // 3) свой claim — запись проходит (CLI-путь не сломан); чужой сначала освобождаем
    await releaseArtifactClaim(
      { baseDir: dir, env: { WOLF_ACTOR: 'agent:l1b', WOLF_SESSION: 'ses-agent:l1b' }, pid: process.pid },
      'dev:2026-10-14-demo'
    );
    await acquireArtifactClaim(
      { baseDir: dir, env: { WOLF_ACTOR: 'agent:l1a', WOLF_SESSION: 'ses-agent:l1a' }, pid: process.pid },
      'dev:2026-10-14-demo'
    );
    const res = await call('agent:l1a');
    expect(res.files).toHaveLength(4);
  });

  it('S-42: мёртвый PID (реальный ESRCH) и возраст > TTL — перехват, исходные файлы в следах (NFR-02)', () => {
    // смерть владельца: pid только что завершившегося процесса
    const dead = spawnSync('node', ['-e', 'process.exit(0)']);
    expect(dead.status).toBe(0);
    expect(dead.pid).toBeGreaterThan(0);
    const artifact = 'dev:2026-10-14-dead';
    mkdirSync(claimsDir(dir), { recursive: true });
    const original = JSON.stringify({
      artifact,
      owner: 'agent:gone',
      session_id: 's',
      pid: dead.pid,
      cwd: dir,
      acquired_at: new Date().toISOString(),
    });
    writeFileSync(claimFilePath(dir, artifact), original, 'utf-8');
    const deps = { root: dir }; // прод-часы и прод-liveness: pidAlive → ESRCH
    const taken = acquireClaim(deps, {
      artifact,
      identity: { owner: 'agent:new', sessionId: 's2', pid: process.pid },
      cwd: dir,
    });
    expect(taken.owner).toBe('agent:new');

    // зависание владельца: pid жив (тест-раннер), но acquired_at старше TTL 24h
    const artifact2 = 'dev:2026-10-14-ttl';
    const stale = JSON.stringify({
      artifact: artifact2,
      owner: 'agent:slow',
      session_id: 's',
      pid: process.pid,
      cwd: dir,
      acquired_at: new Date(Date.now() - 25 * 3600_000).toISOString(),
    });
    writeFileSync(claimFilePath(dir, artifact2), stale, 'utf-8');
    const taken2 = acquireClaim(deps, {
      artifact: artifact2,
      identity: { owner: 'agent:new', sessionId: 's2', pid: process.pid },
      cwd: dir,
    });
    expect(taken2.owner).toBe('agent:new');

    // оба исходных файла сохранены в следах <slug>.<epochMs>.json байт-в-байт
    const trails = readdirSync(claimsDir(dir))
      .filter((f) => /\.\d{13}\.json$/.test(f))
      .sort();
    expect(trails).toHaveLength(2);
    expect(readFileSync(join(claimsDir(dir), trails[0]!), 'utf-8')).toBe(original);
    expect(readFileSync(join(claimsDir(dir), trails[1]!), 'utf-8')).toBe(stale);
  });
});
