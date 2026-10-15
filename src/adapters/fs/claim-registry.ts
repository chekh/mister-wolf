import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
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
 * stale: PID мёртв (ESRCH) ИЛИ возраст > CLAIM_TTL ИЛИ heartbeat старше окна
 * (2.18.0 REQ-03); перехват stale сохраняет
 * прежний файл жёсткой ссылкой в след `<slug>.<epochMs>.json` (excl, NFR-02).
 */

/** TTL claim'а: локальный-first (heartbeat — opt-in продление, REQ-03). */
export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

/** Окно свежести heartbeat (2.18.0 REQ-03, design §3.3 / ADR-7): heartbeat
 * старше окна — claim stale; независимая величина от CLAIM_TTL_MS (DAP-2). */
export const CLAIM_HEARTBEAT_WINDOW_MS = 10 * 60 * 1000;

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
  /** 2.18.3: уникальный токен владения claim'ом для per-token изоляции heartbeat. */
  claim_token?: string;
}

/** Heartbeat-запись (2.18.0 REQ-03, design §3.3; 2.18.2 F-01; 2.18.3 per-token isolation):
 * продление свежести держателем долгой операции; writer — для отладки, не auth;
 * claim_acquired_at и claim_token привязывают heartbeat к конкретному владению claim'ом. */
export interface HeartbeatRecord {
  /** ISO-время последнего heartbeat. */
  written_at: string;
  /** Идентификатор писателя (для отладки, не auth). */
  writer: string;
  /** ISO-время захвата claim, к которому привязан heartbeat (F-01). */
  claim_acquired_at?: string;
  /** Уникальный токен владения claim'ом (2.18.3). */
  claim_token?: string;
  /** 2.18.4: полный идентификатор сессии писателя (null — переданное владение). */
  session_id?: string | null;
  /** 2.18.4: pid писателя (для отладки, не auth). */
  pid?: number;
}

/** 2.18.4: полная идентичность писателя heartbeat. Проверяются только переданные
 * поля: owner — всегда; sessionId (null трактуется строго: claim тоже без сессии —
 * переданное владение) и claimToken — только если определены. Непереданные поля —
 * legacy-поведение (только writer). */
export interface HeartbeatIdentity {
  owner: string;
  sessionId?: string | null;
  pid?: number;
  claimToken?: string;
}

export type HeartbeatReadResult = HeartbeatRecord | { corrupt: true } | null;

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

/** Путь heartbeat-файла артефакта (2.18.0 REQ-03; 2.18.3 per-token isolation):
 * если передан token: `<slug>.<claim_token>.heartbeat`, иначе fallback на `<slug>.heartbeat`. */
export function heartbeatFilePath(root: string, artifact: string, token?: string): string {
  if (token) {
    return join(claimsDir(root), `${claimSlug(artifact)}.${token}.heartbeat`);
  }
  return join(claimsDir(root), `${claimSlug(artifact)}.heartbeat`);
}

/** Токен claim'а: явный claim_token или fallback на acquired_at (legacy-совместимость). */
export function claimTokenOf(rec: ClaimRecord): string {
  return rec.claim_token ?? rec.acquired_at;
}

