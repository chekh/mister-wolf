# Phase 11 — wolf think — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Спека:** `docs/superpowers/specs/2026-08-26-phase-11-thinking.md` (APPROVED). План — развёртка спеки 1:1; решения D1–D10 и отклонения D-dev1–D-dev3 определены в спеке и здесь не дублируются. V-факты кода — спека §0; все ссылки на строки и сигнатуры сверены research-воркером с dev @ 45e6e51 (2026-08-26).

**Goal:** Реализовать `wolf think start|add|conclude|abandon` и MCP-тулы `start_thinking`/`add_thought`/`conclude_thinking`/`abandon_thinking`: явные последовательности рассуждений, где conclude создаёт `decision` со встроенным «Thinking trace» в body и `based_on`-связями на все мысли, а scratch-файл удаляется.

**Architecture:** Гексагон сохраняется. Весь use-case — один модуль `src/app/use-cases/thinking.ts` (типы D2, `THOUGHT_TYPES`, четыре экспортированные функции, внутренние хелперы чтения/записи scratch). Scratch живёт в `.wolf/thinking/<seq-id>.jsonl` — вне md-стора (V6/V7), путь — один хелпер `thinkingDir` в project-paths.ts. Новых доменных типов, миграций, событий и зависимостей нет (D9).

**Tech Stack:** TypeScript (ESM), zod 4, commander 12, vitest — только существующие зависимости.

---

## Соответствие спеке (трассировка)

| Задача спеки                                  | Задачи плана |
| --------------------------------------------- | ------------ |
| Task 1 (use-case `thinking.ts`, TDD)          | Tasks 1–4    |
| Task 2 (CLI `wolf think`)                     | Task 5       |
| Task 3 (MCP-тулы)                             | Task 6       |
| Task 4 (E2E золотые сценарии)                 | Task 7       |
| Task 5 (документация + финальная верификация) | Task 8       |

Уточнения уровня плана (не противоречия спеке, зафиксированы, чтобы исполнитель не решал сам):

1. **Склейка trace-body (D4.2).** Спека задаёт элементы; план фиксирует сборку: `` `${input.body}\n\n## Thinking trace (${meta.id})\n\n${thoughts.map((t) => `${t.n}. [${t.type}] ${t.text}`).join('\n')}` ``.
2. **Единое сообщение об отсутствии последовательности.** `Thinking sequence not found: <id>` для add/conclude/abandon (D5 фиксирует его для abandon; D2 требует у add «Error с путём» — id однозначно задаёт путь `.wolf/thinking/<id>.jsonl`). Битый scratch — отдельные сообщения `Corrupted thinking sequence "<id>": …` (шаблоны в Task 4).
3. **`createdBy` на start (натяжка спеки, НЕ правится молча).** Поверхности принимают параметр (D6 CLI `[--created-by]`, D7 MCP `createdBy: string`), но мета D2 поля `created_by` не имеет и use-case его не сохраняет (сигнатуры D10 — авторитетны). Решение: поверхности параметр принимают и не пробрасывают в use-case; автор фиксируется при conclude. Зафиксировать в execution-отчёте фазы как расхождение D6/D7 ↔ D2/D10.
4. **Номер мысли `n`.** Вычисляется при add как `последний n + 1` из прочитанного scratch.
5. **Ответы CLI.** `Started thinking sequence: <id>` / `Added thought: <tid>` / `Created decision: <id>` / `Abandoned thinking sequence: <id>` — те же строки, что у MCP-тулов (D7), для единообразия поверхностей.

## Предусловия

- [ ] **Шаг 0.1: Ветка.** `git checkout dev && git pull && git checkout -b feat/phase11-thinking` (git-flow через dev).
- [ ] **Шаг 0.2: Базовая линия.** `npm run check` зелёный до старта; базлайн фиксируется в execution-отчёте. Если красное — починить до старта, не тащить в фазу.
- [ ] **Шаг 0.3: Чистое поле.** `rg -i -n 'think' src tests` → 0 совпадений (V17; подтверждено research 2026-08-26).

---

### Task 1: каркас use-case — `thinkingDir`, типы, запись scratch, `startThinking` (TDD)

**Files:**

- Modify: `src/adapters/fs/project-paths.ts` (вставить после функции `indexPath`, т.е. после строки 23)
- Create: `tests/unit/use-cases/thinking.test.ts`
- Create: `src/app/use-cases/thinking.ts`

- [ ] **Step 1.1: Failing-тест.** Создать `tests/unit/use-cases/thinking.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { startThinking } from '../../../src/app/use-cases/thinking.js';
import { Clock } from '../../../src/ports/clock.port.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function fakeClock(): Clock {
  return { now: () => NOW };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-thinking-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function scratchPath(id: string): string {
  return join(dir, '.wolf', 'thinking', `${id}.jsonl`);
}

function thinkDeps() {
  return { baseDir: dir, clock: fakeClock(), idGen: new HashIdGenerator() };
}

describe('startThinking', () => {
  it('creates .wolf/thinking/<id>.jsonl whose first line is the sequence meta, and returns the meta', async () => {
    const meta = await startThinking(thinkDeps(), { goal: 'Decide auth approach', thread: 'thr_1' });
    expect(meta.kind).toBe('sequence');
    expect(meta.id).toMatch(/^mem_/);
    expect(meta.goal).toBe('Decide auth approach');
    expect(meta.thread).toBe('thr_1');
    expect(meta.created_at).toBe(NOW.toISOString());
    expect(existsSync(scratchPath(meta.id))).toBe(true);
    const firstLine = JSON.parse(readFileSync(scratchPath(meta.id), 'utf-8').split('\n')[0]);
    expect(firstLine).toEqual(meta);
  });

  it('defaults thread to null when omitted', async () => {
    const meta = await startThinking(thinkDeps(), { goal: 'g' });
    expect(meta.thread).toBeNull();
  });
});
```

