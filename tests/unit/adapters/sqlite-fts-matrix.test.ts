import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteSearchIndex } from '../../../src/adapters/sqlite/sqlite-search-index.js';
import * as searchIndexModule from '../../../src/adapters/sqlite/sqlite-search-index.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

// Датасет дословно из research-отчёта
// .wolf/orchestration/report-2026-09-01-fts-query-analysis.md §2 (5 объектов sandbox).
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
    tags: [],
    superseded_by: null,
    ...partial,
  } as MemoryObject;
}

function researchDataset(): MemoryObject[] {
  return [
    makeObject({
      id: 'mem_steward',
      type: 'lesson',
      title: 'Роль Стюарда',
      body: 'steward:наставник — рамка Стюарда предписывает агентам искать память проекта',
      confidence: 'high',
      importance: 0.7,
      tags: ['steward', 'ru'],
    }),
    makeObject({
      id: 'mem_onboarding',
      type: 'decision',
      title: 'Onboarding checklist',
      body: 'deployment pipeline checklist guardian для новых агентов',
      confidence: 'high',
      tags: ['devops'],
    }),
    makeObject({
      id: 'mem_mixed',
      type: 'lesson',
      title: 'Смешанный язык',
      body: 'deployment наставник guardian: смешанные кириллица+латиница запросы Наставник',
      confidence: 'medium',
      tags: ['mix'],
    }),
    makeObject({
      id: 'mem_specials',
      type: 'lesson',
      title: 'Спецсимволы в тексте',
      body: "don't stop; (parenthesized) *star* 'quoted' — тест спецсимволов",
      confidence: 'low',
      tags: ['edge'],
    }),
    makeObject({
      id: 'mem_operators',
      type: 'lesson',
      title: 'Операторы как слова',
      body: 'upper case words AND OR NOT NEAR appear here literally',
      confidence: 'high',
      tags: ['ops'],
    }),
    // Контроль для п.9 матрицы: слово checklist есть, deployment нет.
    makeObject({
      id: 'mem_checklist_only',
      type: 'lesson',
      title: 'Checklist alone',
      body: 'checklist без деплоя',
      tags: ['ctrl'],
    }),
  ];
}

const ids = (results: { object: MemoryObject }[]) => results.map((r) => r.object.id).sort();