/** Удаление heartbeat-файлов артефакта: per-token (если указан) и legacy. */
export function removeHeartbeatFiles(root: string, artifact: string, token?: string): void {
  if (token) {
    try {
      const p = heartbeatFilePath(root, artifact, token);
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
  try {
    const legacy = heartbeatFilePath(root, artifact);
    if (existsSync(legacy)) unlinkSync(legacy);
  } catch {
    /* ignore */
  }
}

/** Чтение heartbeat для конкретного claim (2.18.3): сначала per-token файл, затем fallback на legacy. */
export function readClaimHeartbeat(root: string, artifact: string, rec?: ClaimRecord | null): HeartbeatReadResult {
  if (rec) {
    const token = claimTokenOf(rec);
    const tokenPath = heartbeatFilePath(root, artifact, token);
    if (existsSync(tokenPath)) {
      return readHeartbeat(tokenPath);
    }
  }
  const legacyPath = heartbeatFilePath(root, artifact);
  if (existsSync(legacyPath)) {
    return readHeartbeat(legacyPath);
  }
  return null;
}

/** Чтение heartbeat (F-01; 2.18.3): null при отсутствии файла (ENOENT); { corrupt: true }
 * при повреждённом файле/JSON; HeartbeatRecord при валидном JSON. */
export function readHeartbeat(path: string): HeartbeatReadResult {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  try {
    const d = JSON.parse(raw) as Partial<HeartbeatRecord>;
    if (typeof d.written_at !== 'string' || typeof d.writer !== 'string') {
      return { corrupt: true };
    }
    return {
      written_at: d.written_at,
      writer: d.writer,
      ...(typeof d.claim_acquired_at === 'string' ? { claim_acquired_at: d.claim_acquired_at } : {}),
      ...(typeof d.claim_token === 'string' ? { claim_token: d.claim_token } : {}),
      ...(typeof d.session_id === 'string'
        ? { session_id: d.session_id }
        : d.session_id === null
          ? { session_id: null }
          : {}),
      ...(typeof d.pid === 'number' ? { pid: d.pid } : {}),
    };
  } catch {
    return { corrupt: true };
  }
}

/** Запись heartbeat (REQ-03, ADR-7; 2.18.2 F-01; 2.18.3 per-token isolation; 2.18.4
 * полная идентификация): атомарная замена — уникальный tmp (wx) + rename поверх
 * per-token heartbeat-файла. Проверяет, что claim существует, активен и принадлежит
 * писателю (owner обязателен; sessionId/claimToken — при передаче в identity).
 * Привязывает heartbeat к rec.acquired_at и rec.claim_token. */
export function writeHeartbeat(
  deps: ClaimRegistryDeps,
  input: { artifact: string; writer: string; identity?: HeartbeatIdentity }
): HeartbeatRecord {
  const cPath = claimFilePath(deps.root, input.artifact);
  const { rec } = readClaimFile(cPath);
  if (!existsSync(cPath) || rec === null) {
    throw new UserFacingError(
      `No claim held for "${input.artifact}" — acquire it first before heartbeat (claim file: ${cPath})`
    );
  }
  if (isStale(rec, readClaimHeartbeat(deps.root, input.artifact, rec), deps)) {
    throw new UserFacingError(`Claim for "${input.artifact}" is stale — cannot heartbeat (claim file: ${cPath})`);
  }
  if (input.identity) {
    const id = input.identity;
    if (rec.owner !== id.owner) {
      throw new UserFacingError(
        `Claim for "${input.artifact}" is owned by ${rec.owner}, not ${id.owner} (claim file: ${cPath})`
      );
    }
    // 2.18.4: сессия — строгое совпадение; оба null — переданное владение (легально)
    if (id.sessionId !== undefined && rec.session_id !== id.sessionId) {
      throw new UserFacingError(
        `Claim for "${input.artifact}" is held by ${rec.owner} (session ${rec.session_id ?? '-'}) — ` +
          `heartbeat session '${id.sessionId ?? '-'}' does not match (claim file: ${cPath})`
      );
    }
    // 2.18.4: токен — защита от heartbeat'а прежнего владения после перезахвата
    if (id.claimToken !== undefined && id.claimToken !== rec.claim_token) {
      throw new UserFacingError(
        `Claim for "${input.artifact}" was re-acquired by ${rec.owner} — ` +
          `claim_token does not match the current claim (claim file: ${cPath})`
      );
    }
  } else if (rec.owner !== input.writer) {
    throw new UserFacingError(
      `Claim for "${input.artifact}" is owned by ${rec.owner}, not ${input.writer} (claim file: ${cPath})`
    );
  }
  const dir = claimsDir(deps.root);
  mkdirSync(dir, { recursive: true });
  const now = (deps.now ?? (() => new Date()))();
  const token = claimTokenOf(rec);
  const record: HeartbeatRecord = {
    written_at: now.toISOString(),
    writer: input.writer,
    claim_acquired_at: rec.acquired_at,
    claim_token: token,
    ...(input.identity && input.identity.sessionId !== undefined ? { session_id: input.identity.sessionId } : {}),
    ...(input.identity?.pid !== undefined ? { pid: input.identity.pid } : {}),
  };
  const tag = `${process.hrtime.bigint().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
  const tmp = join(dir, `${claimSlug(input.artifact)}.${token}.heartbeat.${tag}.tmp`);
  const fd = openSync(tmp, 'wx');
  writeFileSync(fd, JSON.stringify(record), 'utf-8');
  closeSync(fd);
  try {
    renameSync(tmp, heartbeatFilePath(deps.root, input.artifact, token));
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* конкурент уже убрал — не маскируем исходную ошибку */
    }
    throw e;
  }
  return record;
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
      claim_token: typeof d.claim_token === 'string' ? d.claim_token : undefined,
    };
  } catch {
    return null;
  }
}

/** Stale (design §3.3; 2.18.2 F-01; 2.18.3 per-token isolation): мёртвый PID ИЛИ
 * возраст > TTL ИЛИ (heartbeat есть и старше окна/повреждён); нет heartbeat → правила 2.17.1 (NFR-03).
 * Если heartbeat привязан к чужому claim_acquired_at или чужому claim_token — игнорируется. */
export function isStale(rec: ClaimRecord | null, hb: HeartbeatReadResult, deps: ClaimRegistryDeps): boolean {
  if (rec === null) return true;
  const alive = deps.isAlive ?? pidAlive;
  if (!alive(rec.pid)) return true;
  const acquired = Date.parse(rec.acquired_at);
  if (Number.isNaN(acquired)) return true;
  const now = (deps.now ?? (() => new Date()))().getTime();
  if (now - acquired > CLAIM_TTL_MS) return true;
  if (hb !== null) {
    if ('corrupt' in hb && hb.corrupt) return true;
    const hbRec = hb as HeartbeatRecord;
    // 2.18.3: если heartbeat от другого claim_token — игнорируем его
    if (hbRec.claim_token && rec.claim_token && hbRec.claim_token !== rec.claim_token) {
      return false;
    }
    // F-01: если heartbeat от предыдущего владения (acquired_at не совпадает), игнорируем его
    if (hbRec.claim_acquired_at && hbRec.claim_acquired_at !== rec.acquired_at) {
      return false;
    }
    const written = Date.parse(hbRec.written_at);
    if (Number.isNaN(written)) return true; // повреждён = stale
    if (now - written > CLAIM_HEARTBEAT_WINDOW_MS) return true;
  }
  return false;
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
  const epoch = now().getTime();
  const randomTag = `${process.hrtime.bigint().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
  const claim_token = `${epoch}.${randomTag}`;
  const record: ClaimRecord = {
    artifact: input.artifact,
    owner: input.identity.owner,
    session_id: input.identity.sessionId,
    pid: input.identity.pid,
    cwd: input.cwd,
    acquired_at: now().toISOString(),
    claim_token,
  };

  for (let attempt = 0; ; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeFileSync(fd, JSON.stringify(record), 'utf-8');
      closeSync(fd);
      removeHeartbeatFiles(deps.root, input.artifact);
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
        throw new ClaimHeldError(
          path,
          'unknown',
          'claim file exists but stays empty (in-flight write?) — if it persists, remove it manually'
        );
      }
      (deps.wait ?? sleepMs)(10);
      continue;
    }
    if (rec !== null && !isStale(rec, readClaimHeartbeat(deps.root, input.artifact, rec), deps)) {
      throw new ClaimHeldError(path, rec.owner, describeHolder(rec));
    }
    // stale/порченый (rec === null, сырые байты могли быть) → перехват со следом;
    // проигранная гонка перехвата (ENOENT на link/unlink) — повтор захвата
    try {
      const epochMs = now().getTime();
      // FIX-4 (MINOR-4, ревью T5): след — через linkSync (excl-семантика):
      // exists+rename TOCTOU позволял двум перехватчикам одной мс перезаписать
      // чужой след (потеря байтов, NFR-02); при EEXIST — bump эпохи до свободного
      let preserved: string | null = null;
      for (let bump = 0; bump < 50 && preserved === null; bump++) {
        const trail = claimTrailPath(deps.root, input.artifact, epochMs + bump);
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
          removeHeartbeatFiles(deps.root, input.artifact, rec ? claimTokenOf(rec) : undefined);
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
  const pidReleasable = rec.pid <= 0 || isStale(rec, readClaimHeartbeat(deps.root, input.artifact, rec), deps);
  // MINOR-1b (интегральное ревью 2.17.1): зеркально requireClaim — адресат
  // transfer (session null + owner) освобождает своей сессией, иначе передача
  // паркует release до TTL
  const transferredToWho = rec.session_id === null && rec.owner === input.identity.owner;
  if (!fullMatch && !transferredToWho && !(ownerSessionMatch(rec, input.identity) && pidReleasable)) {
    throw new UserFacingError(
      `Claim for "${input.artifact}" is owned by ${rec.owner} (${describeHolder(rec)}) — release is owner-only (claim file: ${path})`
    );
  }
  if (input.transferTo !== undefined) {
    const now = (deps.now ?? (() => new Date()))();
    const epoch = now.getTime();
    const randomTag = `${process.hrtime.bigint().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
    const transferredToken = `${epoch}.${randomTag}`;
    const transferred: ClaimRecord = {
      artifact: rec.artifact,
      owner: input.transferTo,
      // новый владелец ещё не предъявил процесс — liveness неизвестна (TTL решает)
      session_id: null,
      pid: 0,
      cwd: rec.cwd,
      acquired_at: now.toISOString(),
      claim_token: transferredToken,
    };
    writeFileSync(path, JSON.stringify(transferred), 'utf-8');
    removeHeartbeatFiles(deps.root, input.artifact, claimTokenOf(rec));
    return { action: 'transferred', owner: input.transferTo };
  }
  unlinkSync(path);
  removeHeartbeatFiles(deps.root, input.artifact, claimTokenOf(rec));
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
  if (isStale(rec, readClaimHeartbeat(deps.root, artifact, rec), deps)) {
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