- [ ] **Step 1.2: Run → FAIL.** `npm run test:run -- tests/unit/use-cases/thinking.test.ts` — ожидаемо: модуль `thinking.js` не найден.
- [ ] **Step 1.3: Хелпер пути.** В `src/adapters/fs/project-paths.ts` сразу после функции `indexPath` (после её закрывающей скобки, строка 23) добавить:

```typescript
export function thinkingDir(baseDir: string): string {
  return join(baseDir, '.wolf', 'thinking');
}
```

- [ ] **Step 1.4: Каркас модуля.** Создать `src/app/use-cases/thinking.ts`:

```typescript
import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { thinkingDir } from '../../adapters/fs/project-paths.js';

export const THOUGHT_TYPES = ['hypothesis', 'reasoning', 'evidence', 'concern'] as const;

export type ThoughtType = (typeof THOUGHT_TYPES)[number];

export interface SequenceMeta {
  kind: 'sequence';
  id: string;
  goal: string;
  thread: string | null;
  created_at: string;
}

export interface Thought {
  kind: 'thought';
  tid: string;
  n: number;
  type: ThoughtType;
  text: string;
  created_at: string;
}

interface ThinkingDeps {
  baseDir: string;
  clock: Clock;
  idGen: IdGenerator;
}

// ponytail: без лока — одна последовательность = один файл, сценарий single-agent;
// многописательность потребует файловый лок на scratch (D8)
function scratchPath(baseDir: string, sequenceId: string): string {
  return join(thinkingDir(baseDir), `${sequenceId}.jsonl`);
}

async function appendRecord(baseDir: string, sequenceId: string, record: SequenceMeta | Thought): Promise<void> {
  await mkdir(thinkingDir(baseDir), { recursive: true });
  await appendFile(scratchPath(baseDir, sequenceId), `${JSON.stringify(record)}\n`, 'utf-8');
}

export async function startThinking(
  deps: ThinkingDeps,
  input: { goal: string; thread?: string }
): Promise<SequenceMeta> {
  const now = deps.clock.now();
  const meta: SequenceMeta = {
    kind: 'sequence',
    id: deps.idGen.generateMemoryId(now, input.goal),
    goal: input.goal,
    thread: input.thread ?? null,
    created_at: now.toISOString(),
  };
  await appendRecord(deps.baseDir, meta.id, meta);
  return meta;
}
```

- [ ] **Step 1.5: GREEN.** Та же команда — оба теста проходят.
- [ ] **Step 1.6: Полный `npm run check`.** Коммит: `feat(thinking): scratch layout, types, startThinking`.

---

### Task 2: `addThought` — чтение scratch, номер мысли, валидация типа (TDD)

**Files:**

- Modify: `tests/unit/use-cases/thinking.test.ts`
- Modify: `src/app/use-cases/thinking.ts`

- [ ] **Step 2.1: Failing-тесты.** В шапке тест-файла расширить импорт use-case до `{ startThinking, addThought, THOUGHT_TYPES }` и добавить `describe`:

```typescript
describe('addThought', () => {
  it('appends thoughts with incrementing n and returns them', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    const t1 = await addThought(deps, { sequenceId: meta.id, type: 'hypothesis', text: 'JWT is enough' });
    const t2 = await addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'API is stateless' });
    expect(t1.n).toBe(1);
    expect(t2.n).toBe(2);
    expect(t1.kind).toBe('thought');
    expect(t1.tid).toMatch(/^mem_/);
    expect(t1.created_at).toBe(NOW.toISOString());
    const lines = readFileSync(scratchPath(meta.id), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[0].kind).toBe('sequence');
    expect(lines[1]).toEqual(t1);
    expect(lines[2]).toEqual(t2);
  });

  it('accepts every THOUGHT_TYPES value', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    for (const type of THOUGHT_TYPES) {
      const thought = await addThought(deps, { sequenceId: meta.id, type, text: `text ${type}` });
      expect(thought.type).toBe(type);
    }
  });

  it('rejects an invalid type listing allowed values', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await expect(addThought(deps, { sequenceId: meta.id, type: 'guess' as never, text: 'x' })).rejects.toThrow(
      'Allowed: hypothesis, reasoning, evidence, concern'
    );
  });

  it('throws for a missing sequence', async () => {
    const deps = thinkDeps();
    await expect(addThought(deps, { sequenceId: 'mem_nope', type: 'evidence', text: 'x' })).rejects.toThrow(
      'Thinking sequence not found: mem_nope'
    );
  });
});
```

- [ ] **Step 2.2: Run → FAIL** (`npm run test:run -- tests/unit/use-cases/thinking.test.ts`) — `addThought` не экспортирован.
- [ ] **Step 2.3: Реализация.** В `thinking.ts`: расширить импорт fs/promises до `{ appendFile, mkdir, readFile }`; добавить внутренний читатель (минимальный; укрепляется в Task 4) и `addThought`:

