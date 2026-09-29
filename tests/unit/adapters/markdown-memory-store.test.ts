import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import * as fsPromises from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import yaml from 'js-yaml';

function makeObject(id: string, type = 'lesson'): MemoryObject {
  return {
    id,
    type: type as any,
    title: 'Test',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: [],
    superseded_by: null,
    body: 'Body text.',
  };
}

function legacyFrontmatter(id: string, status: string): string {
  const obj = makeObject(id, 'decision');
  obj.status = status as any;
  const { body, ...fm } = obj;
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`;
}

describe('MarkdownMemoryStore', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-memory-'));
    store = new MarkdownMemoryStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves and retrieves a memory object', async () => {
    const obj = makeObject('mem_20260629_test_a8f3');
    await store.save(obj);
    const loaded = await store.get('mem_20260629_test_a8f3');
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Test');
  });

  it('returns null for a missing object', async () => {
    const loaded = await store.get('mem_missing');
    expect(loaded).toBeNull();
  });

  it('returns null and reports a problem for unparsable file on get (invalid YAML)', async () => {
    const badPath = join(dir, '.wolf/memory/shared/lessons/mem_bad_yaml.md');
    mkdirSync(dirname(badPath), { recursive: true });
    writeFileSync(badPath, '---\n[not valid yaml\n---\n\nbody', 'utf-8');
    const problems: string[] = [];
    const s = new MarkdownMemoryStore(dir, (msg) => problems.push(msg));
    expect(await s.get('mem_bad_yaml')).toBeNull();
    expect(problems.some((m) => m.includes('mem_bad_yaml'))).toBe(true);
  });

  it('returns null and reports a problem for unparsable file on get (schema mismatch)', async () => {
    const badPath = join(dir, '.wolf/memory/shared/lessons/mem_bad_schema.md');
    mkdirSync(dirname(badPath), { recursive: true });
    writeFileSync(badPath, '---\nid: mem_bad_schema\ntype: lesson\n---\n\nbody', 'utf-8');
    const problems: string[] = [];
    const s = new MarkdownMemoryStore(dir, (msg) => problems.push(msg));
    expect(await s.get('mem_bad_schema')).toBeNull();
    expect(problems.some((m) => m.includes('mem_bad_schema'))).toBe(true);
  });

  it('saves into layout v2 (threads/<tid>/<subdir>) and reads it back', async () => {
    const obj = makeObject('mem_tb1', 'note');
    obj.thread = 'mem_t1';
    (obj as any).facet = 'context';
    await store.save(obj);
    const p = join(dir, '.wolf/memory/threads/mem_t1/notes/mem_tb1.md');
    await expect(fsPromises.access(p)).resolves.toBeUndefined();
    expect((await store.get('mem_tb1'))?.id).toBe('mem_tb1');
  });

  it('lists from both legacy objects/ and new roots; new wins on id collision', async () => {
    const id = 'mem_coll1';
    mkdirSync(join(dir, '.wolf/memory/objects/decisions'), { recursive: true });
    writeFileSync(join(dir, '.wolf/memory/objects/decisions', `${id}.md`), legacyFrontmatter(id, 'active'), 'utf-8');
    mkdirSync(join(dir, '.wolf/memory/shared/decisions'), { recursive: true });
    writeFileSync(join(dir, '.wolf/memory/shared/decisions', `${id}.md`), legacyFrontmatter(id, 'superseded'), 'utf-8');
    const objs = await store.list();
    expect(objs.filter((o) => o.id === id)).toHaveLength(1);
    expect(objs.find((o) => o.id === id)?.status).toBe('superseded');
  });

  it('skips unparsable file without failing list and reports via onProblem', async () => {
    mkdirSync(join(dir, '.wolf/memory/shared/rules'), { recursive: true });
    writeFileSync(join(dir, '.wolf/memory/shared/rules/broken.md'), 'not frontmatter', 'utf-8');
    const problems: string[] = [];
    const s = new MarkdownMemoryStore(dir, (msg) => problems.push(msg));
    await s.save(makeObject('mem_ok1'));
    const objs = await s.list();
    expect(objs.map((o) => o.id)).toEqual(['mem_ok1']);
    expect(problems.some((m) => m.includes('broken.md'))).toBe(true);
  });

  it('filters stale objects', async () => {
    const fresh = makeObject('mem_fresh');
    // ponytail: dynamic date — hardcoded one rotted past the 30-day stale window
    fresh.updated_at = new Date().toISOString();
    const stale = makeObject('mem_stale');
    stale.updated_at = '2026-01-01T00:00:00Z';
    await store.save(fresh);
    await store.save(stale);
    const results = await store.list({ stale: true });
    expect(results.map((r) => r.id)).toEqual(['mem_stale']);
  });
});

// P211: alias-чтение старого проекта без migrate (инвариант v, §5.4/§5.5)
describe('MarkdownMemoryStore alias reading (P211)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-memory-alias-'));
    store = new MarkdownMemoryStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeOldObject(relPath: string, id: string, type: string, extraFm: Record<string, unknown> = {}): string {
    const obj = makeObject(id, type);
    const { body, ...fm } = obj;
    const path = join(dir, relPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\n${yaml.dump({ ...fm, ...extraFm }).trimEnd()}\n---\n\n${body}`, 'utf-8');
    return path;
  }

  it('list/get читают старые типы как note(+facet)/thread (карта §5.4)', async () => {
    writeOldObject('.wolf/memory/shared/lessons/mem_obs1.md', 'mem_obs1', 'observation');
    writeOldObject('.wolf/memory/shared/documents/mem_dref1.md', 'mem_dref1', 'document-ref', {
      source: { kind: 'scan', path: 'docs/a.md' },
    });
    writeOldObject('.wolf/memory/shared/blockers/mem_blk1.md', 'mem_blk1', 'blocker', {
      impact: 'CI down',
      thread: 'mem_t1',
    });
    writeOldObject('.wolf/memory/threads/mem_wt1/WORK-THREAD.md', 'mem_wt1', 'work-thread', {
      goal: 'Ship 2.13',
    });

    const all = await store.list();
    const byId = new Map(all.map((o) => [o.id, o]));

    expect(byId.get('mem_obs1')?.type).toBe('note');
    expect(byId.get('mem_obs1')?.facet).toBe('legacy');
    expect(byId.get('mem_dref1')?.type).toBe('note');
    expect(byId.get('mem_dref1')?.facet).toBe('legacy');
    expect(byId.get('mem_blk1')?.type).toBe('note');
    expect(byId.get('mem_blk1')?.facet).toBe('pitfall');
    expect(byId.get('mem_wt1')?.type).toBe('thread');

    const got = await store.get('mem_blk1');
    expect(got?.type).toBe('note');
    expect(got?.facet).toBe('pitfall');
    // passthrough: поля старого типа переживают чтение
    expect(got?.impact).toBe('CI down');
  });

  it('update переезжает alias-объект на новый путь и удаляет старый файл; повторный update идемпотентен', async () => {
    writeOldObject('.wolf/memory/shared/blockers/mem_blk2.md', 'mem_blk2', 'blocker', { impact: 'x' });
    const updated = await store.update('mem_blk2', { title: 'Renamed' });
    expect(updated.type).toBe('note');
    expect(existsSync(join(dir, '.wolf/memory/shared/blockers/mem_blk2.md'))).toBe(false);
    const newPath = join(dir, '.wolf/memory/shared/notes/mem_blk2.md');
    expect(existsSync(newPath)).toBe(true);
    const saved = await fsPromises.readFile(newPath, 'utf-8');
    expect(saved).not.toContain('alias_origin');
    expect(saved).toContain('facet: pitfall');

    // идемпотентность: файл уже на новом пути, тип уже новый
    const again = await store.update('mem_blk2', { title: 'Renamed twice' });
    expect(again.type).toBe('note');
    expect(existsSync(newPath)).toBe(true);
    expect(existsSync(join(dir, '.wolf/memory/shared/blockers/mem_blk2.md'))).toBe(false);
  });

  it('passthrough guard §8.2.2: note с чужими полями переживает update без потерь', async () => {
    writeOldObject('.wolf/memory/shared/documents/mem_doc9.md', 'mem_doc9', 'document', {
      impact: 'legacy impact',
      legacy_field: 'keep me',
    });
    const updated = await store.update('mem_doc9', { title: 'Touched' });
    expect(updated.impact).toBe('legacy impact');
    expect(updated.legacy_field).toBe('keep me');
    const got = await store.get('mem_doc9');
    expect(got?.type).toBe('note');
    expect(got?.impact).toBe('legacy impact');
    expect(got?.legacy_field).toBe('keep me');
  });

  it('list({type}) префильтрует по корням типа: rule находится, чужие каталоги не сканируются', async () => {
    writeOldObject('.wolf/memory/shared/rules/mem_rule1.md', 'mem_rule1', 'rule', { scope: 'project' });
    // битой файл в чужом корне не сканируется → onProblem молчит
    mkdirSync(join(dir, '.wolf/memory/shared/lessons'), { recursive: true });
    writeFileSync(join(dir, '.wolf/memory/shared/lessons/broken.md'), 'not frontmatter', 'utf-8');
    const problems: string[] = [];
    const s = new MarkdownMemoryStore(dir, (msg) => problems.push(msg));
    const rules = await s.list({ type: 'rule' });
    expect(rules.map((o) => o.id)).toEqual(['mem_rule1']);
    expect(problems.some((m) => m.includes('broken.md'))).toBe(false);
    // без фильтра — полный обход, проблема видна
    await s.list();
    expect(problems.some((m) => m.includes('broken.md'))).toBe(true);
  });

  it('list({type:"note"}) находит note в notes/ И alias-корни (lessons/blockers)', async () => {
    writeOldObject('.wolf/memory/shared/notes/mem_n1.md', 'mem_n1', 'note', { facet: 'context' });
    writeOldObject('.wolf/memory/shared/lessons/mem_obs2.md', 'mem_obs2', 'observation');
    writeOldObject('.wolf/memory/shared/blockers/mem_blk3.md', 'mem_blk3', 'blocker', { impact: 'y' });
    writeOldObject('.wolf/memory/shared/rules/mem_rule2.md', 'mem_rule2', 'rule', { scope: 'project' });
    const notes = await store.list({ type: 'note' });
    expect(notes.map((o) => o.id).sort()).toEqual(['mem_blk3', 'mem_n1', 'mem_obs2']);
  });

  it('list({type:"thread"}) находит WORK-THREAD через walk threads/', async () => {
    writeOldObject('.wolf/memory/threads/mem_wt2/WORK-THREAD.md', 'mem_wt2', 'work-thread', { goal: 'g' });
    writeOldObject('.wolf/memory/shared/notes/mem_n2.md', 'mem_n2', 'note', { facet: 'context' });
    const threads = await store.list({ type: 'thread' });
    expect(threads.map((o) => o.id)).toEqual(['mem_wt2']);
  });

  it('list({type:<старый тип>}) — пусто без ошибок (постфильтр-эквивалент)', async () => {
    writeOldObject('.wolf/memory/shared/lessons/mem_obs3.md', 'mem_obs3', 'observation');
    await expect(store.list({ type: 'observation' })).resolves.toEqual([]);
  });

  it('list({type}) видит объект в legacy objects/ (резервный корень)', async () => {
    writeOldObject('.wolf/memory/objects/decisions/mem_dec1.md', 'mem_dec1', 'decision');
    const decisions = await store.list({ type: 'decision' });
    expect(decisions.map((o) => o.id)).toEqual(['mem_dec1']);
  });
});
