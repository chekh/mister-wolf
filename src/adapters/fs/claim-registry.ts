import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { UserFacingError } from '../../domain/errors.js';

/**
 * 2.17.1 REQ-05 (R06), design §3.5 / ADR-5: файловый claim-реестр владения
 * общими артефактами (TASK-бриф, план, отчёт, worktree). JSON-файлы в общем
 * `.wolf/shared/claims/` (cross-copy видимость — root из resolveMemoryRoot);
 * атомарный захват — `openSync(…, 'wx')` (механика FsMemoryLock tryAcquire);
 * stale: PID мёртв (ESRCH) ИЛИ возраст > CLAIM_TTL; перехват stale сохраняет
 * прежний файл переименованием в след `<slug>.<epochMs>.json` (NFR-02).
 */

/** TTL claim'а: локальный-first, heartbeat не вводим (design §3.5). */
export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

export interface ClaimRecord {
  /** Тип+идентификатор артефакта: "dev:<date>-<slug>" | "worktree:<WT-ID>" | … */
  artifact: string;
  /** Actor (WOLF_ACTOR-резолв, тот же механизм атрибуции). */
  owner: string;
  session_id: string | null;
  pid: number;
  cwd: string;
  /** ISO-время захвата. */
  acquired_at: string;
}

/** Идентичность захватчика/освободителя: маппится в поля записи. */
export interface ClaimIdentity {
  owner: string;
  sessionId: string | null;
  pid: number;
}

export interface ClaimRegistryDeps {
  /** Общий root (resolveMemoryRoot().root) — claims видны из всех копий. */
  root: string;
  /** Тестовый seam: управляемое время (TTL). Дефолт — системные часы. */
  now?: () => Date;
  /** Тестовый seam: liveness PID. Дефолт — process.kill(pid, 0). */
  isAlive?: (pid: number) => boolean;
}

export class ClaimHeldError extends Error {
  constructor(
    public readonly claimPath: string,
    public readonly owner: string,
    public readonly reason: string
  ) {
    super(`Claim held by ${owner}: ${claimPath} (${reason})`);
    this.name = 'ClaimHeldError';
  }
}

export function claimsDir(root: string): string {
  return join(root, '.wolf', 'shared', 'claims');
}

/** Имя файла claim'а: слэг артефакта, безопасный для ФС.
 * shortcut: различные артефакты могут слэгнуться одинаково (отказ fail-closed, не порча). */
export function claimSlug(artifact: string): string {
  return artifact.replace(/[^A-Za-z0-9._-]+/g, '_');
}

export function claimFilePath(root: string, artifact: string): string {
  return join(claimsDir(root), `${claimSlug(artifact)}.json`);
}

/** След перехвата: `<slug>.<epochMs>.json` (исходные байты сохраняются, NFR-02). */
export function claimTrailPath(root: string, artifact: string, epochMs: number): string {
  return join(claimsDir(root), `${claimSlug(artifact)}.${epochMs}.json`);
}

/** Прод-liveness: signal 0; ESRCH — мёртв, EPERM — жив (чужой user). pid<=0 —
 * неизвестен (переданный claim) — считаем живым, пока не истечёт TTL. */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function parseClaim(raw: string): ClaimRecord | null {
  try {
    const d = JSON.parse(raw) as Partial<ClaimRecord>;
    if (typeof d.artifact !== 'string' || typeof d.owner !== 'string') return null;
    return {
      artifact: d.artifact,
      owner: d.owner,
      session_id: typeof d.session_id === 'string' ? d.session_id : null,
      pid: typeof d.pid === 'number' ? d.pid : 0,
      cwd: typeof d.cwd === 'string' ? d.cwd : '',
      acquired_at: typeof d.acquired_at === 'string' ? d.acquired_at : '',
    };
  } catch {
    return null;
  }
}

/** Stale (design §3.5): мёртвый PID ИЛИ возраст > TTL; порченый файл = stale. */
function isStale(rec: ClaimRecord | null, deps: ClaimRegistryDeps): boolean {
  if (rec === null) return true;
  const alive = deps.isAlive ?? pidAlive;
  if (!alive(rec.pid)) return true;
  const acquired = Date.parse(rec.acquired_at);
  if (Number.isNaN(acquired)) return true;
  const now = (deps.now ?? (() => new Date()))().getTime();
  return now - acquired > CLAIM_TTL_MS;
}

function readClaimFile(path: string): { raw: string | null; rec: ClaimRecord | null } {
  try {
    const raw = readFileSync(path, 'utf-8');
    return { raw, rec: parseClaim(raw) };
  } catch {
    return { raw: null, rec: null };
  }
}

function describeHolder(rec: ClaimRecord): string {
  return `session ${rec.session_id ?? '-'}, pid ${rec.pid}, acquired ${rec.acquired_at}`;
}

/** Атомарный захват (REQ-05 AC-1): wx-create; занято и fresh — ClaimHeldError
 * с идентификатором владельца; stale/порченый — перехват со следом. */