```typescript
async function readScratch(baseDir: string, sequenceId: string): Promise<{ meta: SequenceMeta; thoughts: Thought[] }> {
  let raw: string;
  try {
    raw = await readFile(scratchPath(baseDir, sequenceId), 'utf-8');
  } catch {
    throw new Error(`Thinking sequence not found: ${sequenceId}`);
  }
  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  const meta = JSON.parse(lines[0]) as SequenceMeta;
  const thoughts: Thought[] = [];
  for (let i = 1; i < lines.length; i++) thoughts.push(JSON.parse(lines[i]) as Thought);
  return { meta, thoughts };
}

export async function addThought(
  deps: ThinkingDeps,
  input: { sequenceId: string; type: ThoughtType; text: string }
): Promise<Thought> {
  if (!THOUGHT_TYPES.includes(input.type)) {
    throw new Error(`Invalid thought type "${String(input.type)}". Allowed: ${THOUGHT_TYPES.join(', ')}`);
  }
  const { thoughts } = await readScratch(deps.baseDir, input.sequenceId);
  const now = deps.clock.now();
  const thought: Thought = {
    kind: 'thought',
    tid: deps.idGen.generateMemoryId(now, `${input.type}: ${input.text}`),
    n: (thoughts[thoughts.length - 1]?.n ?? 0) + 1,
    type: input.type,
    text: input.text,
    created_at: now.toISOString(),
  };
  await appendRecord(deps.baseDir, input.sequenceId, thought);
  return thought;
}
```

- [ ] **Step 2.4: GREEN + полный `npm run check`.** Коммит: `feat(thinking): addThought with sequential numbering and type validation`.

---

### Task 3: `concludeThinking` — trace в body, based_on, удаление scratch (TDD)

**Files:**

- Modify: `tests/unit/use-cases/thinking.test.ts`
- Modify: `src/app/use-cases/thinking.ts`

- [ ] **Step 3.1: Failing-тесты.** Расширить импорты тест-файла: use-case до `{ startThinking, addThought, concludeThinking, THOUGHT_TYPES }`; порты:

```typescript
import { EventLog } from '../../../src/ports/event-log.port.js';
import { MemoryStore } from '../../../src/ports/memory-store.port.js';
import { RelationLog } from '../../../src/ports/relation-log.port.js';
```

Добавить фабрики-дубли и `describe`:

```typescript
function captureStore(): { store: MemoryStore; saved: Array<{ id: string; body: string }> } {
  const saved: Array<{ id: string; body: string }> = [];
  return {
    saved,
    store: {
      save: async (object) => {
        saved.push(object);
      },
      get: async () => null,
      list: async () => [],
      update: async () => {
        throw new Error('not implemented');
      },
    },
  };
}

function captureLog(): { log: EventLog; events: Array<{ type: string; payload: Record<string, unknown> }> } {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  return {
    events,
    log: {
      append: async (event) => {
        events.push(event);
      },
      readAll: async () => [],
    },
  };
}

function captureRelations(): {
  relations: RelationLog;
  appended: Array<{ subject: string; predicate: string; object: string }>;
} {
  const appended: Array<{ subject: string; predicate: string; object: string }> = [];
  return {
    appended,
    relations: {
      append: async (relation) => {
        appended.push(relation);
      },
      list: async () => [],
    },
  };
}

describe('concludeThinking', () => {
  it('creates a decision with embedded trace, based_on links in thought order, thread from meta; removes scratch', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'auth', thread: 'thr_9' });
    const t1 = await addThought(deps, { sequenceId: meta.id, type: 'hypothesis', text: 'H1' });
    const t2 = await addThought(deps, { sequenceId: meta.id, type: 'concern', text: 'C1' });
    const { store, saved } = captureStore();
    const { log, events } = captureLog();
    const { relations, appended } = captureRelations();

    const result = await concludeThinking(
      { baseDir: dir, store, log, clock: deps.clock, idGen: deps.idGen, relations },
      { sequenceId: meta.id, title: 'Use JWT', body: 'Decision body.', createdBy: 'user:test' }
    );

    expect(result.object.body).toBe(
      'Decision body.\n\n## Thinking trace (' + meta.id + ')\n\n1. [hypothesis] H1\n2. [concern] C1'
    );
    expect(saved).toHaveLength(1);
    expect(events.some((e) => e.type === 'memory.added')).toBe(true);
    expect(appended.filter((r) => r.predicate === 'based_on').map((r) => [r.subject, r.object])).toEqual([
      [result.object.id, t1.tid],
      [result.object.id, t2.tid],
    ]);
    expect(appended.filter((r) => r.predicate === 'updates').map((r) => r.object)).toEqual(['thr_9']);
    expect(appended.filter((r) => r.predicate === 'basis_for')).toHaveLength(2);
    expect(existsSync(scratchPath(meta.id))).toBe(false);
  });

  it('keeps the scratch file when createDecision fails', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'E1' });
    const store: MemoryStore = {
      save: async () => {
        throw new Error('disk full');
      },
      get: async () => null,
      list: async () => [],
      update: async () => {
        throw new Error('not implemented');
      },
    };

    await expect(
      concludeThinking(
        { baseDir: dir, store, log: captureLog().log, clock: deps.clock, idGen: deps.idGen },
        { sequenceId: meta.id, title: 'T', body: 'B', createdBy: 'user:test' }
      )
    ).rejects.toThrow('disk full');
    expect(existsSync(scratchPath(meta.id))).toBe(true);
  });

  it('throws when the sequence has no thoughts', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await expect(
      concludeThinking(
        { baseDir: dir, store: captureStore().store, log: captureLog().log, clock: deps.clock, idGen: deps.idGen },
        { sequenceId: meta.id, title: 'T', body: 'B', createdBy: 'user:test' }
      )
    ).rejects.toThrow(`Sequence has no thoughts: ${meta.id}`);
  });

  it('throws on a second conclude (scratch already removed)', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'E1' });
    const common = { baseDir: dir, clock: deps.clock, idGen: deps.idGen };
    const first = await concludeThinking(
      { ...common, store: captureStore().store, log: captureLog().log },
      { sequenceId: meta.id, title: 'T', body: 'B', createdBy: 'user:test' }
    );
    expect(first.object.id).toMatch(/^mem_/);
    await expect(
      concludeThinking(
        { ...common, store: captureStore().store, log: captureLog().log },
        { sequenceId: meta.id, title: 'T2', body: 'B2', createdBy: 'user:test' }
      )
    ).rejects.toThrow(`Thinking sequence not found: ${meta.id}`);
  });
});
```

