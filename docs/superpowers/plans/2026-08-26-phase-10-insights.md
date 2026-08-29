# Phase 10 — wolf insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Спека:** `docs/superpowers/specs/2026-08-26-phase-10-insights.md` (APPROVED). План — развёртка спеки 1:1; решения D1–D12 и отклонения D-dev1–D-dev3 определены в спеке и здесь не дублируются. V-факты кода — спека §0; все ссылки на строки сверены с main post-Phase 9 (2026-08-26).

**Goal:** Реализовать `wolf insights [--topic <topic>] [--type <type>]` и MCP-тул `insights` — детерминированный Level 1 анализ активной памяти: один `store.list()` → агрегации → пять линз рендера (`patterns | technical_debt | decisions | lessons | activity`). Без LLM, без новых зависимостей, read-only.

**Architecture:** Гексагон сохраняется. Новый read-only use-case `src/app/use-cases/generate-insights.ts` (deps `{ store, clock }`) по образцу `generate-agent-brief.ts`: один `store.list()` плюс агрегации в памяти. Новая CLI-команда `src/adapters/cli/commands/memory-insights.ts`, новый MCP-тул `insights`.

**Tech Stack:** TypeScript (ESM), zod 4, commander 12, vitest — только существующие зависимости.

---

## Соответствие спеке (трассировка)

| Задача спеки                                  | Задачи плана |
| --------------------------------------------- | ------------ |
| Task 1 (use-case `generateInsights`, TDD)     | Tasks 1–4    |
| Task 2 (CLI `wolf insights`)                  | Task 5       |
| Task 3 (MCP-тул `insights`)                   | Task 6       |
| Task 4 (E2E золотые сценарии)                 | Task 7       |
| Task 5 (документация + финальная верификация) | Task 8       |

Уточнения уровня плана (не противоречия спеке, зафиксированы чтобы исполнитель не решал сам):

1. **`openBlockers`** — фильтр `type === 'blocker' && status === 'active'` (прецедент `generate-agent-brief.ts:38-40`, спека не уточняет статус).
2. **Shared tag группы конфликтов** — в отчёте хранятся только `MemoryObject[][]` (спека D1); общий тег для пометки «potential conflict (shared tag: X)» выводится при рендере как первый тег `group[0]`, входящий в теги всех членов группы.

## Предусловия

- [ ] **Шаг 0.1: Ветка.** `git checkout dev && git pull && git checkout -b feat/phase10-insights`
- [ ] **Шаг 0.2: Базовая линия.** `npm run check` зелёный (базлайн 2026-08-26: 61 test files / 230 tests passed). Если красное — починить до старта, не тащить в фазу.
- [ ] **Шаг 0.3: Чистое поле.** `rg -i -n 'insight' src tests` → 0 совпадений (V15).

---

### Task 1: каркас use-case — типы, валидация, база, topic-фильтр, простые агрегации

**Files:**

- Create: `tests/unit/use-cases/generate-insights.test.ts`
- Create: `src/app/use-cases/generate-insights.ts`

Отличие от доменных тестов репозитория: здесь fake-дубли (`store` в памяти, `Clock` с фиксированным `now`) — требование детерминизма D5; прецедента в tests/unit нет (research 2026-08-26), фикстуры ниже самодостаточны.

- [ ] **Step 1.1: Failing-тест — фикстуры + topic-фильтр + база + простые агрегации + валидация.** Создать `tests/unit/use-cases/generate-insights.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { generateInsights, ANALYSIS_TYPES } from '../../../src/app/use-cases/generate-insights.js';
import { MemoryStore } from '../../../src/ports/memory-store.port.js';
import { Clock } from '../../../src/ports/clock.port.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function fakeClock(): Clock {
  return { now: () => NOW };
}

function fakeStore(objects: MemoryObject[]): MemoryStore {
  return {
    save: async () => failReadOnly('save'),
    get: async () => failReadOnly('get'),
    list: async () => objects.map((o) => ({ ...o })),
    update: async () => failReadOnly('update'),
  };
}

function failReadOnly(method: string): never {
  throw new Error(`insights must be read-only; called ${method}`);
}

let seq = 0;

function obj(partial: Partial<MemoryObject>): MemoryObject {
  seq += 1;
  return {
    id: `test-${seq}`,
    type: 'observation',
    title: 'test object',
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.5,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    created_by: 'test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
    ...partial,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('generateInsights — scope, topic filter, simple aggregations', () => {
  it('matches topic by exact tag case-insensitively, by substring in title, by substring in body', async () => {
    const store = fakeStore([
      obj({ tags: ['Auth'] }),
      obj({ title: 'Fix AUTH flow' }),
      obj({ body: 'discussion about authentication internals' }),
      obj({ tags: ['unrelated'], title: 'other', body: 'nothing' }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, { topic: 'auth' });
    expect(report.scope).toEqual({ total: 4, matched: 3 });
  });

  it('without topic matches everything: matched equals total', async () => {
    const store = fakeStore([obj(), obj()]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.scope).toEqual({ total: 2, matched: 2 });
    expect(report.topic).toBeNull();
  });

  it('excludes archived from total and all sections (D2)', async () => {
    const store = fakeStore([obj({ tags: ['x'] }), obj({ tags: ['x'], status: 'archived' })]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.scope.total).toBe(1);
    expect(report.topTags).toEqual([{ tag: 'x', count: 1 }]);
  });

  it('computes topTags/topFiles/typeDistribution sorted desc, tie alphabetical, limit 10', async () => {
    const store = fakeStore([
      obj({ tags: ['b', 'a'], related: { files: ['f1.ts', 'f2.ts'], docs: [], decisions: [] } }),
      obj({ tags: ['a'], related: { files: ['f1.ts'], docs: [], decisions: [] } }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.topTags).toEqual([
      { tag: 'a', count: 2 },
      { tag: 'b', count: 1 },
    ]);
    expect(report.topFiles).toEqual([
      { file: 'f1.ts', count: 2 },
      { file: 'f2.ts', count: 1 },
    ]);
    expect(report.typeDistribution).toEqual([{ tag: 'observation', count: 2 }]);
  });

  it('throws on invalid analysisType listing all five allowed values (D4)', async () => {
    const store = fakeStore([]);
    await expect(
      generateInsights({ store, clock: fakeClock() }, { analysisType: 'nope' as (typeof ANALYSIS_TYPES)[number] })
    ).rejects.toThrow('Allowed: patterns, technical_debt, decisions, lessons, activity');
  });

  it('defaults analysisType to patterns and stamps generatedAt from injected clock', async () => {
    const store = fakeStore([]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.analysisType).toBe('patterns');
    expect(report.generatedAt).toBe(NOW.toISOString());
  });
});
```

