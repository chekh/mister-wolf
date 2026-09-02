import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { planDocIdMigration, applyDocIdMigration } from '../../src/adapters/fs/doc-id-migration.js';
import { documentRefId, isCanonicalDocumentId, withTieBreak } from '../../src/adapters/fs/document-id.js';
import { targetPathFor, relationsPath, memoryDir } from '../../src/adapters/fs/project-paths.js';
import { walkMd } from '../../src/adapters/fs/layout-migration.js';

// фикстура (спека 2.1.0 §2.6): два document-ref со старыми id + decision со ссылками
const DOC_A = 'doc_docs_guide_architecture_md';
const DOC_B = 'doc_README_md';
const PATH_A = 'docs/guide/architecture.md';
const PATH_B = 'README.md';
const CREATED = '2026-08-30T10:00:00Z';

function md(fm: Record<string, any>, body: string): string {
  return `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`;
}

function docFm(id: string, path: string): Record<string, any> {
  return {
    id,
    type: 'document-ref',
    title: `Doc ${id}`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.6,
    created_at: CREATED,
    updated_at: CREATED,
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'file', path },
    related: { files: [], docs: [path], decisions: [] },
    tags: ['document'],
    superseded_by: null,
  };
}

function decisionFm(): Record<string, any> {
  return {
    id: 'dec_1',
    type: 'decision',
    title: 'Decision referencing docs',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: CREATED,
    updated_at: CREATED,
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: DOC_A, // supersede-цепочка (§2.6 п.4)
  };
}

/** Синтетическая память: 2 doc_* + decision со ссылками + relations/events. */
function seedMemory(dir: string): void {
  const shared = join(dir, '.wolf', 'memory', 'shared');
  mkdirSync(join(shared, 'documents'), { recursive: true });
  mkdirSync(join(shared, 'decisions'), { recursive: true });
  writeFileSync(join(shared, 'documents', `${DOC_A}.md`), md(docFm(DOC_A, PATH_A), 'Architecture guide.'));
  writeFileSync(join(shared, 'documents', `${DOC_B}.md`), md(docFm(DOC_B, PATH_B), 'Readme ref.'));
  // ссылка на B в body + пограничная строка DOC_A + 'X' (не должна заменяться)
  writeFileSync(
    join(shared, 'decisions', 'dec_1.md'),
    md(decisionFm(), `Смотрел ${DOC_B} и ${DOC_A}X — граничная строка.`)
  );
  writeFileSync(
    relationsPath(dir),
    JSON.stringify({
      id: 'rel_1',
      subject: 'dec_1',
      predicate: 'related_to',
      object: DOC_A,
      created_at: CREATED,
      source: 'manual',
      confidence: 'medium',
    }) + '\n'
  );
  // events.jsonl — исторический лог, миграция его НЕ трогает (даже со старыми id)
  writeFileSync(join(dir, '.wolf', 'memory', 'events.jsonl'), `{"payload":{"memory_id":"${DOC_A}"}}\n`);
}

function countMd(dir: string): number {
  let n = 0;
  const stack = [memoryDir(dir)];
  while (stack.length) {
    const d = stack.pop()!;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) stack.push(join(d, e.name));
      else if (e.name.endsWith('.md')) n++;
    }
  }
  return n;
}

