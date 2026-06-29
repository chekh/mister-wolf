import { describe, it, expect } from 'vitest';
import { objectDirForType } from '../../../src/adapters/fs/project-paths.js';
import { MemoryType } from '../../../src/domain/memory-types.js';

describe('project-paths', () => {
  it('throws for an unknown memory type', () => {
    expect(() => objectDirForType('/base', 'invalid' as MemoryType)).toThrow('Unknown memory type: invalid');
  });

  it('returns a directory for each known memory type', () => {
    const knownTypes: MemoryType[] = [
      'document',
      'decision',
      'lesson',
      'observation',
      'session-summary',
      'open-question',
      'context',
      'work-thread',
      'info-request',
      'article',
    ];
    const expectedDir: Record<MemoryType, string> = {
      document: 'documents',
      decision: 'decisions',
      lesson: 'lessons',
      observation: 'observations',
      'session-summary': 'sessions',
      'open-question': 'questions',
      context: 'context',
      'work-thread': 'threads',
      'info-request': 'info-requests',
      article: 'articles',
    };
    for (const type of knownTypes) {
      expect(objectDirForType('/base', type)).toContain(expectedDir[type]);
    }
  });
});
