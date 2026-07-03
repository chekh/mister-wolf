import { describe, it, expect } from 'vitest';
import { shouldSummarize } from '../../../src/app/use-cases/should-summarize.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeSummary(date: string): MemoryObject {
  return {
    id: 'mem_summary',
    type: 'session-summary',
    title: 'Summary',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: date,
    updated_at: date,
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'session' },
    related: { files: [], docs: [], decisions: [] },
    tags: ['session-summary'],
    superseded_by: null,
    body: '',
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
  };
}

describe('shouldSummarize', () => {
  it('returns true when no recent summary exists', () => {
    expect(shouldSummarize([], new Date('2026-07-02T12:00:00Z'))).toBe(true);
  });

  it('returns false when a summary exists within 5 minutes', () => {
    const objects = [makeSummary('2026-07-02T11:58:00Z')];
    expect(shouldSummarize(objects, new Date('2026-07-02T12:00:00Z'))).toBe(false);
  });

  it('returns true when the latest summary is older than 5 minutes', () => {
    const objects = [makeSummary('2026-07-02T11:54:00Z')];
    expect(shouldSummarize(objects, new Date('2026-07-02T12:00:00Z'))).toBe(true);
  });
});