describe('SQLiteSearchIndex: FTS query variant D (research-матрица 11 классов)', () => {
  let dir: string;
  let index: SQLiteSearchIndex;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-fts-'));
    index = new SQLiteSearchIndex(join(dir, 'index.sqlite'));
    await index.rebuild(researchDataset());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Якорь брифа: `steward наставник` и `steward:наставник` находят объект, содержащий оба слова.
  it('anchor: "steward наставник" finds the object containing both words', async () => {
    const results = await index.search('steward наставник');
    expect(ids(results)).toEqual(['mem_steward']);
  });

  it('anchor: "steward:наставник" finds the object containing both words (dogfood regression)', async () => {
    const results = await index.search('steward:наставник');
    // steward — не колонка FTS: значение ищется как обычный токен, поле отбрасывается.
    expect(ids(results)).toContain('mem_steward');
    expect(results.length).toBeGreaterThan(0);
  });

  // (а) colon — неизвестное поле: значение как обычный токен.
  it('(a) x:наставник finds by value word', async () => {
    const results = await index.search('x:наставник');
    expect(ids(results)).toEqual(['mem_mixed', 'mem_steward']);
  });

  it('(a) tag:deployment — неизвестное поле, ищет по слову deployment', async () => {
    const results = await index.search('tag:deployment');
    expect(ids(results)).toEqual(['mem_mixed', 'mem_onboarding']);
  });

  // (б) операторы.
  it('(b) "deployment AND checklist" equals "deployment checklist"', async () => {
    const withOp = await index.search('deployment AND checklist');
    const withoutOp = await index.search('deployment checklist');
    expect(ids(withOp)).toEqual(ids(withoutOp));
    expect(ids(withOp)).toEqual(['mem_onboarding']);
  });

  it('(b) "deployment OR nonexistentword" returns union (>=2, both subcases)', async () => {
    const results = await index.search('deployment OR nonexistentword');
    expect(ids(results)).toEqual(['mem_mixed', 'mem_onboarding']);
  });

  it('(b) "NOT deployment" — NOT не оператор: обычное слово, не краш', async () => {
    const results = await index.search('NOT deployment');
    // AND-конъюнкция слов NOT+deployment: ни один объект не содержит оба.
    expect(results).toEqual([]);
  });

  it('(b) "deployment NEAR checklist" — NEAR не оператор: обычное слово, не краш', async () => {
    const results = await index.search('deployment NEAR checklist');
    expect(results).toEqual([]);
  });

  // (в) фразы: кавычки вырезаются, семантика AND (документированная деградация).
  it('(v) "steward наставник" (quoted) still finds via AND semantics', async () => {
    const results = await index.search('"steward наставник"');
    expect(ids(results)).toEqual(['mem_steward']);
  });

  it('(v) unclosed quote "deployment does not throw', async () => {
    const results = await index.search('"deployment');
    expect(ids(results)).toEqual(['mem_mixed', 'mem_onboarding']);
  });

  // (г) скобки: распадаются, OR пробрасывается.
  it('(g) "(deployment OR guardian)" equals union without parens', async () => {
    const withParens = await index.search('(deployment OR guardian)');
    const withoutParens = await index.search('deployment OR guardian');
    expect(ids(withParens)).toEqual(ids(withoutParens));
    expect(ids(withParens)).toEqual(['mem_mixed', 'mem_onboarding']);
  });

  // (д) дефисы: честный AND (исключение — phase 2, решение по research).
  it('(d) "deployment -checklist" is honest AND: only object with both words, never checklist-only', async () => {
    const results = await index.search('deployment -checklist');
    expect(ids(results)).toEqual(['mem_onboarding']);
    expect(results).toHaveLength(1);
  });

  it('(d) "steward-наставник" finds via AND of split parts', async () => {
    const results = await index.search('steward-наставник');
    expect(ids(results)).toEqual(['mem_steward']);
  });

  // (е) регистр и смешанные алфавиты.
  it('(e) "Deployment Наставник" — case-insensitive mixed alphabets', async () => {
    const results = await index.search('Deployment Наставник');
    expect(ids(results)).toEqual(['mem_mixed']);
  });

  it('(e) НАСТАВНИК (upper cyrillic) finds 2', async () => {
    const results = await index.search('НАСТАВНИК');
    expect(ids(results)).toEqual(['mem_mixed', 'mem_steward']);
  });

  it('(e) STEWARD (upper latin) finds 1', async () => {
    const results = await index.search('STEWARD');
    expect(ids(results)).toEqual(['mem_steward']);
  });

  // (ж) пустые запросы: без throw.
  it('(zh) empty and whitespace-only queries return [] without throw', async () => {
    expect(await index.search('')).toEqual([]);
    expect(await index.search('   ')).toEqual([]);
  });

  // (з) мегатокены: не краш, не таймаут.
  it('(z) megatoken "a"×500 + real word does not throw', async () => {
    const results = await index.search(`${'a'.repeat(500)} наставник`);
    expect(results).toEqual([]);
  });

  it('(z) 150×zzword + deployment dedupes tokens, does not throw', async () => {
    const results = await index.search(`${Array(150).fill('zzword').join(' ')} deployment`);
    expect(results).toEqual([]);
  });

  // (и) апострофы и спецсимволы.
  it("(i) don't finds via AND of don+t", async () => {
    const results = await index.search("don't");
    expect(ids(results)).toEqual(['mem_specials']);
  });

  it('(i) *star* finds star', async () => {
    const results = await index.search('*star*');
    expect(ids(results)).toEqual(['mem_specials']);
  });

  it('(i) lone punctuation never throws SqliteError', async () => {
    expect(await index.search(`* ' ; ( )`)).toEqual([]);
    expect(await index.search(': :')).toEqual([]);
  });

  // (к) field:value для существующих FTS-колонок — column-filter.
  it('(k) body:наставник — column filter over body, 2 hits', async () => {
    const results = await index.search('body:наставник');
    expect(ids(results)).toEqual(['mem_mixed', 'mem_steward']);
  });

  it('(k) title:checklist — column filter over title', async () => {
    const results = await index.search('title:checklist');
    expect(ids(results)).toEqual(['mem_checklist_only', 'mem_onboarding']);
  });

  it('(k) type:lesson filters by type column (all lessons incl. control)', async () => {
    const results = await index.search('type:lesson');
    expect(ids(results)).toEqual(['mem_checklist_only', 'mem_mixed', 'mem_operators', 'mem_specials', 'mem_steward']);
  });

  it('(k) status:active filters by status column', async () => {
    const results = await index.search('status:active');
    expect(results).toHaveLength(6);
  });

  it('(k) tags:mix filters by tags column', async () => {
    const results = await index.search('tags:mix');
    expect(ids(results)).toEqual(['mem_mixed']);
  });

  it('(k) combined: type:lesson + body word narrows result', async () => {
    const results = await index.search('type:lesson наставник');
    expect(ids(results)).toEqual(['mem_mixed', 'mem_steward']);
  });

  // (к)/(а) кириллическое неизвестное поле — тоже field:value паттерн.
  it('unknown cyrillic field неизвестноеполе:наставник searches value', async () => {
    const results = await index.search('неизвестноеполе:наставник');
    expect(ids(results)).toEqual(['mem_mixed', 'mem_steward']);
  });
});

