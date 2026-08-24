import { describe, it, expect } from 'vitest';
import { recencyFactor, finalScore } from '../../../src/domain/solve/relevance.js';

const NOW = new Date('2026-08-24T00:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('relevance (D8)', () => {
  it('recency factor is 1.0 for fresh objects', () => {
    expect(recencyFactor(daysAgo(0), NOW)).toBeCloseTo(1.0, 5);
  });
  it('recency factor decays: 30 days -> ~0.5, 90 days -> ~0.25', () => {
    expect(recencyFactor(daysAgo(30), NOW)).toBeCloseTo(0.5, 2);
    expect(recencyFactor(daysAgo(90), NOW)).toBeCloseTo(0.25, 2);
  });
  it('finalScore multiplies fts/importance/confidence/recency (control example)', () => {
    // ftsScore=2, importance=0.5, confidence=high(1.2), ageDays=30(recency=0.5)
    // => 2 * (1+0.5) * 1.2 * 0.5 = 1.8
    expect(finalScore({ ftsScore: 2, importance: 0.5, confidence: 'high', updatedAt: daysAgo(30) }, NOW)).toBeCloseTo(
      1.8,
      5
    );
  });
});
