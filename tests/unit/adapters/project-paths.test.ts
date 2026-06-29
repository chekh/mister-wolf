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
    ];
    for (const type of knownTypes) {
      const expected =
        type === 'session-summary'
          ? 'sessions'
          : type === 'open-question'
            ? 'questions'
            : type === 'context'
              ? 'context'
              : `${type}s`;
      expect(objectDirForType('/base', type)).toContain(expected);
    }
  });
});