export function acquireClaim(
  deps: ClaimRegistryDeps,
  input: { artifact: string; identity: ClaimIdentity; cwd: string }
): ClaimRecord {
  const dir = claimsDir(deps.root);
  mkdirSync(dir, { recursive: true });
  const path = claimFilePath(deps.root, input.artifact);
  const now = deps.now ?? (() => new Date());
  const record: ClaimRecord = {
    artifact: input.artifact,
    owner: input.identity.owner,
    session_id: input.identity.sessionId,
    pid: input.identity.pid,
    cwd: input.cwd,
    acquired_at: now().toISOString(),
  };

  for (let attempt = 0; ; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeFileSync(fd, JSON.stringify(record), 'utf-8');
      closeSync(fd);
      return record;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw e;
    }
    const { rec } = readClaimFile(path);
    if (rec !== null && !isStale(rec, deps)) {
      throw new ClaimHeldError(path, rec.owner, describeHolder(rec));
    }
    // stale/порченый (rec === null, сырые байты могли быть) → перехват со следом;
    // проигранная гонка перехвата (ENOENT на rename) — повтор захвата
    try {
      const epoch = now().getTime();
      let trail = claimTrailPath(deps.root, input.artifact, epoch);
      // двойной перехват в одну мс не должен перезаписать чужой след (NFR-02)
      for (let bump = 1; existsSync(trail) && bump < 50; bump++) {
        trail = claimTrailPath(deps.root, input.artifact, epoch + bump);
      }
      renameSync(path, trail);
    } catch {
      /* конкурент уже переименовал/отпустил — идём на повторный wx */
    }
    if (attempt > 20) {
      throw new ClaimHeldError(path, rec?.owner ?? 'unknown', 'too many contention attempts');
    }
  }
}

function ownerSessionMatch(rec: ClaimRecord, identity: ClaimIdentity): boolean {
  return rec.owner === identity.owner && rec.session_id === identity.sessionId;
}

/** Освобождение (design §3.5): владелец — совпадение owner+session+pid.
 * Освобождение чужим (иной owner/session, или pid записи жив и не совпал) —
 * отказ с именем владельца. Мёртвый/stale держатель: тот же owner+session
 * может убрать запись (равносильно перехвату acquire — новой власти не даёт). */
export function releaseClaim(
  deps: ClaimRegistryDeps,
  input: { artifact: string; identity: ClaimIdentity; transferTo?: string }
): { action: 'released' | 'transferred'; owner: string } {
  const path = claimFilePath(deps.root, input.artifact);
  const { rec } = readClaimFile(path);
  if (rec === null || !existsSync(path)) {
    throw new UserFacingError(`No claim held for "${input.artifact}" (claim file: ${path})`);
  }
  const fullMatch = ownerSessionMatch(rec, input.identity) && rec.pid === input.identity.pid;
  const pidReleasable = rec.pid <= 0 || isStale(rec, deps);
  if (!fullMatch && !(ownerSessionMatch(rec, input.identity) && pidReleasable)) {
    throw new UserFacingError(
      `Claim for "${input.artifact}" is owned by ${rec.owner} (${describeHolder(rec)}) — release is owner-only (claim file: ${path})`
    );
  }
  if (input.transferTo !== undefined) {
    const now = (deps.now ?? (() => new Date()))();
    const transferred: ClaimRecord = {
      artifact: rec.artifact,
      owner: input.transferTo,
      // новый владелец ещё не предъявил процесс — liveness неизвестна (TTL решает)
      session_id: null,
      pid: 0,
      cwd: rec.cwd,
      acquired_at: now.toISOString(),
    };
    writeFileSync(path, JSON.stringify(transferred), 'utf-8');
    return { action: 'transferred', owner: input.transferTo };
  }
  unlinkSync(path);
  return { action: 'released', owner: rec.owner };
}

/** Реестр для наблюдаемости (REQ-05 AC-2): кто/когда/что из файлов; следы
 * `<slug>.<epochMs>.json` исключаются. */
export function listClaims(deps: ClaimRegistryDeps): ClaimRecord[] {
  const dir = claimsDir(deps.root);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: ClaimRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json') || /\.\d{13}\.json$/.test(name)) continue;
    const { rec } = readClaimFile(join(dir, name));
    if (rec !== null) out.push(rec);
  }
  return out;
}

/** Guard записи (REQ-05 AC-3): активный claim артефакта должен существовать и
 * принадлежать пишущему (owner+session; pid писателя ≠ pid захватчика —
 * захват и запись обычно разные процессы). Отказ — UserFacingError с именем
 * владельца и путём claim-файла. */
export function requireClaim(
  deps: ClaimRegistryDeps,
  artifact: string,
  who: { owner: string; sessionId: string | null }
): void {
  const path = claimFilePath(deps.root, artifact);
  const { rec } = readClaimFile(path);
  if (!existsSync(path)) {
    throw new UserFacingError(
      `No claim held for "${artifact}" — acquire it first: wolf claim acquire "${artifact}" (claim file: ${path})`
    );
  }
  if (rec === null) {
    throw new UserFacingError(
      `Claim file for "${artifact}" is corrupt — treated as stale; re-acquire: wolf claim acquire "${artifact}" (claim file: ${path})`
    );
  }
  if (isStale(rec, deps)) {
    throw new UserFacingError(
      `Claim for "${artifact}" is stale (holder ${rec.owner}) — re-acquire: wolf claim acquire "${artifact}" (claim file: ${path})`
    );
  }
  if (rec.owner !== who.owner || rec.session_id !== who.sessionId) {
    throw new UserFacingError(
      `Artifact "${artifact}" is claimed by ${rec.owner} (${describeHolder(rec)}) — claim file: ${path}`
    );
  }
}