- [ ] **Step 1.2: Run → FAIL.** `npm run test:run -- tests/unit/use-cases/generate-insights.test.ts` — ожидаемо: модуль `generate-insights.js` не найден.
- [ ] **Step 1.3: Реализация каркаса.** Создать `src/app/use-cases/generate-insights.ts`:

```typescript
import { MemoryStore } from '../../ports/memory-store.port.js';
import { Clock } from '../../ports/clock.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export type AnalysisType = 'patterns' | 'technical_debt' | 'decisions' | 'lessons' | 'activity';

export const ANALYSIS_TYPES: readonly AnalysisType[] = [
  'patterns',
  'technical_debt',
  'decisions',
  'lessons',
  'activity',
];

export const INSIGHTS_STALE_DAYS = 30;
export const DEBUG_TAGS: readonly string[] = ['debug', 'bug', 'bugfix', 'memory-repair', 'solve'];

export interface InsightsInput {
  topic?: string; // undefined => весь проект
  analysisType?: AnalysisType; // default 'patterns'
}

export interface TagCount {
  tag: string;
  count: number;
}
export interface FileCount {
  file: string;
  count: number;
}
export interface WeekBucket {
  week: string; // YYYY-MM-DD понедельника ISO-недели (UTC)
  decisions: number;
  lessons: number;
  debug: number;
  total: number;
}

export interface InsightsReport {
  topic: string | null;
  analysisType: AnalysisType;
  generatedAt: string;
  scope: { total: number; matched: number };
  topTags: TagCount[]; // top 10, убывание count, tie => алфавит
  topFiles: FileCount[]; // top 10 из related.files, та же сортировка
  typeDistribution: TagCount[]; // {tag: type, count}
  stale: MemoryObject[]; // D5
  supersededDecisions: MemoryObject[]; // decision status='superseded'
  conflicts: { statusConflicting: MemoryObject[]; candidates: MemoryObject[][] }; // D6
  lowConfidenceActive: MemoryObject[];
  openBlockers: MemoryObject[];
  decisionsByStatus: Record<string, MemoryObject[]>; // active/superseded/rejected/obsolete
  lessonsTopTags: TagCount[]; // top 5 по типам lesson+observation
  density: WeekBucket[]; // 8 недель, D7
  statusTally: TagCount[];
  truthRoleTally: TagCount[];
}

function matchesTopic(obj: MemoryObject, topic: string): boolean {
  const t = topic.toLowerCase();
  return (
    obj.tags.some((tag) => tag.toLowerCase() === t) ||
    obj.title.toLowerCase().includes(t) ||
    obj.body.toLowerCase().includes(t)
  );
}

function topCounts(values: string[], limit: number): TagCount[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

export async function generateInsights(
  deps: { store: MemoryStore; clock: Clock },
  input: InsightsInput = {}
): Promise<InsightsReport> {
  const analysisType = input.analysisType ?? 'patterns';
  if (!ANALYSIS_TYPES.includes(analysisType)) {
    throw new Error(`Invalid analysis type "${String(input.analysisType)}". Allowed: ${ANALYSIS_TYPES.join(', ')}`);
  }

  const all = await deps.store.list();
  // ponytail: store.list() — полный reparse всех md (V6); ровно один вызов на отчёт (D1)
  const base = all.filter((obj) => obj.status !== 'archived');
  const matched = input.topic ? base.filter((obj) => matchesTopic(obj, input.topic)) : base;

  return {
    topic: input.topic ?? null,
    analysisType,
    generatedAt: deps.clock.now().toISOString(),
    scope: { total: base.length, matched: matched.length },
    topTags: topCounts(
      matched.flatMap((obj) => obj.tags),
      10
    ),
    topFiles: topCounts(
      matched.flatMap((obj) => obj.related.files),
      10
    ).map(({ tag, count }) => ({
      file: tag,
      count,
    })),
    typeDistribution: topCounts(
      matched.map((obj) => obj.type),
      Math.max(matched.length, 1)
    ),
    stale: [],
    supersededDecisions: [],
    conflicts: { statusConflicting: [], candidates: [] },
    lowConfidenceActive: [],
    openBlockers: [],
    decisionsByStatus: {},
    lessonsTopTags: [],
    density: [],
    statusTally: [],
    truthRoleTally: [],
  };
}
```

