import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import yaml from 'js-yaml';
import { planLayoutMigration, applyLayoutMigration } from '../../../src/adapters/fs/layout-migration.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { objectsDir } from '../../../src/adapters/fs/project-paths.js';

function legacyMd(id: string, overrides: Record<string, any>): string {
  const base = {
    id,
    type: 'decision',
    title: `Test ${id}`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    ...overrides,
  };
  const { body, ...fm } = base;
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body ?? 'Body text.'}`;
}

describe('layout-migration', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-migrate-'));
    // empty events/relations
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'memory', 'events.jsonl'), '');
    writeFileSync(join(dir, '.wolf', 'memory', 'relations.jsonl'), '');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('plans correct targets incl. document split and WORK-THREAD.md', async () => {
    const objs = objectsDir(dir);
    // decision without thread → shared/decisions/
    mkdirSync(join(objs, 'decisions'), { recursive: true });
    writeFileSync(join(objs, 'decisions', 'dec_1.md'), legacyMd('dec_1', { type: 'decision' }));
    // work-thread → threads/<id>/WORK-THREAD.md
    mkdirSync(join(objs, 'threads'), { recursive: true });
    writeFileSync(
      join(objs, 'threads', 'wt_1.md'),
      legacyMd('wt_1', { type: 'work-thread', goal: 'test goal', current_state: '', next_steps: [] })
    );
    // document WITH source.path → document-ref
    mkdirSync(join(objs, 'documents'), { recursive: true });
    writeFileSync(
      join(objs, 'documents', 'doc_1.md'),
      legacyMd('doc_1', { type: 'document', source: { kind: 'file', path: 'src/foo.ts' } })
    );
    // document WITHOUT path → document-native
    writeFileSync(
      join(objs, 'documents', 'doc_2.md'),
      legacyMd('doc_2', { type: 'document', source: { kind: 'manual' } })
    );

    const report = await planLayoutMigration(dir);

    expect(report.entries.find((e) => e.type === 'work-thread')?.to).toMatch(/WORK-THREAD\.md$/);
    expect(report.entries.find((e) => e.originalType === 'document' && e.type === 'document-ref')).toBeDefined();
    expect(report.entries.find((e) => e.type === 'document-native')).toBeDefined();
    expect(report.conflicts).toHaveLength(0);
  });

  it('is idempotent: second run reports nothing to migrate', async () => {
    const objs = objectsDir(dir);
    mkdirSync(join(objs, 'decisions'), { recursive: true });
    writeFileSync(join(objs, 'decisions', 'dec_1.md'), legacyMd('dec_1', { type: 'decision' }));
    mkdirSync(join(objs, 'documents'), { recursive: true });
    writeFileSync(
      join(objs, 'documents', 'doc_1.md'),
      legacyMd('doc_1', { type: 'document', source: { kind: 'file', path: 'src/foo.ts' } })
    );

    await applyLayoutMigration(dir);
    const second = await planLayoutMigration(dir);
    expect(second.total).toBe(0);
  });

  it('convert-document rewrites type in frontmatter and removes source file', async () => {
    const objs = objectsDir(dir);
    mkdirSync(join(objs, 'documents'), { recursive: true });
    writeFileSync(
      join(objs, 'documents', 'doc_ref1.md'),
      legacyMd('doc_ref1', { type: 'document', source: { kind: 'file', path: 'src/bar.ts' } })
    );

    await applyLayoutMigration(dir);

    // new file has type document-ref
    const newPath = join(dir, '.wolf', 'memory', 'shared', 'documents', 'doc_ref1.md');
    const content = readFileSync(newPath, 'utf-8');
    expect(content).toContain('type: document-ref');
    // old file gone
    expect(() => readFileSync(join(objs, 'documents', 'doc_ref1.md'))).toThrow();
  });

  it('does not touch events.jsonl and relations.jsonl', async () => {
    const objs = objectsDir(dir);
    mkdirSync(join(objs, 'decisions'), { recursive: true });
    writeFileSync(join(objs, 'decisions', 'dec_1.md'), legacyMd('dec_1', { type: 'decision' }));

    const evBefore = readFileSync(join(dir, '.wolf', 'memory', 'events.jsonl'));
    const relBefore = readFileSync(join(dir, '.wolf', 'memory', 'relations.jsonl'));

    await applyLayoutMigration(dir);

    const evAfter = readFileSync(join(dir, '.wolf', 'memory', 'events.jsonl'));
    const relAfter = readFileSync(join(dir, '.wolf', 'memory', 'relations.jsonl'));
    expect(evAfter).toEqual(evBefore);
    expect(relAfter).toEqual(relBefore);
  });
});
