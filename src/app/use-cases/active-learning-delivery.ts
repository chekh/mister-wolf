// src/app/use-cases/active-learning-delivery.ts
import type { MemoryStore } from '../../ports/memory-store.port.js';
import { tryParseLearningChangeEnvelope } from '../../domain/schemas/learning-change-schema.js';
import { ActivationRecordSchema } from '../../domain/schemas/learning-activation-schema.js';

/**
 * 3.2.0 T-06, контрактная часть доставки (REQ-08 AC, S-16): «новое поручение
 * получает принятую версию; принятый кандидат не изменяет уже выполняющееся
 * поручение». Read-only резолвер: версия знания привязывается к НОВОМУ поручению
 * в момент его создания через delivered_ref (точный active-hash); этот код не
 * читает и не мутирует уже идущие поручения — ретроактивной доставки нет по
 * построению. Живой host-канал подстановки в новую сессию — контур доставки
 * (T-09/T-10, живая проверка T-12); здесь только контракт активной версии.
 */

export interface ActiveLearningVersion {
  change_id: string;
  /** Hash принятого diff — идентичность применённой версии. */
  candidate_sha256: string;
  /** Точный hash активного состояния ( == rollback.expected_active_sha256). */
  active_sha256: string;
  activated_at: string;
  /** Ссылка для привязки к новому поручению: learning:<change_id>@<hash12>. */
  delivered_ref: string;
}

/** Активные (phase=active) кандидаты проекта, старшие по activated_at последними. */
export async function resolveActiveLearningVersions(
  deps: { store: MemoryStore },
  projectId: string
): Promise<ActiveLearningVersion[]> {
  const proposals = await deps.store.list({ facet: 'proposal' });
  const versions: ActiveLearningVersion[] = [];
  for (const obj of proposals) {
    const envelope = tryParseLearningChangeEnvelope(obj);
    if (!envelope || envelope.phase !== 'active' || envelope.scope.project_id !== projectId) continue;
    const activation = ActivationRecordSchema.safeParse(envelope.activation);
    if (!activation.success) continue;
    versions.push({
      change_id: envelope.change_id,
      candidate_sha256: envelope.candidate.sha256,
      active_sha256: activation.data.expected_active_sha256,
      activated_at: activation.data.activated_at,
      delivered_ref: `learning:${envelope.change_id}@${activation.data.expected_active_sha256.slice(0, 12)}`,
    });
  }
  return versions.sort((a, b) => a.activated_at.localeCompare(b.activated_at));
}