Поля-заглушки (`stale: []` … `truthRoleTally: []`) заполняются в Tasks 2–3 — интерфейс отчёта полный с первого коммита (D1).

- [ ] **Step 1.4: GREEN.** Та же команда — все 6 тестов проходят.
- [ ] **Step 1.5: Полный `npm run check`.** Коммит: `feat(insights): report skeleton — scope, topic filter, top tags/files, type distribution`.

---

### Task 2: сигналы технического долга — stale, конфликты, low-confidence, blockers, decisions by status

**Files:**

- Modify: `tests/unit/use-cases/generate-insights.test.ts`
- Modify: `src/app/use-cases/generate-insights.ts`

- [ ] **Step 2.1: Failing-тесты.** Добавить в тест-файл новый `describe`:

```typescript
describe('generateInsights — debt signals', () => {
  it('marks active older than 30 days as stale, 29 days not, status stale always, archived/superseded never (D5)', async () => {
    const store = fakeStore([
      obj({ id: 'fresh', updated_at: isoDaysAgo(29) }),
      obj({ id: 'old', updated_at: isoDaysAgo(31) }),
      obj({ id: 'flagged', status: 'stale', updated_at: NOW.toISOString() }),
      obj({ id: 'gone', status: 'superseded', updated_at: isoDaysAgo(400) }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.stale.map((o) => o.id)).toEqual(['old', 'flagged']);
  });

  it('groups active decisions sharing a tag into one candidate; disjoint decisions yield none (D6)', async () => {
    const store = fakeStore([
      obj({ id: 'd1', type: 'decision', tags: ['auth'] }),
      obj({ id: 'd2', type: 'decision', tags: ['auth', 'api'] }),
      obj({ id: 'd3', type: 'decision', tags: ['ui'] }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.conflicts.candidates).toHaveLength(1);
    expect(report.conflicts.candidates[0].map((o) => o.id)).toEqual(['d1', 'd2']);
  });

  it('collects any-type conflicting-status objects into statusConflicting (D6)', async () => {
    const store = fakeStore([obj({ id: 'l1', type: 'lesson', status: 'conflicting' })]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.conflicts.statusConflicting.map((o) => o.id)).toEqual(['l1']);
    expect(report.conflicts.candidates).toHaveLength(0);
  });

  it('fills lowConfidenceActive, openBlockers and decisionsByStatus', async () => {
    const store = fakeStore([
      obj({ id: 'lc', confidence: 'low' }),
      obj({ id: 'bl', type: 'blocker' }),
      obj({ id: 'da', type: 'decision', status: 'active' }),
      obj({ id: 'ds', type: 'decision', status: 'superseded', superseded_by: 'da' }),
      obj({ id: 'dr', type: 'decision', status: 'rejected' }),
      obj({ id: 'lo', type: 'lesson', status: 'obsolete' }), // не decision — в decisionsByStatus не попадает
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.lowConfidenceActive.map((o) => o.id)).toEqual(['lc']);
    expect(report.openBlockers.map((o) => o.id)).toEqual(['bl']);
    expect(Object.keys(report.decisionsByStatus).sort()).toEqual(['active', 'obsolete', 'rejected', 'superseded']);
    expect(report.decisionsByStatus['superseded'].map((o) => o.id)).toEqual(['ds']);
    expect(report.supersededDecisions.map((o) => o.id)).toEqual(['ds']);
  });
});
```

- [ ] **Step 2.2: Run → FAIL** (`npm run test:run -- tests/unit/use-cases/generate-insights.test.ts`) — массивы-заглушки пусты.
- [ ] **Step 2.3: Реализация.** В `generateInsights` перед `return` добавить (константу `DECISION_STATUSES` объявить рядом с `DEBUG_TAGS`):

```typescript
const DECISION_STATUSES = ['active', 'superseded', 'rejected', 'obsolete'] as const;
```

```typescript
const now = deps.clock.now().getTime();
const staleMs = INSIGHTS_STALE_DAYS * 24 * 60 * 60 * 1000;
const stale = matched.filter(
  (obj) => obj.status === 'stale' || (obj.status === 'active' && now - new Date(obj.updated_at).getTime() > staleMs)
);

const statusConflicting = matched.filter((obj) => obj.status === 'conflicting');
const activeDecisions = matched.filter((obj) => obj.type === 'decision' && obj.status === 'active');
// ponytail: O(n²) попарная группировка — норм для local-first масштабов; union-find если память вырастет
const claimed = new Set<string>();
const candidates: MemoryObject[][] = [];
for (let i = 0; i < activeDecisions.length; i++) {
  if (claimed.has(activeDecisions[i].id)) continue;
  const group = [activeDecisions[i]];
  for (let j = i + 1; j < activeDecisions.length; j++) {
    if (activeDecisions[j].tags.some((tag) => activeDecisions[i].tags.includes(tag))) {
      group.push(activeDecisions[j]);
      claimed.add(activeDecisions[j].id);
    }
  }
  if (group.length >= 2) candidates.push(group);
}

const lowConfidenceActive = matched.filter((obj) => obj.confidence === 'low' && obj.status === 'active');
const openBlockers = matched.filter((obj) => obj.type === 'blocker' && obj.status === 'active'); // прецедент brief

const decisionsByStatus: Record<string, MemoryObject[]> = {};
for (const status of DECISION_STATUSES) decisionsByStatus[status] = [];
for (const obj of matched) {
  if (obj.type === 'decision' && Object.hasOwn(decisionsByStatus, obj.status)) {
    decisionsByStatus[obj.status].push(obj);
  }
}
```