Примечание для исполнителя: `createDecision` внутри вызывает `summarizeSession` с catch-and-log (V15) — на фейковых дублиях он отработает вхолостую и не уронит тесты; это ожидаемо.

- [ ] **Step 3.2: Run → FAIL** — `concludeThinking` не экспортирован.
- [ ] **Step 3.3: Реализация.** В `thinking.ts` импорты расширить:

```typescript
import { appendFile, mkdir, readFile, unlink } from 'fs/promises';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { createDecision, CreateDecisionResult } from './create-decision.js';
```

и добавить функцию:

```typescript
export async function concludeThinking(
  deps: {
    baseDir: string;
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
    lock?: MemoryLock;
  },
  input: { sequenceId: string; title: string; body: string; createdBy: string }
): Promise<CreateDecisionResult> {
  const { meta, thoughts } = await readScratch(deps.baseDir, input.sequenceId);
  if (thoughts.length === 0) {
    throw new Error(`Sequence has no thoughts: ${input.sequenceId}`);
  }
  const trace = thoughts.map((t) => `${t.n}. [${t.type}] ${t.text}`).join('\n');
  const body = `${input.body}\n\n## Thinking trace (${meta.id})\n\n${trace}`;
  const result = await createDecision(
    {
      store: deps.store,
      log: deps.log,
      clock: deps.clock,
      idGen: deps.idGen,
      index: deps.index,
      relations: deps.relations,
      lock: deps.lock,
    },
    {
      title: input.title,
      body,
      thread: meta.thread ?? undefined,
      basedOn: thoughts.map((t) => t.tid),
      createdBy: input.createdBy,
    }
  );
  await unlink(scratchPath(deps.baseDir, input.sequenceId)).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err;
  });
  return result;
}
```

- [ ] **Step 3.4: GREEN + полный `npm run check`.** Коммит: `feat(thinking): concludeThinking embeds trace and links based_on`.

---

### Task 4: `abandonThinking` + устойчивость к битому scratch (TDD)

**Files:**

- Modify: `tests/unit/use-cases/thinking.test.ts`
- Modify: `src/app/use-cases/thinking.ts`

- [ ] **Step 4.1: Failing-тесты.** Расширить импорт `fs` тест-файла до `{ mkdtempSync, rmSync, existsSync, readFileSync, appendFileSync, writeFileSync }`; расширить импорт use-case на `abandonThinking`; добавить два `describe`:

```typescript
describe('abandonThinking', () => {
  it('removes the scratch file', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    await addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'E1' });
    await abandonThinking({ baseDir: dir }, { sequenceId: meta.id });
    expect(existsSync(scratchPath(meta.id))).toBe(false);
  });

  it('throws when there is nothing to abandon', async () => {
    await expect(abandonThinking({ baseDir: dir }, { sequenceId: 'mem_nope' })).rejects.toThrow(
      'Thinking sequence not found: mem_nope'
    );
  });
});

describe('corrupted scratch', () => {
  it('throws on a non-JSON line', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    appendFileSync(scratchPath(meta.id), 'not-json\n');
    await expect(addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'x' })).rejects.toThrow(
      /line 2 is not valid JSON/
    );
  });

  it('throws when line 1 is not kind:"sequence"', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    writeFileSync(
      scratchPath(meta.id),
      JSON.stringify({ kind: 'thought', tid: 't', n: 1, type: 'evidence', text: 'x', created_at: NOW.toISOString() }) +
        '\n'
    );
    await expect(addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'x' })).rejects.toThrow(
      'line 1 must be kind:"sequence"'
    );
  });

  it('throws when meta id does not match the file name', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    writeFileSync(
      scratchPath(meta.id),
      JSON.stringify({ kind: 'sequence', id: 'mem_other', goal: 'g', thread: null, created_at: NOW.toISOString() }) +
        '\n'
    );
    await expect(addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'x' })).rejects.toThrow(
      'meta id mismatch ("mem_other")'
    );
  });

  it('throws on an unknown thought type stored in the file', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    appendFileSync(
      scratchPath(meta.id),
      JSON.stringify({ kind: 'thought', tid: 'mem_t', n: 1, type: 'guess', text: 'x', created_at: NOW.toISOString() }) +
        '\n'
    );
    await expect(addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'x' })).rejects.toThrow(
      'Unknown thought type "guess"'
    );
  });

  it('throws on an empty scratch file', async () => {
    const deps = thinkDeps();
    const meta = await startThinking(deps, { goal: 'g' });
    writeFileSync(scratchPath(meta.id), '');
    await expect(addThought(deps, { sequenceId: meta.id, type: 'evidence', text: 'x' })).rejects.toThrow(
      'file is empty'
    );
  });
});
```

- [ ] **Step 4.2: Run → FAIL** — `abandonThinking` не экспортирован; битый JSON сейчас даёт сырую ошибку `SyntaxError`, а не сообщение шаблона.
- [ ] **Step 4.3: Реализация.** В `thinking.ts` заменить минимальный `readScratch` из Task 2 на защищённый (добавить хелпер `parseLine` перед ним) и добавить `abandonThinking`:

```typescript
function parseLine<T>(line: string, sequenceId: string, lineNumber: number): T {
  try {
    return JSON.parse(line) as T;
  } catch {
    throw new Error(`Corrupted thinking sequence "${sequenceId}": line ${lineNumber} is not valid JSON`);
  }
}

