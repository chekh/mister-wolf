import { describe, it, expect } from 'vitest';
import { targetPathFor } from '../../../src/adapters/fs/project-paths.js';

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
