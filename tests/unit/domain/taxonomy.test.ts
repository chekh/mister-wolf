import { describe, it, expect } from 'vitest';
import { CORE_TAXONOMY, MEMORY_TYPES, getDeclaration, subdirectoryFor } from '../../../src/domain/memory-types.js';
import { ALLOWED_TRANSITIONS } from '../../../src/domain/governance.js';

describe('CORE_TAXONOMY', () => {
  it('covers every MEMORY_TYPES entry exactly once', () => {
    expect(CORE_TAXONOMY.map((d) => d.name).sort()).toEqual([...MEMORY_TYPES].sort());
  });
  it('every lifecycle status exists in MemoryStatus canon', () => {
    for (const d of CORE_TAXONOMY) {
      for (const s of d.lifecycle) {
        expect(ALLOWED_TRANSITIONS, `${d.name}: ${s}`).toHaveProperty(s);
      }
    }
  });
  it('orchestration lifecycles match concept §6', () => {
    expect(getDeclaration('task-brief').lifecycle).toEqual(['active', 'completed', 'superseded']);
    expect(getDeclaration('council-question').lifecycle).toEqual(['open', 'answered', 'archived']);
    expect(getDeclaration('escalation').lifecycle).toEqual(['open', 'resolved', 'archived']);
  });
  it('subdir mapping follows concept §1.4', () => {
    expect(subdirectoryFor('task-brief', 'thread')).toBe('tasks');
    expect(subdirectoryFor('rule', 'shared')).toBe('rules');
    expect(subdirectoryFor('rule', 'thread')).toBeNull();
    expect(getDeclaration('work-thread').layout).toBe('work-thread-file');
  });
});
