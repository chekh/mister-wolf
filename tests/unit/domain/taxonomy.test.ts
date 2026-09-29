import { describe, it, expect } from 'vitest';
import {
  CORE_TAXONOMY,
  MEMORY_TYPES,
  DEPRECATED_TYPE_ALIASES,
  getDeclaration,
  subdirectoryFor,
  DEFAULT_CHARACTER_FACETS,
} from '../../../src/domain/memory-types.js';
import type { MemoryType, MemoryTypeDeclaration } from '../../../src/domain/memory-types.js';
import { ALLOWED_TRANSITIONS } from '../../../src/domain/governance.js';
import { targetPathFor } from '../../../src/adapters/fs/project-paths.js';

describe('CORE_TAXONOMY (волна 2.13 §5.1)', () => {
  it('MEMORY_TYPES ровно 7 в дословном составе', () => {
    expect(MEMORY_TYPES).toEqual(['rule', 'lesson', 'decision', 'thread', 'complaint', 'tool', 'note']);
  });

  it('covers every MEMORY_TYPES entry exactly once', () => {
    expect(CORE_TAXONOMY.map((d) => d.name).sort()).toEqual([...MEMORY_TYPES].sort());
  });

  it('every taxonomy declaration is placeable without adapter mapping', () => {
    for (const d of CORE_TAXONOMY) {
      if (d.layout === 'work-thread-file') {
        expect(targetPathFor('/base', { type: d.name, id: 'mem_x' })).toBe(
          '/base/.wolf/memory/threads/mem_x/WORK-THREAD.md'
        );
        continue;
      }
      expect(d.subdirShared ?? d.subdirThread, `${d.name} has a storage dir`).toBeTruthy();
      if (d.subdirShared) {
        expect(targetPathFor('/base', { type: d.name, id: 'mem_x' })).toBe(
          `/base/.wolf/memory/shared/${d.subdirShared}/mem_x.md`
        );
      }
      if (d.subdirThread) {
        expect(targetPathFor('/base', { type: d.name, id: 'mem_x', thread: 'mem_t' })).toBe(
          `/base/.wolf/memory/threads/mem_t/${d.subdirThread}/mem_x.md`
        );
      }
    }
  });

  it('every lifecycle status exists in MemoryStatus canon', () => {
    for (const d of CORE_TAXONOMY) {
      for (const s of d.lifecycle) {
        expect(ALLOWED_TRANSITIONS, `${d.name}: ${s}`).toHaveProperty(s);
      }
    }
  });

  it('thread lifecycle поглощает blocker/info_request/question (§5.2)', () => {
    expect(getDeclaration('thread').lifecycle).toEqual([
      'active',
      'paused',
      'blocked',
      'waiting_answer',
      'open',
      'completed',
      'archived',
    ]);
    expect(getDeclaration('thread').layout).toBe('work-thread-file');
  });

  it('subdir mapping дословно по таблице §5.1', () => {
    expect(subdirectoryFor('rule', 'shared')).toBe('rules');
    expect(subdirectoryFor('rule', 'thread')).toBeNull();
    expect(subdirectoryFor('lesson', 'thread')).toBe('lessons');
    expect(subdirectoryFor('note', 'shared')).toBe('notes');
    expect(subdirectoryFor('complaint', 'shared')).toBe('complaints');
    expect(subdirectoryFor('tool', 'shared')).toBe('tools');
  });

  it('note объявляет facet enum из дефолтного словаря §5.3', () => {
    expect(getDeclaration('note').fields?.facet).toEqual({ kind: 'enum', values: DEFAULT_CHARACTER_FACETS });
    expect(DEFAULT_CHARACTER_FACETS).toEqual([
      'howto',
      'pitfall',
      'context',
      'metric',
      'history',
      'legacy',
      'constraint',
    ]);
  });
});