В `return` заменить заглушки:

```typescript
    stale,
    supersededDecisions: decisionsByStatus['superseded'] ?? [],
    conflicts: { statusConflicting, candidates },
    lowConfidenceActive,
    openBlockers,
    decisionsByStatus,
```

- [ ] **Step 2.4: GREEN + полный `npm run check`.** Коммит: `feat(insights): stale/conflict/debt signals with injected clock`.

---

### Task 3: density/activity — недельные бакеты, tallies; read-only контракт

**Files:**

- Modify: `tests/unit/use-cases/generate-insights.test.ts`
- Modify: `src/app/use-cases/generate-insights.ts`

- [ ] **Step 3.1: Failing-тесты.** Новый `describe`:

```typescript
describe('generateInsights — density and tallies', () => {
  it('buckets created_at into ISO weeks (Monday keys), classes counted independently, window is 8 weeks (D7)', async () => {
    const store = fakeStore([
      // NOW = среда 2026-08-26; понедельник текущей недели = 2026-08-24
      obj({ id: 'a', type: 'decision', created_at: '2026-08-25T10:00:00.000Z' }),
      obj({ id: 'b', type: 'lesson', created_at: '2026-08-24T10:00:00.000Z' }),
      obj({ id: 'c', type: 'observation', created_at: '2026-07-27T10:00:00.000Z' }), // прошлая неделя
      obj({ id: 'd', created_at: '2026-06-01T10:00:00.000Z' }), // вне окна 8 недель
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.density).toHaveLength(8);
    // индекс 7 — текущая неделя; окно стартует с понедельника 2026-07-06 (индекс 0)
    expect(report.density[7]).toEqual({ week: '2026-08-24', decisions: 1, lessons: 1, debug: 0, total: 2 });
    expect(report.density[3]).toEqual({ week: '2026-07-27', decisions: 0, lessons: 1, debug: 0, total: 1 });
    expect(report.density[6]).toEqual({ week: '2026-08-17', decisions: 0, lessons: 0, debug: 0, total: 0 });
    expect(report.density.find((b) => b.week === '2026-06-01')).toBeUndefined();
  });

  it('debug class counts any-type objects carrying DEBUG_TAGS (D-dev1)', async () => {
    const store = fakeStore([
      obj({ id: 'l', type: 'lesson', tags: ['debug'], created_at: '2026-08-25T10:00:00.000Z' }),
      obj({ id: 'd', type: 'decision', tags: ['solve'], created_at: '2026-08-25T11:00:00.000Z' }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.density[7]).toMatchObject({ debug: 2, total: 2 });
  });

  it('fills lessonsTopTags (top 5), statusTally and truthRoleTally', async () => {
    const store = fakeStore([
      obj({ type: 'lesson', tags: ['x', 'y'] }),
      obj({ type: 'observation', tags: ['x'] }),
      obj({ type: 'decision', tags: ['x'], truth_role: 'source_of_truth' }),
    ]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.lessonsTopTags).toEqual([
      { tag: 'x', count: 2 },
      { tag: 'y', count: 1 },
    ]);
    expect(report.statusTally).toEqual([{ tag: 'active', count: 3 }]);
    expect(report.truthRoleTally).toEqual([
      { tag: 'accepted_knowledge', count: 2 },
      { tag: 'source_of_truth', count: 1 },
    ]);
  });
});
```

Арифметика окна для ревью ассертов: NOW — среда 2026-08-26, текущий понедельник `2026-08-24` (индекс 7), окно стартует с `2026-07-06` (индекс 0); объект `c` создан в понедельник `2026-07-27` ⇒ индекс 3; объект `d` (2026-06-01) старше окна и ни в один бакет не попадает.

- [ ] **Step 3.2: Run → FAIL.**
- [ ] **Step 3.3: Реализация.** Добавить функцию (рядом с `topCounts`):

```typescript
function mondayOf(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  const mondayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86_400_000;
  return new Date(mondayMs).toISOString().slice(0, 10);
}
```

В `generateInsights` перед `return`:

