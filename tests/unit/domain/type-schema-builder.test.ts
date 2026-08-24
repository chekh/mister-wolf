import { describe, it, expect } from 'vitest';
import { buildTypeSchema } from '../../../src/domain/type-schema-builder.js';
import { getDeclaration } from '../../../src/domain/memory-types.js';

const minimalBase = {
  id: 'mem_x',
  title: 't',
  review_state: 'accepted',
  confidence: 'medium',
  importance: 0.5,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  created_by: 'user:test',
  source: { kind: 'manual' },
  tags: [],
  superseded_by: null,
};

describe('buildTypeSchema', () => {
  it('rejects status outside type lifecycle', () => {
    const s = buildTypeSchema(getDeclaration('task-brief'));
    expect(() => s.parse({ ...minimalBase, type: 'task-brief', status: 'open' })).toThrow();
  });
  it('rejects missing declared field (executor)', () => {
    const s = buildTypeSchema(getDeclaration('task-brief'));
    expect(() => s.parse({ ...minimalBase, type: 'task-brief', status: 'active' })).toThrow(/executor/i);
  });
  it('accepts valid task-brief with executor+priority', () => {
    const s = buildTypeSchema(getDeclaration('task-brief'));
    const obj = s.parse({
      ...minimalBase,
      type: 'task-brief',
      status: 'active',
      executor: 'executor-lead',
      priority: 'high',
    });
    expect(obj.executor).toBe('executor-lead');
  });
  it('document-ref requires source.path', () => {
    const s = buildTypeSchema(getDeclaration('document-ref'));
    expect(() => s.parse({ ...minimalBase, type: 'document-ref', status: 'active', source: { kind: 'scan' } })).toThrow(
      /source\.path/
    );
  });
});
