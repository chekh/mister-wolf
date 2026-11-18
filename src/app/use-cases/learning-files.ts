// src/app/use-cases/learning-files.ts
import { realpathSync } from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import { UserFacingError } from '../../domain/errors.js';
import {
  LEARNING_CHANGE_TAG,
  parseLearningChangeEnvelope,
  type LearningChangeEnvelope,
} from '../../domain/schemas/learning-change-schema.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

/**
 * 3.2.0 T-06: общие механики apply/rollback-learning-change (REQ-08, design §8):
 * безопасный проектный путь, загрузка конверта кандидата, запись событий журнала.
 */

/**
 * Резолвит относительный путь проекта в абсолютный с запретом выхода за корень
 * проекта (path traversal и symlink escape запрещены на штатном пути, design §8.2;
 * прецедент F26 — user-config.ts). Файл может не существовать (backup пишется
 * apply'ем) — проверяется реальный путь ближайшего существующего предка.
 */
export function resolveProjectFilePath(baseDir: string, relPath: string): string {
  if (relPath.length === 0) throw new UserFacingError('empty target path is not allowed');
  if (isAbsolute(relPath)) {
    throw new UserFacingError(`path must be relative to the project root, got absolute: ${relPath}`);
  }
  const abs = resolve(baseDir, relPath);
  const rel = relative(baseDir, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new UserFacingError(`path escapes the project root: ${relPath}`);
  }
  const realBase = realpathSync(baseDir);
  let probe = abs;
  for (;;) {
    let real: string;
    try {
      real = realpathSync(probe);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' && probe !== dirname(probe)) {
        probe = dirname(probe);
        continue;
      }
      throw err;
    }
    if (relative(realBase, real).startsWith('..')) {
      throw new UserFacingError(`path escapes the project root through a symlink: ${relPath}`);
    }
    return abs;
  }
}

/** Кандидат: memory-объект с валидным конвертом (тег wolf:learning-change:v1). */
export async function loadLearningCandidate(
  store: MemoryStore,
  candidateId: string
): Promise<{ obj: MemoryObject; envelope: LearningChangeEnvelope }> {
  const obj = await store.get(candidateId);
  if (!obj) throw new UserFacingError(`Memory object not found: ${candidateId}`);
  const envelope = parseLearningChangeEnvelope(obj);
  if (!envelope) {
    throw new UserFacingError(`${candidateId} is not a learning candidate (missing tag ${LEARNING_CHANGE_TAG})`);
  }
  return { obj, envelope };
}

/** Событие журнала apply/rollback (прецедент face-operation.appendEvent). */
export async function appendLearningEvent(
  deps: { log: EventLog; clock: Clock; idGen: IdGenerator },
  type: MemoryEvent['type'],
  payload: Record<string, unknown>,
  actor: string
): Promise<void> {
  const now = deps.clock.now();
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type,
    timestamp: now.toISOString(),
    actor,
    payload,
  });
}

/** opId контура apply/rollback: learnop-<ts>-<rand4> (прецедент generateOpId). */
export function generateLearningOpId(clock: Clock): string {
  const rand = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `learnop-${clock.now().getTime()}-${rand}`;
}