```typescript
const currentMondayMs = Date.parse(`${mondayOf(deps.clock.now().toISOString())}T00:00:00Z`);
const buckets = new Map<string, WeekBucket>();
for (let i = 7; i >= 0; i--) {
  const key = new Date(currentMondayMs - i * 7 * 86_400_000).toISOString().slice(0, 10);
  buckets.set(key, { week: key, decisions: 0, lessons: 0, debug: 0, total: 0 });
}
for (const obj of matched) {
  const bucket = buckets.get(mondayOf(obj.created_at));
  if (!bucket) continue;
  if (obj.type === 'decision') bucket.decisions += 1;
  if (obj.type === 'lesson' || obj.type === 'observation') bucket.lessons += 1;
  if (obj.tags.some((tag) => DEBUG_TAGS.includes(tag))) bucket.debug += 1;
  bucket.total += 1;
}

const lessonsTopTags = topCounts(
  matched.filter((obj) => obj.type === 'lesson' || obj.type === 'observation').flatMap((obj) => obj.tags),
  5
);
const statusTally = topCounts(
  matched.map((obj) => obj.status),
  Math.max(matched.length, 1)
);
const truthRoleTally = topCounts(
  matched.map((obj) => obj.truth_role),
  Math.max(matched.length, 1)
);
```

В `return` заменить заглушки: `density: [...buckets.values()], lessonsTopTags, statusTally, truthRoleTally`.

- [ ] **Step 3.4: GREEN.**
- [ ] **Step 3.5: Failing-тест read-only (D10)** — реальные адаптеры поверх tmpdir, как в `generate-agent-brief.test.ts`. Новый `describe` (+ импорты `mkdtempSync, rmSync, readdirSync, readFileSync` из `'fs'`, `tmpdir` из `'os'`, `join, relative` из `'path'`, `MarkdownMemoryStore` из `'../../../src/adapters/fs/markdown-memory-store.js'`):

```typescript
describe('generateInsights — read-only contract', () => {
  it('does not mutate the memory directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-insights-ro-'));
    try {
      const store = new MarkdownMemoryStore(dir);
      await store.save(obj({ id: 'ro-1', type: 'lesson', tags: ['debug'] }));
      const snapshot = (): Map<string, string> => {
        const out = new Map<string, string>();
        const walk = (p: string): void => {
          for (const entry of readdirSync(p, { withFileTypes: true })) {
            const full = join(p, entry.name);
            if (entry.isDirectory()) walk(full);
            else out.set(relative(dir, full), readFileSync(full, 'utf-8'));
          }
        };
        walk(dir);
        return out;
      };
      const before = snapshot();
      await generateInsights({ store, clock: fakeClock() }, { topic: 'debug' });
      expect(snapshot()).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

Если `store.save` требует инициализированный каталог `.wolf/memory` — прогони сначала `init`-путь как в `tests/unit/use-cases/init-project-memory.test.ts` (инициализатор из `src/adapters/fs/fs-project-initializer.js`); семантика теста не меняется.

- [ ] **Step 3.6: Run → PASS** (use-case уже ничего не пишет; тест фиксирует контракт).
- [ ] **Step 3.7: Полный `npm run check`.** Коммит: `feat(insights): weekly density buckets, governance tallies, read-only contract test`.

---

### Task 4: renderInsights — пять линз human-text рендера

**Files:**

- Modify: `tests/unit/use-cases/generate-insights.test.ts`
- Modify: `src/app/use-cases/generate-insights.ts`

- [ ] **Step 4.1: Failing-тесты.** Новый `describe`:

```typescript
describe('renderInsights', () => {
  const base = {
    topic: null,
    analysisType: 'patterns' as const,
    generatedAt: NOW.toISOString(),
    scope: { total: 2, matched: 2 },
    topTags: [{ tag: 'auth', count: 2 }],
    topFiles: [{ file: 'src/a.ts', count: 2 }],
    typeDistribution: [
      { tag: 'decision', count: 1 },
      { tag: 'lesson', count: 1 },
    ],
    stale: [],
    supersededDecisions: [],
    conflicts: { statusConflicting: [], candidates: [] },
    lowConfidenceActive: [],
    openBlockers: [],
    decisionsByStatus: {},
    lessonsTopTags: [],
    density: [],
    statusTally: [],
    truthRoleTally: [{ tag: 'accepted_knowledge', count: 2 }],
  };

  it('renders each lens with its own section headers plus Scope line and Generated footer', () => {
    const mk = (over: Partial<typeof base>): string =>
      renderInsights({ ...base, ...over } as Parameters<typeof renderInsights>[0]);

    const patterns = mk({});
    expect(patterns).toContain('Insights [patterns] (project-wide), matched 2/2 objects');
    expect(patterns).toContain('Scope: matched 2/2 objects, truth roles: accepted_knowledge 2');
    expect(patterns).toContain('## Top tags');
    expect(patterns).toContain('- auth (2)');
    expect(patterns).toContain('## Frequent related.files');
    expect(patterns).toContain('## Type distribution');
    expect(patterns).toContain(`Generated: ${NOW.toISOString()}`);

    const debt = mk({ analysisType: 'technical_debt' });
    expect(debt).toContain('## Stale objects');
    expect(debt).toContain('## Superseded decisions');
    expect(debt).toContain('## Low-confidence active');
    expect(debt).toContain('## Open blockers');

    const decisions = mk({
      analysisType: 'decisions',
      decisionsByStatus: { active: [obj({ id: 'd1', type: 'decision', updated_at: NOW.toISOString() })] },
      conflicts: {
        statusConflicting: [],
        candidates: [
          [obj({ id: 'c1', type: 'decision', tags: ['auth'] }), obj({ id: 'c2', type: 'decision', tags: ['auth'] })],
        ],
      },
    });
    expect(decisions).toContain('## Decisions by status');
    expect(decisions).toContain('## Potential conflicts');
    expect(decisions).toContain('potential conflict (shared tag: auth): c1, c2');
    expect(decisions).toContain('## Recent decisions');
    expect(decisions).toContain('d1');

    const lessons = mk({ analysisType: 'lessons', lessonsTopTags: [{ tag: 'x', count: 1 }] });
    expect(lessons).toContain('## Lesson/Observation counts');
    expect(lessons).toContain('## Stale lessons');
    expect(lessons).toContain('## Top lesson tags');

    const activity = mk({
      analysisType: 'activity',
      density: [{ week: '2026-08-24', decisions: 1, lessons: 0, debug: 0, total: 1 }],
      statusTally: [{ tag: 'active', count: 2 }],
    });
    expect(activity).toContain('## Weekly density');
    expect(activity).toContain('- 2026-08-24: 1 decisions, 0 lessons, 0 debug, 1 total');
    expect(activity).toContain('## Status tally');
  });

  it('renders empty memory gracefully: dash instead of sections, no throw, all five lenses', () => {
    for (const analysisType of ANALYSIS_TYPES) {
      const text = renderInsights({ ...base, analysisType });
      expect(text).toContain('-');
      expect(text).toContain(`Insights [${analysisType}]`);
    }
  });

  it('renders topic label when topic is set', () => {
    const text = renderInsights({ ...base, topic: 'auth' });
    expect(text).toContain('Insights [patterns] (topic: auth), matched 2/2 objects');
  });
});
```

(+ импорт `renderInsights` в шапке тест-файла.)

- [ ] **Step 4.2: Run → FAIL** — функции нет.
- [ ] **Step 4.3: Реализация.** В конец `generate-insights.ts`:

```typescript
function section(lines: string[], title: string, items: string[]): void {
  lines.push('', `## ${title}`);
  if (items.length === 0) {
    lines.push('-');
  } else {
    for (const item of items) lines.push(item);
  }
}

