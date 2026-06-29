import { describe, it, expect } from 'vitest';
import { ArticleSchema } from '../../../src/domain/schemas/article-schema.js';

const baseArticle = {
  id: 'mem_20260630_article_e5f6',
  type: 'article',
  title: 'Rate-limiting policy summary',
  status: 'active',
  review_state: 'accepted',
  confidence: 'high',
  importance: 0.85,
  created_at: '2026-06-30T12:00:00Z',
  updated_at: '2026-06-30T12:00:00Z',
  created_by: 'user:chekh',
  schema_version: 1,
  source: { kind: 'manual' },
  related: {},
  tags: [],
  superseded_by: null,
  body: '',
  thread: 'mem_20260630_thread_a1b2',
  summary: 'The API allows 60 requests per minute per IP.',
  answers: ['60 req/min', 'No burst'],
  supports: ['doc/limits'],
  evidence: ['config/rate-limits.yaml'],
};

describe('ArticleSchema', () => {
  it('validates a valid article', () => {
    const result = ArticleSchema.safeParse(baseArticle);
    expect(result.success).toBe(true);
  });

  it('rejects when summary is missing', () => {
    const { summary: _, ...invalid } = baseArticle;
    const result = ArticleSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
