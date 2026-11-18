// src/app/use-cases/rollback-learning-change.ts
import { readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { MemoryLock } from '../../ports/memory-lock.port.js';
import { UserFacingError } from '../../domain/errors.js';
import { LearningBackupSchema, sha256Of } from '../../domain/schemas/learning-activation-schema.js';
import {
  appendLearningEvent,
  generateLearningOpId,
  loadLearningCandidate,
  resolveProjectFilePath,
} from './learning-files.js';
import { readActivation } from './apply-learning-change.js';

/**
 * 3.2.0 T-06 (REQ-08, NFR-03, design §8.6): точный откат применённого кандидата.
 *
 * Rollback проверяет, что каждый целевой файл совпадает с применённой активной
 * версией (activation.files[].sha256_after); чужие последующие правки → отказ
 * БЕЗ перезаписи и без потери (несовпадающий hash всегда отказ, NFR-03).
 * Восстановление идёт по backup, который apply записал до мутаций
 * (rollback.previous_ref): содержимое backup'а сверяется с baseline hash'ами до
 * первой записи. Multi-file rollback журналируется пошагово
 * (memory.learning.op_started/op_step, финал memory.learning.rolled_back);
 * незавершённый откат дозавершается повтором (файл с baseline-hash —
 * already_restored, перезаписи нет). Повтор полного отката — noop (REQ-08 AC).
 * Режим learning.mode откат не гейтит: обратимость — механизм безопасности
 * (NFR-03), а не новая активация.
 */

/** Точки тестового seam'а (паттерн FaceFaultPoint/AggregateFaultPoint). */
export type RollbackLearningFaultPoint = 'op_started' | 'restore_file' | 'verify' | 'deactivate' | 'rolled_back';

export interface RollbackLearningChangeResult {
  change_id: string;
  /** Файлы, восстановленные из backup этим запуском. */
  restored: string[];
  /** Файлы, уже имевшие baseline-hash незавершённого отката (перезаписи не было). */
  already_restored: string[];
  /** Конверт переведён active → rolled_back этим запуском. */
  deactivated: boolean;
  /** true — ничего не сделано: кандидат уже rolled_back (повтор rollback). */
  noop: boolean;
}

export async function rollbackLearningChange(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    /** Корень проекта (тот же, что использовал apply). */
    baseDir: string;
    lock?: MemoryLock;
    fault?: (point: RollbackLearningFaultPoint) => void;
  },
  candidateId: string,
  actor: string = 'system:wolf'
): Promise<RollbackLearningChangeResult> {
  const run = async (): Promise<RollbackLearningChangeResult> => {
    const { obj, envelope } = await loadLearningCandidate(deps.store, candidateId);

    // Повтор rollback (REQ-08 AC: повторный rollback — noop). Незакрытый след
    // (сбой между deactivate и финалом) дозаписывает финал — паттерн apply-aggregate.
    if (envelope.phase === 'rolled_back') {
      const closed = (await deps.log.readAll()).some(
        (e) => e.type === 'memory.learning.rolled_back' && e.payload['change_id'] === envelope.change_id
      );
      if (closed) {
        return { change_id: envelope.change_id, restored: [], already_restored: [], deactivated: false, noop: true };
      }
      await appendLearningEvent(deps, 'memory.learning.rolled_back', { change_id: envelope.change_id }, actor);
      deps.fault?.('rolled_back');
      return { change_id: envelope.change_id, restored: [], already_restored: [], deactivated: false, noop: false };
    }
    if (envelope.phase !== 'active') {
      throw new UserFacingError(
        `candidate ${candidateId} is phase "${envelope.phase}": rollback requires an "active" candidate (nothing applied to roll back); nothing was written`
      );
    }

    const activation = readActivation(envelope);
    if (envelope.rollback.expected_active_sha256 !== activation.expected_active_sha256) {
      throw new UserFacingError(
        `candidate ${candidateId} declares rollback.expected_active_sha256 ${envelope.rollback.expected_active_sha256}, but activation recorded ${activation.expected_active_sha256}: refusing to roll back an undeclared active state`
      );
    }
    if (activation.backup_ref !== envelope.rollback.previous_ref) {
      throw new UserFacingError(
        `activation backup_ref ${activation.backup_ref} differs from rollback.previous_ref ${envelope.rollback.previous_ref}: refusing without overwrite`
      );
    }

    const baselineByPath = new Map(envelope.baseline.files.map((f) => [f.path, f.sha256]));
    const problems: string[] = [];
    interface RollbackFile {
      path: string;
      abs: string;
      baselineSha: string;
      state: 'pending' | 'already_restored';
    }
    const files: RollbackFile[] = [];
    for (const applied of activation.files) {
      const baselineSha = baselineByPath.get(applied.path);
      if (baselineSha === undefined) {
        problems.push(`- ${applied.path}: applied file is absent from baseline.files`);
        continue;
      }
      let abs: string;
      try {
        abs = resolveProjectFilePath(deps.baseDir, applied.path);
      } catch (err) {
        problems.push(`- ${applied.path}: ${(err as Error).message}`);
        continue;
      }
      let currentSha: string;
      try {
        currentSha = sha256Of(await readFile(abs));
      } catch {
        problems.push(
          `- ${applied.path}: target file is missing (expected applied sha256 ${applied.sha256_after}) — refusing without overwrite`
        );
        continue;
      }
      if (currentSha === applied.sha256_after) {
        files.push({ path: applied.path, abs, baselineSha, state: 'pending' });
      } else if (currentSha === baselineSha) {
        // Уже восстановлен незавершённым откатом — дозавершение без перезаписи.
        files.push({ path: applied.path, abs, baselineSha, state: 'already_restored' });
      } else {
        problems.push(
          `- ${applied.path}: changed after apply (expected applied sha256 ${applied.sha256_after}, found ${currentSha}) — refusing without overwrite, keep the later edit and resolve the conflict explicitly (REQ-08 AC)`
        );
      }
    }

    // Backup обязан держать точное baseline-содержимое всех применённых файлов.
    const backupPath = resolveProjectFilePath(deps.baseDir, envelope.rollback.previous_ref);
    let backupByPath = new Map<string, { path: string; content: string; sha256: string }>();
    try {
      const parsed = LearningBackupSchema.safeParse(JSON.parse((await readFile(backupPath)).toString('utf8')));
      if (!parsed.success) {
        problems.push(
          `- rollback backup at ${envelope.rollback.previous_ref} is not a valid learning backup: ${parsed.error.issues
            .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
            .join('; ')}`
        );
      } else {
        backupByPath = new Map(parsed.data.files.map((f) => [f.path, f]));
      }
    } catch (err) {
      problems.push(`- rollback backup at ${envelope.rollback.previous_ref} is unreadable: ${(err as Error).message}`);
    }
    for (const f of files) {
      const entry = backupByPath.get(f.path);
      if (!entry) {
        problems.push(`- ${f.path}: rollback backup has no baseline entry for this file`);
        continue;
      }
      // REQ-321-1 (R-1): содержимое бэкапа хэшируется до первой записи — поле
      // sha256 хранится рядом с content и само по себе содержимое не доказывает:
      // испорченный content при интактном sha256 ловится ДО записи, а не после.
      const contentSha = sha256Of(entry.content);
      if (entry.sha256 !== f.baselineSha) {
        problems.push(
          `- ${f.path}: rollback backup holds sha256 ${entry.sha256}, expected baseline ${f.baselineSha} — refusing without overwrite`
        );
      } else if (contentSha !== entry.sha256) {
        problems.push(
          `- ${f.path}: rollback backup content hash ${contentSha} does not match its stored sha256 ${entry.sha256} (expected baseline ${f.baselineSha}) — refusing without overwrite`
        );
      }
    }
    if (problems.length > 0) {
      throw new UserFacingError(
        `Rollback of ${envelope.change_id} refused, nothing was written:\n` + problems.join('\n')
      );
    }

    const opId = generateLearningOpId(deps.clock);
    const stepEvent = async (step: string, detail: Record<string, unknown> = {}): Promise<void> => {
      await appendLearningEvent(deps, 'memory.learning.op_step', { opId, step, ...detail }, actor);
    };
    await appendLearningEvent(
      deps,
      'memory.learning.op_started',
      {
        opId,
        op: 'rollback',
        change_id: envelope.change_id,
        plan: ['restore_file', 'verify', 'deactivate', 'rolled_back'],
        input: {
          expected_active_sha256: activation.expected_active_sha256,
          backup_ref: envelope.rollback.previous_ref,
          planned: activation.files.map((f) => ({ path: f.path, sha256_restored: baselineByPath.get(f.path) })),
        },
      },
      actor
    );
    deps.fault?.('op_started');

    for (const f of files) {
      if (f.state === 'already_restored') {
        await stepEvent('restore_file', { path: f.path, sha256_restored: f.baselineSha, recovered: true });
        continue;
      }
      await writeFile(f.abs, backupByPath.get(f.path)!.content, 'utf8');
      await stepEvent('restore_file', { path: f.path, sha256_restored: f.baselineSha });
      deps.fault?.('restore_file');
    }

    for (const f of files) {
      const nowSha = sha256Of(await readFile(f.abs));
      if (nowSha !== f.baselineSha) {
        throw new UserFacingError(
          `verification failed for ${f.path}: expected baseline sha256 ${f.baselineSha}, found ${nowSha}; rollback trace stays incomplete, repeat rollback to recover`
        );
      }
    }
    await stepEvent('verify', { files: files.length });
    deps.fault?.('verify');

    const updated = { ...envelope, phase: 'rolled_back' as const };
    await deps.store.update(obj.id, {
      body: JSON.stringify(updated, null, 2),
      title: `Learning candidate ${envelope.change_id} (rolled_back)`,
    });
    await stepEvent('deactivate');
    deps.fault?.('deactivate');

    await appendLearningEvent(deps, 'memory.learning.rolled_back', { change_id: envelope.change_id }, actor);
    deps.fault?.('rolled_back');

    return {
      change_id: envelope.change_id,
      restored: files.filter((f) => f.state === 'pending').map((f) => f.path),
      already_restored: files.filter((f) => f.state === 'already_restored').map((f) => f.path),
      deactivated: true,
      noop: false,
    };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
