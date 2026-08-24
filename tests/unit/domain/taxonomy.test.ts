import { describe, it, expect } from 'vitest';
import { CORE_TAXONOMY, MEMORY_TYPES, getDeclaration, subdirectoryFor } from '../../../src/domain/memory-types.js';
import type { MemoryType } from '../../../src/domain/memory-types.js';
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
  it('orchestration lifecycles match concept \u00a76', () => {
    expect(getDeclaration('task-brief').lifecycle).toEqual(['active', 'completed', 'superseded']);
    expect(getDeclaration('council-question').lifecycle).toEqual(['open', 'answered', 'archived']);
    expect(getDeclaration('escalation').lifecycle).toEqual(['open', 'resolved', 'archived']);
  });
  it('subdir mapping follows concept \u00a71.4', () => {
    expect(subdirectoryFor('task-brief', 'thread')).toBe('tasks');
    expect(subdirectoryFor('rule', 'shared')).toBe('rules');
    expect(subdirectoryFor('rule', 'thread')).toBeNull();
    expect(getDeclaration('work-thread').layout).toBe('work-thread-file');
  });
});

describe('mergeTaxonomy (no config.yaml)', () => {
  it('returns core taxonomy untouched when config is null', async () => {
    const { mergeTaxonomy } = await import('../../../src/domain/taxonomy.js');
    const { types } = mergeTaxonomy(null);
    expect(types.size).toBe(MEMORY_TYPES.length);
    expect(types.get('task-brief')).toBeDefined();
  });
  it('rejects project type shadowing a core type', async () => {
    const { mergeTaxonomy } = await import('../../../src/domain/taxonomy.js');
    expect(() =>
      mergeTaxonomy({
        artifact_sources: [],
        rawCoreBlock: null,
        projectTypes: [{ name: 'decision', lifecycle: ['active'], subdirThread: 'x', subdirShared: null }],
      })
    ).toThrow(/cannot be overridden/);
  });
  it('accepts a legit project type', async () => {
    const { mergeTaxonomy } = await import('../../../src/domain/taxonomy.js');
    const { types } = mergeTaxonomy({
      artifact_sources: [],
      rawCoreBlock: null,
      projectTypes: [
        {
          name: 'postmortem' as MemoryType,
          lifecycle: ['open', 'resolved'],
          subdirThread: 'postmortems',
          subdirShared: null,
        },
      ],
    });
    expect(types.get('postmortem' as MemoryType)?.subdirThread).toBe('postmortems');
  });
});

describe('renderConfigYaml', () => {
  it('is deterministic: two renders are byte-identical', async () => {
    const { renderConfigYaml } = await import('../../../src/adapters/fs/config-file.js');
    const { generateCoreConfigBlock } = await import('../../../src/domain/taxonomy.js');
    const a = renderConfigYaml(null);
    const b = renderConfigYaml(null);
    expect(a).toBe(b);
    expect(a).toContain('task-brief');
    expect(Object.keys(generateCoreConfigBlock())).toHaveLength(MEMORY_TYPES.length);
  });
  it('preserves artifact_sources and project types alongside generated core', async () => {
    const { renderConfigYaml } = await import('../../../src/adapters/fs/config-file.js');
    const yaml = renderConfigYaml({
      artifact_sources: ['docs/'],
      rawCoreBlock: null,
      projectTypes: [
        {
          name: 'postmortem' as MemoryType,
          lifecycle: ['open', 'resolved'],
          subdirThread: 'postmortems',
          subdirShared: null,
        },
      ],
    });
    expect(yaml).toContain('- docs/');
    expect(yaml).toContain('postmortem');
    expect(yaml).toContain('postmortems');
    expect(yaml).toContain('task-brief');
  });
});

describe('call-injection type (phase 9)', () => {
  it('extends MEMORY_TYPES to 23 with call-injection last', () => {
    expect(MEMORY_TYPES).toHaveLength(23);
    expect(MEMORY_TYPES[MEMORY_TYPES.length - 1]).toBe('call-injection');
  });

  it('declares call-injection with operational lifecycle and shared calls dir', () => {
    const decl = getDeclaration('call-injection');
    expect(decl.lifecycle).toEqual(['active', 'superseded', 'archived']);
    expect(decl.subdirShared).toBe('calls');
    expect(decl.subdirThread).toBeNull();
  });

  it('relaxes info-request.thread to optional for project-level requests', () => {
    const thread = getDeclaration('info-request').fields?.thread;
    expect(thread).toEqual({ kind: 'string', optional: true });
  });
});
