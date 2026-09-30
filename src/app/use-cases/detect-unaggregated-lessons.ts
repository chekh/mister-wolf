import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { Relation } from '../../domain/schemas/relation-schema.js';

/** 2.14 §7.2: порог зрелости кластера по числу неагрегированных уроков. */
export const MATURITY_MIN_COUNT = 3;

/** 2.14 §7.2: порог зрелости по возрасту старейшего урока (7 дней, включительно). */
export const MATURITY_AGE_MS = 7 * 86_400_000;

export interface UnaggregatedLessons {
  total: number;
  mature: number;
}

/**
 * 2.14 §7.2: детектор неагрегированных уроков (чистая функция, без IO;
 * переиспользуется recap §7.4 и call-banner §7.1).
 *
 * Неагрегированный = lesson в active без «живого» ребра пары агрегации:
 * для урока L ребро — строка relations, где (aggregated_in && subject===L.id)
 * или (aggregates && object===L.id); второй конец — id агрегата. Ребро живое
 * ⇔ агрегат найден в `all` и его статус proposed|active. Рёбра от
 * rejected/archived агрегатов и рёбра с отсутствующим агрегатом игнорируются —
 * отклонённый кластер снова виден как неагрегированный («отказ бесплатен»).
 *
 * Входящие rows уже отфильтрованы адаптером от removed:true (JsonlRelationLog,
 * last-write-wins) — здесь доверчивое чтение, без повторной фильтрации.
 *
 * Зрелость пер-урока: total >= MATURITY_MIN_COUNT (кластер созрел числом)
 * или возраст урока >= MATURITY_AGE_MS. Константы в коде, не конфиг
 * (открытый вопрос §14 — принят дефолт).
 */
export function detectUnaggregatedLessons(all: MemoryObject[], relations: Relation[], now: Date): UnaggregatedLessons {
  const byId = new Map(all.map((o) => [o.id, o]));
  const aggregated = new Set<string>();
  for (const r of relations) {
    const isForward = r.predicate === 'aggregates';
    const isInverse = r.predicate === 'aggregated_in';
    if (!isForward && !isInverse) continue;
    const agg = byId.get(isForward ? r.subject : r.object);
    if (agg && (agg.status === 'proposed' || agg.status === 'active')) {
      aggregated.add(isForward ? r.object : r.subject);
    }
  }
  const lessons = all.filter((o) => o.type === 'lesson' && o.status === 'active' && !aggregated.has(o.id));
  const mature = lessons.filter(
    (l) => lessons.length >= MATURITY_MIN_COUNT || now.getTime() - Date.parse(l.created_at) >= MATURITY_AGE_MS
  ).length;
  return { total: lessons.length, mature };
}