describe('doc-id-migration (спека 2.1.0 §2.6)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-docid-'));
    seedMemory(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('dry-run планирует переименование, ничего не меняя', async () => {
    const before = countMd(dir);
    const plan = await planDocIdMigration(dir);
    expect(plan.entries).toHaveLength(2);
    expect(plan.renamed).toBe(0);
    expect(plan.refsRewritten).toBe(0);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.problems).toHaveLength(0);
    // файлы не тронуты
    expect(countMd(dir)).toBe(before);
    expect(existsSync(join(dir, '.wolf/memory/shared/documents', `${DOC_A}.md`))).toBe(true);
  });

  it('apply переименовывает, переписывает ссылки с границей id, не трогает events', async () => {
    // порядок вычисления newId повторяет план: takenIds = id всех объектов, новые накапливаются
    const expectedA = withTieBreak(documentRefId(PATH_A, CREATED), [DOC_A, DOC_B, 'dec_1']);
    const expectedB = withTieBreak(documentRefId(PATH_B, CREATED), [DOC_A, DOC_B, 'dec_1', expectedA]);

    const report = await applyDocIdMigration(dir);

    expect(report.renamed).toBe(2);
    expect(report.conflicts).toHaveLength(0);
    expect(report.problems).toHaveLength(0);
    expect(report.refsRewritten).toBeGreaterThan(0);

    const entryA = report.entries.find((e) => e.id === DOC_A)!;
    const entryB = report.entries.find((e) => e.id === DOC_B)!;
    expect(entryA.newId).toBe(expectedA);
    expect(entryB.newId).toBe(expectedB);
    expect(isCanonicalDocumentId(entryA.newId)).toBe(true);
    expect(isCanonicalDocumentId(entryB.newId)).toBe(true);

    // число .md неизменно; файлы легли по каноническим путям, старые пути свободны
    expect(countMd(dir)).toBe(3);
    expect(existsSync(targetPathFor(dir, { type: 'document-ref', id: entryA.newId }))).toBe(true);
    expect(existsSync(targetPathFor(dir, { type: 'document-ref', id: entryB.newId }))).toBe(true);
    expect(existsSync(join(dir, '.wolf/memory/shared/documents', `${DOC_A}.md`))).toBe(false);

    // старых id нет нигде в .md и relations.jsonl (по границе id — DOC_A+X легитимно
    // остаётся, старый id там лишь префикс); граничная строка с X не тронута
    let allText = readFileSync(relationsPath(dir), 'utf-8');
    for (const f of await walkMd(memoryDir(dir))) allText += readFileSync(f, 'utf-8');
    const standalone = (hay: string, id: string): number =>
      (hay.match(new RegExp(`${id}(?![A-Za-z0-9_-])`, 'g')) ?? []).length;
    expect(standalone(allText, DOC_A)).toBe(0);
    expect(standalone(allText, DOC_B)).toBe(0);
    expect(allText).toContain(`${DOC_A}X`);

    // decision: superseded_by и body переписаны на новый id
    const decision = readFileSync(join(dir, '.wolf/memory/shared/decisions/dec_1.md'), 'utf-8');
    expect(decision).toContain(`superseded_by: ${entryA.newId}`);
    expect(decision).toContain(entryB.newId);

    // frontmatter переименованных файлов несёт новый id
    const docAContent = readFileSync(targetPathFor(dir, { type: 'document-ref', id: entryA.newId }), 'utf-8');
    expect(docAContent).toContain(`id: ${entryA.newId}`);

    // events.jsonl не тронут (исторический лог)
    expect(readFileSync(join(dir, '.wolf/memory/events.jsonl'), 'utf-8')).toContain(DOC_A);
  });

  it('повторный apply — уже канонические, renamed=0', async () => {
    await applyDocIdMigration(dir);
    const second = await applyDocIdMigration(dir);
    expect(second.entries).toHaveLength(0);
    expect(second.renamed).toBe(0);
    expect(second.refsRewritten).toBe(0);
  });

  it('конфликт: чужой файл по целевому пути → action conflict, не трогаем', async () => {
    const newIdA = withTieBreak(documentRefId(PATH_A, CREATED), [DOC_A, DOC_B, 'dec_1']);
    const foreign = targetPathFor(dir, { type: 'document-ref', id: newIdA });
    mkdirSync(dirname(foreign), { recursive: true });
    writeFileSync(foreign, '---\nid: mem_foreign\n---\n\nx');

    const plan = await planDocIdMigration(dir);
    const conflictEntry = plan.entries.find((e) => e.id === DOC_A)!;
    expect(conflictEntry.action).toBe('conflict');
    expect(plan.conflicts).toHaveLength(1); // exit-семантика CLI: > 0 → exitCode 2
    // исходный файл не тронут
    expect(existsSync(join(dir, '.wolf/memory/shared/documents', `${DOC_A}.md`))).toBe(true);
  });
});
