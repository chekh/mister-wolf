import { describe, it, expect } from 'vitest';
import {
  routeReviewDepth,
  BLAST_RADIUS_REVIEW,
  BLAST_RADIUS_ATTENTION,
  REVIEW_FILES_THRESHOLD,
  REVIEW_LINES_THRESHOLD,
} from '../../../src/domain/review-depth.js';

// Ф25 (D3.4): AFlow-минимум — детерминированная таблица эвристик глубины ревью,
// гейт человека (S25-02), изменение эвристик — только человеком (§3 «структура»).

describe('routeReviewDepth (Ф25)', () => {
  it('плоская схема для простой задачи', () => {
    const d = routeReviewDepth({ taskType: 'bugfix', files: 2, lines: 80 });
    expect(d.depth).toBe('flat');
    expect(d.decisionBy).toBe('human');
    expect(d.reasons.length).toBeGreaterThan(0);
  });

  it('read-only зона → review-council (§5, §15)', () => {
    const d = routeReviewDepth({ touchesReadOnlyZone: true, files: 1, lines: 10 });
    expect(d.depth).toBe('review-council');
    expect(d.reasons.some((r) => r.includes('read-only'))).toBe(true);
  });

  it('безопасность → review-council', () => {
    expect(routeReviewDepth({ security: true }).depth).toBe('review-council');
  });

  it(`blast radius ≥ ${BLAST_RADIUS_REVIEW} → review-council; зона внимания ${BLAST_RADIUS_ATTENTION} — flat с пометкой`, () => {
    expect(routeReviewDepth({ blastRadius: BLAST_RADIUS_REVIEW }).depth).toBe('review-council');
    const mid = routeReviewDepth({ blastRadius: BLAST_RADIUS_ATTENTION });
    expect(mid.depth).toBe('flat');
    expect(mid.reasons.some((r) => r.includes('attention'))).toBe(true);
  });

  it(`объём: >${REVIEW_FILES_THRESHOLD} файлов или >${REVIEW_LINES_THRESHOLD} строк → review-council`, () => {
    expect(routeReviewDepth({ files: REVIEW_FILES_THRESHOLD + 1 }).depth).toBe('review-council');
    expect(routeReviewDepth({ lines: REVIEW_LINES_THRESHOLD + 1 }).depth).toBe('review-council');
    expect(routeReviewDepth({ files: REVIEW_FILES_THRESHOLD, lines: REVIEW_LINES_THRESHOLD }).depth).toBe('flat');
  });

  it('эксперимент без детерминированной метрики → review-council (§3 GEPA-ограничение)', () => {
    expect(routeReviewDepth({ taskType: 'experiment', hasDeterministicMetric: false }).depth).toBe('review-council');
    expect(routeReviewDepth({ taskType: 'experiment', hasDeterministicMetric: true }).depth).toBe('flat');
  });

  it('несколько признаков — все причины перечислены', () => {
    const d = routeReviewDepth({ security: true, touchesReadOnlyZone: true, files: 10 });
    expect(d.depth).toBe('review-council');
    expect(d.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('пустые признаки — flat с обоснованием', () => {
    const d = routeReviewDepth({});
    expect(d.depth).toBe('flat');
    expect(d.reasons[0]).toContain('flat');
  });
});
