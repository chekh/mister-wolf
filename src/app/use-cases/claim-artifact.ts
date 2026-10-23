import { resolveCreatedBy, resolveSessionId } from '../../domain/actor.js';
import { resolveMemoryRoot } from '../../adapters/fs/memory-root.js';
import {
  acquireClaim,
  listClaims,
  releaseClaim,
  requireClaim,
  writeHeartbeat,
  type ClaimIdentity,
  type ClaimRecord,
  type ClaimRegistryDeps,
  type HeartbeatIdentity,
  type HeartbeatRecord,
} from '../../adapters/fs/claim-registry.js';

/**
 * 2.17.1 REQ-05 (R06), design §3.5: use-case-слой claim. Идентичность — env
 * (WOLF_ACTOR/WOLF_SESSION, тот же механизм атрибуции, что у мутаций);
 * реестр — в общем root (resolveMemoryRoot): claims видны из всех копий.
 * makeClaimGuard — точка инъекции для use-cases записи общих артефактов
 * (requireClaim до записи, REQ-05 AC-3).
 */

export interface ClaimArtifactDeps {
  baseDir: string;
  /** Тестовые seam'ы; прод-дефолты — process.env / process.pid / process.cwd(). */
  env?: NodeJS.ProcessEnv;
  pid?: number;
  cwd?: string;
  now?: () => Date;
  isAlive?: (pid: number) => boolean;
}

function identityOf(deps: ClaimArtifactDeps): ClaimIdentity {
  return {
    owner: resolveCreatedBy(undefined, deps.env ?? process.env),
    sessionId: resolveSessionId(deps.env ?? process.env),
    pid: deps.pid ?? process.pid,
  };
}

function registryDeps(deps: ClaimArtifactDeps): ClaimRegistryDeps {
  return {
    root: resolveMemoryRoot(deps.baseDir).root,
    now: deps.now,
    isAlive: deps.isAlive,
  };
}

export function acquireArtifactClaim(deps: ClaimArtifactDeps, artifact: string): ClaimRecord {
  return acquireClaim(registryDeps(deps), {
    artifact,
    identity: identityOf(deps),
    cwd: deps.cwd ?? process.cwd(),
  });
}

export function releaseArtifactClaim(
  deps: ClaimArtifactDeps,
  artifact: string,
  transferTo?: string
): { action: 'released' | 'transferred'; owner: string } {
  return releaseClaim(registryDeps(deps), { artifact, identity: identityOf(deps), transferTo });
}

export function listArtifactClaims(deps: ClaimArtifactDeps): ClaimRecord[] {
  return listClaims(registryDeps(deps));
}

/** Heartbeat держателя (2.18.0 REQ-03): продлевает свежесть claim'а долгой
 * операции в окне CLAIM_HEARTBEAT_WINDOW_MS; writer — owner из env (не auth).
 * 2.18.4: identityOverride (CLI-флаги --session/--pid/--claim-token) включает
 * строгие проверки владения.
 * 2.18.5 (AC2): штатный вызов без override проверяет сессию из WOLF_SESSION
 * автоматически; совместимость только по имени — явный legacy-режим
 * (WOLF_CLAIM_HEARTBEAT_LEGACY=1) для внешних интеграций без сессии. */
export function heartbeatArtifactClaim(
  deps: ClaimArtifactDeps,
  artifact: string,
  identityOverride?: { sessionId?: string | null; pid?: number; claimToken?: string }
): HeartbeatRecord {
  const env = deps.env ?? process.env;
  const who = identityOf(deps);
  const legacy = env.WOLF_CLAIM_HEARTBEAT_LEGACY === '1' || env.WOLF_CLAIM_HEARTBEAT_LEGACY === 'true';
  const identity: HeartbeatIdentity | undefined = identityOverride
    ? { owner: who.owner, ...identityOverride }
    : legacy
      ? undefined
      : { owner: who.owner, sessionId: resolveSessionId(env) };
  return writeHeartbeat(registryDeps(deps), { artifact, writer: who.owner, ...(identity ? { identity } : {}) });
}

/** Guard для use-cases записи общих артефактов: claim артефакта должен
 * принадлежать текущей идентичности (owner+session); pid писателя не важен
 * (захват и запись — разные процессы). */
export interface ClaimGuard {
  requireClaim(artifact: string): void;
}

export function makeClaimGuard(deps: ClaimArtifactDeps): ClaimGuard {
  const registry = registryDeps(deps);
  const who = identityOf(deps);
  return {
    requireClaim: (artifact: string) =>
      requireClaim(registry, artifact, { owner: who.owner, sessionId: who.sessionId }),
  };
}