describe('getDeclaration: C12-гвард старых типов (§5.4)', () => {
  it('старый тип → UserFacingError с подсказкой нового типа+фасета', () => {
    expect(() => getDeclaration('observation')).toThrow(
      /Type "observation" was removed in 2\.13: use "note" \(facet: legacy\)/
    );
    expect(() => getDeclaration('work-thread')).toThrow(/use "thread"/);
    expect(() => getDeclaration('blocker')).toThrow(/use "note" \(facet: pitfall\)/);
  });

  it('неизвестный тип — прежний гвард со списком 7 типов', () => {
    expect(() => getDeclaration('notaftype')).toThrow(
      /Unknown memory type "notaftype"\. Valid types: rule, lesson, decision, thread, complaint, tool, note/
    );
  });

  it('extra (project-типы) по-прежнему находятся', () => {
    const postmortem: MemoryTypeDeclaration = {
      name: 'postmortem' as MemoryType,
      lifecycle: ['open', 'resolved'],
      subdirThread: 'postmortems',
      subdirShared: null,
    };
    expect(getDeclaration('postmortem' as MemoryType, [postmortem]).subdirThread).toBe('postmortems');
    // core wins when extra shadows a core type
    const shadow = { ...postmortem, name: 'decision' as MemoryType };
    expect(getDeclaration('decision', [shadow]).subdirShared).toBe('decisions');
  });
});

describe('DEPRECATED_TYPE_ALIASES (карта §5.4)', () => {
  it('содержит ровно 20 поглощаемых строк; identity и task-brief не входят', () => {
    const keys = Object.keys(DEPRECATED_TYPE_ALIASES).sort();
    expect(keys).toHaveLength(20);
    for (const identity of ['rule', 'lesson', 'decision', 'complaint', 'tool', 'task-brief']) {
      expect(keys, identity).not.toContain(identity);
    }
  });

  it('каждая строка указывает на выживший тип и несёт subdir старого типа', () => {
    for (const [oldType, spec] of Object.entries(DEPRECATED_TYPE_ALIASES)) {
      expect(MEMORY_TYPES, oldType).toContain(spec.target);
      expect(spec.subdirThread === null || typeof spec.subdirThread === 'string').toBe(true);
      expect(spec.subdirShared === null || typeof spec.subdirShared === 'string').toBe(true);
    }
  });

  it('выборочные строки карты дословно', () => {
    expect(DEPRECATED_TYPE_ALIASES['work-thread']).toEqual({
      target: 'thread',
      subdirThread: null,
      subdirShared: null,
    });
    expect(DEPRECATED_TYPE_ALIASES.blocker).toEqual({
      target: 'note',
      facet: 'pitfall',
      subdirThread: 'blockers',
      subdirShared: 'blockers',
    });
    expect(DEPRECATED_TYPE_ALIASES['call-injection']).toEqual({
      target: 'note',
      facet: 'howto',
      subdirThread: null,
      subdirShared: 'calls',
    });
  });
});

describe('mergeTaxonomy (no config.yaml)', () => {
  it('returns core taxonomy untouched when config is null', async () => {
    const { mergeTaxonomy } = await import('../../../src/domain/taxonomy.js');
    const { types } = mergeTaxonomy(null);
    expect(types.size).toBe(MEMORY_TYPES.length);
    expect(types.get('note')).toBeDefined();
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
  it('кастомный facets.character подменяет enum фасета note (§5.3)', async () => {
    const { mergeTaxonomy } = await import('../../../src/domain/taxonomy.js');
    const character = ['howto', 'pitfall', 'context', 'metric', 'history', 'legacy', 'constraint', 'extra'];
    const { types } = mergeTaxonomy({
      artifact_sources: [],
      rawCoreBlock: null,
      projectTypes: [],
      facets: { character },
    });
    expect(types.get('note')?.fields?.facet).toEqual({ kind: 'enum', values: character });
    // core-декларация не мутирована
    expect(getDeclaration('note').fields?.facet).toEqual({ kind: 'enum', values: DEFAULT_CHARACTER_FACETS });
  });
});

describe('renderConfigYaml', () => {
  it('is deterministic: two renders are byte-identical', async () => {
    const { renderConfigYaml } = await import('../../../src/adapters/fs/config-file.js');
    const { generateCoreConfigBlock } = await import('../../../src/domain/taxonomy.js');
    const a = renderConfigYaml(null);
    const b = renderConfigYaml(null);
    expect(a).toBe(b);
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
  });
});