export function renderInsights(report: InsightsReport): string {
  const lines: string[] = [];
  const topicLabel = report.topic ? `topic: ${report.topic}` : 'project-wide';
  lines.push(
    `Insights [${report.analysisType}] (${topicLabel}), matched ${report.scope.matched}/${report.scope.total} objects`
  );
  const roles = report.truthRoleTally.map((t) => `${t.tag} ${t.count}`).join(' / ');
  lines.push(`Scope: matched ${report.scope.matched}/${report.scope.total} objects, truth roles: ${roles || '-'}`);

  const fmtObj = (obj: MemoryObject): string => `- ${obj.id} [${obj.type}] ${obj.title}`;

  if (report.analysisType === 'patterns') {
    section(
      lines,
      'Top tags',
      report.topTags.map((t) => `- ${t.tag} (${t.count})`)
    );
    section(
      lines,
      'Frequent related.files',
      report.topFiles.map((f) => `- ${f.file} (${f.count})`)
    );
    section(
      lines,
      'Type distribution',
      report.typeDistribution.map((t) => `- ${t.tag} (${t.count})`)
    );
  }

  if (report.analysisType === 'technical_debt') {
    section(lines, 'Stale objects', report.stale.map(fmtObj));
    section(lines, 'Superseded decisions', report.supersededDecisions.map(fmtObj));
    section(lines, 'Low-confidence active', report.lowConfidenceActive.map(fmtObj));
    section(lines, 'Open blockers', report.openBlockers.map(fmtObj));
  }

  if (report.analysisType === 'decisions') {
    section(
      lines,
      'Decisions by status',
      Object.entries(report.decisionsByStatus).map(([status, objs]) => `- ${status}: ${objs.length}`)
    );
    section(lines, 'Potential conflicts', [
      ...report.conflicts.statusConflicting.map((obj) => `- ${fmtObj(obj)} (status: conflicting)`),
      ...report.conflicts.candidates.map((group) => {
        const shared = group[0].tags.find((tag) => group.every((o) => o.tags.includes(tag)));
        return `- potential conflict (shared tag: ${shared ?? '?'}): ${group.map((o) => o.id).join(', ')}`;
      }),
    ]);
    const recent = [...(report.decisionsByStatus['active'] ?? [])]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);
    section(lines, 'Recent decisions', recent.map(fmtObj));
  }

  if (report.analysisType === 'lessons') {
    const counts = report.typeDistribution.filter((t) => t.tag === 'lesson' || t.tag === 'observation');
    section(
      lines,
      'Lesson/Observation counts',
      counts.map((t) => `- ${t.tag}: ${t.count}`)
    );
    section(
      lines,
      'Stale lessons',
      report.stale.filter((obj) => obj.type === 'lesson' || obj.type === 'observation').map(fmtObj)
    );
    section(
      lines,
      'Top lesson tags',
      report.lessonsTopTags.map((t) => `- ${t.tag} (${t.count})`)
    );
  }

  if (report.analysisType === 'activity') {
    section(
      lines,
      'Weekly density',
      report.density.map(
        (b) => `- ${b.week}: ${b.decisions} decisions, ${b.lessons} lessons, ${b.debug} debug, ${b.total} total`
      )
    );
    section(
      lines,
      'Status tally',
      report.statusTally.map((t) => `- ${t.tag} (${t.count})`)
    );
  }

  lines.push('', `Generated: ${report.generatedAt}`);
  return lines.join('\n');
}
```

- [ ] **Step 4.4: GREEN + полный `npm run check`.** Коммит: `feat(insights): five-lens human text renderer`.

---

### Task 5: CLI `wolf insights`

**Files:**

- Create: `src/adapters/cli/commands/memory-insights.ts`
- Modify: `src/adapters/cli/cli-entry.ts` (import-блок строки 5–32; регистрация строки 44–69)

- [ ] **Step 5.1: Команда.** Создать `src/adapters/cli/commands/memory-insights.ts` по образцу `memory-search.ts` (V11):

```typescript
import { Command, Option } from 'commander';
import { generateInsights, renderInsights, ANALYSIS_TYPES } from '../../../app/use-cases/generate-insights.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryInsightsCommand(): Command {
  return new Command('insights')
    .description('Heuristic pattern analysis over project memory (Level 1, no LLM)')
    .option('--topic <topic>', 'Filter by topic: exact tag match or substring in title/body')
    .addOption(new Option('--type <type>', 'Analysis lens').choices([...ANALYSIS_TYPES]).default('patterns'))
    .action(async (options) => {
      const { store, clock } = createCliContainer(process.cwd());
      const report = await generateInsights({ store, clock }, { topic: options.topic, analysisType: options.type });
      console.log(renderInsights(report));
    });
}
```

- [ ] **Step 5.2: Регистрация.** В `src/adapters/cli/cli-entry.ts`: после строки `import { memoryCallCommand as callCommand } ...` добавить

```typescript
import { memoryInsightsCommand as insightsCommand } from './commands/memory-insights.js';
```

после строки `program.addCommand(callCommand());` добавить

```typescript
program.addCommand(insightsCommand());
```

- [ ] **Step 5.3: Ручная проверка.** `npm run build && node dist/bootstrap/cli.js insights --help` — help показывает `--topic` и `--type` с пятью choices; `node dist/bootstrap/cli.js insights` на этом репо — exit 0, заголовок `Insights [patterns] (project-wide), matched M/N objects`.
- [ ] **Step 5.4: Полный `npm run check`.** Коммит: `feat(insights): wolf insights command`.

---

### Task 6: MCP-тул `insights`

**Files:**

- Modify: `src/adapters/mcp/mcp-schemas.ts` (в конец файла)
- Modify: `src/adapters/mcp/mcp-tools.ts` (imports строки 1–31; регистрация после тула `brief`, строки 274–285)
- Modify: `tests/unit/adapters/mcp-server.test.ts`

- [ ] **Step 6.1: Failing-тест.** В `tests/unit/adapters/mcp-server.test.ts` внутрь существующего `describe('buildMcpServer')` (паттерн теста `'generates an agent brief'`, строки 185–198):

```typescript
it('analyzes memory via insights tool', async () => {
  const server = buildMcpServer(dir);
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
      >;
    }
  )._registeredTools;
  const result = await tools.insights.handler({});
  expect(result.content).toHaveLength(1);
  expect(result.content[0].text).toContain('Insights [patterns]');
});

