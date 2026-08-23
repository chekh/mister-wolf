import { describe, it, expect } from 'vitest';
import { objectDirForType, targetPathFor } from '../../../src/adapters/fs/project-paths.js';
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
      'blocker',
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
      blocker: 'blockers',
    };
    for (const type of knownTypes) {
      expect(objectDirForType('/base', type)).toContain(expectedDir[type]);
    }
  });
});

describe('targetPathFor (layout v2)', () => {
  it('work-thread goes to threads/<id>/WORK-THREAD.md', () => {
    expect(targetPathFor('/base', { type: 'work-thread', id: 'mem_t1' })).toBe(
      '/base/.wolf/memory/threads/mem_t1/WORK-THREAD.md'
    );
  });

  it('threaded object goes to threads/<tid>/<subdir>/', () => {
    expect(targetPathFor('/base', { type: 'task-brief', id: 'mem_b1', thread: 'mem_t1' })).toBe(
      '/base/.wolf/memory/threads/mem_t1/tasks/mem_b1.md'
    );
  });

  it('shared-only type goes to shared/<subdir>/', () => {
    expect(targetPathFor('/base', { type: 'rule', id: 'mem_r1' })).toBe('/base/.wolf/memory/shared/rules/mem_r1.md');
    expect(targetPathFor('/base', { type: 'decision', id: 'mem_d1' })).toBe(
      '/base/.wolf/memory/shared/decisions/mem_d1.md'
    );
  });
});
