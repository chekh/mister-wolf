// src/domain/schemas/learning-activation-schema.ts
import { createHash } from 'crypto';
import { z } from 'zod';

/**
 * 3.2.0 T-06 (REQ-08, design §5/§8): схемы приёмки, активации и точного patch
 * кандидата изменения — их фиксирует apply-контур (learning-change-schema:
 * acceptance/activation при создании кандидата равны null и типизируются здесь).
 *
 * Цепочка идентичности применяемой версии (все звенья проверяет apply ДО первой
 * записи, NFR-03):
 *   acceptance.accepted_candidate_sha256 = envelope.candidate.sha256
 *   envelope.candidate.sha256            = sha256(diff-файла по candidate.diff_ref)
 *   envelope.baseline.files[].sha256     = sha256(текущих целевых файлов)
 *   envelope.rollback.expected_active_sha256 = canonicalActiveHash(post-hash'ей)
 */

const nonEmpty = z.string().min(1);
/** Hash-поля: sha256 в нижнем hex (прецедент learning-change-schema). */
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'expected 64-char lowercase sha256 hex');
const iso = z.string().datetime();

/**
 * Решение владельца/ведущего (REQ-08). verdict_ref обязателен: apply применяет
 * только кандидата с непустой независимой проверкой (design §8.1); заголовок и
 * created_by полномочием не являются (design §6).
 */
export const AcceptanceRecordSchema = z.strictObject({
  decision: z.literal('accepted'),
  accepted_by: nonEmpty,
  accepted_at: iso,
  /** Идентичность принятой версии: hash ровно того diff, который принят. */
  accepted_candidate_sha256: sha256Hex,
  /** Ссылка на вердикт/evidence независимой проверки (trial result, review). */
  verdict_ref: nonEmpty,
});
export type AcceptanceRecord = z.infer<typeof AcceptanceRecordSchema>;

/** Фактически применённая версия (design §8.4): post-hash'и записанных файлов. */
export const ActivationRecordSchema = z.strictObject({
  op_id: nonEmpty,
  activated_at: iso,
  applied_by: nonEmpty,
  files: z.array(z.strictObject({ path: nonEmpty, sha256_after: sha256Hex })).min(1),
  /** Backup предыдущего содержимого (== envelope.rollback.previous_ref). */
  backup_ref: nonEmpty,
  expected_active_sha256: sha256Hex,
});
export type ActivationRecord = z.infer<typeof ActivationRecordSchema>;

/**
 * Содержимое diff-файла (candidate.diff_ref): точные новые содержимые целевых
 * файлов. Формат — полная замена содержимого (не контекстный unified diff):
 * применение детерминировано byte-в-byte, post-hash вычислим до записи, откат
 * возвращает точный предыдущий hash (REQ-08 AC, NFR-03). Ссылки на файлы —
 * относительные пути проекта.
 */
export const LearningPatchSchema = z.strictObject({
  files: z.array(z.strictObject({ path: nonEmpty, content: z.string() })).min(1),
});
export type LearningPatch = z.infer<typeof LearningPatchSchema>;

/** Backup предыдущего содержимого по previous_ref: пишет apply до первой записи. */
export const LearningBackupSchema = z.strictObject({
  files: z.array(z.strictObject({ path: nonEmpty, content: z.string(), sha256: sha256Hex })).min(1),
});
export type LearningBackup = z.infer<typeof LearningBackupSchema>;

export function sha256Of(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Активный hash набора post-hash'ей: канонический JSON (sorted by path, ключи
 * отсортированы) → sha256. Определяет ожидание rollback.expected_active_sha256. */
export function canonicalActiveHash(files: ReadonlyArray<{ path: string; sha256: string }>): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const canonical = JSON.stringify(sorted.map((f) => ({ path: f.path, sha256: f.sha256 })));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
