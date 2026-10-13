import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
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
 * прежний файл жёсткой ссылкой в след `<slug>.<epochMs>.json` (excl, NFR-02).
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
  /** Тестовый seam: ожидание in-flight окна. Дефолт — синхронный sleep. */
  wait?: (ms: number) => void;
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

/** Синхронное ожидание in-flight окна (MINOR-2): Atomics.wait — без busy-loop. */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
    const { raw, rec } = readClaimFile(path);
    // MINOR-2 (ревью T5): пустой файл — in-flight окно создателя (между wx и
    // write), не порча: takeover запрещён, короткое ожидание и повтор
    if (raw !== null && raw.trim() === '') {
      if (attempt >= 60) {
        throw new ClaimHeldError(path, 'unknown', 'claim file exists but stays empty (in-flight write?)');
      }
      (deps.wait ?? sleepMs)(10);
      continue;
    }
    if (rec !== null && !isStale(rec, deps)) {
      throw new ClaimHeldError(path, rec.owner, describeHolder(rec));
    }
    // stale/порченый (rec === null, сырые байты могли быть) → перехват со следом;
    // проигранная гонка перехвата (ENOENT на link/unlink) — повтор захвата
    try {
      const epoch = now().getTime();
      // FIX-4 (MINOR-4, ревью T5): след — через linkSync (excl-семантика):
      // exists+rename TOCTOU позволял двум перехватчикам одной мс перезаписать
      // чужой след (потеря байтов, NFR-02); при EEXIST — bump эпохи до свободного
      let preserved: string | null = null;
      for (let bump = 0; bump < 50 && preserved === null; bump++) {
        const trail = claimTrailPath(deps.root, input.artifact, epoch + bump);
        try {
          linkSync(path, trail);
          preserved = trail;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        }
      }
      if (preserved !== null) {
        // решение принималось по raw, а слинковаться мог уже переписанный файл
        // (чужой takeover между чтением и link): чужую свежую запись в след не
        // берём и claim-имя под ней не освобождаем — перечитаем и откажемся
        if (raw !== null && readFileSync(preserved, 'utf-8') !== raw) {
          unlinkSync(preserved);
        } else if (statSync(path).ino === statSync(preserved).ino) {
          // unlink только сохранённый inode: конкурент мог уже пересоздать claim
          unlinkSync(path);
        }
      }
    } catch {
      /* конкурент уже сохранил/убрал файл — идём на повторный wx */
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
  if (!existsSync(path)) {
    throw new UserFacingError(`No claim held for "${input.artifact}" (claim file: ${path})`);
  }
  if (rec === null) {
    // FIX-5 (MINOR-5, ревью T5): файл есть, но не читается как claim — «No claim
    // held» лгало об отсутствии; честный отказ без расширения поведения.
    throw new UserFacingError(
      `Claim file for "${input.artifact}" is corrupt — ownership cannot be verified; take over via "wolf claim acquire" (preserves bytes) or remove it manually (claim file: ${path})`
    );
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
 * `<slug>.<epochMs>.json` исключаются — по содержимому: след хранит запись
 * базового артефакта, его slug ≠ имя файла следа (MINOR-4). */
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
    if (!name.endsWith('.json')) continue;
    const { rec } = readClaimFile(join(dir, name));
    if (rec === null) continue;
    // MINOR-4: имя с 13 цифрами на конце может быть легитимным claim'ом —
    // след распознаём по несоответствию имени и slug(rec.artifact), не по маске
    if (claimFilePath(deps.root, rec.artifact) !== join(dir, name)) continue;
    out.push(rec);
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
  // MINOR-1 (ревью T5): переданный claim (transfer: session null, pid 0)
  // доступен адресату с любой его сессией — иначе передача парковала бы
  // запись до TTL. pid-проверка для pid:0 не применяется (pidAlive).
  const transferredToWho = rec.session_id === null && rec.owner === who.owner;
  if (!transferredToWho && (rec.owner !== who.owner || rec.session_id !== who.sessionId)) {
    throw new UserFacingError(
      `Artifact "${artifact}" is claimed by ${rec.owner} (${describeHolder(rec)}) — claim file: ${path}`
    );
  }
}
