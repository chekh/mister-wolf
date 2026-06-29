import { describe, it, expect } from 'vitest';
import { InfoRequestSchema } from '../../../src/domain/schemas/info-request-schema.js';

const baseInfoRequest = {
  id: 'mem_20260630_info_c3d4',
  type: 'info-request',
  title: 'Clarify rate-limiting policy',
  status: 'open',
  review_state: 'proposed',
  confidence: 'medium',
  importance: 0.7,
  created_at: '2026-06-30T11:00:00Z',
  updated_at: '2026-06-30T11:00:00Z',
  created_by: 'user:chekh',
  schema_version: 1,
  source: { kind: 'manual' },
  related: {},
  tags: [],
  superseded_by: null,
  body: '',
  thread: 'mem_20260630_thread_a1b2',
  question: 'What is the rate limit per IP?',
  detour_reason: 'Current docs are ambiguous',
  needed_for: ['Implement throttling'],
  expected_answer: ['Requests per minute', 'Burst behavior'],
  preliminary_answer: '',
};

describe('InfoRequestSchema', () => {
  it('validates a valid info-request', () => {
    const result = InfoRequestSchema.safeParse(baseInfoRequest);
    expect(result.success).toBe(true);
  });

  it('rejects when detour_reason is missing', () => {
    const { detour_reason: _, ...invalid } = baseInfoRequest;
    const result = InfoRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
