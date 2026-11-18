// src/app/use-cases/apply-learning-change.ts
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { SearchIndex } from '../../ports/search-index.port.js';
import type { MemoryLock } from '../../ports/memory-lock.port.js';
import { UserFacingError } from '../../domain/errors.js';
import { resolveLearningMode, type LearningMode, type LearningModeConfig } from '../../domain/learning-mode.js';
import {
  AcceptanceRecordSchema,
  ActivationRecordSchema,
  LearningPatchSchema,
  canonicalActiveHash,
  sha256Of,
  type ActivationRecord,
  type LearningPatch,
} from '../../domain/schemas/learning-activation-schema.js';
import {
  appendLearningEvent,
  generateLearningOpId,
  loadLearningCandidate,
  resolveProjectFilePath,
} from './learning-files.js';

/**
 * 3.2.0 T-06 (REQ-08, design §8): разрешённое применение одиночного кандидата.
 *
 * apply выполняется ТОЛЬКО при phase=approved и подтверждённом acceptance
 * (decision/accepted_by/accepted_at/verdict_ref + идентичность принятой версии:
 * accepted_candidate_sha256 = candidate.sha256 = sha256(diff-файла)). Preflight
 * сверяет точный baseline (sha256 всех целевых файлов) ДО первой записи; stale
 * baseline → отказ без перезаписи. Multi-file apply журналирует каждый шаг
 * (memory.learning.op_started/op_step, финал memory.learning.applied) — паттерн
 * apply-aggregate/face-операций; FS не транзакционен: повтор apply дозавершает
 * по журналу и фактическим hash'ам (файл с post-hash из незавершённого прогона —
 * recovered, перезаписи нет; при ложном active — только дописывается финал).
 * Повтор полностью применённого кандидата — noop без второго эффекта (REQ-08 AC).
 * Backup предыдущего содержимого пишется в rollback.previous_ref ДО мутаций —
 * база точного отката (rollback-learning-change) и дозавершения.
 */

/** Точки тестового seam'а (паттерн FaceFaultPoint/AggregateFaultPoint): fault(point)
 * бросается ПОСЛЕ завершения указанного шага — данные шага на диске и в журнале,
 * следующий шаг не начат. Прод-код seam не передаёт. */
export type ApplyLearningFaultPoint = 'op_started' | 'backup' | 'write_file' | 'verify' | 'activate' | 'applied';

export interface ApplyLearningChangeResult {
  change_id: string;
  /** Целевые файлы, записанные этим запуском (точная принятая версия). */
  applied: string[];
  /** Файлы, уже имевшие post-hash незавершённого прогона (перезаписи не было). */
  recovered: string[];
  /** Конверт переведён approved → active этим запуском. */
  activated: boolean;
  /** true — ничего не сделано: кандидат active со закрытым следом (повтор apply). */
  noop: boolean;
}

export interface ApplyLearningChangeDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  /** Корень проекта: все целевые пути/diff/backup резолвятся внутри него. */
  baseDir: string;
  index?: SearchIndex;
  lock?: MemoryLock;
  /** Явный программный режим; иначе config → env WOLF_LEARNING_MODE → 'suggest'. */
  mode?: LearningMode;
  env?: NodeJS.ProcessEnv;
  config?: LearningModeConfig | null;
  fault?: (point: ApplyLearningFaultPoint) => void;
}

/** Activation-запись из конверта или UserFacingError (без неё точный откат невозможен). */
export function readActivation(envelope: { activation: unknown; change_id: string }): ActivationRecord {
  const parsed = ActivationRecordSchema.safeParse(envelope.activation);
  if (!parsed.success) {
    throw new UserFacingError(
      `learning candidate "${envelope.change_id}" has no valid activation record: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`
    );
  }
  return parsed.data;
}

/**
 * Приёмка кандидата владельцем/ведущим (REQ-08: proposed/trialled → approved).
 * Ничего не применяет: только фиксирует решение (acceptance-запись c
 * идентичностью принятой версии и ссылкой на независимый вердикт) и событие
 * memory.learning.accepted. Повторная приёмка невозможна: acceptance-запись
 * неизменяема (изменение решения — новый кандидат).
 */