async function readScratch(baseDir: string, sequenceId: string): Promise<{ meta: SequenceMeta; thoughts: Thought[] }> {
  let raw: string;
  try {
    raw = await readFile(scratchPath(baseDir, sequenceId), 'utf-8');
  } catch {
    throw new Error(`Thinking sequence not found: ${sequenceId}`);
  }
  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    throw new Error(`Corrupted thinking sequence "${sequenceId}": file is empty`);
  }
  const meta = parseLine<SequenceMeta>(lines[0], sequenceId, 1);
  if (meta.kind !== 'sequence') {
    throw new Error(`Corrupted thinking sequence "${sequenceId}": line 1 must be kind:"sequence"`);
  }
  if (meta.id !== sequenceId) {
    throw new Error(`Corrupted thinking sequence "${sequenceId}": meta id mismatch ("${meta.id}")`);
  }
  const thoughts: Thought[] = [];
  for (let i = 1; i < lines.length; i++) {
    const thought = parseLine<Thought>(lines[i], sequenceId, i + 1);
    if (thought.kind !== 'thought') {
      throw new Error(`Corrupted thinking sequence "${sequenceId}": line ${i + 1} must be kind:"thought"`);
    }
    if (!THOUGHT_TYPES.includes(thought.type)) {
      throw new Error(
        `Unknown thought type "${String(thought.type)}" in sequence "${sequenceId}". Allowed: ${THOUGHT_TYPES.join(', ')}`
      );
    }
    thoughts.push(thought);
  }
  return { meta, thoughts };
}

