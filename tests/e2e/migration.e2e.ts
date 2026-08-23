import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

function legacyMd(id: string, overrides: Record<string, unknown>): string {
  const base: Record<string, unknown> = {
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
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${(body as string) ?? 'Body text.'}`;
}

describe('legacy objects migrate and stay searchable', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('migrates 5 legacy objects, idempotent, searchable', () => {
    const objs = join(cwd, '.wolf/memory/objects');
    mkdirSync(join(objs, 'decisions'), { recursive: true });
    mkdirSync(join(objs, 'lessons'), { recursive: true });
    mkdirSync(join(objs, 'threads'), { recursive: true });
    mkdirSync(join(objs, 'documents'), { recursive: true });

    writeFileSync(join(objs, 'decisions', 'dec_1.md'), legacyMd('dec_1', { type: 'decision' }));
    writeFileSync(join(objs, 'lessons', 'les_1.md'), legacyMd('les_1', { type: 'lesson' }));
    writeFileSync(
      join(objs, 'threads', 'wt_1.md'),
      legacyMd('wt_1', { type: 'work-thread', goal: 'test goal', current_state: '', next_steps: [] })
    );
    writeFileSync(
      join(objs, 'documents', 'doc_1.md'),
      legacyMd('doc_1', { type: 'document', source: { kind: 'file', path: 'src/foo.ts' } })
    );
    writeFileSync(
      join(objs, 'documents', 'doc_2.md'),
      legacyMd('doc_2', { type: 'document', source: { kind: 'manual' } })
    );

    writeFileSync(join(cwd, '.wolf/memory/events.jsonl'), '');
    writeFileSync(join(cwd, '.wolf/memory/relations.jsonl'), '');

    const dry = runCli(['migrate'], cwd);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('(5 objects)');
    expect(dry.stdout).toContain('document split');

    const apply = runCli(['migrate', '--apply'], cwd);
    expect(apply.status).toBe(0);
    expect(apply.stdout).toContain('moved: 5');

    const dry2 = runCli(['migrate'], cwd);
    expect(dry2.stdout).toContain('moved: 0');

    runCli(['rebuild-index'], cwd);
    const search = runCli(['search', 'decision'], cwd);
    expect(search.status).toBe(0);
    expect(search.stdout).toContain('dec_1');
  });
});