export async function acceptLearningChange(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    lock?: MemoryLock;
  },
  input: { candidateId: string; acceptedBy: string; verdictRef: string },
  actor: string = 'system:wolf'
): Promise<{ change_id: string; phase: 'approved' }> {
  const run = async (): Promise<{ change_id: string; phase: 'approved' }> => {
    const { obj, envelope } = await loadLearningCandidate(deps.store, input.candidateId);
    // Acceptance неизменяема: повторная приёмка/приёмка повторно предложенного
    // кандидата отвергается до фазовой проверки.
    if (envelope.acceptance !== null) {
      throw new UserFacingError(
        `candidate ${input.candidateId} already carries an acceptance record: acceptance is immutable (revoke/replace by declining this candidate and proposing a new one)`
      );
    }
    if (envelope.phase !== 'proposed' && envelope.phase !== 'trialled') {
      throw new UserFacingError(
        `candidate ${input.candidateId} is phase "${envelope.phase}": acceptance expects "proposed" or "trialled"`
      );
    }
    const record = {
      decision: 'accepted',
      accepted_by: input.acceptedBy,
      accepted_at: deps.clock.now().toISOString(),
      accepted_candidate_sha256: envelope.candidate.sha256,
      verdict_ref: input.verdictRef,
    };
    const checked = AcceptanceRecordSchema.safeParse(record);
    if (!checked.success) {
      throw new UserFacingError(
        `acceptance record failed validation: ${checked.error.issues
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; ')}`
      );
    }
    const updated = { ...envelope, phase: 'approved' as const, acceptance: checked.data };
    await deps.store.update(obj.id, {
      body: JSON.stringify(updated, null, 2),
      title: `Learning candidate ${envelope.change_id} (approved)`,
    });
    await appendLearningEvent(
      deps,
      'memory.learning.accepted',
      {
        change_id: envelope.change_id,
        accepted_by: checked.data.accepted_by,
        accepted_candidate_sha256: checked.data.accepted_candidate_sha256,
        verdict_ref: checked.data.verdict_ref,
      },
      actor
    );
    return { change_id: envelope.change_id, phase: 'approved' };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}

/**
 * Применение принятого кандидата (документация модуля выше). Под lock если дан.
 */
export async function applyLearningChange(
  deps: ApplyLearningChangeDeps,
  candidateId: string,
  actor: string = 'system:wolf'
): Promise<ApplyLearningChangeResult> {
  const run = async (): Promise<ApplyLearningChangeResult> => {
    const { obj, envelope } = await loadLearningCandidate(deps.store, candidateId);

    // Повтор apply (REQ-08 AC: двойной apply не повторяет эффект). noop-путь
    // не требует режима: он ничего не активирует.
    if (envelope.phase === 'active') {
      const closed = (await deps.log.readAll()).some(
        (e) => e.type === 'memory.learning.applied' && e.payload['change_id'] === envelope.change_id
      );
      if (closed) {
        return { change_id: envelope.change_id, applied: [], recovered: [], activated: false, noop: true };
      }
      // Незакрытый след (сбой между activate и финалом) дозавершается по журналу —
      // паттерн apply-aggregate; ложного active здесь уже нет: apply завершён.
      await appendLearningEvent(deps, 'memory.learning.applied', { change_id: envelope.change_id }, actor);
      deps.fault?.('applied');
      return { change_id: envelope.change_id, applied: [], recovered: [], activated: false, noop: false };
    }

    // Режим (REQ-12, design §6): применение — только в apply-approved.
    const mode = deps.mode ?? resolveLearningMode(deps.env ?? process.env, deps.config);
    if (mode !== 'apply-approved') {
      throw new UserFacingError(
        `learning mode is "${mode}": apply requires mode "apply-approved" (design §6); nothing was written`
      );
    }

    // Фаза: применён может быть только approved-кандидат (REQ-08).
    if (envelope.phase !== 'approved') {
      throw new UserFacingError(
        `candidate ${candidateId} is phase "${envelope.phase}": apply requires "approved" (accept the candidate first); nothing was written`
      );
    }

    // Подтверждённая приёмка + идентичность принятой версии (design §8.1).
    const acceptance = AcceptanceRecordSchema.safeParse(envelope.acceptance);
    if (!acceptance.success) {
      throw new UserFacingError(
        `candidate ${candidateId} has no confirmed acceptance (decision/accepted_by/accepted_at/accepted_candidate_sha256/verdict_ref required); nothing was written`
      );
    }
    if (acceptance.data.accepted_candidate_sha256 !== envelope.candidate.sha256) {
      throw new UserFacingError(
        `acceptance pins candidate sha256 ${acceptance.data.accepted_candidate_sha256}, but candidate ${candidateId} carries ${envelope.candidate.sha256}: accepted-version identity mismatch; nothing was written`
      );
    }

    // Точный diff: содержимое и hash (кандидат не подменяется после приёмки).
    const diffPath = resolveProjectFilePath(deps.baseDir, envelope.candidate.diff_ref);
    let diffBytes: Buffer;
    try {
      diffBytes = await readFile(diffPath);
    } catch {
      throw new UserFacingError(`candidate diff file not found: ${envelope.candidate.diff_ref}`);
    }
    const diffSha = sha256Of(diffBytes);
    if (diffSha !== envelope.candidate.sha256) {
      throw new UserFacingError(
        `diff content hash ${diffSha} does not match candidate.sha256 ${envelope.candidate.sha256} (${envelope.candidate.diff_ref}); nothing was written`
      );
    }
    let patch: LearningPatch;
    try {
      patch = LearningPatchSchema.parse(JSON.parse(diffBytes.toString('utf8')));
    } catch (err) {
      throw new UserFacingError(
        `candidate diff is not a valid learning patch (${envelope.candidate.diff_ref}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    // Preflight ВСЕХ файлов до первой записи (design §8.2, NFR-03).
    const patchByPath = new Map(patch.files.map((f) => [f.path, f.content]));
    const baselineByPath = new Map(envelope.baseline.files.map((f) => [f.path, f.sha256]));
    const problems: string[] = [];
    if (new Set(envelope.baseline.files.map((f) => f.path)).size !== envelope.baseline.files.length) {
      problems.push('- duplicate path in baseline.files');
    }
    if (patchByPath.size !== patch.files.length) {
      problems.push('- duplicate path in candidate diff');
    }
    interface PreflightFile {
      path: string;
      abs: string;
      baselineSha: string;
      /** Текущее (baseline) содержимое — уходит в backup отката (только pending;
       * recovered берёт запись из backup прерванного прогона). */
      baselineContent?: string;
      postSha: string;
      content: string;
      state: 'pending' | 'recovered';
    }
    const files: PreflightFile[] = [];
    for (const base of envelope.baseline.files) {
      const content = patchByPath.get(base.path);
      if (content === undefined) {
        problems.push(`- ${base.path}: candidate diff does not cover this baseline file`);
        continue;
      }
      let abs: string;
      try {
        abs = resolveProjectFilePath(deps.baseDir, base.path);
      } catch (err) {
        problems.push(`- ${base.path}: ${(err as Error).message}`);
        continue;
      }
      let current: Buffer;
      try {
        current = await readFile(abs);
      } catch {
        problems.push(`- ${base.path}: baseline target file is missing`);
        continue;
      }
      const currentSha = sha256Of(current);
      const postSha = sha256Of(content);
      if (currentSha === base.sha256) {
        files.push({
          path: base.path,
          abs,
          baselineSha: base.sha256,
          baselineContent: current.toString('utf8'),
          postSha,
          content,
          state: 'pending',
        });
      } else if (currentSha === postSha) {
        // Уже записан незавершённым прогоном (сбой после записи/между записью и
        // журналом): дозавершение без перезаписи.
        files.push({ path: base.path, abs, baselineSha: base.sha256, postSha, content, state: 'recovered' });
      } else {
        problems.push(
          `- ${base.path}: stale baseline (expected sha256 ${base.sha256}, found ${currentSha}) — refusing without overwrite (REQ-08 AC)`
        );
      }
    }
    for (const p of patch.files) {
      if (!baselineByPath.has(p.path)) {
        problems.push(`- ${p.path}: diff touches a file outside baseline.files`);
      }
    }
    const expectedActive = canonicalActiveHash(
      envelope.baseline.files.map((f) => ({ path: f.path, sha256: sha256Of(patchByPath.get(f.path) ?? '') }))
    );
    if (expectedActive !== envelope.rollback.expected_active_sha256) {
      problems.push(
        `- declared rollback.expected_active_sha256 ${envelope.rollback.expected_active_sha256} does not match what this diff produces (${expectedActive})`
      );
    }
    if (problems.length > 0) {
      throw new UserFacingError(
        `Learning candidate ${envelope.change_id} failed preflight, nothing was written:\n` + problems.join('\n')
      );
    }

    // Backup предыдущего содержимого: записи для pending добавляются, для
    // recovered уже должны существовать (прерванный прогон писал их) — иначе
    // точный откат невозможен и состояние отказоопасно отклоняется.
    const backupPath = resolveProjectFilePath(deps.baseDir, envelope.rollback.previous_ref);
    const backupEntries = new Map<string, { path: string; content: string; sha256: string }>();
    try {
      const raw = JSON.parse((await readFile(backupPath)).toString('utf8')) as {
        files?: Array<{ path: string; content: string; sha256: string }>;
      };
      for (const e of raw.files ?? []) backupEntries.set(e.path, e);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new UserFacingError(
          `existing rollback backup at ${envelope.rollback.previous_ref} is unreadable: ${(err as Error).message}`
        );
      }
    }
    for (const f of files) {
      const existing = backupEntries.get(f.path);
      if (existing) {
        if (existing.sha256 !== f.baselineSha) {
          throw new UserFacingError(
            `rollback backup at ${envelope.rollback.previous_ref} holds sha256 ${existing.sha256} for ${f.path}, expected baseline ${f.baselineSha}; nothing was written`
          );
        }
        continue;
      }
      if (f.state === 'recovered') {
        throw new UserFacingError(
          `${f.path} carries the applied content of an interrupted run, but the rollback backup at ${envelope.rollback.previous_ref} has no baseline entry for it; nothing was written`
        );
      }
      // state==='recovered' выброшен выше — здесь pending, baselineContent задан
      backupEntries.set(f.path, { path: f.path, content: f.baselineContent!, sha256: f.baselineSha });
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
        op: 'apply',
        change_id: envelope.change_id,
        plan: ['backup', 'write_file', 'verify', 'activate', 'applied'],
        input: {
          candidate_sha256: envelope.candidate.sha256,
          diff_ref: envelope.candidate.diff_ref,
          backup_ref: envelope.rollback.previous_ref,
          planned: envelope.baseline.files.map((f) => ({
            path: f.path,
            sha256_before: f.sha256,
            sha256_after: sha256Of(patchByPath.get(f.path)!),
          })),
        },
      },
      actor
    );
    deps.fault?.('op_started');

    // Backup (baseline и намерение операции — design §8.2) до первой мутации.
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, JSON.stringify({ files: [...backupEntries.values()] }, null, 2) + '\n', 'utf8');
    await stepEvent('backup', { backup_ref: envelope.rollback.previous_ref, files: backupEntries.size });
    deps.fault?.('backup');

    for (const f of files) {
      if (f.state === 'recovered') {
        await stepEvent('write_file', { path: f.path, sha256_after: f.postSha, recovered: true });
        continue;
      }
      await mkdir(dirname(f.abs), { recursive: true });
      await writeFile(f.abs, f.content, 'utf8');
      await stepEvent('write_file', { path: f.path, sha256_after: f.postSha });
      deps.fault?.('write_file');
    }

    // Фактические hashes (design §8.4): несовпадение — отказ с незакрытым
    // следом (повтор apply дозавершает).
    for (const f of files) {
      const nowSha = sha256Of(await readFile(f.abs));
      if (nowSha !== f.postSha) {
        throw new UserFacingError(
          `verification failed for ${f.path}: expected sha256 ${f.postSha}, found ${nowSha}; operation trace stays incomplete, repeat apply to recover`
        );
      }
    }
    await stepEvent('verify', { files: files.length });
    deps.fault?.('verify');

    const activation: ActivationRecord = {
      op_id: opId,
      activated_at: deps.clock.now().toISOString(),
      applied_by: actor,
      files: envelope.baseline.files.map((f) => ({
        path: f.path,
        sha256_after: sha256Of(patchByPath.get(f.path)!),
      })),
      backup_ref: envelope.rollback.previous_ref,
      expected_active_sha256: expectedActive,
    };
    const updated = { ...envelope, phase: 'active' as const, activation };
    await deps.store.update(obj.id, {
      body: JSON.stringify(updated, null, 2),
      title: `Learning candidate ${envelope.change_id} (active)`,
    });
    await stepEvent('activate');
    deps.fault?.('activate');

    await appendLearningEvent(deps, 'memory.learning.applied', { change_id: envelope.change_id }, actor);
    deps.fault?.('applied');

    return {
      change_id: envelope.change_id,
      applied: files.filter((f) => f.state === 'pending').map((f) => f.path),
      recovered: files.filter((f) => f.state === 'recovered').map((f) => f.path),
      activated: true,
      noop: false,
    };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
