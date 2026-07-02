import { describe, it, expect } from 'vitest';
import { RuleSchema } from '../../../src/domain/schemas/rule-schema.js';

describe('RuleSchema', () => {
  it('accepts a valid project rule', () => {
    const result = RuleSchema.safeParse({
      id: 'mem_test',
      type: 'rule',
      title: 'Always use strict mode',
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.9,
      created_at: '2026-07-02T10:00:00Z',
      updated_at: '2026-07-02T10:00:00Z',
      created_by: 'user:cli',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: ['typescript'],
      superseded_by: null,
      body: 'Enable TypeScript strict mode in all tsconfig files.',
      memory_class: 'canonical',
      truth_role: 'source_of_truth',
      lifetime: 'long_term',
      scope: 'project',
      applies_to: ['src/**/*.ts'],
      trigger: 'when creating tsconfig',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a rule without scope', () => {
    const result = RuleSchema.safeParse({
      id: 'mem_test',
      type: 'rule',
      title: 'Always use strict mode',
      status: 'active',
      review_state: 'accepted',
      confidence: 'high',
      importance: 0.9,
      created_at: '2026-07-02T10:00:00Z',
      updated_at: '2026-07-02T10:00:00Z',
      created_by: 'user:cli',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      body: '',
      memory_class: 'canonical',
      truth_role: 'source_of_truth',
      lifetime: 'long_term',
    });
    expect(result.success).toBe(false);
  });
});
