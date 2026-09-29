import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

/**
 * E2E alias-чтения старой таксономии (спека 2.13 §10.1, инвариант v §8.1):
 * старый проект читается БЕЗ migrate — list/get/search видят новые типы,
 * update не теряет чужие поля (zod-strip guard §8.2.2), add валидирует фасеты.
 */
const CREATED = '2026-09-29T10:00:00Z';

function baseFm(id: string, type: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Test ${id}`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    // yaml.dump квотит ISO-даты — js-yaml не парсит их в Date (ловушка сидеров)
    created_at: CREATED,
    updated_at: CREATED,
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    type,
    ...overrides,
  };
}

function writeOld(project: string, rel: string, fm: Record<string, unknown>, body: string): void {
  const abs = join(project, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`);
}

describe('wolf alias-чтение старой таксономии без migrate (2.13 §8.1/§10.1)', () => {
  let project: string;

  beforeAll(() => {
    ensureBuilt();
    project = tmpProject();
    const mem = join(project, '.wolf', 'memory');
    // (а) observation в shared/lessons/
    writeOld(
      project,
      join('.wolf', 'memory', 'shared', 'lessons', 'obs_1.md'),
      baseFm('obs_1', 'observation'),
      'Body of obs_1 mentions QuokkaJumps.'
    );
    // (б) document-ref в shared/documents/
    writeOld(
      project,
      join('.wolf', 'memory', 'shared', 'documents', 'doc_1.md'),
      baseFm('doc_1', 'document-ref', { source: { kind: 'file', path: 'src/foo.ts' } }),
      'Body of doc_1.'
    );
    // (в) work-thread threads/t1/WORK-THREAD.md + blocker с thread: t1
    writeOld(
      project,
      join('.wolf', 'memory', 'threads', 't1', 'WORK-THREAD.md'),
      baseFm('t1', 'work-thread', { goal: 'ship alias reading', current_state: '', next_steps: [] }),
      'Thread body.'
    );
    writeOld(
      project,
      join('.wolf', 'memory', 'threads', 't1', 'blockers', 'blk_1.md'),
      baseFm('blk_1', 'blocker', { thread: 't1', impact: 'blocks the release' }),
      'Blocker body.'
    );
    // (г) note с чужим полем (§8.2.2 passthrough guard)
    writeOld(
      project,
      join('.wolf', 'memory', 'shared', 'notes', 'nte_1.md'),
      baseFm('nte_1', 'note', { facet: 'context', custom_legacy_field: 'keep-me' }),
      'Body of nte_1.'
    );
    writeFileSync(join(mem, 'events.jsonl'), '');
    writeFileSync(join(mem, 'relations.jsonl'), '');
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('list читает старые типы как note и thread, без warning', () => {
    const list = runCli(['list'], project);
    expect(list.status).toBe(0);
    expect(list.stderr).not.toContain('Warning');
    expect(list.stdout).toContain('obs_1 [note]');
    expect(list.stdout).toContain('doc_1 [note]');
    expect(list.stdout).toContain('blk_1 [note]');
    expect(list.stdout).toContain('t1 [thread]');
  });

  it('get каждого старого объекта читается (exit 0, без warning)', () => {
    for (const id of ['obs_1', 'doc_1', 'blk_1', 't1', 'nte_1']) {
      const got = runCli(['get', id], project);
      expect(got.status, id).toBe(0);
      expect(got.stderr, id).not.toContain('Warning');
      expect(got.stdout).toContain(id);
    }
  });

  it('search находит слово из тела старого объекта', () => {
    expect(runCli(['rebuild-index'], project).status).toBe(0);
    const search = runCli(['search', 'QuokkaJumps'], project);
    expect(search.status).toBe(0);
    expect(search.stdout).toContain('obs_1');
  });

  it('zod-strip guard §8.2.2: update сохраняет чужое поле, type и facet note', () => {
    const before = readFileSync(join(project, '.wolf', 'memory', 'shared', 'notes', 'nte_1.md'), 'utf-8');
    expect(before).toContain('keep-me');

    const upd = runCli(['update', 'nte_1', '--tags', 'guardprobe'], project);
    expect(upd.status).toBe(0);

    const after = readFileSync(join(project, '.wolf', 'memory', 'shared', 'notes', 'nte_1.md'), 'utf-8');
    expect(after).toContain('custom_legacy_field: keep-me');
    expect(after).toContain('type: note');
    expect(after).toContain('facet: context');
  });

  it('идемпотентность update: путь и тип не меняются повторно', () => {
    const first = runCli(['update', 'nte_1', '--tags', 'guardprobe2'], project);
    expect(first.status).toBe(0);
    const after = readFileSync(join(project, '.wolf', 'memory', 'shared', 'notes', 'nte_1.md'), 'utf-8');
    expect(after).toContain('type: note');
    // файл не переезжает повторно — остаётся в shared/notes/
    expect(after).toContain('custom_legacy_field: keep-me');
  });

  it('add --type thread (P210 §10.1): файл threads/<tid>/WORK-THREAD.md', () => {
    const add = runCli(
      ['add', '--type', 'thread', '--title', 'Fresh thread', '--body', 'Body', '--set', 'goal=e2e alias probe'],
      project
    );
    expect(add.status).toBe(0);
    const id = /Created memory object: (\S+)/.exec(add.stdout)?.[1];
    expect(id).toBeTruthy();
    const threadFile = join(project, '.wolf', 'memory', 'threads', id!, 'WORK-THREAD.md');
    expect(readFileSync(threadFile, 'utf-8')).toContain('type: thread');
    // не вкладывается в threads/<tid>/threads/...
    expect(threadFile.endsWith(join('threads', id!, 'WORK-THREAD.md'))).toBe(true);
  });

  it('add --type note без --facet / с bogus-фасетом / facet не для note → exit ≠ 0', () => {
    const noFacet = runCli(['add', '--type', 'note', '--title', 'X'], project);
    expect(noFacet.status).not.toBe(0);
    expect(noFacet.stderr).toContain('howto');
    expect(noFacet.stderr).toContain('pitfall');

    const bogus = runCli(['add', '--type', 'note', '--title', 'X', '--facet', 'bogus'], project);
    expect(bogus.status).not.toBe(0);
    expect(bogus.stderr).toContain('Invalid facet "bogus"');

    const wrongType = runCli(['add', '--type', 'rule', '--title', 'X', '--facet', 'howto'], project);
    expect(wrongType.status).not.toBe(0);
    expect(wrongType.stderr).toContain('facet is only valid for type "note"');
  });

  it('list --facet pitfall: blocker-alias читается как pitfall, note+context не попадает', () => {
    const list = runCli(['list', '--facet', 'pitfall'], project);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain('blk_1');
    expect(list.stdout).not.toContain('nte_1');
  });

  it('pipe-вывод без ANSI: NO_COLOR / WOLF_NO_COLOR', () => {
    for (const envVar of [{ NO_COLOR: '1' }, { WOLF_NO_COLOR: '1' }]) {
      const list = runCli(['list'], project, envVar);
      expect(list.status).toBe(0);
      expect(list.stdout).not.toContain('\x1b[');
    }
  });
});
