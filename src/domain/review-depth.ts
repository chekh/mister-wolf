/**
 * Ф25 (AFlow-минимум): эвристики роутинга глубины ревью — детерминированная
 * таблица признаков, БЕЗ поиска топологии (M25-01). Спека §3 класс «структура»,
 * §15 матрица, §16 blast radius 0.2/0.6.
 *
 * Выход — РЕКОМЕНДАЦИЯ с обоснованием; решение принимает человек/координатор
 * (гейт человека, S25-02). Изменение самих эвристик — только человеком
 * (класс «структура», §3): контур самообучения эту таблицу не трогает.
 */

export interface TaskTraits {
  /** Изменение касается read-only зоны (гейты, логи, скелет — §5). */
  touchesReadOnlyZone?: boolean;
  /** Безопасность: доверенные границы, секреты, права доступа. */
  security?: boolean;
  /** Blast radius 0..1 (оценка радиуса изменений; пороги §16). */
  blastRadius?: number;
  /** Число файлов в изменении. */
  files?: number;
  /** Число строк в изменении. */
  lines?: number;
  /** Тип задачи. */
  taskType?: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'experiment';
  /** Есть ли детерминированная метрика качества (ограничение GEPA, §3). */
  hasDeterministicMetric?: boolean;
}

export interface RouteDecision {
  depth: 'flat' | 'review-council';
  reasons: string[];
  /** Решение — за человеком/координатором: это рекомендация, не приказ (S25-02). */
  decisionBy: 'human';
}

/** Высокий blast radius — усиленное ревью (§16: порог 0.6). */
export const BLAST_RADIUS_REVIEW = 0.6;
/** Средний blast radius — допустимо flat, но с пометкой (§16: порог 0.2). */
export const BLAST_RADIUS_ATTENTION = 0.2;
/** Пороги объёма изменения: усиленное ревью при >5 файлов или >500 строк
 * (строки — COMPLEX-граница оркестрации; файлы — расширенный порог:
 * 3 файла уже требуют воркеров, council — с запасом; [ВА], калибровка). */
export const REVIEW_FILES_THRESHOLD = 5;
export const REVIEW_LINES_THRESHOLD = 500;

export function routeReviewDepth(traits: TaskTraits): RouteDecision {
  const reasons: string[] = [];
  let review = false;

  if (traits.touchesReadOnlyZone) {
    review = true;
    reasons.push('read-only зона (гейты/логи/скелет): изменения только через человека (§5, §15)');
  }
  if (traits.security) {
    review = true;
    reasons.push('безопасность: доверенные границы требуют council-ревью');
  }
  if (traits.blastRadius !== undefined && traits.blastRadius >= BLAST_RADIUS_REVIEW) {
    review = true;
    reasons.push(`blast radius ${traits.blastRadius} ≥ ${BLAST_RADIUS_REVIEW} — высокий радиус (§16)`);
  }
  if ((traits.files ?? 0) > REVIEW_FILES_THRESHOLD || (traits.lines ?? 0) > REVIEW_LINES_THRESHOLD) {
    review = true;
    reasons.push(
      `объём: ${traits.files ?? 0} файлов / ${traits.lines ?? 0} строк — больше порога ${REVIEW_FILES_THRESHOLD}/${REVIEW_LINES_THRESHOLD}`
    );
  }
  if (traits.taskType === 'experiment' && traits.hasDeterministicMetric === false) {
    review = true;
    reasons.push('эксперимент без детерминированной метрики — GEPA-скоринг неприменим, только гейт человека (§3)');
  }

  if (!review && traits.blastRadius !== undefined && traits.blastRadius >= BLAST_RADIUS_ATTENTION) {
    reasons.push(
      `blast radius ${traits.blastRadius} в зоне внимания (≥${BLAST_RADIUS_ATTENTION}) — ревьюеру проверить радиус`
    );
  }
  if (reasons.length === 0) reasons.push('признаков риска нет — плоская схема достаточна');

  return { depth: review ? 'review-council' : 'flat', reasons, decisionBy: 'human' };
}
