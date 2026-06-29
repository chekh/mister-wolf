import { describe, it, expect } from 'vitest';
import { WorkThreadSchema } from '../../../src/domain/schemas/thread-schema.js';

const baseThread = {
  id: 'mem_20260630_thread_a1b2',
  type: 'work-thread',
  title: 'Refactor auth flow',
  status: 'active',
  review_state: 'accepted',
  confidence: 'high',
  importance: 0.9,
  created_at: '2026-06-30T10:00:00Z',
  updated_at: '2026-06-30T10:00:00Z',
  created_by: 'user:chekh',
  schema_version: 1,
  source: { kind: 'manual' },
  related: {},
  tags: [],
  superseded_by: null,
  body: '',
  goal: 'Simplify the authentication flow',
  current_state: 'Draft in progress',
  next_steps: ['Extract helper', 'Update tests'],
};

describe('WorkThreadSchema', () => {
  it('validates a valid work-thread', () => {
    const result = WorkThreadSchema.safeParse(baseThread);
    expect(result.success).toBe(true);
  });

  it('rejects when goal is missing', () => {
    const { goal: _, ...invalid } = baseThread;
    const result = WorkThreadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