describe('buildFtsQuery: трансформации (снапшоты, п.14 матрицы)', () => {
  const buildFtsQuery = (searchIndexModule as { buildFtsQuery?: (q: string) => string }).buildFtsQuery;

  it('is exported as a pure function', () => {
    expect(typeof buildFtsQuery).toBe('function');
  });

  it('tokenizes non-alphanumerics: steward:наставник → value word (unknown field discarded)', () => {
    expect(buildFtsQuery!('steward:наставник')).toBe('"наставник"*');
    expect(buildFtsQuery!('x:наставник')).toBe('"наставник"*');
  });

  it('passes uppercase AND as implicit conjunction', () => {
    expect(buildFtsQuery!('deployment AND checklist')).toBe('"deployment"* "checklist"*');
  });

  it('lowercase and is a regular word token', () => {
    expect(buildFtsQuery!('a and b')).toBe('"a"* "and"* "b"*');
  });

  it('passes uppercase OR through as FTS5 operator', () => {
    expect(buildFtsQuery!('deployment OR guardian')).toBe('"deployment"* OR "guardian"*');
  });

  it('parens dissolve into tokens: (deployment OR guardian)', () => {
    expect(buildFtsQuery!('(deployment OR guardian)')).toBe('"deployment"* OR "guardian"*');
  });

  it('stray operators are dropped: leading/trailing/doubled OR', () => {
    expect(buildFtsQuery!('OR a')).toBe('"a"*');
    expect(buildFtsQuery!('a OR')).toBe('"a"*');
    expect(buildFtsQuery!('a OR OR b')).toBe('"a"* OR "b"*');
  });

  it('NOT stays a plain word token (not an operator)', () => {
    expect(buildFtsQuery!('deployment NOT checklist')).toBe('"deployment"* "NOT"* "checklist"*');
  });

  it('whitelisted columns become column filters', () => {
    expect(buildFtsQuery!('type:lesson')).toBe('type:"lesson"*');
    expect(buildFtsQuery!('body:наставник')).toBe('body:"наставник"*');
    expect(buildFtsQuery!('title:deployment-рамка')).toBe('title:"deployment"* title:"рамка"*');
    expect(buildFtsQuery!('Type:lesson')).toBe('type:"lesson"*');
  });

  it('unknown field name is discarded, value tokens searched', () => {
    expect(buildFtsQuery!('неизвестноеполе:слово')).toBe('"слово"*');
    expect(buildFtsQuery!('steward:наставник')).toBe('"наставник"*');
  });

  it('empty value after known column yields no term', () => {
    expect(buildFtsQuery!('body:')).toBe('');
    expect(buildFtsQuery!('body:-')).toBe('');
  });

  it('empty or punctuation-only input yields empty FTS query', () => {
    expect(buildFtsQuery!('')).toBe('');
    expect(buildFtsQuery!('   ')).toBe('');
    expect(buildFtsQuery!('"" * ^ () :')).toBe('');
  });

  it('splits apostrophe and hyphen tokens into words', () => {
    expect(buildFtsQuery!("don't")).toBe('"don"* "t"*');
    expect(buildFtsQuery!('wolf - search')).toBe('"wolf"* "search"*');
    expect(buildFtsQuery!('steward-наставник')).toBe('"steward"* "наставник"*');
  });

  it('dedupes repeated word tokens', () => {
    expect(buildFtsQuery!('zzword zzword deployment')).toBe('"zzword"* "deployment"*');
  });
});
