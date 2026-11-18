// src/domain/learning-signals.ts
import { createHash } from 'crypto';
import { MemoryObject } from './schemas/memory-object-schema.js';
import { LEARNING_CHANGE_TAG } from './schemas/learning-change-schema.js';

/**
 * 3.2.0 T-05 (REQ-03, design §7): что является сигналом адресной очереди.
 * Источники сигналов по REQ-03 — жалобы, уроки и наблюдения (note); rules/
 * decisions/threads и прочие типы сигналом не являются. Конверты кандидатов
 * (note/proposal с тегом wolf:learning-change:v1, T-04) — НЕ сигналы: их
 * фазовые переходы — жизненный цикл кандидата, а не новая работа очереди
 * (REQ-03: повторный просмотр набора без новых оснований не создаёт работу).
 */

export const LEARNING_SIGNAL_TYPES: ReadonlySet<string> = new Set(['complaint', 'lesson', 'note']);

/** Является ли memory-объект сигналом очереди (см. модульную docstring). */
export function isLearningSignal(obj: MemoryObject): boolean {
  if (!LEARNING_SIGNAL_TYPES.has(obj.type)) return false;
  if ((obj.tags ?? []).includes(LEARNING_CHANGE_TAG)) return false;
  return true;
}

/**
 * Ревизия содержимого сигнала — детерминированный sha256 изменяемых полей.
 * Равная ревизия при повторном индексировании того же содержимого не двигает
 * курсор и не создаёт due-работу (S-23: повтор принятого — курсор на месте);
 * изменение содержимого (новая ревизия) снова делает сигнал due (S-23).
 */
export function learningSignalRevision(obj: MemoryObject): string {
  return createHash('sha256').update([obj.type, obj.status, obj.title, obj.body].join('\u0000'), 'utf8').digest('hex');
}