it('rejects invalid insights type', async () => {
  const server = buildMcpServer(dir);
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
      >;
    }
  )._registeredTools;
  await expect(tools.insights.handler({ type: 'bogus' })).rejects.toThrow(/Allowed:/);
});
```

- [ ] **Step 6.2: Run → FAIL** — тула `insights` нет (`tools.insights` undefined).
- [ ] **Step 6.3: Схема.** В конец `src/adapters/mcp/mcp-schemas.ts`:

```typescript
export const InsightsInputSchema = z.object({
  topic: z.string().optional(),
  type: z.enum(['patterns', 'technical_debt', 'decisions', 'lessons', 'activity']).optional(),
});
```

- [ ] **Step 6.4: Тул.** В `src/adapters/mcp/mcp-tools.ts`: в import схем добавить `InsightsInputSchema`; добавить импорты

```typescript
import { generateInsights, renderInsights } from '../../app/use-cases/generate-insights.js';
```

после регистрации `brief` (строка 285):

```typescript
server.registerTool(
  'insights',
  {
    description: 'Heuristic pattern analysis over project memory (Level 1, no LLM)',
    inputSchema: InsightsInputSchema,
  },
  async (input: unknown) => {
    const args = input as {
      topic?: string;
      type?: 'patterns' | 'technical_debt' | 'decisions' | 'lessons' | 'activity';
    };
    const report = await generateInsights(
      { store: deps.store, clock: deps.clock },
      { topic: args.topic, analysisType: args.type }
    );
    return { content: [{ type: 'text' as const, text: renderInsights(report) }] };
  }
);
```

`deps` в `registerMemoryTools(server, deps, baseDir)` — полный контейнер (`ReturnType<typeof createCliContainer>`, mcp-tools.ts:33-37), поэтому `deps.store` и `deps.clock` доступны напрямую.

- [ ] **Step 6.5: GREEN + полный `npm run check`.** Коммит: `feat(insights): MCP insights tool`.

---

### Task 7: E2E золотые сценарии

**Files:**

- Create: `tests/e2e/insights.e2e.ts` (каркас `tests/e2e/helpers.ts`: `ensureBuilt/runCli/tmpProject`; шаблон — `tests/e2e/solve-empty.e2e.ts`)

Сидинг через корневую команду `wolf add` (флаги сверены с `src/adapters/cli/commands/memory-add.ts`: `--type` choices, `--title` required, `--body`, `--tags` comma-separated, `--created-by` default `user:cli`).

- [ ] **Step 7.1: Сценарий populated.** Создать `tests/e2e/insights.e2e.ts`:

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('insights golden scenarios', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('insights analyzes seeded memory by topic', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init'], dir);

    const decision = runCli(
      [
        'add',
        '--type',
        'decision',
        '--title',
        'Use JWT for API auth',
        '--body',
        'Chose JWT over sessions',
        '--tags',
        'auth',
      ],
      dir
    );
    expect(decision.status).toBe(0);
    const lesson = runCli(
      [
        'add',
        '--type',
        'lesson',
        '--title',
        'JWT expiry bites',
        '--body',
        'Short JWT lifetimes caused login bugs',
        '--tags',
        'auth,debug',
      ],
      dir
    );
    expect(lesson.status).toBe(0);

    const insights = runCli(['insights', '--topic', 'auth', '--type', 'patterns'], dir);
    expect(insights.status).toBe(0);
    expect(insights.stdout).toContain('Insights [patterns]');
    expect(insights.stdout).toContain('(topic: auth)');
    expect(insights.stdout).toContain('## Top tags');
    expect(insights.stdout).toContain('auth');
  });

  it('insights on empty memory degrades gracefully', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init'], dir);

    const insights = runCli(['insights'], dir);
    expect(insights.status).toBe(0);
    expect(insights.stdout).toContain('Insights [patterns] (project-wide)');
    expect(insights.stdout).toContain('matched 0/0 objects');
    expect(insights.stdout).toContain('-');
  });
});
```