export async function abandonThinking(deps: { baseDir: string }, input: { sequenceId: string }): Promise<void> {
  try {
    await unlink(scratchPath(deps.baseDir, input.sequenceId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Thinking sequence not found: ${input.sequenceId}`);
    }
    throw err;
  }
}
```

- [ ] **Step 4.4: GREEN + полный `npm run check`.** Коммит: `feat(thinking): abandonThinking and corrupted-scratch guards`.

---

### Task 5: CLI `wolf think`

**Files:**

- Create: `src/adapters/cli/commands/memory-think.ts`
- Modify: `src/adapters/cli/cli-entry.ts` (импорт-блок строки 5–34; регистрация строки 46–73)

- [ ] **Step 5.1: Команда.** Создать `src/adapters/cli/commands/memory-think.ts` по образцу `memory-council.ts` (группа) и `memory-decision.ts` (дефолт `--created-by`):

```typescript
import { Command, Option } from 'commander';
import {
  startThinking,
  addThought,
  concludeThinking,
  abandonThinking,
  THOUGHT_TYPES,
  ThoughtType,
} from '../../../app/use-cases/thinking.js';
import { createCliContainer } from '../../../bootstrap/container.js';

export function memoryThinkCommand(): Command {
  const think = new Command('think').description('Structured thinking sequences (goal -> thoughts -> conclusion)');

  think
    .command('start')
    .description('Start a thinking sequence')
    .requiredOption('--goal <goal>', 'Goal of the thinking sequence')
    .option('--thread <thread-id>', 'Parent thread id')
    .option('--created-by <actor>', 'Creator actor (accepted for surface parity; not persisted on scratch)', 'user:cli')
    .action(async (options: { goal: string; thread?: string; createdBy: string }) => {
      const { clock, idGen } = createCliContainer(process.cwd());
      const meta = await startThinking(
        { baseDir: process.cwd(), clock, idGen },
        { goal: options.goal, thread: options.thread }
      );
      console.log(`Started thinking sequence: ${meta.id}`);
    });

  think
    .command('add')
    .description('Add a thought to a thinking sequence')
    .requiredOption('--sequence <id>', 'Thinking sequence id')
    .addOption(new Option('--type <type>', 'Thought type').choices([...THOUGHT_TYPES]).makeOptionMandatory())
    .requiredOption('--text <text>', 'Thought text')
    .action(async (options: { sequence: string; type: ThoughtType; text: string }) => {
      const { clock, idGen } = createCliContainer(process.cwd());
      const thought = await addThought(
        { baseDir: process.cwd(), clock, idGen },
        { sequenceId: options.sequence, type: options.type, text: options.text }
      );
      console.log(`Added thought: ${thought.tid}`);
    });

  think
    .command('conclude')
    .description('Conclude a thinking sequence into a decision with an embedded thinking trace')
    .requiredOption('--sequence <id>', 'Thinking sequence id')
    .requiredOption('--title <title>', 'Decision title')
    .requiredOption('--body <body>', 'Decision body')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options: { sequence: string; title: string; body: string; createdBy: string }) => {
      const { store, log, clock, idGen, index, relations, lock } = createCliContainer(process.cwd());
      const result = await concludeThinking(
        { baseDir: process.cwd(), store, log, clock, idGen, index, relations, lock },
        { sequenceId: options.sequence, title: options.title, body: options.body, createdBy: options.createdBy }
      );
      console.log(`Created decision: ${result.object.id}`);
    });

  think
    .command('abandon')
    .description('Abandon a thinking sequence without creating a decision')
    .requiredOption('--sequence <id>', 'Thinking sequence id')
    .action(async (options: { sequence: string }) => {
      await abandonThinking({ baseDir: process.cwd() }, { sequenceId: options.sequence });
      console.log(`Abandoned thinking sequence: ${options.sequence}`);
    });

  return think;
}
```

- [ ] **Step 5.2: Регистрация.** В `src/adapters/cli/cli-entry.ts`: после строки 34 (`import { memoryRecapCommand as recapCommand } …`) добавить:

```typescript
import { memoryThinkCommand as thinkCommand } from './commands/memory-think.js';
```

После строки 73 (`program.addCommand(recapCommand());`) добавить:

```typescript
program.addCommand(thinkCommand());
```

- [ ] **Step 5.3: Ручная проверка.** `npm run build && node dist/bootstrap/cli.js think --help` — help показывает 4 subcommand (start/add/conclude/abandon); `node dist/bootstrap/cli.js think add --help` показывает `--type` с choices `hypothesis|reasoning|evidence|concern`.
- [ ] **Step 5.4: Полный `npm run check`.** Коммит: `feat(thinking): wolf think command group`.

---

### Task 6: MCP-тулы

**Files:**

- Modify: `src/adapters/mcp/mcp-schemas.ts` (в конец файла, после `InsightsInputSchema`)
- Modify: `src/adapters/mcp/mcp-tools.ts` (импорт схем строки 2–17; импорт use-cases строки 18–33; регистрация — конец `registerMemoryTools`, после тула `create_rule`)
- Modify: `tests/unit/adapters/mcp-server.test.ts` (внутри `describe('buildMcpServer')`, после теста `'generates an agent brief'`, строка 226)

- [ ] **Step 6.1: Схемы.** В конец `src/adapters/mcp/mcp-schemas.ts`:

```typescript
export const ThinkingStartInputSchema = z.object({
  goal: z.string(),
  thread: z.string().optional(),
  createdBy: z.string(),
});

export const ThinkingAddInputSchema = z.object({
  sequenceId: z.string(),
  type: z.enum(['hypothesis', 'reasoning', 'evidence', 'concern']),
  text: z.string(),
});

export const ThinkingConcludeInputSchema = z.object({
  sequenceId: z.string(),
  title: z.string(),
  body: z.string(),
  createdBy: z.string(),
});

export const ThinkingAbandonInputSchema = z.object({
  sequenceId: z.string(),
});
```

- [ ] **Step 6.2: Failing-тесты.** В `tests/unit/adapters/mcp-server.test.ts`: расширить существующий импорт из mcp-schemas.js (строка 6) до `{ MemorySearchInputSchema, ThinkingAddInputSchema }`; добавить импорт `import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';`; после теста `'generates an agent brief'` (строка 226) добавить три теста (паттерн доступа `_registeredTools` — из теста `brief`, строки 213–222):

```typescript
it('runs a full thinking cycle: start -> add -> conclude creates decision with trace', async () => {
  const server = buildMcpServer(dir);
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
      >;
    }
  )._registeredTools;

  const started = await tools.start_thinking.handler({ goal: 'Decide auth', createdBy: 'agent:test' });
  const seqId = started.content[0].text.replace('Started thinking sequence: ', '');
  expect(seqId).toMatch(/^mem_/);

  const added = await tools.add_thought.handler({ sequenceId: seqId, type: 'hypothesis', text: 'JWT suffices' });
  expect(added.content[0].text).toContain('Added thought: mem_');

  const concluded = await tools.conclude_thinking.handler({
    sequenceId: seqId,
    title: 'Use JWT',
    body: 'Chosen.',
    createdBy: 'agent:test',
  });
  const decisionId = concluded.content[0].text.replace('Created decision: ', '');
  expect(decisionId).toMatch(/^mem_/);

  const store = new MarkdownMemoryStore(dir);
  const decision = await store.get(decisionId);
  expect(decision?.body).toContain('## Thinking trace');
  expect(decision?.body).toContain('1. [hypothesis] JWT suffices');
});

it('abandons a thinking sequence', async () => {
  const server = buildMcpServer(dir);
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
      >;
    }
  )._registeredTools;
  const started = await tools.start_thinking.handler({ goal: 'Spike', createdBy: 'agent:test' });
  const seqId = started.content[0].text.replace('Started thinking sequence: ', '');
  const abandoned = await tools.abandon_thinking.handler({ sequenceId: seqId });
  expect(abandoned.content[0].text).toBe(`Abandoned thinking sequence: ${seqId}`);
});

it('rejects an invalid thought type', async () => {
  const server = buildMcpServer(dir);
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }
      >;
    }
  )._registeredTools;
  await expect(tools.add_thought.handler({ sequenceId: 'mem_x', type: 'guess', text: 'x' })).rejects.toThrow();
  // ошибка схемы по букве спеки (§4 Task 3): zod-enum отклоняет невалидный тип независимо от гварда use-case
  expect(() => ThinkingAddInputSchema.parse({ sequenceId: 'mem_x', type: 'guess', text: 'x' })).toThrow();
});
```

- [ ] **Step 6.3: Run → FAIL** — тулов `start_thinking`/`add_thought`/`conclude_thinking`/`abandon_thinking` нет (`tools.start_thinking` undefined).
- [ ] **Step 6.4: Тулы.** В `src/adapters/mcp/mcp-tools.ts`: в импорт схем (строки 2–17) добавить `ThinkingStartInputSchema, ThinkingAddInputSchema, ThinkingConcludeInputSchema, ThinkingAbandonInputSchema`; после строки 33 добавить:

```typescript
import { startThinking, addThought, concludeThinking, abandonThinking } from '../../app/use-cases/thinking.js';
```

В конец `registerMemoryTools` (после регистрации `create_rule`) добавить четыре тула:

```typescript
server.registerTool(
  'start_thinking',
  {
    description: 'Start a structured thinking sequence (goal -> thoughts -> conclusion)',
    inputSchema: ThinkingStartInputSchema,
  },
  async (input: unknown) => {
    const args = input as { goal: string; thread?: string; createdBy: string };
    const meta = await startThinking(
      { baseDir, clock: deps.clock, idGen: deps.idGen },
      { goal: args.goal, thread: args.thread }
    );
    return { content: [{ type: 'text' as const, text: `Started thinking sequence: ${meta.id}` }] };
  }
);

server.registerTool(
  'add_thought',
  {
    description: 'Add a thought to a thinking sequence',
    inputSchema: ThinkingAddInputSchema,
  },
  async (input: unknown) => {
    const args = input as {
      sequenceId: string;
      type: 'hypothesis' | 'reasoning' | 'evidence' | 'concern';
      text: string;
    };
    const thought = await addThought(
      { baseDir, clock: deps.clock, idGen: deps.idGen },
      { sequenceId: args.sequenceId, type: args.type, text: args.text }
    );
    return { content: [{ type: 'text' as const, text: `Added thought: ${thought.tid}` }] };
  }
);

server.registerTool(
  'conclude_thinking',
  {
    description: 'Conclude a thinking sequence into a decision with an embedded trace and based_on links',
    inputSchema: ThinkingConcludeInputSchema,
  },
  async (input: unknown) => {
    const args = input as { sequenceId: string; title: string; body: string; createdBy: string };
    const result = await concludeThinking(
      {
        baseDir,
        store: deps.store,
        log: deps.log,
        clock: deps.clock,
        idGen: deps.idGen,
        index: deps.index,
        relations: deps.relations,
        lock: deps.lock,
      },
      { sequenceId: args.sequenceId, title: args.title, body: args.body, createdBy: args.createdBy }
    );
    return { content: [{ type: 'text' as const, text: `Created decision: ${result.object.id}` }] };
  }
);

server.registerTool(
  'abandon_thinking',
  {
    description: 'Abandon a thinking sequence without creating a decision',
    inputSchema: ThinkingAbandonInputSchema,
  },
  async (input: unknown) => {
    const args = input as { sequenceId: string };
    await abandonThinking({ baseDir }, { sequenceId: args.sequenceId });
    return { content: [{ type: 'text' as const, text: `Abandoned thinking sequence: ${args.sequenceId}` }] };
  }
);
```

`baseDir` — третий параметр `registerMemoryTools(server, deps, baseDir)` (mcp-tools.ts:36-40). `createdBy` в `start_thinking` принимается схемой (D7), в use-case не пробрасывается — уточнение №3.

- [ ] **Step 6.5: GREEN + полный `npm run check`.** Коммит: `feat(thinking): MCP thinking tools`.

---

### Task 7: E2E золотые сценарии

**Files:**

- Create: `tests/e2e/thinking.e2e.ts` (каркас `tests/e2e/helpers.ts`: `ensureBuilt/runCli/tmpProject`; шаблон — `tests/e2e/solve-empty.e2e.ts`)

- [ ] **Step 7.1: Сценарии.** Создать `tests/e2e/thinking.e2e.ts`:

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

function findObjectMd(root: string, id: string): string {
  const stack = [join(root, '.wolf', 'memory')];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === `${id}.md`) return full;
    }
  }
  throw new Error(`object file not found: ${id}`);
}

function thinkingEntries(dir: string): string[] {
  const thinking = join(dir, '.wolf', 'thinking');
  return existsSync(thinking) ? readdirSync(thinking) : [];
}

describe('thinking golden scenarios', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('full cycle: start -> 4 thoughts -> conclude creates decision with trace and based_on links', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init'], dir);

    const start = runCli(['think', 'start', '--goal', 'Choose auth strategy'], dir);
    expect(start.status).toBe(0);
    const seqId = start.stdout.trim().replace('Started thinking sequence: ', '');
    expect(seqId).toMatch(/^mem_/);

    const thoughts: Array<[string, string]> = [
      ['hypothesis', 'JWT alone is enough'],
      ['reasoning', 'API clients are stateless'],
      ['evidence', 'Existing sessions caused bugs'],
      ['concern', 'Token revocation is hard'],
    ];
    const tids: string[] = [];
    for (const [type, text] of thoughts) {
      const add = runCli(['think', 'add', '--sequence', seqId, '--type', type, '--text', text], dir);
      expect(add.status).toBe(0);
      tids.push(add.stdout.trim().replace('Added thought: ', ''));
    }

    const conclude = runCli(
      ['think', 'conclude', '--sequence', seqId, '--title', 'Use JWT for auth', '--body', 'Chosen JWT.'],
      dir
    );
    expect(conclude.status).toBe(0);
    const decisionId = conclude.stdout.trim().replace('Created decision: ', '');
    expect(decisionId).toMatch(/^mem_/);

    expect(thinkingEntries(dir)).toEqual([]);

    const md = readFileSync(findObjectMd(dir, decisionId), 'utf-8');
    expect(md).toContain('## Thinking trace');
    expect(md).toContain('1. [hypothesis] JWT alone is enough');
    expect(md).toContain('4. [concern] Token revocation is hard');

    const relations = readFileSync(join(dir, '.wolf', 'memory', 'relations.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const basedOn = relations.filter((r) => r.subject === decisionId && r.predicate === 'based_on');
    expect(basedOn.map((r) => r.object)).toEqual(tids);
    const basisFor = relations.filter((r) => r.predicate === 'basis_for');
    expect(basisFor).toHaveLength(4);
    expect(basisFor.map((r) => r.object)).toEqual(Array(4).fill(decisionId));
  });

  it('abandon removes the sequence without touching memory', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init'], dir);

    const start = runCli(['think', 'start', '--goal', 'Spike idea'], dir);
    expect(start.status).toBe(0);
    const seqId = start.stdout.trim().replace('Started thinking sequence: ', '');

    const add = runCli(['think', 'add', '--sequence', seqId, '--type', 'evidence', '--text', 'some fact'], dir);
    expect(add.status).toBe(0);

    const abandon = runCli(['think', 'abandon', '--sequence', seqId], dir);
    expect(abandon.status).toBe(0);

    expect(thinkingEntries(dir)).toEqual([]);
    expect(() => findObjectMd(dir, seqId)).toThrow();
    expect(existsSync(join(dir, '.wolf', 'memory', 'relations.jsonl'))).toBe(false);
  });
});
```

- [ ] **Step 7.2: Run → GREEN.** `npm run e2e` — оба сценария зелёные вместе со всей e2e-сюитой.
- [ ] **Step 7.3: Полный `npm run check`.** Коммит: `test(e2e): thinking golden scenarios — full cycle with trace/links and abandon`.

---

### Task 8: документация + финальная верификация

**Files:**

- Modify: `README.md` (секция `## Commands`, строка 29; последняя командная подсекция `### Insights (Level 1 analytics)` — строки 138–140; следующая секция верхнего уровня `## Testing` — строка 142)

