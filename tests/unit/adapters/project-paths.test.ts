import { describe, it, expect } from 'vitest';
import { targetPathFor } from '../../../src/adapters/fs/project-paths.js';
import type { MemoryType, MemoryTypeDeclaration } from '../../../src/domain/memory-types.js';

const incident: MemoryTypeDeclaration = {
  name: 'incident' as MemoryType,
  lifecycle: ['open', 'archived'],
  subdirThread: null,
  subdirShared: 'incidents',
};

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

  it('project type with extraDeclarations resolves shared path', () => {
    expect(targetPathFor('/base', { type: 'incident', id: 'mem_i1' }, [incident])).toBe(
      '/base/.wolf/memory/shared/incidents/mem_i1.md'
    );
  });

  it('project type with thread subdir resolves thread path and shared fallback', () => {
    const postmortem: MemoryTypeDeclaration = {
      name: 'postmortem' as MemoryType,
      lifecycle: ['open', 'resolved'],
      subdirThread: 'postmortems',
      subdirShared: null,
    };
    expect(targetPathFor('/base', { type: 'postmortem', id: 'mem_p1', thread: 'mem_t1' }, [postmortem])).toBe(
      '/base/.wolf/memory/threads/mem_t1/postmortems/mem_p1.md'
    );
    expect(targetPathFor('/base', { type: 'postmortem', id: 'mem_p1' }, [postmortem])).toBe(
      '/base/.wolf/memory/shared/postmortems/mem_p1.md'
    );
  });

  it('unknown type still throws even with unrelated extraDeclarations', () => {
    expect(() => targetPathFor('/base', { type: 'nope', id: 'mem_x' }, [incident])).toThrow(/No taxonomy declaration/);
  });
});