- [ ] **Step 7.2: Run → GREEN.** `npm run e2e` — оба сценария зелёные вместе со всей e2e-сюитой.
- [ ] **Step 7.3: Полный `npm run check`.** Коммит: `test(e2e): insights golden scenarios — seeded topic analysis and empty-memory graceful degradation`.

---

### Task 8: документация + финальная верификация

**Files:**

- Modify: `README.md` (секция `## Commands`, начинается строка 29; фазы оформлены подсекциями `### Phase N: …`)

- [ ] **Step 8.1: README.** Якорь: подсекция `### Phase 9: solve/call` внутри `## Commands` (строка 98; следующая секция верхнего уровня — `## Testing`). Добавить сразу после последнего буллета Phase 9, до `## Testing`:

```markdown
### Insights (Level 1 analytics)

- `wolf insights [--topic <topic>] [--type <type>]` — deterministic heuristic analysis of project memory, no LLM. Five lenses: `patterns` (default), `technical_debt`, `decisions`, `lessons`, `activity`; without arguments — project-wide overview. Deliberate deviations from the roadmap: debug-density is a tag heuristic (`debug`, `bug`, `bugfix`, `memory-repair`, `solve`) because the taxonomy has no `debug` core type; LLM synthesis (Level 2) is out of scope for this phase; both flags are optional.
```

- [ ] **Step 8.2: Формат.** `npx prettier --write "docs/superpowers/plans/2026-08-26-phase-10-insights.md" README.md` (prettier проверяет `docs/**/*.md` и README — формат-чистота обязательна, V15).
- [ ] **Step 8.3: Финал.** `npm run check` зелёный + `npm run e2e` зелёный. Коммит: `docs: phase 10 insights documentation`.

---

## Definition of Done (фаза)

1. Все 5 analysis types работают через CLI (`wolf insights`) и MCP (`insights`); `wolf insights --topic auth --type patterns` даёт эвристический анализ без LLM (roadmap success criteria, сужённый D-dev2).
2. Один `store.list()` на отчёт (D1); read-only контракт подтверждён тестом неизменности каталога (D10).
3. Real-time/cross-project отсутствуют (out of scope, V1); LLM-адаптера нет (D-dev2); новых зависимостей нет.
4. Все решения D1–D12 и отклонения D-dev1–D-dev3 спеки реализованы.
5. `npm run check` и `npm run e2e` зелёные; README обновлён.

## E2E-секция (правило mem_20260823_e2e_5459cc)

Полное E2E выполняется после реализации плана: оба золотых сценария из Task 7 прогоняются через `npm run e2e` (build + vitest, каркас tests/e2e/). Результат фиксируется в execution-отчёте фазы.

## Самопроверка плана (что сознательно НЕ входит)

- `--json` и структурированный вывод — до первого потребителя (D8).
- Нормализация тегов (lowercase-миграция стора) — отдельная фаза; здесь только case-insensitive сравнение на лету (V9).
- Tag co-occurrence, графовые метрики — YAGNI для Level 1.
- Governance-фильтры — ждут портов (D9); Level 1 только показывает `truthRoleTally` в Scope-строке.
- Unit-тесты используют fake store/clock (детерминизм D5) — прецедента в репо нет, это осознанный новый паттерн для этого файла; интеграционный стиль с реальными адаптерами применён только в read-only тесте (Step 3.5).