- [ ] **Step 8.1: README.** Вставить между строкой 140 (конец Insights) и строкой 142 (`## Testing`):

```markdown
### Structured thinking

- `wolf think start --goal <goal> [--thread <id>] [--created-by <actor>]` — start a thinking sequence; prints the sequence id.
- `wolf think add --sequence <id> --type <hypothesis|reasoning|evidence|concern> --text <text>` — append a thought; prints the thought id.
- `wolf think conclude --sequence <id> --title <title> --body <body> [--created-by <actor>]` — finish into a decision: the body gets an embedded "Thinking trace" section, the relation log gets `based_on`/`basis_for` links to every thought, and the scratch file is removed.
- `wolf think abandon --sequence <id>` — discard the sequence without creating anything.
- MCP tools: `start_thinking`, `add_thought`, `conclude_thinking`, `abandon_thinking`.
- Storage model: while thinking, thoughts live in a scratch file `.wolf/thinking/<id>.jsonl` outside the memory store (invisible to search/brief); on conclude the trace is embedded into the decision body and the scratch is deleted. Deliberate deviations from the roadmap: `--text` carries the thought content (the roadmap defined no carrier), `abandon` completes the lifecycle, storage is the hybrid scratch+embed model.
```

- [ ] **Step 8.2: Формат.** `npx prettier --write "docs/superpowers/plans/2026-08-26-phase-11-thinking.md" README.md` (prettier проверяет `docs/**/*.md` и README — формат-чистота обязательна, V16).
- [ ] **Step 8.3: Финал.** `npm run check` зелёный + `npm run e2e` зелёный. Коммит: `docs: phase 11 thinking documentation`.

