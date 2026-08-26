import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeObject(partial: Partial<MemoryObject> & Pick<MemoryObject, 'id' | 'title' | 'body'>): MemoryObject {
  return {
    type: 'lesson',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T15:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: ['router'],
    superseded_by: null,
    ...partial,
  } as MemoryObject;
}

describe('SQLiteSearchIndex', () => {
  let dir: string;
  let index: SQLiteSearchIndex;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-idx-'));
    index = new SQLiteSearchIndex(join(dir, 'index.sqlite'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds object by body text', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'Router', body: 'reconnect failure mode' }),
      makeObject({ id: 'mem_2', title: 'Auth', body: 'token rotation' }),
    ]);
    const results = await index.search('reconnect');
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe('mem_1');
  });

  it('ranks objects by match count', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'One', body: 'alpha beta gamma' }),
      makeObject({ id: 'mem_2', title: 'Two', body: 'alpha alpha beta' }),
    ]);
    const results = await index.search('alpha');
    expect(results.map((r) => r.object.id)).toEqual(['mem_2', 'mem_1']);
  });

  it('filters by type', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', type: 'lesson', title: 'Lesson', body: 'shared term' }),
      makeObject({ id: 'mem_2', type: 'decision', title: 'Decision', body: 'shared term' }),
    ]);
    const results = await index.search('shared', { type: 'decision' });
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe('mem_2');
  });

  it('excludes superseded objects by default', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'Active', body: 'target content', status: 'active' }),
      makeObject({ id: 'mem_2', title: 'Superseded', body: 'target content', status: 'superseded' }),
    ]);
    const results = await index.search('target');
    expect(results.map((r) => r.object.id)).toEqual(['mem_1']);
  });

  it('finds objects in live non-active statuses and still excludes dead ones', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', type: 'council-question', title: 'Question', body: 'council term', status: 'open' }),
      makeObject({ id: 'mem_2', type: 'synthesis', title: 'Synthesis', body: 'council term', status: 'proposed' }),
      makeObject({ id: 'mem_3', title: 'Archived', body: 'council term', status: 'archived' }),
      makeObject({ id: 'mem_4', title: 'Superseded', body: 'council term', status: 'superseded' }),
    ]);
    const results = await index.search('council');
    expect(results.map((r) => r.object.id).sort()).toEqual(['mem_1', 'mem_2']);
  });

  it('includes superseded objects when requested', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'Active', body: 'target content', status: 'active' }),
      makeObject({ id: 'mem_2', title: 'Superseded', body: 'target content', status: 'superseded' }),
    ]);
    const results = await index.search('target', { includeSuperseded: true });
    expect(results).toHaveLength(2);
  });

  it('filters by tag', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'Lesson', body: 'shared term', tags: ['alpha'] }),
      makeObject({ id: 'mem_2', title: 'Decision', body: 'shared term', tags: ['beta'] }),
    ]);
    const results = await index.search('shared', { tags: ['alpha'] });
    expect(results).toHaveLength(1);
    expect(results[0].object.id).toBe('mem_1');
  });

  it('filters by importance range', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'Low', body: 'target', importance: 0.2 }),
      makeObject({ id: 'mem_2', title: 'Mid', body: 'target', importance: 0.5 }),
      makeObject({ id: 'mem_3', title: 'High', body: 'target', importance: 0.9 }),
    ]);
    const results = await index.search('target', { minImportance: 0.4, maxImportance: 0.7 });
    expect(results.map((r) => r.object.id)).toEqual(['mem_2']);
  });

  it('applies confidence and importance boost to score', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'One', body: 'target term', confidence: 'low', importance: 0.1 }),
      makeObject({ id: 'mem_2', title: 'Two', body: 'target term', confidence: 'high', importance: 0.9 }),
    ]);
    const results = await index.search('target');
    const mem1 = results.find((r) => r.object.id === 'mem_1')!;
    const mem2 = results.find((r) => r.object.id === 'mem_2')!;
    expect(mem2.score).toBeGreaterThan(mem1.score);
  });

  it('limits results', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'One', body: 'target term' }),
      makeObject({ id: 'mem_2', title: 'Two', body: 'target term' }),
      makeObject({ id: 'mem_3', title: 'Three', body: 'target term' }),
    ]);
    const results = await index.search('target', { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('matches by token prefix', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'Reconnection', body: 'how router recovers' }),
      makeObject({ id: 'mem_2', title: 'Other', body: 'unrelated content' }),
    ]);
    const results = await index.search('reconne');
    expect(results.map((r) => r.object.id)).toEqual(['mem_1']);
  });

  it('returns empty result for query without valid tokens', async () => {
    await index.rebuild([makeObject({ id: 'mem_1', title: 'Punct', body: 'text' })]);
    const results = await index.search('"" * ^ () :');
    expect(results).toEqual([]);
  });

  it('ranks title matches above body matches', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'Plain', body: 'router content' }),
      makeObject({ id: 'mem_2', title: 'Router guide', body: 'generic content' }),
    ]);
    const results = await index.search('router');
    expect(results.map((r) => r.object.id)).toEqual(['mem_2', 'mem_1']);
  });

  it('filters by file_path via related.files', async () => {
    await index.rebuild([
      makeObject({
        id: 'mem_1',
        title: 'One',
        body: 'shared',
        related: { files: ['src/a.ts'], docs: [], decisions: [] },
      }),
      makeObject({
        id: 'mem_2',
        title: 'Two',
        body: 'shared',
        related: { files: ['src/b.ts'], docs: [], decisions: [] },
      }),
    ]);
    const results = await index.search('shared', { file_path: 'src/a.ts' });
    expect(results.map((r) => r.object.id)).toEqual(['mem_1']);
  });

  it('filters by file_path via source.path', async () => {
    await index.rebuild([
      makeObject({ id: 'mem_1', title: 'One', body: 'shared', source: { kind: 'file', path: 'docs/spec.md' } }),
      makeObject({ id: 'mem_2', title: 'Two', body: 'shared' }),
    ]);
    const results = await index.search('shared', { file_path: 'docs/spec.md' });
    expect(results.map((r) => r.object.id)).toEqual(['mem_1']);
  });

  it('matches file_path as suffix of related file path', async () => {
    await index.rebuild([
      makeObject({
        id: 'mem_1',
        title: 'One',
        body: 'shared',
        related: { files: ['src/adapters/x.ts'], docs: [], decisions: [] },
      }),
    ]);
    const results = await index.search('shared', { file_path: 'adapters/x.ts' });
    expect(results.map((r) => r.object.id)).toEqual(['mem_1']);
  });

  it('filters out objects with non-matching file_path', async () => {
    await index.rebuild([
      makeObject({
        id: 'mem_1',
        title: 'One',
        body: 'shared',
        related: { files: ['src/a.ts'], docs: [], decisions: [] },
      }),
    ]);
    const results = await index.search('shared', { file_path: 'src/other.ts' });
    expect(results).toEqual([]);
  });

  it('applies limit after file_path filter', async () => {
    await index.rebuild([
      makeObject({
        id: 'mem_1',
        title: 'One',
        body: 'shared',
        related: { files: ['src/a.ts'], docs: [], decisions: [] },
      }),
      makeObject({
        id: 'mem_2',
        title: 'Two',
        body: 'shared',
        related: { files: ['src/a.ts'], docs: [], decisions: [] },
      }),
      makeObject({
        id: 'mem_3',
        title: 'Three',
        body: 'shared',
        related: { files: ['src/a.ts'], docs: [], decisions: [] },
      }),
      makeObject({
        id: 'mem_4',
        title: 'Four',
        body: 'shared',
        related: { files: ['src/b.ts'], docs: [], decisions: [] },
      }),
    ]);
    const results = await index.search('shared', { file_path: 'src/a.ts', limit: 2 });
    expect(results).toHaveLength(2);
    expect(['mem_1', 'mem_2', 'mem_3']).toContain(results[0].object.id);
    expect(['mem_1', 'mem_2', 'mem_3']).toContain(results[1].object.id);
  });

  it('rebuild is idempotent', async () => {
    const objects = [
      makeObject({ id: 'mem_1', title: 'First', body: 'unique term alpha' }),
      makeObject({ id: 'mem_2', title: 'Second', body: 'unique term beta' }),
    ];
    await index.rebuild(objects);
    const first = await index.search('unique');
    await index.rebuild(objects);
    const second = await index.search('unique');
    expect(second.map((r) => r.object.id).sort()).toEqual(first.map((r) => r.object.id).sort());
  });

  it('reconstructs full memory object', async () => {
    const obj = makeObject({
      id: 'mem_1',
      title: 'Title',
      body: 'body text',
      type: 'decision',
      status: 'superseded',
      review_state: 'rejected',
      confidence: 'high',
      importance: 0.9,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      created_by: 'user:alice',
      schema_version: 1,
      source: { kind: 'file', path: '/docs/spec.md' },
      related: { files: ['a.ts'], docs: ['b.md'], decisions: ['c'] },
      tags: ['alpha', 'beta'],
      superseded_by: 'mem_2',
    });
    await index.rebuild([obj]);
    const results = await index.search('body', { includeSuperseded: true });
    expect(results).toHaveLength(1);
    expect(results[0].object).toEqual(obj);
  });
});