---

## Definition of Done (фаза)

1. Полный цикл start → add×N → conclude создаёт active-decision, чей body содержит trace всех мыслей, а relation log — пары `based_on`/`basis_for` на каждую мысль (roadmap success criteria «decision with linked thoughts»).
2. Все 4 типа мыслей принимаются и попадают в trace; невалидный тип отклоняется на всех трёх уровнях (use-case, CLI choices, MCP z.enum).
3. abandon удаляет последовательность без следов в памяти (D5).
4. Ветвящиеся деревья и автоматическое мышление отсутствуют (out of scope, V1); новых зависимостей и event-типов нет (D9).
5. `npm run check` и `npm run e2e` зелёные; README обновлён.

## E2E-секция (правило mem_20260823_e2e_5459cc)

Полное E2E выполняется после реализации плана: оба золотых сценария из Task 7 прогоняются через `npm run e2e` (build + vitest, каркас tests/e2e/). Результат фиксируется в execution-отчёте фазы.

## Самопроверка плана (что сознательно НЕ входит)

- `wolf think show/list` — просмотр накопленных мыслей: агент видит собственные мысли, scratch — plain jsonl (`cat` решает); команда появится при первом реальном запросе (зеркало self-review спеки).
- События start/add/abandon в event log — шум для ephemeral-состояния (D9).
- Ретеншн заброшенных scratch-файлов — YAGNI; abandon покрывает штатный путь.
- Локи на scratch (D8) — однописатель на sequence; ponytail-комментарий в коде фиксирует потолок.
- Краш-окно между createDecision и unlink — worst case: дубль decision при повторном conclude; известный потолок local-first (зеркало self-review спеки).

## Execution Handoff

Исполнение по задачам Task 1–8 воркерами implementer'ами (Task 1–4 последовательны — один модуль; Tasks 5–7 после Task 4; Task 8 — микробатч). Валидация каждого шага: точечная команда из шага + полный `npm run check`; финал — `npm run check` + `npm run e2e`. Ревью плана — worker-reviewer до APPROVED.
