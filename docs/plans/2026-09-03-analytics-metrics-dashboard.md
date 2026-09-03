# Аналитика эффективности (метрики, реестры, дашборд) — план реализации

> **Исполнителям:** REQUIRED-СКИЛЛ: используй wolf-sdd (рекомендуется) ИЛИ wolf-execute
> для поэтапной реализации этого плана. Шаги оформлены чекбоксами (`- [ ]`) для трекинга.

**Цель:** Построить аналитический слой Wolf поверх существующих логов — обогащение прогона (M1), снапшоты отчётов (M2), абсолюты с pricing (M3), динамика мутаций (M4), реестры и воронка `wolf analytics` (M5), консольный дашборд `wolf dashboard` и MCP-инструмент `analytics`.

**Архитектура:** Три уровня (D1): L1 Health — агрегаты `EffectivenessReport` (расширяется блоком totals из run-сигналов), L2 Ledgers — новый чистый use-case `buildAnalyticsReport` (per-object следы: память/тулы/правила/агенты), L3 Trends — снапшоты `effectiveness-snapshots.jsonl` + недельные бакеты. Витрина: CLI `wolf analytics` (выборки Стюарда) + `wolf dashboard` (Unicode-таблицы, спарклайны, без файлов) + MCP-зеркало. Всё — детерминированная агрегация существующих данных, новых сборщиков нет; $-конверсия только при явном `pricing` в config (D9).

**Стек:** TypeScript (Node ≥22, ESM), commander, zod, vitest; валидация `npm run check`.

**Спека (единственный источник требований):** `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md` (rev.4).

## Структура файлов

Новые:

| Файл                                         | Ответственность                                                                                                     | Задача |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| `src/domain/pricing.ts`                      | `runCostUsd` — $-конверсия raw-токенов по `PricingTable` ($/Mtok)                                                   | 4      |
| `src/app/use-cases/snapshot-delta.ts`        | `flattenReportNumbers` + `computeSnapshotDelta` — диф отчётов (Q9)                                                  | 3, 4   |
| `src/adapters/fs/effectiveness-snapshots.ts` | append-only `.wolf/metrics/effectiveness-snapshots.jsonl` (D6)                                                      | 3      |
| `src/app/use-cases/build-analytics.ts`       | Ядро M5: `AnalyticsReport` + `buildAnalyticsReport` + `filterAnalytics`; контракт типов определяется здесь ОДИН раз | 6–8    |
| `src/app/use-cases/build-dashboard.ts`       | Композиция effectiveness + analytics + дельта снапшота                                                              | 11     |
| `src/adapters/cli/commands/analytics.ts`     | `wolf analytics` — выборки Стюарда (§6.2)                                                                           | 9      |
| `src/adapters/cli/commands/dashboard.ts`     | `wolf dashboard` — рендер (Unicode-таблицы, спарклайны)                                                             | 11     |
| `docs/guide/analytics.md`                    | Практический гайд по витрине                                                                                        | 12     |

Изменяемые:

| Файл                                                               | Что меняется                                                         | Задача |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ------ |
| `src/adapters/cli/opencode-run-metrics.ts`                         | `RunMetrics` + сырые токены (tokensIn/tokensOut/cacheRead)           | 1      |
| `src/domain/tool-economy.ts`                                       | `RunLogEntry` + session/duration_ms/tokens/experiment                | 2      |
| `src/adapters/fs/session-metrics-log.ts`                           | `SignalEvent` + те же поля; `appendRunSignal` опцы                   | 2      |
| `src/adapters/cli/commands/memory-run.ts`                          | флаги `--experiment/--arm/--task-id`, замер duration                 | 2      |
| `src/adapters/cli/commands/memory-effectiveness.ts`                | `--snapshot` + печать дельты; totals/cost/byModel                    | 3, 4   |
| `src/domain/taxonomy.ts`, `src/adapters/fs/config-file.ts`         | `pricing` + `analytics.thresholds` в config (snake_case → camelCase) | 4      |
| `src/app/use-cases/effectiveness.ts`                               | `TotalsBlock` из run-сигналов, `pricing?` в input                    | 4      |
| `src/app/use-cases/generate-insights.ts`                           | export `mondayOf`, `InsightsInput.events`, `mutations`-бакеты        | 5      |
| `src/adapters/cli/commands/memory-insights.ts`                     | передача `log.readAll()` в insights                                  | 5      |
| `src/adapters/mcp/mcp-schemas.ts`, `src/adapters/mcp/mcp-tools.ts` | MCP-инструмент `analytics` (зеркало CLI JSON)                        | 10     |
| `src/adapters/cli/cli-entry.ts`                                    | регистрация `analytics` + `dashboard`                                | 9, 11  |
| `docs/guide/signal-log.md`                                         | новые опц. поля run-события                                          | 12     |

Сквозные инварианты:

- Интерфейс `AnalyticsReport` (и все вложенные типы) определяется в задаче 6 **один раз**; задачи 7–8 только заполняют вычисления, задачи 9–11 только импортируют.
- Абсолюты (totals) считаются из run-СИГНАЛОВ; run-log остаётся для economy/routing (rev.4).
- Prevented в недельную воронку НЕ входит (holdout-счётчики кумулятивны, c9009fd) — только суммарно в rule ranking.
- $-поля null без pricing (D9); null ≠ 0 — «не знаем» не подменяем нулём.

## Порядок задач

Задачи исполняются строго по номерам 1→12 (каждая опирается на типы/файлы предыдущих). Задачи 1–2 (M1) не зависят друг от друга по файлам тестов, но 2 зависит от 1 (`RunMetrics.tokensIn` в memory-run); 9–11 требуют влитых 3–8. Финальная валидация всего плана — задача 12 (`npm run check` + e2e).

---

### Задача 1: M1a — сырые токены в parseRunMetrics

Спека: `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md` §5 M1 (первый пункт), D3 (сырые токены — опциональные поля рядом с weighted, weighted не меняем), Q7 (источник cache-hit ratio), §8 критерий 1 (частично: raw-токены в записях прогона).

**Файлы:**

- Modify: `src/adapters/cli/opencode-run-metrics.ts` (интерфейс `RunMetrics` + суммирование `tokensIn`/`tokensOut`/`cacheRead` в существующем цикле `parseRunMetrics`; `weighted` НЕ меняем)
- Test: `tests/unit/adapters/opencode-run-metrics.test.ts` (extend)

- [ ] **Шаг 1: Напиши падающий тест**

В `tests/unit/adapters/opencode-run-metrics.test.ts` внутрь `describe('parseRunMetrics', ...)` добавьте новый кейс (хелпер `stepFinish` уже существует в файле выше — переиспользуйте, не дублируйте):

```typescript
it('raw token sums alongside weighted (M1: Σ tokens по step-finish)', () => {
  const ndjson = [stepFinish(21679, 3, 0, 'ses_a'), stepFinish(1000, 20, 500, 'ses_a')].join('\n');
  const metrics = parseRunMetrics(ndjson);
  expect(metrics.tokensIn).toBe(22679); // 21679 + 1000
  expect(metrics.tokensOut).toBe(23); // 3 + 20
  expect(metrics.cacheRead).toBe(500); // 0 + 500
  expect(metrics.weighted).toBeCloseTo(22844, 9); // старая формула не изменилась: 21694 + 1150
});
```

И ОБЯЗАТЕЛЬНО обновите объект-ожидание в существующем кейсе `returns zeroes on empty and garbage input without throwing` — новый возврат `parseRunMetrics` содержит три дополнительных обязательных поля, `toEqual` без них упадёт (extend, смысл кейса не меняется):

```typescript
it('returns zeroes on empty and garbage input without throwing', () => {
  expect(parseRunMetrics('')).toEqual({
    session: null,
    weighted: 0,
    stepFinishes: 0,
    tokensIn: 0,
    tokensOut: 0,
    cacheRead: 0,
  });
  const garbage = parseRunMetrics('not json\n{"broken":\n\n{"type":"text","part":{"type":"text"}}');
  expect(garbage.weighted).toBe(0);
  expect(garbage.stepFinishes).toBe(0);
  expect(garbage.session).toBeNull();
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**

Запуск: `npx vitest run tests/unit/adapters/opencode-run-metrics.test.ts -t "raw token sums alongside weighted"`
Ожидание: FAIL — `expected undefined to be 22679` (свойств `tokensIn`/`tokensOut`/`cacheRead` ещё нет в `RunMetrics`; esbuild не тайпчекает, поэтому падение на `expect`, не на импорте).

- [ ] **Шаг 3: Напиши минимальную реализацию**

В `src/adapters/cli/opencode-run-metrics.ts` замените интерфейс `RunMetrics` на:

```typescript
export interface RunMetrics {
  session: string | null;
  weighted: number;
  stepFinishes: number;
  /** M1 (D3, Q7): Σ tokens.input по step-finish — сырые токены рядом с weighted. */
  tokensIn: number;
  /** M1: Σ tokens.output по step-finish. */
  tokensOut: number;
  /** M1: Σ tokens.cache.read по step-finish. */
  cacheRead: number;
}
```

Затем замените функцию `parseRunMetrics` целиком на (структура цикла та же, добавлены три аккумулятора):

```typescript
/**
 * weighted = Σ по всем step-finish событиям: input + 0.1 × cache.read + 5 × output.
 * M1: рядом с weighted суммируются сырые токены (tokensIn/tokensOut/cacheRead).
 * Малформ-строки молча пропускаются. sessionID — из любого события
 * (верхнего уровня или part.sessionID).
 */
export function parseRunMetrics(ndjsonText: string): RunMetrics {
  let session: string | null = null;
  let weighted = 0;
  let stepFinishes = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheRead = 0;
  for (const rawLine of ndjsonText.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const event = parsed as { sessionID?: unknown; part?: unknown };
    if (session === null && typeof event.sessionID === 'string') session = event.sessionID;
    if (typeof event.part !== 'object' || event.part === null) continue;
    const part = event.part as { type?: unknown; sessionID?: unknown; tokens?: unknown };
    if (session === null && typeof part.sessionID === 'string') session = part.sessionID;
    if (part.type !== 'step-finish') continue;
    stepFinishes++;
    if (typeof part.tokens === 'object' && part.tokens !== null) {
      const tokens = part.tokens as { input?: unknown; output?: unknown; cache?: { read?: unknown } | null };
      const inTok = asNumber(tokens.input);
      const outTok = asNumber(tokens.output);
      const cacheTok = asNumber(tokens.cache?.read);
      tokensIn += inTok;
      tokensOut += outTok;
      cacheRead += cacheTok;
      weighted += inTok + 0.1 * cacheTok + 5 * outTok; // формула weighted не изменилась
    }
  }
  return { session, weighted, stepFinishes, tokensIn, tokensOut, cacheRead };
}
```

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**

Запуск: `npx vitest run tests/unit/adapters/opencode-run-metrics.test.ts`
Ожидание: PASS (7 tests)

- [ ] **Шаг 5: Закоммить**

```bash
git add src/adapters/cli/opencode-run-metrics.ts tests/unit/adapters/opencode-run-metrics.test.ts
git commit -m "feat(run): raw token sums alongside weighted in parseRunMetrics (M1)"
```

Покрывает: Q7 (источник cache-hit ratio), критерий приёмки 1 (частично — raw-токены), D3.

---

### Задача 2: M1b — duration_ms + experiment/arm/task_id в run-log и run-сигнале

Спека: §5 M1 (пункты 2–3), D4 (duration меряет `wolf run` вокруг spawn), D5 (экспериментальные примитивы без движка), §8 критерий 1, Q5/Q10 (источники duration и arm/task_id).

Согласование контрактов: в `SignalEvent.experiment` поле `arm` имеет тип `'wolf' | 'baseline'`, в `RunLogEntry.experiment` — `string`. Эксперимент-объект пишется только при наличии `--experiment`; поскольку `arm` обязателен в типе сигнала, CLI пишет experiment только при полном наборе `--experiment` + `--arm` (оба неполных варианта — `--arm/--task-id` без `--experiment` и `--experiment` без `--arm` — дают `console.error`-предупреждение и игнорируются).

**Файлы:**

- Modify: `src/domain/tool-economy.ts` (опциональные поля `RunLogEntry`)
- Modify: `src/adapters/fs/session-metrics-log.ts` (опциональные поля `SignalEvent` + опции `appendRunSignal`)
- Modify: `src/adapters/cli/commands/memory-run.ts` (опции `--experiment`/`--arm`/`--task-id`, замер `startedAt`→`duration_ms`, запись tokens/experiment)
- Test: `tests/unit/adapters/session-metrics-log.test.ts` (extend)

- [ ] **Шаг 1: Напиши падающий тест**

В `tests/unit/adapters/session-metrics-log.test.ts` добавьте импорт (новой строкой после существующего импорта из `session-metrics-log.js`):

```typescript
import { parseRunLog } from '../../../src/domain/tool-economy.js';
```

Внутрь `describe("Ф20 (D1.1): session-metrics.jsonl — writer'ы и формат", ...)` добавьте три кейса (хелперы `signals()` и `dir` уже есть в этом describe):

```typescript
it('(M1-а) run: опциональные durationMs/tokens/experiment записываются и читаются', () => {
  appendRunSignal(dir, {
    model: 'zai-coding-plan/glm-5.3',
    agent: 'worker-implementer',
    title: 'M1 примитивы',
    session: 'ses_1',
    weighted: 42,
    outcome: 'ok',
    actor: 'executor-lead',
    durationMs: 1234,
    tokens: { input: 10, output: 2, cache_read: 3 },
    experiment: { id: 'exp-1', arm: 'wolf', taskId: 'task-9' },
  });
  const [rec] = signals();
  expect(rec.duration_ms).toBe(1234);
  expect(rec.tokens).toEqual({ input: 10, output: 2, cache_read: 3 });
  expect(rec.experiment).toEqual({ id: 'exp-1', arm: 'wolf', task_id: 'task-9' });
});

it('(M1-б) run без опциональных полей — в записи нет ключей duration_ms/tokens/experiment (backward-compat)', () => {
  appendRunSignal(dir, {
    model: 'm',
    agent: 'a',
    title: 't',
    session: null,
    weighted: 1,
    outcome: 'ok',
    actor: 'x',
  });
  const raw = JSON.parse(readFileSync(metricsLogPath(dir), 'utf-8').trim()) as Record<string, unknown>;
  expect(Object.prototype.hasOwnProperty.call(raw, 'duration_ms')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(raw, 'tokens')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(raw, 'experiment')).toBe(false);
});

it('(M1-в) parseRunLog: записи с новыми полями M1 парсятся с сохранением типов', () => {
  const entries = parseRunLog(
    JSON.stringify({
      ts: '2026-09-03T00:00:00.000Z',
      model: 'glm',
      agent: 'a',
      title: 't',
      session: 'ses_1',
      weighted: 100,
      duration_ms: 5000,
      tokens: { input: 10, output: 2, cache_read: 3 },
      experiment: { id: 'exp-1', arm: 'wolf', task_id: 'task-9' },
    })
  );
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  expect(typeof entry?.duration_ms).toBe('number');
  expect(entry?.duration_ms).toBe(5000);
  expect(typeof entry?.tokens).toBe('object');
  expect(entry?.tokens).toEqual({ input: 10, output: 2, cache_read: 3 });
  expect(typeof entry?.experiment).toBe('object');
  expect(entry?.experiment).toEqual({ id: 'exp-1', arm: 'wolf', task_id: 'task-9' });
  expect(typeof entry?.session).toBe('string');
  expect(entry?.session).toBe('ses_1');
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**

Запуск: `npx vitest run tests/unit/adapters/session-metrics-log.test.ts -t "M1-а"`
Ожидание: FAIL — esbuild-трансляция падает на неизвестных свойствах: `Property 'durationMs' does not exist in input type` (TS-ошибка компиляции теста) либо рантайм-падение `rec.duration_ms` → `expected undefined to be 1234`. Любой из вариантов — корректный красный.

- [ ] **Шаг 3: Напиши минимальную реализацию**

**(3.1) `src/domain/tool-economy.ts`** — замените интерфейс `RunLogEntry` на (остальной файл не трогайте):

```typescript
export interface RunLogEntry {
  ts?: string;
  model?: string;
  agent?: string;
  title?: string;
  session?: string;
  weighted?: number;
  tools?: string[];
  /** M1 (D4): wall-clock длительность прогона, мс (замер wolf run вокруг spawn). */
  duration_ms?: number;
  /** M1 (D3): сырые токены прогона (Σ по step-finish). */
  tokens?: { input: number; output: number; cache_read: number };
  /** M1 (D5): экспериментальные примитивы; arm/task_id пишутся только с experiment. */
  experiment?: { id: string; arm: string; task_id?: string };
}
```

**(3.2) `src/adapters/fs/session-metrics-log.ts`** — в интерфейсе `SignalEvent` после поля `weighted?: number;` и перед `outcome?: string;` вставьте три опциональных поля:

```typescript
  /** M1 (D4): wall-clock длительность прогона, мс (только run-события). */
  duration_ms?: number;
  /** M1 (D3): сырые токены прогона (только run-события). */
  tokens?: { input: number; output: number; cache_read: number };
  /** M1 (D5): экспериментальные примитивы (arm/task_id пишутся только с experiment). */
  experiment?: { id: string; arm: 'wolf' | 'baseline'; task_id?: string };
```

И замените функцию `appendRunSignal` целиком на:

```typescript
/** Writer (а): `wolf run` — метрики сессии (модель из routing, weighted, outcome; M1: duration/tokens/experiment). */
export function appendRunSignal(
  baseDir: string,
  input: {
    model: string;
    agent: string;
    title: string;
    session: string | null;
    weighted: number;
    outcome: string;
    actor: string;
    task?: string;
    durationMs?: number;
    tokens?: { input: number; output: number; cache_read: number };
    experiment?: { id: string; arm: 'wolf' | 'baseline'; taskId?: string };
  }
): { key: string | null; count: number; patternFixed: boolean } {
  return appendSignal(baseDir, {
    ts: nowIso(),
    event: 'run',
    session_id: input.session,
    gen_ai: { modelID: input.model, agent: input.agent },
    orchestration: { task: input.title, actor: input.actor },
    weighted: input.weighted,
    outcome: input.outcome,
    ...(input.task !== undefined ? { detail: { task: input.task } } : {}),
    ...(input.durationMs !== undefined ? { duration_ms: input.durationMs } : {}),
    ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
    ...(input.experiment !== undefined
      ? {
          experiment: {
            id: input.experiment.id,
            arm: input.experiment.arm,
            ...(input.experiment.taskId !== undefined ? { task_id: input.experiment.taskId } : {}),
          },
        }
      : {}),
  });
}
```

**(3.3) `src/adapters/cli/commands/memory-run.ts`** — четыре точечные правки:

(а) Импорт `Command` замените на:

```typescript
import { Command, Option } from 'commander';
```

(б) Цепочку опций — после строки `.option('--tool <name>', ...)` и перед `.argument('<prompt>', ...)` вставьте:

```typescript
    .option('--experiment <id>', 'Experiment id (comparative methodologies, e.g. RCT)')
    .addOption(new Option('--arm <choice>', 'Experiment arm').choices(['wolf', 'baseline']))
    .option('--task-id <id>', 'Task id within the experiment (golden tasks)')
```

(в) Внутри `action` первой строкой после `const model = await resolveModel();` (ДО сборки `args` и `spawn` — D4: замер вокруг spawn) вставьте:

```typescript
const startedAt = Date.now();
```

(г) Замените блок от `const metrics = parseRunMetrics(...)` до конца `appendRunSignal(...)` (включая `appendFileSync` run-log) на:

```typescript
const metrics = parseRunMetrics(chunks.map(String).join(''));

// M1 (D4): wall-clock длительность прогона
const durationMs = Date.now() - startedAt;

// M1 (D5): experiment пишется только полным набором --experiment + --arm;
// arm — union 'wolf' | 'baseline' (обязателен в типе сигнала), поэтому
// experiment без arm не записывается, как и arm/task-id без experiment
if (options.experiment === undefined && (options.arm !== undefined || options.taskId !== undefined)) {
  console.error('[wolf-run] Warning: --arm/--task-id without --experiment are ignored');
}
if (options.experiment !== undefined && options.arm === undefined) {
  console.error('[wolf-run] Warning: --experiment without --arm: experiment fields are not recorded');
}
const experiment =
  options.experiment !== undefined && options.arm !== undefined
    ? {
        id: options.experiment as string,
        arm: options.arm as string,
        ...(options.taskId !== undefined ? { task_id: options.taskId as string } : {}),
      }
    : undefined;

const wolfDir = join(process.cwd(), '.wolf');
mkdirSync(wolfDir, { recursive: true });
const logPath = join(wolfDir, 'run-log.jsonl');
appendFileSync(
  logPath,
  JSON.stringify({
    ts: new Date().toISOString(),
    model,
    agent: options.agent,
    title: options.title,
    session: metrics.session,
    weighted: metrics.weighted,
    verdict_pending: true,
    duration_ms: durationMs,
    tokens: { input: metrics.tokensIn, output: metrics.tokensOut, cache_read: metrics.cacheRead },
    ...(experiment !== undefined ? { experiment } : {}),
    ...(options.tool.length > 0 ? { tools: options.tool } : {}),
  }) + '\n'
);

console.error(`[wolf-run] model=${model} weighted=${metrics.weighted} log=${logPath}`);
// Ф20 (а): событие metrics в сигнальный лог контура самообучения
appendRunSignal(process.cwd(), {
  model,
  agent: options.agent,
  title: options.title,
  session: metrics.session,
  weighted: metrics.weighted,
  outcome: exitCode === 0 ? 'ok' : `exit_${exitCode}`,
  actor: resolveCreatedBy(undefined),
  durationMs,
  tokens: { input: metrics.tokensIn, output: metrics.tokensOut, cache_read: metrics.cacheRead },
  ...(experiment !== undefined
    ? {
        experiment: {
          id: experiment.id,
          arm: experiment.arm as 'wolf' | 'baseline',
          ...(options.taskId !== undefined ? { taskId: options.taskId as string } : {}),
        },
      }
    : {}),
});
if (exitCode !== 0) process.exit(exitCode);
```

Примечание: `duration_ms`/`tokens` пишутся всегда (честные суммы за прогон, нули при отсутствии step-finish), `experiment` — только при полном наборе; чтение старых записей не ломается (все новые поля опциональны — критерий приёмки 1).

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**

Запуск: `npx vitest run tests/unit/adapters/session-metrics-log.test.ts`
Ожидание: PASS (16 tests). Дополнительно: `npx vitest run tests/unit/adapters/opencode-run-metrics.test.ts` — не сломал ли (PASS, 7 tests).

- [ ] **Шаг 5: Закоммить**

```bash
git add src/domain/tool-economy.ts src/adapters/fs/session-metrics-log.ts src/adapters/cli/commands/memory-run.ts tests/unit/adapters/session-metrics-log.test.ts
git commit -m "feat(run): duration + experiment/arm/task-id in run log and run signal (M1)"
```

Покрывает: критерий приёмки 1 (M1: duration_ms, experiment/arm/task_id в run-log и run-сигнале; backward-compat записи), Q5/Q8 (duration), Q10 (arm/task_id).

---

### Задача 3: M2 — снапшоты отчётов + дельта

Спека: §5 M2, D6 (append-only `.wolf/metrics/effectiveness-snapshots.jsonl`, полная копия отчёта + дельта к последнему), §8 критерий 2, Q9.

Слой: `snapshot-delta.ts` — app-слой (импортирует тип `EffectivenessReport` из `effectiveness.js`); `effectiveness-snapshots.ts` — fs-адаптер рядом с `session-metrics-log.ts` (type-only импорт `EffectivenessReport` — рантайм-цикла нет: `effectiveness.ts` импортирует только `session-metrics-log.js`, не snapshots).

**Файлы:**

- Create: `src/app/use-cases/snapshot-delta.ts` (DeltaRow, flattenReportNumbers, computeSnapshotDelta)
- Create: `src/adapters/fs/effectiveness-snapshots.ts` (SnapshotEntry, snapshotsPath, readSnapshots, appendSnapshot)
- Modify: `src/adapters/cli/commands/memory-effectiveness.ts` (опция `--snapshot`, печать дельты к последнему снапшоту)
- Test: Create `tests/unit/use-cases/snapshot-delta.test.ts`, Create `tests/unit/adapters/effectiveness-snapshots.test.ts`

- [ ] **Шаг 1: Напиши падающий тест**

Создайте `tests/unit/use-cases/snapshot-delta.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeSnapshotDelta, flattenReportNumbers } from '../../../src/app/use-cases/snapshot-delta.js';
import type { EffectivenessReport } from '../../../src/app/use-cases/effectiveness.js';

function baseReport(): EffectivenessReport {
  return {
    rules: { activeRules: 3, prevented: 5, checked: 15 },
    tools: {
      toolCount: 2,
      totalUsage: 4,
      economy: { sufficient: true, toolRuns: 3, totalRuns: 8, medianTool: 6, medianAll: 15, savingsPct: 60 },
    },
    delivery: {
      deliveryEvents: 20,
      triggeredObjects: 2,
      activeRules: 3,
      silentRules: 1,
      enoughDeliveryData: true,
      silentShare: 33.3,
    },
    noise: { totalObjects: 10, writeOnly: 6, share: 60, documents: 2, archived: 0 },
    noiseStatus: 'BAD',
    silentStatus: 'BAD',
    routing: [
      { model: 'glm', tasks: 6, medianWeighted: 8.5 },
      { model: 'kimi', tasks: 2, medianWeighted: 150 },
    ],
  };
}

function row(rows: ReturnType<typeof computeSnapshotDelta>, path: string) {
  return rows.find((r) => r.path === path);
}

describe('flattenReportNumbers (M2: явные пути полей отчёта)', () => {
  it('routing кладётся построчно по model-ключу (не индексу): routing.<model>.tasks / .medianWeighted', () => {
    const flat = flattenReportNumbers(baseReport());
    expect(flat.get('routing.glm.tasks')).toBe(6);
    expect(flat.get('routing.glm.medianWeighted')).toBe(8.5);
    expect(flat.get('routing.kimi.tasks')).toBe(2);
    expect(flat.get('routing.kimi.medianWeighted')).toBe(150);
  });

  it('null-поля пропущены: prevented/checked/share/medianTool/medianAll/savingsPct/medianWeighted', () => {
    const r = baseReport();
    r.rules.prevented = null;
    r.rules.checked = null;
    r.noise.share = null;
    r.tools.economy.medianTool = null;
    r.tools.economy.medianAll = null;
    r.tools.economy.savingsPct = null;
    r.routing[1]!.medianWeighted = null;
    const flat = flattenReportNumbers(r);
    expect(flat.has('rules.prevented')).toBe(false);
    expect(flat.has('rules.checked')).toBe(false);
    expect(flat.has('noise.share')).toBe(false);
    expect(flat.has('tools.economy.medianTool')).toBe(false);
    expect(flat.has('tools.economy.medianAll')).toBe(false);
    expect(flat.has('tools.economy.savingsPct')).toBe(false);
    expect(flat.has('routing.kimi.medianWeighted')).toBe(false);
    // не-null поля остаются
    expect(flat.get('rules.activeRules')).toBe(3);
    expect(flat.get('routing.kimi.tasks')).toBe(2);
  });
});

describe('computeSnapshotDelta (Q9: диф последнего снапшота с предыдущим)', () => {
  it('diff = curr − prev; неизменённые поля дают diff 0', () => {
    const prev = baseReport();
    const curr = baseReport();
    curr.rules.activeRules = 4;
    curr.noise.writeOnly = 5;
    const rows = computeSnapshotDelta(prev, curr);
    expect(row(rows, 'rules.activeRules')).toEqual({ path: 'rules.activeRules', prev: 3, curr: 4, diff: 1 });
    expect(row(rows, 'noise.writeOnly')).toEqual({ path: 'noise.writeOnly', prev: 6, curr: 5, diff: -1 });
    expect(row(rows, 'tools.toolCount')).toEqual({ path: 'tools.toolCount', prev: 2, curr: 2, diff: 0 });
  });

  it('новый routing-рядок → prev null, diff null; исчезнувший рядок → curr null, diff null', () => {
    const prev = baseReport();
    const curr = baseReport();
    curr.routing = [...curr.routing, { model: 'qwen', tasks: 3, medianWeighted: 7 }];
    curr.routing = curr.routing.filter((r) => r.model !== 'kimi');
    const rows = computeSnapshotDelta(prev, curr);
    expect(row(rows, 'routing.qwen.tasks')).toEqual({ path: 'routing.qwen.tasks', prev: null, curr: 3, diff: null });
    expect(row(rows, 'routing.kimi.tasks')).toEqual({ path: 'routing.kimi.tasks', prev: 2, curr: null, diff: null });
  });
});
```

Создайте `tests/unit/adapters/effectiveness-snapshots.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendSnapshot, readSnapshots, snapshotsPath } from '../../../src/adapters/fs/effectiveness-snapshots.js';
import type { EffectivenessReport } from '../../../src/app/use-cases/effectiveness.js';

function report(activeRules: number): EffectivenessReport {
  return {
    rules: { activeRules, prevented: null, checked: null },
    tools: {
      toolCount: 0,
      totalUsage: 0,
      economy: { sufficient: false, toolRuns: 0, totalRuns: 0, medianTool: null, medianAll: null, savingsPct: null },
    },
    delivery: {
      deliveryEvents: 0,
      triggeredObjects: 0,
      activeRules: 0,
      silentRules: 0,
      enoughDeliveryData: false,
      silentShare: null,
    },
    noise: { totalObjects: 0, writeOnly: 0, share: null, documents: 0, archived: 0 },
    noiseStatus: 'NO_DATA',
    silentStatus: 'NO_DATA',
    routing: [],
  };
}

describe('M2: effectiveness-snapshots.jsonl (D6: append-only, полная копия отчёта)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-snapshots-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('append → read roundtrip: ts и полная копия отчёта возвращаются', () => {
    appendSnapshot(dir, report(3), '2026-09-03T10:00:00.000Z');
    const snaps = readSnapshots(dir);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.ts).toBe('2026-09-03T10:00:00.000Z');
    expect(snaps[0]!.report.rules.activeRules).toBe(3);
    expect(snaps[0]!.report.routing).toEqual([]);
  });

  it('вторая append → 2 записи в порядке записи (последний — свежий)', () => {
    appendSnapshot(dir, report(3), '2026-09-03T10:00:00.000Z');
    appendSnapshot(dir, report(4), '2026-09-03T11:00:00.000Z');
    const snaps = readSnapshots(dir);
    expect(snaps).toHaveLength(2);
    expect(snaps[1]!.ts).toBe('2026-09-03T11:00:00.000Z');
    expect(snaps[1]!.report.rules.activeRules).toBe(4);
  });

  it('битая строка пропускается; отсутствующий файл → []', () => {
    expect(readSnapshots(dir)).toEqual([]);
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
    writeFileSync(snapshotsPath(dir), '{битая строка\n' + JSON.stringify({ ts: 't', report: report(1) }) + '\n');
    const snaps = readSnapshots(dir);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.report.rules.activeRules).toBe(1);
  });
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**

Запуск: `npx vitest run tests/unit/use-cases/snapshot-delta.test.ts`
Ожидание: FAIL — `Cannot find module '.../src/app/use-cases/snapshot-dnapshot.js'` / точнее `Failed to resolve import "../../../src/app/use-cases/snapshot-delta.js"` (модуль ещё не создан). Аналогично для `effectiveness-snapshots.test.ts`: `Failed to resolve import "../../../src/adapters/fs/effectiveness-snapshots.js"`.

- [ ] **Шаг 3: Напиши минимальную реализацию**

**(3.1) Создайте `src/app/use-cases/snapshot-delta.ts`** (app-слой: нужен тип `EffectivenessReport`; поле `totals` задачи 4 сюда НЕ включать — задача 4 сама расширит flatten):

```typescript
/**
 * M2 (Q9): диф последнего снапшота эффективности с предыдущим.
 * flattenReportNumbers обходит поля отчёта вручную (явные пути, НЕ generic-walker):
 * числовые поля всех блоков + routing построчно по model-ключу; null-поля
 * пропускаются (в Map<string, number> null не кладётся — «не знаем» ≠ 0).
 */
import type { EffectivenessReport } from './effectiveness.js';

export interface DeltaRow {
  path: string;
  prev: number | null;
  curr: number | null;
  diff: number | null;
}

function put(map: Map<string, number>, path: string, value: number | null): void {
  if (value !== null) map.set(path, value);
}

/** Плоская карта «явный путь → число» по всем числовым полям отчёта. */
export function flattenReportNumbers(report: EffectivenessReport): Map<string, number> {
  const flat = new Map<string, number>();
  flat.set('rules.activeRules', report.rules.activeRules);
  put(flat, 'rules.prevented', report.rules.prevented);
  put(flat, 'rules.checked', report.rules.checked);
  flat.set('tools.toolCount', report.tools.toolCount);
  flat.set('tools.totalUsage', report.tools.totalUsage);
  flat.set('tools.economy.toolRuns', report.tools.economy.toolRuns);
  flat.set('tools.economy.totalRuns', report.tools.economy.totalRuns);
  put(flat, 'tools.economy.medianTool', report.tools.economy.medianTool);
  put(flat, 'tools.economy.medianAll', report.tools.economy.medianAll);
  put(flat, 'tools.economy.savingsPct', report.tools.economy.savingsPct);
  flat.set('delivery.deliveryEvents', report.delivery.deliveryEvents);
  flat.set('delivery.triggeredObjects', report.delivery.triggeredObjects);
  flat.set('delivery.activeRules', report.delivery.activeRules);
  flat.set('delivery.silentRules', report.delivery.silentRules);
  flat.set('noise.totalObjects', report.noise.totalObjects);
  flat.set('noise.writeOnly', report.noise.writeOnly);
  put(flat, 'noise.share', report.noise.share);
  flat.set('noise.documents', report.noise.documents);
  flat.set('noise.archived', report.noise.archived);
  for (const r of report.routing) {
    flat.set(`routing.${r.model}.tasks`, r.tasks);
    put(flat, `routing.${r.model}.medianWeighted`, r.medianWeighted);
  }
  return flat;
}

/**
 * Дельта = объединение ключей prev|curr; diff = curr − prev,
 * null если хоть одна сторона null (ключа нет в карте).
 * Сортировка по path — детерминированный вывод.
 */
export function computeSnapshotDelta(prev: EffectivenessReport, curr: EffectivenessReport): DeltaRow[] {
  const prevFlat = flattenReportNumbers(prev);
  const currFlat = flattenReportNumbers(curr);
  const rows: DeltaRow[] = [];
  for (const key of new Set([...prevFlat.keys(), ...currFlat.keys()])) {
    const p = prevFlat.get(key) ?? null;
    const c = currFlat.get(key) ?? null;
    rows.push({ path: key, prev: p, curr: c, diff: p !== null && c !== null ? c - p : null });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
```

**(3.2) Создайте `src/adapters/fs/effectiveness-snapshots.ts`** (стиль `session-metrics-log.ts`: `appendFileSync` + `readFileSync` с пропуском битых строк, `mkdirSync(metricsDir, { recursive: true })`):

```typescript
/**
 * M2 (D6, Q9): снапшоты отчётов эффективности — .wolf/metrics/effectiveness-snapshots.jsonl.
 * Append-only, полная копия EffectivenessReport + ts; хранить «только последние N»
 * не будем — история нужна для трендов (решение D6 спеки аналитики).
 */
import { appendFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { metricsDir } from './project-paths.js';
import type { EffectivenessReport } from '../../app/use-cases/effectiveness.js';

export interface SnapshotEntry {
  /** ISO8601 момента снапшота. */
  ts: string;
  report: EffectivenessReport;
}

export function snapshotsPath(baseDir: string): string {
  return join(metricsDir(baseDir), 'effectiveness-snapshots.jsonl');
}

/** Все снапшоты в порядке записи; отсутствующий/битый лог → максимально читаемое. */
export function readSnapshots(baseDir: string): SnapshotEntry[] {
  let raw: string;
  try {
    raw = readFileSync(snapshotsPath(baseDir), 'utf-8');
  } catch {
    return [];
  }
  const out: SnapshotEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) out.push(parsed as SnapshotEntry);
    } catch {
      // малформ-строка пропускается: лог append-only, битая строка не роняет контур
    }
  }
  return out;
}

/** Аппенд полного отчёта с таймстампом; ts задаёт вызывающий код (тестируемость). */
export function appendSnapshot(baseDir: string, report: EffectivenessReport, ts: string): void {
  mkdirSync(metricsDir(baseDir), { recursive: true });
  appendFileSync(snapshotsPath(baseDir), JSON.stringify({ ts, report } satisfies SnapshotEntry) + '\n');
}
```

**(3.3) Modify `src/adapters/cli/commands/memory-effectiveness.ts`** — три точечные правки:

(а) Добавьте импорты (после существующего импорта `session-metrics-log.js`):

```typescript
import { appendSnapshot, readSnapshots } from '../../../adapters/fs/effectiveness-snapshots.js';
import { computeSnapshotDelta } from '../../../app/use-cases/snapshot-delta.js';
```

(б) В `memoryEffectivenessCommand` после строки с `const cmd = new Command('effectiveness').description(...)` добавьте опцию:

```typescript
cmd.option('--snapshot', 'Append the full report to .wolf/metrics/effectiveness-snapshots.jsonl');
```

(в) Сигнатуру action замените с `cmd.action(async () => {` на `cmd.action(async (options) => {` и сразу ПОСЛЕ строки `printReport(report);` вставьте:

```typescript
// M2: --snapshot аппендит полный отчёт; обычный вызов печатает дельту к последнему
if (options.snapshot) {
  appendSnapshot(baseDir, report, new Date().toISOString());
  console.log(`snapshot appended (total: ${readSnapshots(baseDir).length})`);
} else {
  const snaps = readSnapshots(baseDir);
  if (snaps.length > 0) {
    const last = snaps[snaps.length - 1]!;
    const changed = computeSnapshotDelta(last.report, report).filter((r) => r.diff !== null && r.diff !== 0);
    console.log(`delta vs ${last.ts}:`);
    if (changed.length === 0) {
      console.log('  no changes');
    } else {
      for (const r of changed) {
        const sign = r.diff! > 0 ? '+' : '';
        console.log(`  ${r.path}: ${r.prev} -> ${r.curr} (${sign}${r.diff})`);
      }
    }
  }
}
```

Строки внутри `catch` (n/a-панель) не трогайте: там отчёта нет, снапшотить/дельтить нечего.

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**

Запуск: `npx vitest run tests/unit/use-cases/snapshot-delta.test.ts tests/unit/adapters/effectiveness-snapshots.test.ts`
Ожидание: PASS (7 tests: 4 + 3). Дополнительно точечно: `npx vitest run tests/unit/use-cases/effectiveness.test.ts` — отчёт не менялся (PASS, 9 tests).

- [ ] **Шаг 5: Закоммить (два раздельных коммита)**

```bash
git add src/app/use-cases/snapshot-delta.ts src/adapters/fs/effectiveness-snapshots.ts tests/unit/use-cases/snapshot-delta.test.ts tests/unit/adapters/effectiveness-snapshots.test.ts
git commit -m "feat(effectiveness): snapshot delta computation (M2)"
```

```bash
git add src/adapters/cli/commands/memory-effectiveness.ts
git commit -m "feat(effectiveness): --snapshot flag + delta print (M2)"
```

Покрывает: критерий приёмки 2, Q9 (диф снапшотов), D6 (append-only снапшоты + дельта к последнему).

---

### Задача 4: M3 — pricing в конфиге + блок totals из run-сигналов

Спека: `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md` (§2 D4/D7/D9, §5 M3, §4 Q5–Q7, §8 критерий 3).
Методологическое ограничение rev.4: блок абсолютов (totals) считается из run-СИГНАЛОВ
(`SignalEvent event='run'` — там outcome/tokens/duration_ms), run-log остаётся для
economy/routing. $-поля скрыты (null) без pricing (D9).

**Зависимости:** задачи 1–3 этого плана уже влиты: `SignalEvent` имеет опциональные
`tokens?: { input: number; output: number; cache_read: number }` и `duration_ms?: number`
в run-событиях (M1); `src/app/use-cases/snapshot-delta.ts` существует и содержит
`flattenReportNumbers`, покрывающий числовые поля отчёта БЕЗ totals (M2).

**Файлы:**

- Create: `src/domain/pricing.ts`
- Modify: `src/domain/taxonomy.ts` (импорт `PricingTable`, поля `pricing?`/`analytics?` в `WolfConfig`)
- Modify: `src/adapters/fs/config-file.ts` (схема `pricing` + `analytics.thresholds`, маппинг в ОБОИХ `loadWolfConfig`/`loadWolfConfigSync`)
- Modify: `src/app/use-cases/effectiveness.ts` (`TotalsBlock`, `pricing?` в input, приватная `buildTotals`)
- Modify: `src/app/use-cases/snapshot-delta.ts` (`flattenTotals` + вызов в `flattenReportNumbers`)
- Modify: `src/adapters/cli/commands/memory-effectiveness.ts` (строки totals/cost/byModel в `printReport`, `pricing` в вызов)
- Test: Create `tests/unit/domain/pricing.test.ts`; Extend `tests/unit/use-cases/effectiveness.test.ts`; Extend `tests/unit/adapters/config-file.test.ts` (файл существует — проверено Glob'ом); Extend `tests/unit/use-cases/snapshot-delta.test.ts` (totals-дельта + фикстура `totals`); Modify `tests/unit/adapters/effectiveness-snapshots.test.ts` (фикстура `totals`)

- [ ] **Шаг 1: Напиши падающий тест**

**1а. Create `tests/unit/domain/pricing.test.ts` (полный файл):**

```typescript
import { describe, it, expect } from 'vitest';
import { runCostUsd, type PricingTable } from '../../../src/domain/pricing.js';

const pricing: PricingTable = {
  'zai-coding-plan/glm-5.3': { input: 0.6, output: 2.2, cache_read: 0.06 },
};

describe('runCostUsd (M3: $-конверсия, D9 — числа не выдумываем)', () => {
  it('стоимость = (input×p.input + output×p.output + cache_read×p.cache_read)/1e6', () => {
    // (1000×0.6 + 200×2.2 + 500×0.06)/1e6 = (600 + 440 + 30)/1e6 = 0.00107
    expect(runCostUsd({ input: 1000, output: 200, cache_read: 500 }, pricing, 'zai-coding-plan/glm-5.3')).toBeCloseTo(
      0.00107,
      10
    );
  });

  it('мегатокены → прайс в $ напрямую', () => {
    // 0.6 + 2.2 + 0.06 = 2.86
    expect(
      runCostUsd({ input: 1_000_000, output: 1_000_000, cache_read: 1_000_000 }, pricing, 'zai-coding-plan/glm-5.3')
    ).toBeCloseTo(2.86, 10);
  });

  it('нет pricing → null', () => {
    expect(runCostUsd({ input: 1, output: 1, cache_read: 1 }, undefined, 'm')).toBeNull();
  });

  it('модели нет в таблице → null', () => {
    expect(runCostUsd({ input: 1, output: 1, cache_read: 1 }, pricing, 'other-model')).toBeNull();
  });

  it('нет токенов → null', () => {
    expect(runCostUsd(null, pricing, 'zai-coding-plan/glm-5.3')).toBeNull();
    expect(runCostUsd(undefined, pricing, 'zai-coding-plan/glm-5.3')).toBeNull();
  });

  it('модель null → null', () => {
    expect(runCostUsd({ input: 1, output: 1, cache_read: 1 }, pricing, null)).toBeNull();
  });
});
```

**1б. Extend `tests/unit/use-cases/effectiveness.test.ts`** — в шапку после импорта `SignalEvent` добавь:

```typescript
import type { PricingTable } from '../../../src/domain/pricing.js';
```

В конец файла (новый describe):

```typescript
describe('totals (M3: блок абсолютов из run-сигналов)', () => {
  const pricing: PricingTable = {
    m1: { input: 0.6, output: 2.2, cache_read: 0.06 },
    m2: { input: 1.0, output: 4.0, cache_read: 0.1 },
  };

  function runTotalsSignal(over: Partial<SignalEvent>): SignalEvent {
    return {
      ts: T(0),
      event: 'run',
      session_id: 's',
      gen_ai: { modelID: 'm1', agent: 'a' },
      orchestration: { task: 't', actor: 'user:cli' },
      outcome: 'ok',
      ...over,
    };
  }

  it('3 run (2 ok / 1 exit_1, tokens и duration у двух, m1/m1/m2) → суммы и byModel точные', async () => {
    const signals = [
      runTotalsSignal({ weighted: 10, duration_ms: 1000, tokens: { input: 1000, output: 200, cache_read: 500 } }),
      runTotalsSignal({ weighted: 20, duration_ms: 3000, tokens: { input: 2000, output: 300, cache_read: 1000 } }),
      runTotalsSignal({ gen_ai: { modelID: 'm2', agent: 'a' }, outcome: 'exit_1', weighted: 40 }),
    ];
    const report = await buildEffectivenessReport(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations([]) },
      { signals, runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS, pricing }
    );

    expect(report.totals.runs).toBe(3);
    expect(report.totals.failures).toBe(1);
    expect(report.totals.sumWeighted).toBe(70); // 10+20+40
    expect(report.totals.sumTokens).toEqual({ input: 3000, output: 500, cache_read: 1500 });
    expect(report.totals.cacheHitRatio).toBeCloseTo(100 / 3, 5); // 1500/(3000+1500)×100
    expect(report.totals.avgDurationMs).toBe(2000); // (1000+3000)/2
    // m1: (1070 + 1920)/1e6; m2 без tokens → вклад null
    expect(report.totals.costUsd).toBeCloseTo(0.00299, 10);

    // сортировка: runs убыв., потом model — m1 (2 прогона) первым
    expect(report.totals.byModel).toHaveLength(2);
    const m1 = report.totals.byModel[0];
    expect(m1.model).toBe('m1');
    expect(m1.runs).toBe(2);
    expect(m1.failures).toBe(0);
    expect(m1.sumWeighted).toBe(30);
    expect(m1.avgDurationMs).toBe(2000);
    expect(m1.costUsd).toBeCloseTo(0.00299, 10); // 1070/1e6 + 1920/1e6
    expect(m1.costPerSuccess).toBeCloseTo(0.001495, 10); // 0.00299/2

    expect(report.totals.byModel[1]).toEqual({
      model: 'm2',
      runs: 1,
      failures: 1,
      sumWeighted: 40,
      avgDurationMs: null, // ни одного duration_ms
      costUsd: null, // ни одного tokens
      costPerSuccess: null, // costUsd null И успехов 0
    });
  });

  it('run-сигналы без tokens/duration → sumTokens null, cacheHitRatio null, costUsd null', async () => {
    const signals = [runTotalsSignal({ weighted: 5 }), runTotalsSignal({ weighted: 7, outcome: 'exit_1' })];
    const report = await buildEffectivenessReport(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations([]) },
      { signals, runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS, pricing }
    );
    expect(report.totals.runs).toBe(2);
    expect(report.totals.failures).toBe(1);
    expect(report.totals.sumWeighted).toBe(12);
    expect(report.totals.sumTokens).toBeNull();
    expect(report.totals.cacheHitRatio).toBeNull();
    expect(report.totals.avgDurationMs).toBeNull();
    expect(report.totals.costUsd).toBeNull();
    expect(report.totals.byModel).toEqual([
      { model: 'm1', runs: 2, failures: 1, sumWeighted: 12, avgDurationMs: null, costUsd: null, costPerSuccess: null },
    ]);
  });

  it('run-сигналов нет → нулевой totals без byModel', async () => {
    const report = await buildEffectivenessReport(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations([]) },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS, pricing }
    );
    expect(report.totals).toEqual({
      runs: 0,
      failures: 0,
      sumWeighted: 0,
      sumTokens: null,
      cacheHitRatio: null,
      avgDurationMs: null,
      costUsd: null,
      byModel: [],
    });
  });
});
```

**1в. Extend `tests/unit/use-cases/snapshot-delta.test.ts`** (файл задачи 3) — в конец файла добавь describe (проверка расширения flatten полем totals):

```typescript
import { flattenReportNumbers } from '../../../src/app/use-cases/snapshot-delta.js'; // уже импортирован задачей 3

describe('flattenReportNumbers + totals (M3)', () => {
  it('totals-пути попадают в дельту; null-поля (sumTokens/costUsd) пропущены', () => {
    const r = baseReport();
    (r as { totals?: unknown }).totals = {
      runs: 5,
      failures: 1,
      sumWeighted: 500,
      sumTokens: { input: 3000, output: 500, cache_read: 1500 },
      cacheHitRatio: 33.3,
      avgDurationMs: 2000,
      costUsd: null,
      byModel: [
        {
          model: 'm1',
          runs: 2,
          failures: 0,
          sumWeighted: 30,
          avgDurationMs: 2000,
          costUsd: 0.00299,
          costPerSuccess: 0.001495,
        },
      ],
    };
    const flat = flattenReportNumbers(r);
    expect(flat.get('totals.runs')).toBe(5);
    expect(flat.get('totals.sumTokens.cache_read')).toBe(1500);
    expect(flat.get('totals.byModel.m1.costPerSuccess')).toBeCloseTo(0.001495, 10);
    expect(flat.has('totals.costUsd')).toBe(false); // null — не попадает
  });
});
```

**1г. Extend `tests/unit/adapters/config-file.test.ts`** — в конец файла (существующие импорты шапки достаточны: `describe/it/expect/beforeEach/afterEach` из vitest, `mkdtempSync/rmSync/mkdirSync/writeFileSync` из fs, `join/tmpdir`):

```typescript
// M3: pricing ($/Mtok) + analytics.thresholds (D7) из config.yaml; битые блоки отбрасываются схемой
describe('config pricing + analytics.thresholds (M3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-config-m3-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(yaml: string): void {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), yaml);
  }

  it('pricing-таблица и analytics.thresholds читаются, пороги маппятся в camelCase', () => {
    writeConfig(
      'pricing:\n' +
        "  'zai-coding-plan/glm-5.3':\n" +
        '    input: 0.6\n' +
        '    output: 2.2\n' +
        '    cache_read: 0.06\n' +
        'analytics:\n' +
        '  thresholds:\n' +
        '    new_days: 14\n' +
        '    workhorse_uses: 3\n'
    );
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.pricing).toEqual({
      'zai-coding-plan/glm-5.3': { input: 0.6, output: 2.2, cache_read: 0.06 },
    });
    expect(loaded?.analytics?.thresholds).toEqual({ newDays: 14, workhorseUses: 3 });
  });

  it('без блоков — undefined', () => {
    writeConfig('learning:\n  pattern_threshold: 5\n');
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.pricing).toBeUndefined();
    expect(loaded?.analytics).toBeUndefined();
  });
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**

Запуск: `npx vitest run tests/unit/domain/pricing.test.ts tests/unit/use-cases/effectiveness.test.ts tests/unit/adapters/config-file.test.ts`
Ожидание: FAIL — `Error: Cannot find module '.../src/domain/pricing.js'` (pricing.test.ts и import в effectiveness.test.ts); после создания модуля — `report.totals is undefined` и `loaded?.pricing is undefined` (реализация ещё не написана).

- [ ] **Шаг 3: Напиши минимальную реализацию**

**3а. Create `src/domain/pricing.ts` (полный файл):**

```typescript
/**
 * M3 (D4/D9): $-конверсия токенов прогона по таблице прайсов из config.yaml.
 * Прайсы — $ за мегатокен ($/Mtok). null при отсутствии прайса/модели/токенов —
 * числа не выдумываем (прецедент EconomyResult.sufficient).
 */
export interface ModelPricing {
  input: number;
  output: number;
  cache_read: number;
}

/** modelID → прайс ($/Mtok); ключи — полные имена моделей (напр. 'zai-coding-plan/glm-5.3'). */
export type PricingTable = Record<string, ModelPricing>;

export interface RawTokens {
  input: number;
  output: number;
  cache_read: number;
}

/** Стоимость прогона в $; null при отсутствии прайса/модели/токенов — числа не выдумываем (D9). */
export function runCostUsd(
  tokens: RawTokens | null | undefined,
  pricing: PricingTable | undefined,
  model: string | null
): number | null {
  if (tokens === null || tokens === undefined) return null;
  if (model === null || pricing === undefined) return null;
  const p = pricing[model];
  if (p === undefined) return null;
  return (tokens.input * p.input + tokens.output * p.output + tokens.cache_read * p.cache_read) / 1e6;
}
```

**3б. Modify `src/domain/taxonomy.ts`** — после импорта `ALLOWED_TRANSITIONS` добавь:

```typescript
import type { PricingTable } from './pricing.js';
```

В интерфейс `WolfConfig` после блока `learning?` добавь:

```typescript
  /** M3: $-прайсы ($/Mtok) из config.yaml; без прайса $-поля скрыты (D9). */
  pricing?: PricingTable;
  /** M3: пороги lifecycle-классификации D7 (analytics.thresholds из config.yaml). */
  analytics?: { thresholds?: { newDays?: number; workhorseUses?: number } };
```

**3в. Modify `src/adapters/fs/config-file.ts`.** В `ConfigFileSchema` после блока `learning` добавь (catch-политика как у learning):

```typescript
  // M3: $-прайсы ($/Mtok) и пороги lifecycle-аналитики (D7); битые блоки отбрасываются
  pricing: z
    .record(z.string(), z.object({ input: z.number(), output: z.number(), cache_read: z.number() }))
    .optional()
    .catch(undefined),
  analytics: z
    .object({
      thresholds: z
        .object({
          new_days: z.number().int().min(1).optional(),
          workhorse_uses: z.number().int().min(1).optional(),
        })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
```

После `mapEffectivenessThresholds` добавь маппер (паттерн тот же):

```typescript
/** M3: analytics.thresholds → camelCase, undefined-поля отбрасываются. */
function mapAnalyticsThresholds(t?: {
  new_days?: number;
  workhorse_uses?: number;
}): { newDays?: number; workhorseUses?: number } | undefined {
  if (t === undefined) return undefined;
  const out: { newDays?: number; workhorseUses?: number } = {};
  if (t.new_days !== undefined) out.newDays = t.new_days;
  if (t.workhorse_uses !== undefined) out.workhorseUses = t.workhorse_uses;
  return Object.keys(out).length > 0 ? out : undefined;
}
```

В return-объекте ОБОИХ `loadWolfConfig` И `loadWolfConfigSync` (дублирование — прецедент файла) после `errorClassTaxonomy:` добавь:

```typescript
    pricing: cfg.pricing,
    analytics: cfg.analytics === undefined ? undefined : { thresholds: mapAnalyticsThresholds(cfg.analytics.thresholds) },
```

**3г. Modify `src/app/use-cases/effectiveness.ts`.** Импорт после `tool-economy.js`:

```typescript
import { runCostUsd, type PricingTable, type RawTokens } from '../../domain/pricing.js';
```

После `EffectivenessThresholds`-блока (перед `export interface EffectivenessReport`) добавь контрактные типы:

```typescript
/** M3: блок «Абсолюты» — из run-СИГНАЛОВ (rev.4), не из run-log. */
export interface TotalsBlock {
  runs: number;
  /** run-сигналы с outcome !== 'ok'. */
  failures: number;
  sumWeighted: number;
  /** null = ни один run-сигнал не несёт tokens (до M1-данных). */
  sumTokens: RawTokens | null;
  /** cache_read/(input+cache_read)×100; null при sumTokens null или знаменателе 0. */
  cacheHitRatio: number | null;
  avgDurationMs: number | null;
  costUsd: number | null;
  byModel: Array<{
    model: string;
    runs: number;
    failures: number;
    sumWeighted: number;
    avgDurationMs: number | null;
    costUsd: number | null;
    /** costUsd/(runs-failures); null если costUsd null или успехов 0. */
    costPerSuccess: number | null;
  }>;
}
```

В `EffectivenessReport` после поля `routing:` добавь:

```typescript
/** Блок 6 «Абсолюты» (M3). */
totals: TotalsBlock;
```

Сигнатуру `buildEffectivenessReport` дополни pricing:

```typescript
export async function buildEffectivenessReport(
  deps: { store: MemoryStore; log: EventLog; relations: RelationLog },
  input: { signals: SignalEvent[]; runLogText: string | null; thresholds: EffectivenessThresholds; pricing?: PricingTable }
): Promise<EffectivenessReport> {
```

Перед `buildEffectivenessReport` добавь приватную функцию:

```typescript
/** M3: агрегация run-сигналов в блок абсолютов; пустые данные → нули/null, не выдумываем. */
function buildTotals(signals: SignalEvent[], pricing?: PricingTable): TotalsBlock {
  const runs = signals.filter((s) => s.event === 'run');
  const failures = runs.filter((s) => s.outcome !== 'ok').length;
  const sumWeighted = runs.reduce((sum, s) => sum + (s.weighted ?? 0), 0);

  let sumTokens: RawTokens | null = null;
  const durations: number[] = [];
  let costUsd: number | null = null;
  const byModelMap = new Map<
    string,
    { runs: number; failures: number; sumWeighted: number; durations: number[]; costUsd: number | null }
  >();
  for (const s of runs) {
    if (typeof s.duration_ms === 'number' && Number.isFinite(s.duration_ms)) durations.push(s.duration_ms);
    if (s.tokens !== undefined && s.tokens !== null) {
      if (sumTokens === null) sumTokens = { input: 0, output: 0, cache_read: 0 };
      sumTokens.input += s.tokens.input;
      sumTokens.output += s.tokens.output;
      sumTokens.cache_read += s.tokens.cache_read;
    }
    const c = runCostUsd(s.tokens, pricing, s.gen_ai.modelID);
    if (c !== null) costUsd = (costUsd ?? 0) + c;

    const model = s.gen_ai.modelID ?? 'unknown';
    const row = byModelMap.get(model) ?? { runs: 0, failures: 0, sumWeighted: 0, durations: [], costUsd: null };
    row.runs += 1;
    if (s.outcome !== 'ok') row.failures += 1;
    row.sumWeighted += s.weighted ?? 0;
    if (typeof s.duration_ms === 'number' && Number.isFinite(s.duration_ms)) row.durations.push(s.duration_ms);
    if (c !== null) row.costUsd = (row.costUsd ?? 0) + c;
    byModelMap.set(model, row);
  }

  const avg = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
  const denom = sumTokens === null ? 0 : sumTokens.input + sumTokens.cache_read;

  const byModel = [...byModelMap.entries()]
    .map(([model, row]) => {
      const successes = row.runs - row.failures;
      return {
        model,
        runs: row.runs,
        failures: row.failures,
        sumWeighted: row.sumWeighted,
        avgDurationMs: avg(row.durations),
        costUsd: row.costUsd,
        costPerSuccess: row.costUsd === null || successes === 0 ? null : row.costUsd / successes,
      };
    })
    .sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model));

  return {
    runs: runs.length,
    failures,
    sumWeighted,
    sumTokens,
    cacheHitRatio: sumTokens === null || denom === 0 ? null : (sumTokens.cache_read / denom) * 100,
    avgDurationMs: avg(durations),
    costUsd,
    byModel,
  };
}
```

В return `buildEffectivenessReport` после `routing,` добавь:

```typescript
    totals: buildTotals(input.signals, input.pricing),
```

**3д. Modify `src/app/use-cases/snapshot-delta.ts`** (файл задачи 3; он собирает `Map<string, number>` — flattenTotals пишет в ту же Map). В импорты добавь:

```typescript
import type { TotalsBlock } from './effectiveness.js';
```

Рядом с `flattenReportNumbers` (после неё, перед `computeSnapshotDelta`) добавь функцию:

```typescript
/** M3: плоские числа totals для дельты снапшотов (Q9); null-поля не попадают в дельту. */
function flattenTotals(flat: Map<string, number>, t: TotalsBlock): void {
  flat.set('totals.runs', t.runs);
  flat.set('totals.failures', t.failures);
  flat.set('totals.sumWeighted', t.sumWeighted);
  if (t.sumTokens !== null) {
    flat.set('totals.sumTokens.input', t.sumTokens.input);
    flat.set('totals.sumTokens.output', t.sumTokens.output);
    flat.set('totals.sumTokens.cache_read', t.sumTokens.cache_read);
  }
  put(flat, 'totals.cacheHitRatio', t.cacheHitRatio);
  put(flat, 'totals.avgDurationMs', t.avgDurationMs);
  put(flat, 'totals.costUsd', t.costUsd);
  for (const row of t.byModel) {
    flat.set(`totals.byModel.${row.model}.runs`, row.runs);
    flat.set(`totals.byModel.${row.model}.failures`, row.failures);
    flat.set(`totals.byModel.${row.model}.sumWeighted`, row.sumWeighted);
    put(flat, `totals.byModel.${row.model}.avgDurationMs`, row.avgDurationMs);
    put(flat, `totals.byModel.${row.model}.costUsd`, row.costUsd);
    put(flat, `totals.byModel.${row.model}.costPerSuccess`, row.costPerSuccess);
  }
}
```

И в `flattenReportNumbers` ПОСЛЕ цикла `for (const r of report.routing) { ... }` — ПЕРЕД `return flat;` — вставь ровно одну строку:

```typescript
flattenTotals(flat, report.totals);
```

(`put` — приватный хелпер файла задачи 3: кладёт только не-null значения.)

**3е. Обнови фикстуры тестов задачи 3 под обязательное поле `totals`.** После 3г тип `EffectivenessReport` требует `totals` — фикстуры без него не скомпилируются (tsc). В `tests/unit/use-cases/snapshot-delta.test.ts` в `baseReport()` после `routing: [...]` добавь поле (и вынеси его в переиспользуемый объект — им же пользуется новый describe из шага 1в):

```typescript
function baseReport(): EffectivenessReport {
  return {
    // ...все существующие поля без изменений...
    routing: [
      { model: 'glm', tasks: 6, medianWeighted: 8.5 },
      { model: 'kimi', tasks: 2, medianWeighted: 150 },
    ],
    totals: {
      runs: 0,
      failures: 0,
      sumWeighted: 0,
      sumTokens: null,
      cacheHitRatio: null,
      avgDurationMs: null,
      costUsd: null,
      byModel: [],
    },
  };
}
```

В `tests/unit/adapters/effectiveness-snapshots.test.ts` в фабрике `report(activeRules)` после `routing: []` добавь то же нулевое поле `totals` (скопируй литерал целиком).

**3ж. Modify `src/adapters/cli/commands/memory-effectiveness.ts`.** В импорт из effectiveness-модуля ничего добавлять не нужно; добавь импорт типа:

```typescript
import type { PricingTable } from '../../../domain/pricing.js';
```

В `printReport` после строки `console.log(\`routing: ${routing}\`);` добавь:

```typescript
// M3: блок абсолютов из run-сигналов; null → честное n/a
const t = r.totals;
const cache = t.cacheHitRatio === null ? 'n/a' : `${fmtPct(t.cacheHitRatio)}%`;
const avg = t.avgDurationMs === null ? 'n/a' : `${t.avgDurationMs}ms`;
console.log(`totals: runs=${t.runs} failures=${t.failures} weighted=${t.sumWeighted} cache=${cache} avg=${avg}`);
const cost = t.costUsd === null ? 'n/a (no pricing configured)' : `$${t.costUsd} (pricing enabled)`;
console.log(`cost: ${cost}`);
for (const row of t.byModel) {
  const c = row.costUsd === null ? 'n/a' : `$${row.costUsd}`;
  const cps = row.costPerSuccess === null ? 'n/a' : `$${row.costPerSuccess}`;
  console.log(`model ${row.model}: runs=${row.runs} failures=${row.failures} cost=${c} cost/success=${cps}`);
}
```

В `cmd.action` замени существующий try-блок чтения конфига и вызов use-case (pricing читается тем же вызовом `loadWolfConfigSync`):

```typescript
// пороги + pricing: override из config поверх дефолтов (битый конфиг → дефолты)
let override: Partial<EffectivenessThresholds> | undefined;
let pricing: PricingTable | undefined;
try {
  const cfg = loadWolfConfigSync(baseDir);
  override = cfg?.learning?.effectivenessThresholds;
  pricing = cfg?.pricing;
} catch {
  override = undefined;
}
```

и в вызове `buildEffectivenessReport`:

```typescript
const report = await buildEffectivenessReport(
  { store, log, relations },
  { signals: readSignals(baseDir), runLogText, thresholds, pricing }
);
```

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**

Запуск: `npx vitest run tests/unit/domain/pricing.test.ts tests/unit/use-cases/effectiveness.test.ts tests/unit/adapters/config-file.test.ts && npx tsc --noEmit`
Ожидание: PASS — 27 tests (6 pricing + 14 effectiveness: 11 старых + 3 новых totals + 7 config-file: 5 старых + 2 новых); tsc без ошибок. Существующие тесты `snapshot-delta` (задача 3) должны остаться зелёными: `npx vitest run tests/unit/use-cases/snapshot-delta.test.ts`.

- [ ] **Шаг 5: Закоммить**

```bash
git add src/domain/pricing.ts src/domain/taxonomy.ts src/adapters/fs/config-file.ts src/app/use-cases/effectiveness.ts src/app/use-cases/snapshot-delta.ts src/adapters/cli/commands/memory-effectiveness.ts tests/unit/domain/pricing.test.ts tests/unit/use-cases/effectiveness.test.ts tests/unit/adapters/config-file.test.ts tests/unit/use-cases/snapshot-delta.test.ts tests/unit/adapters/effectiveness-snapshots.test.ts
git commit -m "feat(effectiveness): totals block from run signals + pricing config (M3)"
```

Покрывает: Q5 (cost-per-success), Q7 (cache-hit ratio), критерий приёмки 3.

---

### Задача 5: M4 — недельные мутации в insights

Спека: `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md` §5 M4, §4 Q6. Зависимости: задачи 1–3 влиты (`SignalEvent`/`mondayOf` не нужны — эта задача сама экспортирует `mondayOf` для задач 6–8).

**Файлы:**

- Modify: `src/app/use-cases/generate-insights.ts` (export `mondayOf`, `InsightsInput.events`, `MutationBucket`, `InsightsReport.mutations`, расчёт, секция `Weekly mutations` в `renderInsights`)
- Modify: `src/adapters/cli/commands/memory-insights.ts` (чтение `log.readAll()`, passthrough `events`)
- Test: Extend `tests/unit/use-cases/generate-insights.test.ts`

- [ ] **Шаг 1: Напиши падающий тест**

Extend `tests/unit/use-cases/generate-insights.test.ts`. В шапку после импорта `MemoryObject` добавь:

```typescript
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
```

В фикстуре `base` describe'а `renderInsights` добавь поле `mutations: [],` (после `density: [],`) — иначе после реализации рендера старые тесты упадут на `undefined.map`.

В конец файла добавь:

```typescript
describe('generateInsights — weekly mutation buckets (M4)', () => {
  function memEvent(type: MemoryEvent['type'], timestamp: string): MemoryEvent {
    return { id: `ev-${type}-${timestamp}`, type, timestamp, actor: 'user:cli', payload: {} };
  }

  it('считает мутации по видам в неделях события; memory.scan.updated не мутация; вне окна не считается', async () => {
    const store = fakeStore([obj()]);
    const events = [
      memEvent('memory.added', '2026-08-25T10:00:00.000Z'), // неделя 2026-08-24
      memEvent('memory.updated', '2026-08-25T11:00:00.000Z'),
      memEvent('memory.superseded', '2026-08-18T10:00:00.000Z'), // неделя 2026-08-17
      memEvent('memory.resolved', '2026-08-19T10:00:00.000Z'),
      memEvent('memory.transitioned', '2026-08-20T10:00:00.000Z'),
      memEvent('memory.scan.updated', '2026-08-25T12:00:00.000Z'), // D10 — не мутация
      memEvent('memory.added', '2026-06-01T10:00:00.000Z'), // вне окна 8 недель
    ];
    const report = await generateInsights({ store, clock: fakeClock() }, { events });
    expect(report.mutations).toHaveLength(8);
    expect(report.mutations[7]).toEqual({
      week: '2026-08-24',
      added: 1,
      updated: 1,
      superseded: 0,
      resolved: 0,
      transitioned: 0,
      total: 2,
    });
    expect(report.mutations[6]).toEqual({
      week: '2026-08-17',
      added: 0,
      updated: 0,
      superseded: 1,
      resolved: 1,
      transitioned: 1,
      total: 3,
    });
    expect(report.mutations.reduce((sum, b) => sum + b.total, 0)).toBe(5);
  });

  it('без events → 8 нулевых бакетов (стабильная форма для рендера/JSON)', async () => {
    const store = fakeStore([obj()]);
    const report = await generateInsights({ store, clock: fakeClock() }, {});
    expect(report.mutations).toHaveLength(8);
    for (const b of report.mutations) {
      expect(b).toEqual({
        week: b.week,
        added: 0,
        updated: 0,
        superseded: 0,
        resolved: 0,
        transitioned: 0,
        total: 0,
      });
    }
  });

  it("renderInsights activity содержит 'Weekly mutations' со счётчиками видов", async () => {
    const store = fakeStore([obj()]);
    const events = [
      memEvent('memory.added', '2026-08-25T10:00:00.000Z'),
      memEvent('memory.updated', '2026-08-25T11:00:00.000Z'),
    ];
    const report = await generateInsights({ store, clock: fakeClock() }, { analysisType: 'activity', events });
    const text = renderInsights(report);
    expect(text).toContain('## Weekly mutations');
    expect(text).toContain('- 2026-08-24: added 1, updated 1, superseded 0, resolved 0, transitioned 0 (total 2)');
  });
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**

Запуск: `npx vitest run tests/unit/use-cases/generate-insights.test.ts -t "mutation"`
Ожидание: FAIL — `report.mutations is undefined` (поле ещё не считается/не возвращается); render-кейс: `text not containing 'Weekly mutations'`.

- [ ] **Шаг 3: Напиши минимальную реализацию**

**3а. Modify `src/app/use-cases/generate-insights.ts`.** В шапку после импорта `MemoryObject` добавь:

```typescript
import type { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
```

Локальную функцию `mondayOf` сделай экспортируемой ( контрактом пользуются задачи 6–11):

```typescript
export function mondayOf(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  const mondayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86_400_000;
  return new Date(mondayMs).toISOString().slice(0, 10);
}
```

После `WeekBucket` добавь типы и расширь input/report:

```typescript
/** M4: недельные мутации памяти по event log; memory.scan.updated — НЕ мутация (D10). */
export interface MutationBucket {
  week: string; // YYYY-MM-DD понедельника
  added: number;
  updated: number;
  superseded: number;
  resolved: number;
  transitioned: number;
  total: number;
}
```

В `InsightsInput` после `signalLog?` добавь:

```typescript
  /** M4: event log для недельных мутаций (passthrough, прецедент signalLog). */
  events?: MemoryEvent[];
```

В `InsightsReport` после `density: WeekBucket[];` добавь:

```typescript
  mutations: MutationBucket[]; // 8 недель, M4; всегда массив — стабильная форма для рендера/JSON
```

В `generateInsights` после цикла заполнения density-бакетов (цикл `for (const obj of matched) { ... }`, который инкрементирует `bucket.total`) добавь расчёт мутаций — те же 8 недель от `currentMondayMs`:

```typescript
// M4: мутации по event.timestamp; вид из event.type; scan.updated не считается (D10);
// events не переданы → все бакеты нулевые, но массив из 8 недель — стабильная форма
const mutationBuckets = new Map<string, MutationBucket>();
for (let i = 7; i >= 0; i--) {
  const key = new Date(currentMondayMs - i * 7 * 86_400_000).toISOString().slice(0, 10);
  mutationBuckets.set(key, {
    week: key,
    added: 0,
    updated: 0,
    superseded: 0,
    resolved: 0,
    transitioned: 0,
    total: 0,
  });
}
for (const ev of input.events ?? []) {
  const bucket = mutationBuckets.get(mondayOf(ev.timestamp));
  if (bucket === undefined) continue; // вне окна 8 недель
  if (ev.type === 'memory.added') bucket.added += 1;
  else if (ev.type === 'memory.updated') bucket.updated += 1;
  else if (ev.type === 'memory.superseded') bucket.superseded += 1;
  else if (ev.type === 'memory.resolved') bucket.resolved += 1;
  else if (ev.type === 'memory.transitioned') bucket.transitioned += 1;
  else continue; // memory.scan.updated — не мутация
  bucket.total += 1;
}
```

В return после `density: [...buckets.values()],` добавь:

```typescript
    mutations: [...mutationBuckets.values()],
```

В `renderInsights` в блоке `if (report.analysisType === 'activity')` после секции `Weekly density` (перед `Status tally`) добавь:

```typescript
section(
  lines,
  'Weekly mutations',
  report.mutations.map(
    (b) =>
      `- ${b.week}: added ${b.added}, updated ${b.updated}, superseded ${b.superseded}, resolved ${b.resolved}, transitioned ${b.transitioned} (total ${b.total})`
  )
);
```

**3б. Modify `src/adapters/cli/commands/memory-insights.ts`** — полный новый код `memoryInsightsCommand` (деструктурируется `log`, события пробрасываются по прецеденту signalLog):

```typescript
export function memoryInsightsCommand(): Command {
  return new Command('insights')
    .description('Heuristic pattern analysis over project memory (Level 1, no LLM)')
    .option('--topic <topic>', 'Filter by topic: exact tag match or substring in title/body')
    .addOption(new Option('--type <type>', 'Analysis lens').choices([...ANALYSIS_TYPES]).default('patterns'))
    .action(async (options) => {
      const baseDir = process.cwd();
      const { store, clock, log } = createCliContainer(baseDir);
      const events = await log.readAll();
      const summary = signalLogSummary(baseDir);
      const report = await generateInsights(
        { store, clock },
        {
          topic: options.topic,
          analysisType: options.type,
          // пустой лог — секции нет вовсе (регресс существующего вывода)
          ...(summary.totalEvents > 0 ? { signalLog: summary } : {}),
          ...(events.length > 0 ? { events } : {}),
        }
      );
      console.log(renderInsights(report));
    });
}
```

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**

Запуск: `npx vitest run tests/unit/use-cases/generate-insights.test.ts && npx tsc --noEmit`
Ожидание: PASS — 23 tests (20 старых + 3 новых); tsc без ошибок. Старые тесты остаются зелёными (fixed-фикстура `base` дополнена `mutations: []`).

- [ ] **Шаг 5: Закоммить**

```bash
git add src/app/use-cases/generate-insights.ts src/adapters/cli/commands/memory-insights.ts tests/unit/use-cases/generate-insights.test.ts
git commit -m "feat(insights): weekly mutation buckets from event log (M4)"
```

Покрывает: Q6 (динамика мутаций памяти), M4; прямого критерия приёмки §8 нет — источник для Trends-секции дашборда (критерий 7).

---

### Задача 6: M5-ядро — memory ledger, lifecycle-классификация, view filter

Спека: `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md` §2 (D7, D11), §4 (Q1–Q4, Q6, Q8, Q10–Q12), §5 M5, §6.2, §8 (критерии 4–6). Ревизия 4 (c9009fd): prevented в недельную воронку НЕ входит (holdout-счётчики кумулятивны) — только суммарно в rule ranking.

**Предусловия (задачи 1–5 уже в ветке):**

- `SignalEvent` имеет опц. `duration_ms?: number`, `tokens?: { input: number; output: number; cache_read: number }`, `experiment?: { id: string; arm: 'wolf' | 'baseline'; task_id?: string }` (задача 2).
- `RunLogEntry` имеет те же опциональные поля (задача 2).
- `src/domain/pricing.ts` существует: `runCostUsd(tokens, pricing, model)` → `number | null` по формуле `(input×rate + output×rate + cache_read×rate)/1e6`; `PricingTable = Record<string, { input: number; output: number; cache_read: number }>` ($/Mtok); null при отсутствии токенов/прайса/модели (задача 4).
- `mondayOf` экспортирована из `src/app/use-cases/generate-insights.ts` (задача 5).

**ИНВАРИАНТ КОНТРАКТА:** все публичные интерфейсы (`AnalyticsReport` и вложенные, `AnalyticsDeps`, `AnalyticsInput`, `AnalyticsViewFilter`, `AnalyticsViewPayload`) определяются в задаче 6 **один раз** и больше не меняются. Задачи 7–8 добавляют только локальные (не экспортируемые) функции-хелперы и заменяют тело `buildAnalyticsReport`. Задачи 9–11 (CLI/MCP/дашборд) импортируют эти типы из `src/app/use-cases/build-analytics.js`.

**Файлы:**

- Create: `src/app/use-cases/build-analytics.ts`
- Test: `tests/unit/use-cases/build-analytics.test.ts`

- [ ] **Шаг 1: Напиши падающий тест**

Создай `tests/unit/use-cases/build-analytics.test.ts` (мок-хелперы — копия паттерна `tests/unit/use-cases/effectiveness.test.ts`; фиксированные часы `2026-09-03T00:00:00Z`):

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildAnalyticsReport,
  filterAnalytics,
  classifyLifecycle,
  resolveLifecycleThresholds,
  DEFAULT_LIFECYCLE_THRESHOLDS,
} from '../../../src/app/use-cases/build-analytics.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { Clock } from '../../../src/ports/clock.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
import type { SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';

type Extra = Record<string, unknown>;

function mockStore(objects: Extra[]): MemoryStore {
  return {
    async list(filters) {
      return objects.filter(
        (o) => (!filters?.type || o.type === filters.type) && (!filters?.status || o.status === filters.status)
      ) as MemoryObject[];
    },
    async save() {
      throw new Error('not implemented');
    },
    async get() {
      return null;
    },
    async update() {
      throw new Error('not implemented');
    },
  };
}

function mockLog(events: MemoryEvent[]): EventLog {
  return {
    async readAll() {
      return events;
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}

const fixedClock: Clock = { now: () => new Date('2026-09-03T00:00:00Z') };

function deliveryEvent(name: string, ts: string): SignalEvent {
  return {
    ts,
    event: 'delivery',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'delivered',
    detail: { name },
  };
}

function complaintEvent(objectId: string, ts: string, about = 'quality', actor = 'user:cli'): SignalEvent {
  return {
    ts,
    event: 'complaint',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor },
    outcome: 'complaint',
    detail: { about, text: 'bad', object_id: objectId },
  };
}

function memEvent(
  type: MemoryEvent['type'],
  id: string,
  timestamp: string,
  payload: Extra = { memory_id: id },
  actor = 'user:cli'
): MemoryEvent {
  return { id: `ev-${type}-${id}-${timestamp}`, type, timestamp, actor, payload };
}

describe('classifyLifecycle (D7: newDays=14 / workhorseUses=3)', () => {
  const t = DEFAULT_LIFECYCLE_THRESHOLDS;

  it('границы: uses>=3 workhorse | 1..2 sleeper | 0 и age<=14 new | 0 и age>14 dead', () => {
    expect(classifyLifecycle(3, 0, t)).toBe('workhorse');
    expect(classifyLifecycle(5, 100, t)).toBe('workhorse');
    expect(classifyLifecycle(2, 0, t)).toBe('sleeper');
    expect(classifyLifecycle(1, 100, t)).toBe('sleeper');
    expect(classifyLifecycle(0, 14, t)).toBe('new');
    expect(classifyLifecycle(0, 15, t)).toBe('dead');
  });

  it('override-пороги двигают границы; resolveLifecycleThresholds мержит поверх дефолтов', () => {
    expect(classifyLifecycle(2, 0, { newDays: 14, workhorseUses: 2 })).toBe('workhorse');
    expect(classifyLifecycle(0, 7, { newDays: 7, workhorseUses: 3 })).toBe('new');
    expect(resolveLifecycleThresholds()).toEqual(DEFAULT_LIFECYCLE_THRESHOLDS);
    expect(resolveLifecycleThresholds({ workhorseUses: 5 })).toEqual({ newDays: 14, workhorseUses: 5 });
  });
});

describe('buildAnalyticsReport: memory ledger (Q1/Q2)', () => {
  const objects: Extra[] = [
    {
      id: 'r1',
      title: 'r1',
      type: 'rule',
      status: 'active',
      created_at: '2026-08-30T00:00:00Z',
      holdout_prevented: 3,
      holdout_checked: 5,
    },
    { id: 'l1', title: 'l1', type: 'lesson', status: 'active', created_at: '2026-08-30T00:00:00Z' },
    {
      id: 't1',
      title: 't1',
      type: 'tool',
      status: 'active',
      created_at: '2026-08-30T00:00:00Z',
      name: 'my-tool',
      last_used_at: '2026-09-01T00:00:00Z',
    },
    { id: 'o1', title: 'o1', type: 'decision', status: 'active', created_at: '2026-08-01T00:00:00Z' },
    { id: 'a1', title: 'a1', type: 'rule', status: 'archived', created_at: '2026-08-01T00:00:00Z' },
    { id: 'dr1', title: 'dr1', type: 'document-ref', status: 'active', created_at: '2026-08-30T00:00:00Z' },
  ];
  const events: MemoryEvent[] = [
    memEvent('memory.added', 'r1', '2026-08-30T00:00:01Z'),
    memEvent('memory.updated', 'r1', '2026-08-31T12:00:00Z'), // triggers r1 +1
    memEvent('memory.added', 'l1', '2026-08-30T00:00:01Z'),
  ];
  const signals: SignalEvent[] = [
    deliveryEvent('r1', '2026-08-31T10:00:00Z'),
    deliveryEvent('r1', '2026-09-01T06:00:00Z'),
    deliveryEvent('my-tool', '2026-08-31T08:00:00Z'), // tool-аттрибуция по ToolFields.name
    complaintEvent('r1', '2026-09-02T00:00:00Z'),
  ];

  it('rows: base без archived/document-ref; deliveries/triggers/complaints/holdout/last_used → lifecycle', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.thresholds).toEqual(DEFAULT_LIFECYCLE_THRESHOLDS);
    expect(report.generatedAt).toBe('2026-09-03T00:00:00.000Z');
    expect(report.memory.rows.map((r) => r.id)).toEqual(['r1', 'l1', 't1', 'o1']);

    const r1 = report.memory.rows[0]!;
    expect(r1).toMatchObject({
      id: 'r1',
      type: 'rule',
      title: 'r1',
      status: 'active',
      created_at: '2026-08-30T00:00:00Z',
      age_days: 4,
      deliveries: 2,
      triggers: 1,
      complaints: 1,
      holdout_prevented: 3,
      holdout_checked: 5,
      last_used: '2026-09-02T00:00:00Z',
      lifecycle: 'workhorse', // uses=3 >= 3
    });
    const l1 = report.memory.rows[1]!;
    expect(l1.lifecycle).toBe('new'); // uses=0, age 4 <= 14
    expect(l1.last_used).toBeNull();
    expect(l1.holdout_prevented).toBeNull();
    const t1 = report.memory.rows[2]!;
    expect(t1.lifecycle).toBe('sleeper'); // uses=1 (delivery по tool-name)
    expect(t1.last_used).toBe('2026-09-01T00:00:00Z'); // max(delivery ts, last_used_at)
    const o1 = report.memory.rows[3]!;
    expect(o1.age_days).toBe(33);
    expect(o1.lifecycle).toBe('dead');
  });

  it('garbage: dead/base/ratioPct + инвариант dead === числу dead-строк', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.memory.garbage).toEqual({ dead: 1, base: 4, ratioPct: 25 });
    expect(report.memory.garbage.dead).toBe(report.memory.rows.filter((r) => r.lifecycle === 'dead').length);
  });

  it('ЗАГЛУШКИ (временный тест — удаляется в задаче 7): tools/rules/funnel/outliers/agents пусты, steward/readiness нулевые', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.tools).toEqual([]);
    expect(report.rules).toEqual([]);
    expect(report.funnel).toEqual([]);
    expect(report.outliers).toEqual([]);
    expect(report.agents).toEqual([]);
    expect(report.steward).toEqual({
      mutations: [],
      mutationsByWeek: [],
      complaintFunnel: { filed: 0, resolved: 0, rejected: 0, avgLifetimeHours: null, slaEscalations: 0 },
      recidivismCount: 0,
      churnIds: [],
      autoMutationSharePct: null,
    });
    expect(report.readiness).toEqual({ totalRuns: 0, withArm: 0, withArmPct: null, byArm: [], byExperiment: [] });
  });

  it('filterAnalytics: view-срезы, class/type-фильтр, top-лимит, view=all', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), clock: fixedClock },
      { signals, runLogText: null }
    );
    const dead = filterAnalytics(report, { view: 'memory', class: 'dead' });
    if (dead.view !== 'memory') throw new Error('expected memory view');
    expect(dead.rows.map((r) => r.id)).toEqual(['o1']);
    expect(dead.garbage).toEqual({ dead: 1, base: 4, ratioPct: 25 });

    const typed = filterAnalytics(report, { view: 'memory', type: 'tool' });
    if (typed.view !== 'memory') throw new Error('expected memory view');
    expect(typed.rows.map((r) => r.id)).toEqual(['t1']);

    const top1 = filterAnalytics(report, { view: 'memory', top: 1 });
    if (top1.view !== 'memory') throw new Error('expected memory view');
    expect(top1.rows.map((r) => r.id)).toEqual(['r1']);

    const rules = filterAnalytics(report, { view: 'rules', silent: true });
    if (rules.view !== 'rules') throw new Error('expected rules view');
    expect(rules.rows).toEqual([]);

    const all = filterAnalytics(report, { view: 'all' });
    if (all.view !== 'all') throw new Error('expected all view');
    expect(all.report).toBe(report);
  });
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**

Запуск: `npx vitest run tests/unit/use-cases/build-analytics.test.ts -t "memory ledger"`
Ожидание: FAIL — `Cannot find module '.../src/app/use-cases/build-analytics.js'` (файла ещё нет; esbuild-резолв импорта падает раньше любого expect).

- [ ] **Шаг 3: Напиши минимальную реализацию**

Создай `src/app/use-cases/build-analytics.ts` — полный файл:

```typescript
/**
 * M5 (ядро L2): `wolf analytics` — реестры и воронка (Q1–Q4, Q6, Q8, Q10–Q12).
 * Чистая детерминированная агрегация store + signals + event-log + run-log, без LLM.
 * Дизайн: docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md §5 M5, §6.2.
 */
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import type { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import type { PricingTable } from '../../domain/pricing.js';

// ---------------------------------------------------------------------------
// Контракт отчёта (сквозной для задач 6–11: меняется ТОЛЬКО в задаче 6)
// ---------------------------------------------------------------------------

export interface LifecycleThresholds {
  newDays: number;
  workhorseUses: number;
}

export const DEFAULT_LIFECYCLE_THRESHOLDS: LifecycleThresholds = { newDays: 14, workhorseUses: 3 };

/** Override из config (analytics.thresholds) поверх дефолтов (D7). */
export function resolveLifecycleThresholds(override?: Partial<LifecycleThresholds>): LifecycleThresholds {
  return { ...DEFAULT_LIFECYCLE_THRESHOLDS, ...override };
}

export type LifecycleClass = 'new' | 'sleeper' | 'workhorse' | 'dead';

/** uses >= workhorseUses → workhorse; 1..workhorseUses-1 → sleeper; 0 && ageDays <= newDays → new; иначе dead. */
export function classifyLifecycle(uses: number, ageDays: number, t: LifecycleThresholds): LifecycleClass {
  if (uses >= t.workhorseUses) return 'workhorse';
  if (uses >= 1) return 'sleeper';
  return ageDays <= t.newDays ? 'new' : 'dead';
}

export interface MemoryLedgerRow {
  id: string;
  type: string;
  title: string;
  status: string;
  created_at: string;
  age_days: number;
  deliveries: number;
  triggers: number;
  complaints: number;
  holdout_prevented: number | null;
  holdout_checked: number | null;
  last_used: string | null;
  lifecycle: LifecycleClass;
}

export interface GarbageStats {
  dead: number;
  base: number;
  ratioPct: number | null;
}

export interface ToolLedgerRow {
  name: string;
  origin: 'script' | 'model-native';
  id: string | null;
  status: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  errorCount: number;
  errorClasses: { id: string; count: number }[];
  promotion: 'expose-candidate' | 'register-candidate' | null;
}

export interface RuleRankingRow {
  id: string;
  title: string;
  status: string;
  prevented: number;
  checked: number | null;
  silent: boolean;
}

export interface FunnelWeek {
  week: string;
  writes: number;
  delivers: number;
  triggers: number;
  writeToDeliverPct: number | null;
  deliverToTriggerPct: number | null;
}

export interface OutlierRun {
  ts: string | null;
  model: string | null;
  agent: string | null;
  title: string | null;
  weighted: number;
  costUsd: number | null;
  tools: string[];
}

export interface AgentLedgerRow {
  agent: string;
  runs: number;
  failures: number;
  failureRatePct: number | null;
  weighted: number;
  avgDurationMs: number | null;
  costUsd: number | null;
  toolErrors: number;
  complaintsBy: number;
  complaintsAbout: number;
  successes: number;
  holdoutPrevented: number | null;
}

export interface StewardView {
  mutations: { kind: string; count: number }[];
  mutationsByWeek: { week: string; total: number }[];
  complaintFunnel: {
    filed: number;
    resolved: number;
    rejected: number;
    avgLifetimeHours: number | null;
    slaEscalations: number;
  };
  recidivismCount: number;
  churnIds: string[];
  autoMutationSharePct: number | null;
}

export interface ExperimentReadiness {
  totalRuns: number;
  withArm: number;
  withArmPct: number | null;
  byArm: { arm: string; runs: number }[];
  byExperiment: { experiment: string; runs: number }[];
}

export interface AnalyticsReport {
  generatedAt: string;
  thresholds: LifecycleThresholds;
  memory: { rows: MemoryLedgerRow[]; garbage: GarbageStats };
  tools: ToolLedgerRow[];
  rules: RuleRankingRow[];
  funnel: FunnelWeek[];
  outliers: OutlierRun[];
  agents: AgentLedgerRow[];
  steward: StewardView;
  readiness: ExperimentReadiness;
}

export interface AnalyticsDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
}

export interface AnalyticsInput {
  signals: SignalEvent[];
  runLogText: string | null;
  thresholds?: Partial<LifecycleThresholds>;
  patternThreshold?: number;
  weeks?: number;
  topOutliers?: number;
  pricing?: PricingTable;
}

// ---------------------------------------------------------------------------
// Внутренние хелперы
// ---------------------------------------------------------------------------

/** Passthrough-поля MemoryObject — читаем кастом, NaN/Infinity отбрасываем (прецедент effectiveness). */
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Memory ledger (Q1/Q2): per-object след использования + lifecycle-класс D7. */
function buildMemoryLedger(
  objects: MemoryObject[],
  events: MemoryEvent[],
  signals: SignalEvent[],
  now: Date,
  t: LifecycleThresholds
): AnalyticsReport['memory'] {
  const rows: MemoryLedgerRow[] = [];
  for (const o of objects) {
    // база: активная память минус archived и document-ref (прецедент noise-метрики)
    if (o.status === 'archived' || o.type === 'document-ref') continue;
    const rec = o as Record<string, unknown>;
    // tool-доставки пишутся по полю name (ToolFields), не по id объекта
    const toolName = o.type === 'tool' && typeof rec.name === 'string' ? rec.name : null;

    let lastUsed: string | null = null;
    const bump = (ts: string | null): void => {
      if (ts !== null && (lastUsed === null || ts > lastUsed)) lastUsed = ts;
    };

    // доставки: delivery-сигналы по detail.name === id (или tool-name)
    let deliveries = 0;
    for (const s of signals) {
      if (s.event !== 'delivery') continue;
      const name = s.detail?.name;
      if (name === o.id || (toolName !== null && name === toolName)) {
        deliveries += 1;
        bump(s.ts);
      }
    }
    // срабатывания: любое событие кроме memory.added с payload.memory_id === id (прецедент readIds)
    let triggers = 0;
    for (const ev of events) {
      if (ev.type === 'memory.added') continue;
      const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
      if (mid === o.id) {
        triggers += 1;
        bump(ev.timestamp);
      }
    }
    // жалобы: complaint-сигналы по detail.object_id
    let complaints = 0;
    for (const s of signals) {
      if (s.event === 'complaint' && s.detail?.object_id === o.id) {
        complaints += 1;
        bump(s.ts);
      }
    }
    // у tool-объектов last_used_at пишется использованием (ToolFields)
    if (toolName !== null && typeof rec.last_used_at === 'string') bump(rec.last_used_at);

    const ageDays = Math.floor((now.getTime() - Date.parse(o.created_at)) / 86_400_000);
    const uses = deliveries + triggers;
    rows.push({
      id: o.id,
      type: o.type,
      title: o.title,
      status: o.status,
      created_at: o.created_at,
      age_days: ageDays,
      deliveries,
      triggers,
      complaints,
      holdout_prevented: finiteNumber(rec.holdout_prevented),
      holdout_checked: finiteNumber(rec.holdout_checked),
      last_used: lastUsed,
      lifecycle: classifyLifecycle(uses, ageDays, t),
    });
  }
  const dead = rows.filter((r) => r.lifecycle === 'dead').length;
  const base = rows.length;
  return { rows, garbage: { dead, base, ratioPct: base > 0 ? (dead / base) * 100 : null } };
}

/** Нулевой steward-view (задача 8 заменит расчётом). */
function emptyStewardView(): StewardView {
  return {
    mutations: [],
    mutationsByWeek: [],
    complaintFunnel: { filed: 0, resolved: 0, rejected: 0, avgLifetimeHours: null, slaEscalations: 0 },
    recidivismCount: 0,
    churnIds: [],
    autoMutationSharePct: null,
  };
}

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

/**
 * Полный аналитический отчёт M5 из трёх портов: чистая агрегация, детерминированная.
 * Не падает на пустой памяти — все блоки возвращают нули/null/пустые массивы.
 */
export async function buildAnalyticsReport(deps: AnalyticsDeps, input: AnalyticsInput): Promise<AnalyticsReport> {
  const thresholds = resolveLifecycleThresholds(input.thresholds);
  const now = deps.clock.now();
  // ponytail: store.list() — полный reparse всех md; ровно один вызов на отчёт (прецедент generateInsights)
  const allObjects = await deps.store.list();
  const events = await deps.log.readAll();

  const memory = buildMemoryLedger(allObjects, events, input.signals, now, thresholds);

  return {
    generatedAt: now.toISOString(),
    thresholds,
    memory,
    tools: [], // задача 7: tool ledger (Q3, D11)
    rules: [], // задача 7: rule ranking (Q4)
    funnel: [], // задача 8: воронка по неделям (Q6)
    outliers: [], // задача 8: top-N дорогих прогонов (Q8)
    agents: [], // задача 8: agent ledger (Q11)
    steward: emptyStewardView(), // задача 8: steward view (Q12)
    readiness: { totalRuns: 0, withArm: 0, withArmPct: null, byArm: [], byExperiment: [] }, // задача 8: Q10
  };
}

// ---------------------------------------------------------------------------
// View filter (§6.2: выборки Стюарда для CLI/MCP — задачи 9–11)
// ---------------------------------------------------------------------------

export interface AnalyticsViewFilter {
  view: 'memory' | 'tools' | 'rules' | 'funnel' | 'agents' | 'steward' | 'outliers' | 'readiness' | 'all';
  class?: 'new' | 'sleeper' | 'workhorse' | 'dead';
  type?: string;
  origin?: 'script' | 'model-native';
  agent?: string;
  silent?: boolean;
  top?: number;
}

export type AnalyticsViewPayload =
  | { view: 'memory'; rows: MemoryLedgerRow[]; garbage: GarbageStats }
  | { view: 'tools'; rows: ToolLedgerRow[] }
  | { view: 'rules'; rows: RuleRankingRow[] }
  | { view: 'funnel'; weeks: FunnelWeek[] }
  | { view: 'agents'; rows: AgentLedgerRow[] }
  | { view: 'steward'; steward: StewardView }
  | { view: 'outliers'; runs: OutlierRun[] }
  | { view: 'readiness'; readiness: ExperimentReadiness }
  | { view: 'all'; report: AnalyticsReport };

/** Срез отчёта по view-фильтру (§6.2); top ограничивает строки, дефолт 20. */
export function filterAnalytics(report: AnalyticsReport, filter: AnalyticsViewFilter): AnalyticsViewPayload {
  const top = filter.top ?? 20;
  switch (filter.view) {
    case 'memory': {
      let rows = report.memory.rows;
      if (filter.class !== undefined) rows = rows.filter((r) => r.lifecycle === filter.class);
      if (filter.type !== undefined) rows = rows.filter((r) => r.type === filter.type);
      return { view: 'memory', rows: rows.slice(0, top), garbage: report.memory.garbage };
    }
    case 'tools': {
      let rows = report.tools;
      if (filter.origin !== undefined) rows = rows.filter((r) => r.origin === filter.origin);
      return { view: 'tools', rows: rows.slice(0, top) };
    }
    case 'rules': {
      let rows = report.rules;
      if (filter.silent !== undefined) rows = rows.filter((r) => r.silent === filter.silent);
      return { view: 'rules', rows: rows.slice(0, top) };
    }
    case 'funnel':
      return { view: 'funnel', weeks: report.funnel };
    case 'agents': {
      let rows = report.agents;
      if (filter.agent !== undefined) rows = rows.filter((r) => r.agent === filter.agent);
      return { view: 'agents', rows: rows.slice(0, top) };
    }
    case 'steward':
      return { view: 'steward', steward: report.steward };
    case 'outliers':
      return { view: 'outliers', runs: report.outliers.slice(0, top) };
    case 'readiness':
      return { view: 'readiness', readiness: report.readiness };
    case 'all':
      return { view: 'all', report };
  }
}
```

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**

Запуск: `npx vitest run tests/unit/use-cases/build-analytics.test.ts`
Ожидание: PASS (6 it). Дополнительно: `npx tsc --noEmit` — чисто.

- [ ] **Шаг 5: Закоммить**

```bash
git add src/app/use-cases/build-analytics.ts tests/unit/use-cases/build-analytics.test.ts
git commit -m "feat(analytics): memory ledger, lifecycle classification, view filter (M5)"
```

Покрывает: Q1/Q2 (memory ledger, garbage ratio), критерий приёмки 4.

---

### Задача 7: M5 — tool ledger (script/model-native) + rule ranking

**Файлы:**

- Modify: `src/app/use-cases/build-analytics.ts` (импорты; функции `buildToolLedger`/`buildRuleRanking`; замена заглушек `tools: []`/`rules: []` в `buildAnalyticsReport`)
- Test: `tests/unit/use-cases/build-analytics.test.ts` (добавить хелперы `T`/`runSignal`/`toolErrorEvent` + два describe-блока)

- [ ] **Шаг 1: Напиши падающий тест**

Сначала удали из describe `buildAnalyticsReport: memory ledger (Q1/Q2)` временный it-блок `ЗАГЛУШКИ (временный тест — удаляется в задаче 7)` целиком (от `it('ЗАГЛУШКИ …` до его закрывающей `});`) — его проверка честно устаревает: с первым реальным расчётом `tools` перестаёт быть `[]` (в фикстуре есть tool-объект `t1`).

Затем в `tests/unit/use-cases/build-analytics.test.ts` добавь в конец блока хелперов (после `memEvent`):

```typescript
/** ISO-таймстамп «минута N» — лексикографическая сортировка = хронология. */
const T = (minute: number): string => new Date(Date.UTC(2026, 0, 1, 0, minute, 0)).toISOString();

function runSignal(opts: {
  agent?: string | null;
  model?: string | null;
  ts?: string;
  session?: string | null;
  weighted?: number;
  outcome?: string;
  durationMs?: number;
  experiment?: { id: string; arm: 'wolf' | 'baseline'; task_id?: string };
}): SignalEvent {
  return {
    ts: opts.ts ?? '2026-09-01T00:00:00Z',
    event: 'run',
    session_id: opts.session ?? null,
    gen_ai: { modelID: opts.model ?? null, agent: opts.agent ?? null },
    orchestration: { task: null, actor: 'user:cli' },
    ...(opts.weighted !== undefined ? { weighted: opts.weighted } : {}),
    ...(opts.outcome !== undefined ? { outcome: opts.outcome } : {}),
    ...(opts.durationMs !== undefined ? { duration_ms: opts.durationMs } : {}),
    ...(opts.experiment !== undefined ? { experiment: opts.experiment } : {}),
  };
}

function toolErrorEvent(
  toolName: string,
  errorClassId: string,
  ts = '2026-09-01T00:00:00Z',
  agent: string | null = null
): SignalEvent {
  return {
    ts,
    event: 'tool_error',
    session_id: null,
    gen_ai: { modelID: null, agent },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'error',
    tool_name: toolName,
    error_class_id: errorClassId,
    detail: { message: 'boom' },
  };
}
```

И в конец файла — два describe-блока:

```typescript
describe('buildAnalyticsReport: tool ledger (Q3, D11)', () => {
  const objects: Extra[] = [
    {
      id: 'tb',
      type: 'tool',
      status: 'active',
      created_at: '2026-08-01T00:00:00Z',
      name: 'busy-tool',
      usage_count: 10,
    },
    {
      id: 'tc',
      type: 'tool',
      status: 'candidate',
      created_at: '2026-08-01T00:00:00Z',
      name: 'fetch-helper',
      usage_count: 3,
    },
    {
      id: 'ta',
      type: 'tool',
      status: 'candidate',
      created_at: '2026-08-01T00:00:00Z',
      name: 'almost-tool',
      usage_count: 2,
    },
  ];
  const runLog = [
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['webfetch'] }),
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['webfetch'] }),
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['webfetch'] }),
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['webfetch'] }),
    JSON.stringify({ model: 'glm', weighted: 100, tools: ['busy-tool'] }), // script-имя — не native
  ].join('\n');
  const signals: SignalEvent[] = [
    toolErrorEvent('fetch-helper', 'http_error'),
    toolErrorEvent('fetch-helper', 'http_error'),
    toolErrorEvent('fetch-helper', 'timeout_error'),
    toolErrorEvent('mcp-fetch', 'http_error'),
  ];

  it('script первым, usageCount убыв.; candidate+порог → expose; native без регистрации → register; ошибки по классам', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), clock: fixedClock },
      { signals, runLogText: runLog }
    );
    expect(report.tools.map((r) => [r.name, r.origin, r.usageCount])).toEqual([
      ['busy-tool', 'script', 10],
      ['fetch-helper', 'script', 3],
      ['almost-tool', 'script', 2],
      ['webfetch', 'model-native', 4],
      ['mcp-fetch', 'model-native', 1],
    ]);
    const byName = new Map(report.tools.map((r) => [r.name, r]));
    expect(byName.get('busy-tool')!.promotion).toBeNull(); // active, не candidate
    expect(byName.get('busy-tool')!.errorCount).toBe(0);
    expect(byName.get('fetch-helper')!.promotion).toBe('expose-candidate'); // candidate && 3 >= 3
    expect(byName.get('fetch-helper')!.errorCount).toBe(3);
    expect(byName.get('fetch-helper')!.errorClasses).toEqual([
      { id: 'http_error', count: 2 },
      { id: 'timeout_error', count: 1 },
    ]);
    expect(byName.get('almost-tool')!.promotion).toBeNull(); // candidate, но 2 < 3
    const webfetch = byName.get('webfetch')!;
    expect(webfetch.id).toBeNull();
    expect(webfetch.status).toBeNull();
    expect(webfetch.lastUsedAt).toBeNull();
    expect(webfetch.promotion).toBe('register-candidate'); // 4 появлений >= 3
    expect(byName.get('mcp-fetch')!.promotion).toBeNull(); // 1 < 3
  });

  it('patternThreshold из input повышает планку promotion', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), clock: fixedClock },
      { signals, runLogText: runLog, patternThreshold: 5 }
    );
    const byName = new Map(report.tools.map((r) => [r.name, r]));
    expect(byName.get('fetch-helper')!.promotion).toBeNull(); // 3 < 5
    expect(byName.get('webfetch')!.promotion).toBeNull(); // 4 < 5
  });
});

describe('buildAnalyticsReport: rule ranking (Q4)', () => {
  const objects: Extra[] = [
    {
      id: 'rule-c',
      title: 'rule-c',
      type: 'rule',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      holdout_prevented: 5,
    },
    {
      id: 'rule-a',
      title: 'rule-a',
      type: 'rule',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      holdout_prevented: 5,
    },
    {
      id: 'rule-b',
      title: 'rule-b',
      type: 'rule',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      holdout_prevented: 2,
    },
  ];
  // ЛОВУШКА silentRuleIds: нужно ≥20 delivery-событий и >30 сессий; молчит тот,
  // чья ПОСЛЕДНЯЯ доставка раньше первого run сессии, открывающей последние 30
  // (sessions[32-30] = s02 → граница T(2)). rule-c: последняя T(1) < T(2) → молчит;
  // rule-a: последняя T(29) → свежий; rule-b без доставок → не попадает в карту.
  const signals: SignalEvent[] = [];
  for (let i = 0; i < 32; i++) signals.push(runSignal({ session: `s${String(i).padStart(2, '0')}`, ts: T(i) }));
  signals.push(deliveryEvent('rule-c', T(0)), deliveryEvent('rule-c', T(1)));
  for (let i = 10; i <= 29; i++) signals.push(deliveryEvent('rule-a', T(i)));

  it('все статусы; prevented убыв., silent false первым, потом id; silent от silentRuleIds', async () => {
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.rules.map((r) => r.id)).toEqual(['rule-a', 'rule-c', 'rule-b']);
    expect(report.rules.map((r) => r.silent)).toEqual([false, true, false]);
    expect(report.rules[0]).toMatchObject({ title: 'rule-a', status: 'active', prevented: 5, checked: null });
    expect(report.rules[2]!.prevented).toBe(2);
  });
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**

Запуск: `npx vitest run tests/unit/use-cases/build-analytics.test.ts -t "tool ledger"`
Ожидание: FAIL — `report.tools` ещё заглушка `[]`: `expected [] to deeply equal [[ 'busy-tool', … ]]` (map по пустому массиву даёт `[]`).

- [ ] **Шаг 3: Напиши минимальную реализацию**

**(3а)** В `src/app/use-cases/build-analytics.ts` добавь импорты. Блок импортов станет:

```typescript
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import type { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import { DEFAULT_PATTERN_THRESHOLD, type SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { parseRunLog } from '../../domain/tool-economy.js';
import { UNCATEGORIZED_ERROR_CLASS } from '../../domain/error-class.js';
import { silentRuleIds } from './learn-decay.js';
```

**(3б)** Перед `function emptyStewardView()` добавь две локальные функции:

```typescript
/** Каст tool-полей реестра (ToolFields в tool-librarian.ts): name — ключ lookup'а. */
function toolNameOf(o: MemoryObject): string | null {
  const rec = o as Record<string, unknown>;
  return o.type === 'tool' && typeof rec.name === 'string' && rec.name !== '' ? rec.name : null;
}

/** Tool ledger (Q3, D11): script = объекты type:'tool'; model-native = имена из логов минус script. */
function buildToolLedger(
  toolObjects: MemoryObject[],
  signals: SignalEvent[],
  runLogText: string | null,
  patternThreshold: number
): ToolLedgerRow[] {
  // ошибки по имени тула: tool_error-сигналы, группа по error_class_id
  const errorsByName = new Map<string, { count: number; classes: Map<string, number> }>();
  for (const ev of signals) {
    if (ev.event !== 'tool_error' || typeof ev.tool_name !== 'string') continue;
    const tally = errorsByName.get(ev.tool_name) ?? { count: 0, classes: new Map<string, number>() };
    tally.count += 1;
    const cls = ev.error_class_id ?? UNCATEGORIZED_ERROR_CLASS;
    tally.classes.set(cls, (tally.classes.get(cls) ?? 0) + 1);
    errorsByName.set(ev.tool_name, tally);
  }
  const errorRow = (name: string): { errorCount: number; errorClasses: { id: string; count: number }[] } => {
    const tally = errorsByName.get(name);
    if (tally === undefined) return { errorCount: 0, errorClasses: [] };
    return {
      errorCount: tally.count,
      errorClasses: [...tally.classes.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    };
  };

  const rows: ToolLedgerRow[] = [];
  const scriptNames = new Set<string>();

  // script-ряды: реестр type:'tool' (каст ToolFields — прецедент tool-stats)
  for (const o of toolObjects) {
    const rec = o as Record<string, unknown>;
    const name = toolNameOf(o) ?? o.title;
    scriptNames.add(name);
    const usageCount = typeof rec.usage_count === 'number' ? rec.usage_count : 0;
    rows.push({
      name,
      origin: 'script',
      id: o.id,
      status: o.status,
      usageCount,
      lastUsedAt: typeof rec.last_used_at === 'string' ? rec.last_used_at : null,
      ...errorRow(name),
      promotion: o.status === 'candidate' && usageCount >= patternThreshold ? 'expose-candidate' : null,
    });
  }

  // model-native: имена из tool_error-сигналов ∪ run-log tools[], минус зарегистрированные script
  const nativeCounts = new Map<string, number>();
  const bumpNative = (name: string): void => {
    nativeCounts.set(name, (nativeCounts.get(name) ?? 0) + 1);
  };
  for (const ev of signals) {
    if (ev.event === 'tool_error' && typeof ev.tool_name === 'string') bumpNative(ev.tool_name);
  }
  for (const entry of parseRunLog(runLogText ?? '')) {
    for (const name of entry.tools ?? []) bumpNative(name);
  }
  for (const [name, usageCount] of nativeCounts) {
    if (scriptNames.has(name)) continue;
    rows.push({
      name,
      origin: 'model-native',
      id: null,
      status: null,
      usageCount,
      lastUsedAt: null,
      ...errorRow(name),
      promotion: usageCount >= patternThreshold ? 'register-candidate' : null,
    });
  }

  // сортировка: script первым, потом usageCount убыв., потом имя
  return rows.sort((a, b) => {
    if (a.origin !== b.origin) return a.origin === 'script' ? -1 : 1;
    return b.usageCount - a.usageCount || a.name.localeCompare(b.name);
  });
}

/** Rule ranking (Q4): все статусы; prevented из holdout_prevented; silent от silentRuleIds. */
function buildRuleRanking(ruleObjects: MemoryObject[], signals: SignalEvent[]): RuleRankingRow[] {
  const silent = silentRuleIds(signals).ids;
  return ruleObjects
    .map((o) => {
      const rec = o as Record<string, unknown>;
      return {
        id: o.id,
        title: o.title,
        status: o.status,
        prevented: finiteNumber(rec.holdout_prevented) ?? 0,
        checked: finiteNumber(rec.holdout_checked),
        silent: silent.has(o.id),
      };
    })
    .sort((a, b) => b.prevented - a.prevented || Number(a.silent) - Number(b.silent) || a.id.localeCompare(b.id));
}
```

**(3в)** В `buildAnalyticsReport` замени тело — после `const memory = …` добавь две строки и замени заглушки в return (функция целиком):

```typescript
export async function buildAnalyticsReport(deps: AnalyticsDeps, input: AnalyticsInput): Promise<AnalyticsReport> {
  const thresholds = resolveLifecycleThresholds(input.thresholds);
  const now = deps.clock.now();
  // ponytail: store.list() — полный reparse всех md; ровно один вызов на отчёт (прецедент generateInsights)
  const allObjects = await deps.store.list();
  const events = await deps.log.readAll();

  const memory = buildMemoryLedger(allObjects, events, input.signals, now, thresholds);
  const tools = buildToolLedger(
    allObjects.filter((o) => o.type === 'tool'),
    input.signals,
    input.runLogText,
    input.patternThreshold ?? DEFAULT_PATTERN_THRESHOLD
  );
  const rules = buildRuleRanking(
    allObjects.filter((o) => o.type === 'rule'),
    input.signals
  );

  return {
    generatedAt: now.toISOString(),
    thresholds,
    memory,
    tools,
    rules,
    funnel: [], // задача 8: воронка по неделям (Q6)
    outliers: [], // задача 8: top-N дорогих прогонов (Q8)
    agents: [], // задача 8: agent ledger (Q11)
    steward: emptyStewardView(), // задача 8: steward view (Q12)
    readiness: { totalRuns: 0, withArm: 0, withArmPct: null, byArm: [], byExperiment: [] }, // задача 8: Q10
  };
}
```

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**

Запуск: `npx vitest run tests/unit/use-cases/build-analytics.test.ts`
Ожидание: PASS (8 it: 5 задачи 6 после удаления временного + 3 новых). Дополнительно: `npx tsc --noEmit` — чисто.

- [ ] **Шаг 5: Закоммить**

```bash
git add src/app/use-cases/build-analytics.ts tests/unit/use-cases/build-analytics.test.ts
git commit -m "feat(analytics): tool ledger origins + rule ranking (M5)"
```

Покрывает: Q3 (tool ledger), Q4 (rule ranking), критерии приёмки 4 (tools-часть) и 5.

---

### Задача 8: M5 — funnel, outliers, agent ledger, steward view, readiness

**Файлы:**

- Modify: `src/app/use-cases/build-analytics.ts` (импорт pricing/mondayOf/parseRunLog; хелперы `weekBuckets`/`buildFunnel`/`buildOutliers`/`buildAgents`/`buildSteward`/`buildReadiness`; замена оставшихся заглушек; удаление `emptyStewardView`)
- Test: `tests/unit/use-cases/build-analytics.test.ts` (пять describe-блоков в конец файла)

- [ ] **Шаг 1: Напиши падающий тест**

В конец `tests/unit/use-cases/build-analytics.test.ts` добавь (числа просчитаны руками):

```typescript
describe('buildAnalyticsReport: funnel (Q6)', () => {
  it('2 недели: writes/delivers/triggers + конверсии; пустая неделя → null-конверсии', async () => {
    const events: MemoryEvent[] = [
      memEvent('memory.added', 'm1', '2026-09-01T10:00:00Z'),
      memEvent('memory.added', 'm2', '2026-09-01T11:00:00Z'),
    ];
    const signals: SignalEvent[] = [
      deliveryEvent('r1', '2026-09-02T10:00:00Z'),
      deliveryEvent('r1', '2026-09-02T11:00:00Z'),
      deliveryEvent('r2', '2026-09-02T12:00:00Z'),
    ];
    const report = await buildAnalyticsReport(
      { store: mockStore([]), log: mockLog(events), clock: fixedClock },
      { signals, runLogText: null, weeks: 2 }
    );
    // текущий понедельник 2026-08-31 (ср. часы 2026-09-03 — четверг); бакеты от старой к новой
    expect(report.funnel).toHaveLength(2);
    expect(report.funnel[0]).toEqual({
      week: '2026-08-24',
      writes: 0,
      delivers: 0,
      triggers: 0,
      writeToDeliverPct: null,
      deliverToTriggerPct: null,
    });
    const w = report.funnel[1]!;
    expect(w.week).toBe('2026-08-31');
    expect(w.writes).toBe(2);
    expect(w.delivers).toBe(3);
    expect(w.triggers).toBe(2); // уникальные имена: r1, r2
    expect(w.writeToDeliverPct).toBe(150); // 3/2
    expect(w.deliverToTriggerPct).toBeCloseTo(66.6667, 3); // 2/3
  });
});

describe('buildAnalyticsReport: outliers (Q8)', () => {
  it('top-N по weighted; costUsd при pricing (2M input × 1.5 $/Mtok = 3$); без tokens → null', async () => {
    const big = JSON.stringify({
      ts: '2026-09-01T00:00:00Z',
      model: 'glm',
      agent: 'worker',
      title: 'big',
      weighted: 300,
      tokens: { input: 2_000_000, output: 0, cache_read: 0 },
      tools: ['webfetch'],
    });
    const mid = JSON.stringify({
      ts: '2026-09-01T01:00:00Z',
      model: 'kimi',
      agent: 'steward',
      title: 'mid',
      weighted: 200,
    });
    const small = JSON.stringify({
      ts: '2026-09-01T02:00:00Z',
      model: 'glm',
      agent: 'worker',
      title: 'small',
      weighted: 100,
    });
    const report = await buildAnalyticsReport(
      { store: mockStore([]), log: mockLog([]), clock: fixedClock },
      {
        signals: [],
        runLogText: [big, mid, small].join('\n'),
        topOutliers: 2,
        pricing: { glm: { input: 1.5, output: 2, cache_read: 0.1 } },
      }
    );
    expect(report.outliers).toHaveLength(2);
    expect(report.outliers[0]).toEqual({
      ts: '2026-09-01T00:00:00Z',
      model: 'glm',
      agent: 'worker',
      title: 'big',
      weighted: 300,
      costUsd: 3,
      tools: ['webfetch'],
    });
    expect(report.outliers[1]!.weighted).toBe(200);
    expect(report.outliers[1]!.costUsd).toBeNull(); // нет raw-токенов — стоимости нет
  });
});

describe('buildAnalyticsReport: agent ledger (Q11)', () => {
  it('объём/проблемы/достижения per-agent; строка из complaint-actor тоже существует', async () => {
    const objects: Extra[] = [
      {
        id: 'l1',
        type: 'lesson',
        status: 'active',
        created_at: '2026-08-01T00:00:00Z',
        created_by: 'agent:worker',
        holdout_prevented: 4,
      },
      { id: 'l2', type: 'lesson', status: 'active', created_at: '2026-08-01T00:00:00Z', created_by: 'agent:worker' },
    ];
    const signals: SignalEvent[] = [
      runSignal({ agent: 'worker', model: 'glm', weighted: 100, outcome: 'ok', durationMs: 60_000 }),
      runSignal({ agent: 'worker', model: 'glm', weighted: 50, outcome: 'exit_1', durationMs: 30_000 }),
      toolErrorEvent('bash', 'timeout_error', '2026-09-01T00:00:00Z', 'worker'),
      complaintEvent('x1', '2026-09-01T00:00:00Z', 'worker flooded logs', 'agent:steward'),
    ];
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.agents.map((a) => a.agent)).toEqual(['worker', 'steward']); // сортировка runs убыв.
    expect(report.agents[0]).toEqual({
      agent: 'worker',
      runs: 2,
      failures: 1,
      failureRatePct: 50,
      weighted: 150,
      avgDurationMs: 45_000,
      costUsd: null, // без pricing
      toolErrors: 1,
      complaintsBy: 0,
      complaintsAbout: 1, // about содержит 'worker'
      successes: 1,
      holdoutPrevented: 4, // lesson created_by agent:worker
    });
    const steward = report.agents[1]!;
    expect(steward.runs).toBe(0);
    expect(steward.failureRatePct).toBeNull();
    expect(steward.complaintsBy).toBe(1); // жалоба подана от agent:steward
    expect(steward.complaintsAbout).toBe(0);
    expect(steward.holdoutPrevented).toBeNull(); // ни одного holdout-поля у его объектов
  });
});

describe('buildAnalyticsReport: steward view (Q12)', () => {
  it('мутации по видам/неделям, жалобная воронка, SLA, рецидив, churn, авто-доля', async () => {
    const objects: Extra[] = [
      { id: 'b1', type: 'blocker', status: 'resolved', created_at: '2026-08-01T00:00:00Z' },
      { id: 'c1', type: 'rule', status: 'active', created_at: '2026-08-01T00:00:00Z', dispatch_ages: 4 },
    ];
    const events: MemoryEvent[] = [
      memEvent('memory.added', 'zz', '2026-09-01T00:00:00Z'), // не мутация
      memEvent('memory.scan.updated', 'zz', '2026-09-01T00:01:00Z'), // не мутация
      memEvent('memory.updated', 'd1', '2026-09-01T00:05:00Z', { memory_id: 'd1' }, 'system:wolf'),
      memEvent('memory.updated', 'd1', '2026-09-01T00:06:00Z', { memory_id: 'd1' }, 'user:cli'),
      memEvent('memory.updated', 't9', '2026-09-01T00:07:00Z', { memory_id: 't9', kind: 'tool.used' }, 'system:wolf'),
      memEvent('memory.updated', 'c1', '2026-09-01T00:15:00Z'), // между двумя жалобами c1
      memEvent('memory.resolved', 'b1', '2026-09-01T02:00:00Z'),
      memEvent('memory.transitioned', 'q1', '2026-09-01T03:00:00Z', { memory_id: 'q1', to: 'rejected' }),
    ];
    const signals: SignalEvent[] = [
      complaintEvent('b1', '2026-09-01T00:00:00Z'),
      complaintEvent('c1', '2026-09-01T00:10:00Z'),
      complaintEvent('c1', '2026-09-01T00:20:00Z'),
    ];
    const report = await buildAnalyticsReport(
      { store: mockStore(objects), log: mockLog(events), clock: fixedClock },
      { signals, runLogText: null, weeks: 2 }
    );
    const st = report.steward;
    // мутации: update ×3 (d1 ×2 + c1), resolve ×1, transition ×1, tool-mutation ×1, supersede 0
    expect(st.mutations).toEqual([
      { kind: 'update', count: 3 },
      { kind: 'supersede', count: 0 },
      { kind: 'resolve', count: 1 },
      { kind: 'transition', count: 1 },
      { kind: 'tool-mutation', count: 1 },
    ]);
    expect(st.mutationsByWeek).toEqual([
      { week: '2026-08-24', total: 0 },
      { week: '2026-08-31', total: 6 },
    ]);
    // жалобы: 3 подано; b1 resolved через 2ч после первой жалобы → lifetime 2; q1 rejected
    expect(st.complaintFunnel).toEqual({ filed: 3, resolved: 1, rejected: 1, avgLifetimeHours: 2, slaEscalations: 1 });
    expect(st.recidivismCount).toBe(1); // c1: 2 жалобы + update между ними
    expect(st.churnIds).toEqual(['d1']); // d1: 2 мутации за окно
    expect(st.autoMutationSharePct).toBeCloseTo(33.3333, 3); // 2 из 6 мутаций от system:wolf
  });
});

describe('buildAnalyticsReport: experiment readiness (Q10)', () => {
  it('доля прогонов с arm; выборки по группам и экспериментам', async () => {
    const signals: SignalEvent[] = [
      runSignal({ agent: 'w', outcome: 'ok', experiment: { id: 'e1', arm: 'wolf' } }),
      runSignal({ agent: 'w', outcome: 'ok', experiment: { id: 'e1', arm: 'wolf' } }),
      runSignal({ agent: 'w', outcome: 'ok', experiment: { id: 'e2', arm: 'baseline' } }),
      runSignal({ agent: 'w', outcome: 'ok' }),
    ];
    const report = await buildAnalyticsReport(
      { store: mockStore([]), log: mockLog([]), clock: fixedClock },
      { signals, runLogText: null }
    );
    expect(report.readiness).toEqual({
      totalRuns: 4,
      withArm: 3,
      withArmPct: 75,
      byArm: [
        { arm: 'baseline', runs: 1 },
        { arm: 'wolf', runs: 2 },
      ], // сорт по имени arm
      byExperiment: [
        { experiment: 'e1', runs: 2 },
        { experiment: 'e2', runs: 1 },
      ], // сорт runs убыв.
    });
  });
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**

Запуск: `npx vitest run tests/unit/use-cases/build-analytics.test.ts -t "funnel"`
Ожидание: FAIL — `report.funnel` ещё заглушка `[]`: `expected [] to have length 2` (`toHaveLength(2)` на пустом массиве).

- [ ] **Шаг 3: Напиши минимальную реализацию**

**(3а)** В `src/app/use-cases/build-analytics.ts` приведи блок импортов к виду (добавились `runCostUsd`/`PricingTable`, `mondayOf`; `parseRunLog` и `SignalEvent` уже импортированы задачей 7):

```typescript
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { Clock } from '../../ports/clock.port.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import type { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import { DEFAULT_PATTERN_THRESHOLD, type SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { parseRunLog } from '../../domain/tool-economy.js';
import { UNCATEGORIZED_ERROR_CLASS } from '../../domain/error-class.js';
import { runCostUsd } from '../../domain/pricing.js';
import type { PricingTable } from '../../domain/pricing.js';
import { silentRuleIds } from './learn-decay.js';
import { mondayOf } from './generate-insights.js';
```

**(3б)** Удали функцию `emptyStewardView` (заменяется расчётом) и добавь перед `buildAnalyticsReport` шесть локальных функций:

```typescript
/** Ключи недельных бакетов (понедельники ISO), от старой к новой; weeks — глубина окна. */
function weekBuckets(now: Date, weeks: number): string[] {
  const currentMondayMs = Date.parse(`${mondayOf(now.toISOString())}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--)
    keys.push(new Date(currentMondayMs - i * 7 * 86_400_000).toISOString().slice(0, 10));
  return keys;
}

/** Воронка Q6: write (memory.added) → deliver (delivery-сигналы) → trigger (уникальные имена).
 * prevented НЕ входит: holdout-счётчики кумулятивны, без таймстампов (спека §5 M5, rev.4). */
function buildFunnel(events: MemoryEvent[], signals: SignalEvent[], now: Date, weeks: number): FunnelWeek[] {
  const buckets = new Map<string, { week: string; writes: number; delivers: number; names: Set<string> }>();
  for (const week of weekBuckets(now, weeks)) {
    buckets.set(week, { week, writes: 0, delivers: 0, names: new Set<string>() });
  }
  for (const ev of events) {
    if (ev.type !== 'memory.added') continue;
    const b = buckets.get(mondayOf(ev.timestamp));
    if (b !== undefined) b.writes += 1;
  }
  for (const s of signals) {
    if (s.event !== 'delivery') continue;
    const b = buckets.get(mondayOf(s.ts));
    if (b === undefined) continue;
    b.delivers += 1;
    if (typeof s.detail?.name === 'string') b.names.add(s.detail.name); // прецедент delivery.triggeredObjects
  }
  return [...buckets.values()].map(({ week, writes, delivers, names }) => ({
    week,
    writes,
    delivers,
    triggers: names.size,
    writeToDeliverPct: writes > 0 ? (delivers / writes) * 100 : null,
    deliverToTriggerPct: delivers > 0 ? (names.size / delivers) * 100 : null,
  }));
}

/** Outliers Q8: top-N прогонов по finite weighted; $ при pricing (D9 — без данных null). */
function buildOutliers(runLogText: string | null, pricing: PricingTable | undefined, top: number): OutlierRun[] {
  return parseRunLog(runLogText ?? '')
    .filter((e) => finiteNumber(e.weighted) !== null)
    .sort((a, b) => (b.weighted ?? 0) - (a.weighted ?? 0))
    .slice(0, top)
    .map((e) => ({
      ts: typeof e.ts === 'string' ? e.ts : null,
      model: typeof e.model === 'string' ? e.model : null,
      agent: typeof e.agent === 'string' ? e.agent : null,
      title: typeof e.title === 'string' ? e.title : null,
      weighted: e.weighted as number,
      costUsd: runCostUsd(e.tokens, pricing, typeof e.model === 'string' ? e.model : null),
      tools: e.tools ?? [],
    }));
}

/** Agent ledger Q11: строки по run-агентам ∪ complaint-акторам `agent:<имя>`; три уровня —
 * объём (runs/weighted/duration/cost), проблемы (failures/toolErrors/жалобы), достижения
 * (successes/holdout_prevented его rule/lesson). */
function buildAgents(
  signals: SignalEvent[],
  objects: MemoryObject[],
  pricing: PricingTable | undefined
): AgentLedgerRow[] {
  const AGENT_PREFIX = 'agent:';
  interface AgentAcc {
    runs: number;
    failures: number;
    successes: number;
    weighted: number;
    durations: number[];
    cost: number | null;
    toolErrors: number;
    complaintsBy: number;
    complaintsAbout: number;
    holdoutSum: number;
    hasHoldout: boolean;
  }
  const acc = new Map<string, AgentAcc>();
  const rowOf = (name: string): AgentAcc => {
    let r = acc.get(name);
    if (r === undefined) {
      r = {
        runs: 0,
        failures: 0,
        successes: 0,
        weighted: 0,
        durations: [],
        cost: null,
        toolErrors: 0,
        complaintsBy: 0,
        complaintsAbout: 0,
        holdoutSum: 0,
        hasHoldout: false,
      };
      acc.set(name, r);
    }
    return r;
  };

  // проход 1: источники строк (run-агенты, complaint-акторы) + объём/ошибки
  for (const ev of signals) {
    if (ev.event === 'run' && typeof ev.gen_ai.agent === 'string' && ev.gen_ai.agent !== '') {
      const r = rowOf(ev.gen_ai.agent);
      r.runs += 1;
      if (ev.outcome === 'ok') r.successes += 1;
      else r.failures += 1;
      r.weighted += finiteNumber(ev.weighted) ?? 0;
      const d = finiteNumber(ev.duration_ms);
      if (d !== null) r.durations.push(d);
      const cost = runCostUsd(ev.tokens, pricing, ev.gen_ai.modelID);
      if (cost !== null) r.cost = (r.cost ?? 0) + cost;
    }
    if (ev.event === 'complaint') {
      const actor = ev.orchestration.actor;
      if (actor.startsWith(`${AGENT_PREFIX}`) && actor.length > AGENT_PREFIX.length) {
        rowOf(actor.slice(AGENT_PREFIX.length)).complaintsBy += 1;
      }
    }
  }
  // tool-ошибки по агенту — только для существующих строк (строки создают run/complaint-actor)
  for (const ev of signals) {
    if (ev.event === 'tool_error' && typeof ev.gen_ai.agent === 'string' && acc.has(ev.gen_ai.agent)) {
      acc.get(ev.gen_ai.agent)!.toolErrors += 1;
    }
  }
  // проход 2: жалобы НА агента — detail.about содержит имя
  for (const ev of signals) {
    if (ev.event !== 'complaint') continue;
    const about = String(ev.detail?.about ?? '');
    if (about === '') continue;
    for (const name of acc.keys()) {
      if (about.includes(name)) acc.get(name)!.complaintsAbout += 1;
    }
  }
  // достижения: holdout_prevented у rule/lesson с created_by === 'agent:<имя>'
  for (const o of objects) {
    if (o.type !== 'rule' && o.type !== 'lesson') continue;
    if (!o.created_by.startsWith(AGENT_PREFIX)) continue;
    const name = o.created_by.slice(AGENT_PREFIX.length);
    if (!acc.has(name)) continue;
    const p = finiteNumber((o as Record<string, unknown>).holdout_prevented);
    if (p !== null) {
      acc.get(name)!.holdoutSum += p;
      acc.get(name)!.hasHoldout = true;
    }
  }

  return [...acc.entries()]
    .map(([agent, r]) => ({
      agent,
      runs: r.runs,
      failures: r.failures,
      failureRatePct: r.runs > 0 ? (r.failures / r.runs) * 100 : null,
      weighted: r.weighted,
      avgDurationMs: r.durations.length > 0 ? r.durations.reduce((s, v) => s + v, 0) / r.durations.length : null,
      costUsd: r.cost,
      toolErrors: r.toolErrors,
      complaintsBy: r.complaintsBy,
      complaintsAbout: r.complaintsAbout,
      successes: r.successes,
      holdoutPrevented: r.hasHoldout ? r.holdoutSum : null,
    }))
    .sort((a, b) => b.runs - a.runs || a.agent.localeCompare(b.agent));
}

/** Вид мутации события: update/supersede/resolve/transition; memory.updated с kind='tool.used'
 * → tool-mutation; added/scan.updated — не мутации. */
function mutationKindOf(ev: MemoryEvent): string | null {
  switch (ev.type) {
    case 'memory.updated': {
      const kind = (ev.payload as Record<string, unknown> | undefined)?.kind;
      return kind === 'tool.used' ? 'tool-mutation' : 'update';
    }
    case 'memory.superseded':
      return 'supersede';
    case 'memory.resolved':
      return 'resolve';
    case 'memory.transitioned':
      return 'transition';
    default:
      return null;
  }
}

const MUTATION_KINDS = ['update', 'supersede', 'resolve', 'transition', 'tool-mutation'] as const;

/** Steward view Q12: мутации за окно weeks (то же, что воронка), жалобная воронка,
 * SLA-эскалации (dispatch_ages >= 3), рецидивы, churn, доля авто-мутаций. */
function buildSteward(
  events: MemoryEvent[],
  signals: SignalEvent[],
  objects: MemoryObject[],
  now: Date,
  weeks: number
): StewardView {
  const keys = weekBuckets(now, weeks);

  // мутации: виды + недели + churn + авто-доля
  const kindCount = new Map<string, number>(MUTATION_KINDS.map((k) => [k, 0]));
  const weekTotal = new Map<string, number>(keys.map((k) => [k, 0]));
  const mutationsById = new Map<string, number>();
  let totalMutations = 0;
  let autoMutations = 0;
  for (const ev of events) {
    const kind = mutationKindOf(ev);
    if (kind === null) continue;
    if (!weekTotal.has(mondayOf(ev.timestamp))) continue; // вне окна
    kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);
    weekTotal.set(mondayOf(ev.timestamp), (weekTotal.get(mondayOf(ev.timestamp)) ?? 0) + 1);
    totalMutations += 1;
    if (ev.actor === 'system:wolf') autoMutations += 1;
    const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
    if (typeof mid === 'string') mutationsById.set(mid, (mutationsById.get(mid) ?? 0) + 1);
  }

  // жалобная воронка
  const complaints = signals.filter((s) => s.event === 'complaint' && weekTotal.has(mondayOf(s.ts)));
  const filed = complaints.length;
  let resolved = 0;
  let rejected = 0;
  for (const ev of events) {
    if (!weekTotal.has(mondayOf(ev.timestamp))) continue;
    if (ev.type === 'memory.resolved') resolved += 1;
    if (ev.type === 'memory.transitioned' && (ev.payload as Record<string, unknown> | undefined)?.to === 'rejected') {
      rejected += 1;
    }
  }
  // время жизни: resolved-событие − первый complaint по тому же id (в часах)
  const firstComplaintById = new Map<string, string>();
  for (const s of signals) {
    if (s.event !== 'complaint') continue;
    const id = s.detail?.object_id;
    if (typeof id !== 'string') continue;
    const cur = firstComplaintById.get(id);
    if (cur === undefined || s.ts < cur) firstComplaintById.set(id, s.ts);
  }
  const lifetimes: number[] = [];
  for (const ev of events) {
    if (ev.type !== 'memory.resolved') continue;
    const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
    if (typeof mid !== 'string') continue;
    const first = firstComplaintById.get(mid);
    if (first === undefined) continue;
    lifetimes.push((Date.parse(ev.timestamp) - Date.parse(first)) / 3_600_000);
  }
  const avgLifetimeHours = lifetimes.length > 0 ? lifetimes.reduce((s, v) => s + v, 0) / lifetimes.length : null;

  // SLA: объекты с dispatch_ages >= 3 (passthrough-поле)
  let slaEscalations = 0;
  for (const o of objects) {
    const dispatchAges = finiteNumber((o as Record<string, unknown>).dispatch_ages);
    if (dispatchAges !== null && dispatchAges >= 3) slaEscalations += 1;
  }

  // рецидивы: ≥2 жалобы на объект И update по нему строго между первой и последней жалобой
  const complaintTsById = new Map<string, string[]>();
  for (const s of signals) {
    if (s.event !== 'complaint') continue;
    const id = s.detail?.object_id;
    if (typeof id !== 'string') continue;
    const arr = complaintTsById.get(id) ?? [];
    arr.push(s.ts);
    complaintTsById.set(id, arr);
  }
  const updateTsById = new Map<string, string[]>();
  for (const ev of events) {
    if (ev.type !== 'memory.updated') continue;
    const mid = (ev.payload as Record<string, unknown> | undefined)?.memory_id;
    if (typeof mid !== 'string') continue;
    const arr = updateTsById.get(mid) ?? [];
    arr.push(ev.timestamp);
    updateTsById.set(mid, arr);
  }
  let recidivismCount = 0;
  for (const [id, tsList] of complaintTsById) {
    if (tsList.length < 2) continue;
    const sorted = [...tsList].sort();
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if ((updateTsById.get(id) ?? []).some((ts) => ts > first && ts < last)) recidivismCount += 1;
  }

  const churnIds = [...mutationsById.entries()]
    .filter(([, n]) => n >= 2)
    .map(([id]) => id)
    .sort();

  return {
    mutations: MUTATION_KINDS.map((kind) => ({ kind, count: kindCount.get(kind) ?? 0 })),
    mutationsByWeek: keys.map((week) => ({ week, total: weekTotal.get(week) ?? 0 })),
    complaintFunnel: { filed, resolved, rejected, avgLifetimeHours, slaEscalations },
    recidivismCount,
    churnIds,
    autoMutationSharePct: totalMutations > 0 ? (autoMutations / totalMutations) * 100 : null,
  };
}

/** Experiment readiness Q10: доля run-сигналов с experiment.arm; выборки по группам. */
function buildReadiness(signals: SignalEvent[]): ExperimentReadiness {
  const runs = signals.filter((s) => s.event === 'run');
  let withArm = 0;
  const byArm = new Map<string, number>();
  const byExperiment = new Map<string, number>();
  for (const ev of runs) {
    const experiment = ev.experiment as { arm?: unknown; id?: unknown } | undefined;
    const arm = experiment?.arm;
    if (typeof arm === 'string' && arm !== '') {
      withArm += 1;
      byArm.set(arm, (byArm.get(arm) ?? 0) + 1);
    }
    const id = experiment?.id;
    if (typeof id === 'string' && id !== '') byExperiment.set(id, (byExperiment.get(id) ?? 0) + 1);
  }
  const totalRuns = runs.length;
  return {
    totalRuns,
    withArm,
    withArmPct: totalRuns > 0 ? (withArm / totalRuns) * 100 : null,
    byArm: [...byArm.entries()].map(([arm, n]) => ({ arm, runs: n })).sort((a, b) => a.arm.localeCompare(b.arm)),
    byExperiment: [...byExperiment.entries()]
      .map(([experiment, n]) => ({ experiment, runs: n }))
      .sort((a, b) => b.runs - a.runs || a.experiment.localeCompare(b.experiment)),
  };
}
```

**(3в)** Замени тело `buildAnalyticsReport` на финальное (все заглушки ушли):

```typescript
export async function buildAnalyticsReport(deps: AnalyticsDeps, input: AnalyticsInput): Promise<AnalyticsReport> {
  const thresholds = resolveLifecycleThresholds(input.thresholds);
  const now = deps.clock.now();
  // ponytail: store.list() — полный reparse всех md; ровно один вызов на отчёт (прецедент generateInsights)
  const allObjects = await deps.store.list();
  const events = await deps.log.readAll();
  const weeks = input.weeks ?? 8;

  const memory = buildMemoryLedger(allObjects, events, input.signals, now, thresholds);
  const tools = buildToolLedger(
    allObjects.filter((o) => o.type === 'tool'),
    input.signals,
    input.runLogText,
    input.patternThreshold ?? DEFAULT_PATTERN_THRESHOLD
  );
  const rules = buildRuleRanking(
    allObjects.filter((o) => o.type === 'rule'),
    input.signals
  );
  const funnel = buildFunnel(events, input.signals, now, weeks);
  const outliers = buildOutliers(input.runLogText, input.pricing, input.topOutliers ?? 10);
  const agents = buildAgents(input.signals, allObjects, input.pricing);
  const steward = buildSteward(events, input.signals, allObjects, now, weeks);
  const readiness = buildReadiness(input.signals);

  return {
    generatedAt: now.toISOString(),
    thresholds,
    memory,
    tools,
    rules,
    funnel,
    outliers,
    agents,
    steward,
    readiness,
  };
}
```

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**

Запуск: `npx vitest run tests/unit/use-cases/build-analytics.test.ts`
Ожидание: PASS (13 it). Дополнительно: `npx tsc --noEmit` — чисто.

- [ ] **Шаг 5: Закоммить**

```bash
git add src/app/use-cases/build-analytics.ts tests/unit/use-cases/build-analytics.test.ts
git commit -m "feat(analytics): funnel, outliers, agent ledger, steward view, readiness (M5)"
```

Покрывает: Q6 (воронка), Q8 (outliers), Q10 (readiness), Q11 (agent ledger), Q12 (steward view), критерий приёмки 6.

---

### Задача 9: CLI `wolf analytics`

> **Зависимости (общие для задач 9–12):** задачи потребляют типы/функции задач 3–8 (сквозной контракт плана):
> `buildAnalyticsReport`/`filterAnalytics`/`AnalyticsReport`/`AnalyticsViewPayload`/`LifecycleThresholds`
> (`src/app/use-cases/build-analytics.ts`), `buildEffectivenessReport` (+ `pricing` в input, `totals` в отчёте)
> (`src/app/use-cases/effectiveness.ts`), `readSnapshots`/`SnapshotEntry`
> (`src/adapters/fs/effectiveness-snapshots.ts`), `computeSnapshotDelta`/`DeltaRow`
> (`src/app/use-cases/snapshot-delta.ts`), `PricingTable` (`src/domain/pricing.ts`),
> `config.pricing` + `config.analytics.thresholds` (`src/adapters/fs/config-file.ts`),
> enriched run-события (`duration_ms`, `tokens`, `experiment`) в `SignalEvent`/run-log (M1).
> Задачи 9–12 стартуют только после влития задач 3–8 — иначе `tsc` не соберётся.
>
> **Контракт полей — ДОСЛОВНО из задачи 6** (`src/app/use-cases/build-analytics.ts`): view-payload
> `filterAnalytics` возвращает `{view:'memory', rows: MemoryLedgerRow[], garbage: {dead, base, ratioPct}}`
> | `{view:'tools', rows: ToolLedgerRow[]}` | `{view:'rules', rows: RuleRankingRow[]}`
> | `{view:'funnel', weeks: FunnelWeek[]}` | `{view:'agents', rows: AgentLedgerRow[]}`
> | `{view:'steward', steward: StewardView}` | `{view:'outliers', runs: OutlierRun[]}`
> | `{view:'readiness', readiness: ExperimentReadiness}` | `{view:'all', report: AnalyticsReport}`.
> Поля строк: `MemoryLedgerRow {id, type, lifecycle, age_days, deliveries, triggers, complaints, last_used}`,
> `ToolLedgerRow {name, origin, status, usageCount, lastUsedAt, errorCount, errorClasses, promotion}`,
> `RuleRankingRow {id, title, status, prevented, checked, silent}`, `FunnelWeek {week, writes, delivers,
triggers, writeToDeliverPct, deliverToTriggerPct}`, `AgentLedgerRow {agent, runs, failures, failureRatePct,
weighted, avgDurationMs, costUsd, toolErrors, complaintsBy, complaintsAbout, successes, holdoutPrevented}`,
> `OutlierRun {ts, model, agent, title, weighted, costUsd, tools}`, `StewardView {mutations, mutationsByWeek,
complaintFunnel {filed, resolved, rejected, avgLifetimeHours, slaEscalations}, recidivismCount, churnIds,
autoMutationSharePct}`, `ExperimentReadiness {totalRuns, withArm, withArmPct, byArm, byExperiment}`.
> `EffectivenessReport.totals` (TotalsBlock задачи 4): `{runs, failures, sumWeighted, sumTokens: RawTokens | null,
cacheHitRatio, avgDurationMs, costUsd, byModel}`.
>
> **Стиль:** ESM `.js`-суффиксы, одинарные кавычки, `;`, 2 пробела, printWidth 120 (prettier).
> Пользовательский вывод адаптеров — английский (гейт `check-english-surface.mjs`: кириллица в
> строковых литералах `src/adapters/**` запрещена); комментарии — русские.

**Файлы:**

- Create: `src/adapters/cli/commands/analytics.ts`
- Modify: `src/adapters/cli/cli-entry.ts` (import + регистрация команды после `effectivenessCommand`)

Задача без юнит-тестов рендера (текстовые таблицы покрываются e2e задачи 12): реализация → lint → smoke → коммит.

- [ ] **Шаг 1: Напиши реализацию команды**

`src/adapters/cli/commands/analytics.ts` (полностью):

```typescript
import { Command, Option } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeCwd } from '../cli-entry.js';
import { readSignals } from '../../fs/session-metrics-log.js';
import { loadWolfConfigSync } from '../../fs/config-file.js';
import { buildAnalyticsReport, filterAnalytics, type AnalyticsReport } from '../../../app/use-cases/build-analytics.js';
import { createCliContainer } from '../../../bootstrap/container.js';

/**
 * §6.2 спеки аналитики: `wolf analytics` — выборки для Стюарда с фильтрами.
 * Фильтры class/type/origin/agent/silent/top применяются ВНУТРИ filterAnalytics —
 * CLI только парсит аргументы. `--json` — машинный вывод (дефолт для агентов),
 * иначе текстовые таблицы по секциям. baseDir инъектится для тестов (прецедент:
 * memory-effectiveness.ts).
 */

type AnalyticsView = 'memory' | 'tools' | 'rules' | 'funnel' | 'agents' | 'steward' | 'outliers' | 'readiness' | 'all';
type SectionView = Exclude<AnalyticsView, 'all'>;

const SECTION_VIEWS: SectionView[] = [
  'memory',
  'tools',
  'rules',
  'funnel',
  'agents',
  'steward',
  'outliers',
  'readiness',
];

/** null/undefined → '-', остальное — строкой (колонки с nullable-полями). */
function cell(v: unknown): string {
  return v === null || v === undefined ? '-' : String(v);
}

/** Плоская текстовая таблица: ширина колонки = max длины, разделитель '  '. */
function renderRows(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) => cells.map((c, i) => (c ?? '').padEnd(widths[i] ?? 0)).join('  ');
  return [line(headers), ...rows.map(line)].join('\n');
}

/** Одна секция текстового рендера: `== <view> ==` + таблица/строки. */
function renderSection(report: AnalyticsReport, view: SectionView, top: number): string {
  const payload = filterAnalytics(report, { view, top });
  const header = `== ${view} ==`;
  switch (payload.view) {
    case 'memory': {
      const rows = payload.rows.map((r) => [
        r.id,
        r.type,
        r.lifecycle,
        cell(r.age_days),
        cell(r.deliveries),
        cell(r.triggers),
        cell(r.complaints),
        cell(r.last_used),
      ]);
      const garbage = payload.garbage.ratioPct === null ? 'n/a' : `${payload.garbage.ratioPct.toFixed(1)}%`;
      return [
        header,
        renderRows(['id', 'type', 'lifecycle', 'age_days', 'deliveries', 'triggers', 'complaints', 'last_used'], rows),
        `garbage: dead/base = ${payload.garbage.dead}/${payload.garbage.base} = ${garbage}`,
      ].join('\n');
    }
    case 'tools': {
      const rows = payload.rows.map((r) => [
        r.name,
        r.origin,
        cell(r.status),
        cell(r.usageCount),
        cell(r.errorCount),
        cell(r.promotion),
      ]);
      return [header, renderRows(['name', 'origin', 'status', 'usage', 'errors', 'promotion'], rows)].join('\n');
    }
    case 'rules': {
      const rows = payload.rows.map((r) => [
        r.id,
        cell(r.prevented),
        cell(r.checked),
        r.silent ? 'yes' : 'no',
        r.title,
      ]);
      return [header, renderRows(['id', 'prevented', 'checked', 'silent', 'title'], rows)].join('\n');
    }
    case 'funnel': {
      const rows = payload.weeks.map((r) => [
        r.week,
        cell(r.writes),
        cell(r.delivers),
        cell(r.triggers),
        cell(r.writeToDeliverPct === null ? null : r.writeToDeliverPct.toFixed(1)),
        cell(r.deliverToTriggerPct === null ? null : r.deliverToTriggerPct.toFixed(1)),
      ]);
      return [header, renderRows(['week', 'writes', 'delivers', 'triggers', 'W->D %', 'D->T %'], rows)].join('\n');
    }
    case 'agents': {
      const rows = payload.rows.map((r) => [
        r.agent,
        cell(r.runs),
        cell(r.weighted),
        cell(r.avgDurationMs),
        cell(r.failureRatePct === null ? null : r.failureRatePct.toFixed(1)),
        `${r.complaintsBy}/${r.complaintsAbout}`,
        cell(r.holdoutPrevented),
      ]);
      return [
        header,
        renderRows(['agent', 'runs', 'weighted', 'avg_ms', 'fail_%', 'compl by/about', 'prevented'], rows),
      ].join('\n');
    }
    case 'steward': {
      const lines = [
        header,
        'mutations:',
        renderRows(
          ['kind', 'count'],
          payload.steward.mutations.map((m) => [m.kind, cell(m.count)])
        ),
        'mutations by week:',
        renderRows(
          ['week', 'total'],
          payload.steward.mutationsByWeek.map((w) => [w.week, cell(w.total)])
        ),
        'complaint funnel:',
        `  filed: ${cell(payload.steward.complaintFunnel.filed)}`,
        `  resolved: ${cell(payload.steward.complaintFunnel.resolved)}`,
        `  rejected: ${cell(payload.steward.complaintFunnel.rejected)}`,
        `  avg lifetime: ${cell(
          payload.steward.complaintFunnel.avgLifetimeHours === null
            ? null
            : payload.steward.complaintFunnel.avgLifetimeHours.toFixed(1) + 'h'
        )}`,
        `  sla escalations (dispatch_ages>=3): ${cell(payload.steward.complaintFunnel.slaEscalations)}`,
      ];
      const autoShare =
        payload.steward.autoMutationSharePct === null ? 'n/a' : `${payload.steward.autoMutationSharePct.toFixed(1)}%`;
      lines.push(
        `recidivism: ${cell(payload.steward.recidivismCount)} | churn: ${cell(
          payload.steward.churnIds.length
        )} | autoShare: ${autoShare}`
      );
      return lines.join('\n');
    }
    case 'outliers': {
      const rows = payload.runs.map((r) => [
        cell(r.ts),
        cell(r.model),
        cell(r.weighted),
        cell(r.costUsd === null ? null : `$${r.costUsd}`),
        cell(r.title),
      ]);
      return [header, renderRows(['ts', 'model', 'weighted', 'cost', 'title'], rows)].join('\n');
    }
    case 'readiness': {
      const share = payload.readiness.withArmPct === null ? 'n/a' : `${payload.readiness.withArmPct.toFixed(1)}%`;
      const arms = payload.readiness.byArm.map((a) => `${a.arm}=${a.runs}`).join(' ');
      const experiments = payload.readiness.byExperiment.map((e) => `${e.experiment}:${e.runs}`).join(' ');
      return [
        header,
        `runs: total=${payload.readiness.totalRuns} withArm=${payload.readiness.withArm} share=${share}`,
        `arms: ${arms || '-'} | experiments: ${experiments || '-'}`,
      ].join('\n');
    }
    default:
      // 'all' обрабатывается вызывающим кодом до renderSection; ветка закрывает switch (TS2366)
      throw new Error(`renderSection: unexpected view ${String((payload as { view: string }).view)}`);
  }
}

export function analyticsCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('analytics').description(
    'Effectiveness analytics: ledgers (memory/tools/rules), funnel, agents, steward view, outliers, experiment readiness'
  );

  cmd
    .addOption(
      new Option('--view <view>', 'Analytics view')
        .choices(['memory', 'tools', 'rules', 'funnel', 'agents', 'steward', 'outliers', 'readiness', 'all'])
        .default('all')
    )
    .addOption(
      new Option('--class <class>', 'Memory lifecycle filter').choices(['new', 'sleeper', 'workhorse', 'dead'])
    )
    .option('--type <type>', 'Memory type filter')
    .addOption(new Option('--origin <origin>', 'Tool origin filter').choices(['script', 'native']))
    .option('--agent <agent>', 'Agent name filter')
    .option('--silent', 'Rules view: only silent rules', false)
    .option('--top <n>', 'Row limit', parseInt, 20)
    .option('--weeks <n>', 'Funnel window in weeks', parseInt, 8)
    .option('--json', 'Machine-readable JSON output', false);

  cmd.action(async (options) => {
    // конфиг: pricing + analytics.thresholds (битый yaml → undefined, дефолты внутри use-case)
    let config: ReturnType<typeof loadWolfConfigSync> = undefined;
    try {
      config = loadWolfConfigSync(baseDir);
    } catch {
      config = undefined;
    }
    const analyticsThresholds = config?.analytics?.thresholds;

    let runLogText: string | null = null;
    try {
      runLogText = readFileSync(join(baseDir, '.wolf', 'run-log.jsonl'), 'utf-8');
    } catch {
      runLogText = null; // ENOENT — run-log ещё не пишется
    }

    const { store, log, clock } = createCliContainer(baseDir);
    const report = await buildAnalyticsReport(
      { store, log, clock },
      {
        signals: readSignals(baseDir),
        runLogText,
        ...(analyticsThresholds !== undefined ? { thresholds: analyticsThresholds } : {}),
        weeks: options.weeks,
        topOutliers: options.top,
        ...(config?.pricing !== undefined ? { pricing: config.pricing } : {}),
      }
    );

    // commander отдаёт строки — приводим к union контракта задачи 6; CLI-флаг по спеке
    // §6.2 называется `native`, а `ToolLedgerRow.origin` — 'model-native' (D11)
    const origin: 'script' | 'model-native' | undefined =
      options.origin === 'script' ? 'script' : options.origin === 'native' ? 'model-native' : undefined;
    const klass: 'new' | 'sleeper' | 'workhorse' | 'dead' | undefined =
      options.class === 'new' ||
      options.class === 'sleeper' ||
      options.class === 'workhorse' ||
      options.class === 'dead'
        ? options.class
        : undefined;

    const payload = filterAnalytics(report, {
      view: options.view as AnalyticsView,
      ...(klass !== undefined ? { class: klass } : {}),
      ...(options.type !== undefined ? { type: options.type } : {}),
      ...(origin !== undefined ? { origin } : {}),
      ...(options.agent !== undefined ? { agent: options.agent } : {}),
      ...(options.silent ? { silent: true } : {}),
      top: options.top,
    });

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    // текстовый рендер: all — все секции подряд с заголовками, иначе одна секция
    if (payload.view === 'all') {
      console.log(SECTION_VIEWS.map((v) => renderSection(report, v, options.top)).join('\n\n'));
    } else {
      console.log(renderSection(report, payload.view as SectionView, options.top));
    }
  });

  return cmd;
}
```

- [ ] **Шаг 2: Зарегистрируй команду в CLI**

`src/adapters/cli/cli-entry.ts` — две правки:

После строки с импортом `memory-effectiveness.js` (строка 44) добавить:

```typescript
import { analyticsCommand } from './commands/analytics.js';
```

После `program.addCommand(effectivenessCommand());` (строка 95) добавить:

```typescript
program.addCommand(analyticsCommand());
```

- [ ] **Шаг 3: Проверь типы и собери**
      Запуск: `npm run lint && npm run build`
      Ожидание: обе команды без ошибок (при уже влитых задачах 3–8: `build-analytics.ts`, `pricing.ts`, поля `config.pricing`/`config.analytics.thresholds` существуют).
- [ ] **Шаг 4: Smoke-проверка**
      Запуск: `node dist/bootstrap/cli.js analytics --view readiness --json`
      Ожидание: exit 0, stdout — валидный JSON с полем `view: "readiness"` и числами `totalRuns`/`withArm`.
- [ ] **Шаг 5: Закоммить**

```bash
git add src/adapters/cli/commands/analytics.ts src/adapters/cli/cli-entry.ts
git commit -m "feat(cli): wolf analytics command with views and filters"
```

Покрывает: критерии приёмки 4–6 (CLI-часть), критерий 8 (CLI-половина JSON-зеркала).

---

### Задача 10: MCP-инструмент analytics

**Файлы:**

- Modify: `src/adapters/mcp/mcp-schemas.ts` (добавить `AnalyticsInputSchema` в конец файла)
- Modify: `src/adapters/mcp/mcp-tools.ts` (импорт схемы + use-case-функций и адаптеров; registerTool `analytics` после инструмента `insights`)
- Test: `tests/unit/adapters/mcp-schemas.test.ts` (новый `describe` для `AnalyticsInputSchema`)

- [ ] **Шаг 1: Напиши падающий тест**

В конец `tests/unit/adapters/mcp-schemas.test.ts` добавь describe. Импорт `AnalyticsInputSchema` добавь В СУЩЕСТВУЮЩИЙ строку импорта из `mcp-schemas.js` в шапке файла (не создавай отдельный import-блок):

```typescript
describe('AnalyticsInputSchema (analytics MCP tool)', () => {
  it('parses a full valid object and keeps every field', () => {
    const parsed = AnalyticsInputSchema.safeParse({
      view: 'memory',
      class: 'dead',
      type: 'rule',
      origin: 'script',
      agent: 'dev',
      top: 5,
      weeks: 4,
      silent: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        view: 'memory',
        class: 'dead',
        type: 'rule',
        origin: 'script',
        agent: 'dev',
        top: 5,
        weeks: 4,
        silent: true,
      });
    }
  });

  it('rejects unknown view value', () => {
    const parsed = AnalyticsInputSchema.safeParse({ view: 'bogus' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('view'))).toBe(true);
    }
  });
});
```

- [ ] **Шаг 2: Запусти тест — убедись, что падает**
      Запуск: `npx vitest run tests/unit/adapters/mcp-schemas.test.ts`
      Ожидание: FAIL — `AnalyticsInputSchema` не экспортируется (модуль не знает символа).
- [ ] **Шаг 3: Напиши минимальную реализацию**

В конец `src/adapters/mcp/mcp-schemas.ts` добавь:

```typescript
export const AnalyticsInputSchema = z.object({
  view: z.enum(['memory', 'tools', 'rules', 'funnel', 'agents', 'steward', 'outliers', 'readiness', 'all']).optional(),
  class: z.enum(['new', 'sleeper', 'workhorse', 'dead']).optional(),
  type: z.string().optional(),
  origin: z.enum(['script', 'native']).optional(),
  agent: z.string().optional(),
  top: z.number().int().min(1).optional(),
  weeks: z.number().int().min(1).optional(),
  silent: z.boolean().optional(),
});
```

В `src/adapters/mcp/mcp-tools.ts` — три правки:

1. В импорт-блок из `./mcp-schemas.js` (строки 2–21) добавь `AnalyticsInputSchema,` после `InsightsInputSchema,`.
2. Добавь импорты (после строки 39 `import { createCliContainer } ...`):

```typescript
import { buildAnalyticsReport, filterAnalytics } from '../../app/use-cases/build-analytics.js';
import { readSignals } from '../../adapters/fs/session-metrics-log.js';
import { loadWolfConfigSync } from '../../adapters/fs/config-file.js';
import { readFileSync } from 'fs';
import { join } from 'path';
```

3. После `registerTool('insights', ...)` (закрывается на строке ~315) добавь инструмент — тот же вход, что CLI (readSignals, run-log, config), фильтрация ТОЛЬКО через `filterAnalytics`, никакой дублированной логики:

```typescript
server.registerTool(
  'analytics',
  {
    description:
      'Effectiveness analytics: ledgers (memory/tools/rules), funnel, agents, steward view, outliers, experiment readiness — same JSON as `wolf analytics --json`',
    inputSchema: AnalyticsInputSchema,
  },
  async (input: unknown) => {
    const args = input as {
      view?: 'memory' | 'tools' | 'rules' | 'funnel' | 'agents' | 'steward' | 'outliers' | 'readiness' | 'all';
      class?: 'new' | 'sleeper' | 'workhorse' | 'dead';
      type?: string;
      origin?: 'script' | 'native';
      agent?: string;
      top?: number;
      weeks?: number;
      silent?: boolean;
    };

    // те же входы, что CLI: сигналы, run-log, config (битый yaml → undefined)
    let config: ReturnType<typeof loadWolfConfigSync> = undefined;
    try {
      config = loadWolfConfigSync(baseDir);
    } catch {
      config = undefined;
    }
    let runLogText: string | null = null;
    try {
      runLogText = readFileSync(join(baseDir, '.wolf', 'run-log.jsonl'), 'utf-8');
    } catch {
      runLogText = null; // ENOENT — run-log ещё не пишется
    }

    const report = await buildAnalyticsReport(
      { store: deps.store, log: deps.log, clock: deps.clock },
      {
        signals: readSignals(baseDir),
        runLogText,
        ...(config?.analytics?.thresholds !== undefined ? { thresholds: config.analytics.thresholds } : {}),
        ...(args.weeks !== undefined ? { weeks: args.weeks } : {}),
        ...(config?.pricing !== undefined ? { pricing: config.pricing } : {}),
      }
    );
    const payload = filterAnalytics(report, {
      view: args.view ?? 'all',
      ...(args.class !== undefined ? { class: args.class } : {}),
      ...(args.type !== undefined ? { type: args.type } : {}),
      // схема MCP — script|native (зеркало CLI §6.2); контракт задачи 6 — 'model-native'
      ...(args.origin !== undefined ? { origin: args.origin === 'native' ? 'model-native' : 'script' } : {}),
      ...(args.agent !== undefined ? { agent: args.agent } : {}),
      ...(args.silent ? { silent: true } : {}),
      ...(args.top !== undefined ? { top: args.top } : {}),
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
  }
);
```

- [ ] **Шаг 4: Запусти тест — убедись, что проходит**
      Запуск: `npx vitest run tests/unit/adapters/mcp-schemas.test.ts`
      Ожидание: PASS (включая новый describe).
- [ ] **Шаг 5: Типы + smoke**
      Запуск: `npm run lint && npm run build && node dist/bootstrap/cli.js analytics --view readiness --json`
      Ожидание: lint/build без ошибок; smoke-команда (тот же путь данных, что MCP-handler) печатает JSON с `readiness`.
- [ ] **Шаг 6: Закоммить**

```bash
git add src/adapters/mcp/mcp-schemas.ts src/adapters/mcp/mcp-tools.ts tests/unit/adapters/mcp-schemas.test.ts
git commit -m "feat(mcp): analytics tool mirroring wolf analytics --json"
```

Покрывает: критерий приёмки 8.

---

### Задача 11: `wolf dashboard` — консольные Unicode-таблицы и спарклайны

**Файлы:**

- Create: `src/app/use-cases/build-dashboard.ts` (композиция отчётов + дельта снапшота)
- Create: `src/adapters/cli/commands/dashboard.ts` (команда + чистые рендер-функции)
- Modify: `src/adapters/cli/cli-entry.ts` (import + регистрация после `analyticsCommand`)
- Test: `tests/unit/adapters/dashboard-render.test.ts`
- Test: `tests/unit/use-cases/build-dashboard.test.ts`

- [ ] **Шаг 1: Напиши падающие тесты**

`tests/unit/adapters/dashboard-render.test.ts` (полностью):

```typescript
import { describe, it, expect } from 'vitest';
import { sparkline, renderTable } from '../../../src/adapters/cli/commands/dashboard.js';

describe('dashboard render helpers (D8: console unicode)', () => {
  it('sparkline: [] -> empty string, all zeros -> flat bars, proportional otherwise', () => {
    expect(sparkline([])).toBe('');
    expect(sparkline([0, 0])).toBe('▁▁');
    expect(sparkline([1, 2, 4, 8])).toBe('▁▂▄█');
    expect(sparkline([5])).toBe('█');
  });

  it('renderTable: unicode frame and column separator', () => {
    const out = renderTable(
      ['a', 'b'],
      [
        ['1', '2'],
        ['3', '4'],
      ]
    );
    expect(out).toContain('│');
    expect(out).toContain('┌');
    expect(out).toContain('└');
  });
});
```

`tests/unit/use-cases/build-dashboard.test.ts` (полностью; моки — прецедент `tests/unit/use-cases/effectiveness.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { buildDashboard } from '../../../src/app/use-cases/build-dashboard.js';
import {
  buildEffectivenessReport,
  DEFAULT_EFFECTIVENESS_THRESHOLDS,
} from '../../../src/app/use-cases/effectiveness.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { RelationLog } from '../../../src/ports/relation-log.port.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
import type { SnapshotEntry } from '../../../src/adapters/fs/effectiveness-snapshots.js';

type Extra = Record<string, unknown>;

function mockStore(objects: Extra[]): MemoryStore {
  return {
    async list(filters) {
      return objects.filter(
        (o) => (!filters?.type || o.type === filters.type) && (!filters?.status || o.status === filters.status)
      ) as never;
    },
    async save() {
      throw new Error('not implemented');
    },
    async get() {
      return null;
    },
    async update() {
      throw new Error('not implemented');
    },
  };
}

function mockLog(events: MemoryEvent[]): EventLog {
  return {
    async readAll() {
      return events;
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}

function mockRelations(): RelationLog {
  return {
    async list() {
      return [];
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}

const FIXED_TS = '2026-09-03T00:00:00.000Z';
const clock = { now: () => new Date(FIXED_TS) };

function objects(n: number): Extra[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `o${i + 1}`,
    title: `o${i + 1}`,
    type: 'decision',
    status: 'active',
  }));
}

function addedEvents(os: Extra[]): MemoryEvent[] {
  return os.map((o) => ({
    id: `ev-${o.id}`,
    type: 'memory.added',
    timestamp: FIXED_TS,
    actor: 'user:cli',
    payload: { memory_id: o.id as string },
  }));
}

describe('buildDashboard (композиция effectiveness + analytics + snapshot delta)', () => {
  it('prevSnapshot null -> snapshot: prevTs null, delta []', async () => {
    const data = await buildDashboard(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations(), clock },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS, prevSnapshot: null }
    );
    expect(data.snapshot).toEqual({ prevTs: null, delta: [] });
    expect(data.generatedAt).toBe(FIXED_TS);
    expect(data.effectiveness).toBeDefined();
    expect(data.analytics).toBeDefined();
  });

  it('prevSnapshot с другим отчётом -> delta содержит изменившийся path', async () => {
    // prev: 3 write-only решения; curr: 2 -> числовые поля блоков расходятся
    const prevObjects = objects(3);
    const prevReport = await buildEffectivenessReport(
      { store: mockStore(prevObjects), log: mockLog(addedEvents(prevObjects)), relations: mockRelations() },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS }
    );
    const prevSnapshot: SnapshotEntry = { ts: '2026-09-01T00:00:00.000Z', report: prevReport };

    const currObjects = objects(2);
    const data = await buildDashboard(
      { store: mockStore(currObjects), log: mockLog(addedEvents(currObjects)), relations: mockRelations(), clock },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS, prevSnapshot }
    );
    expect(data.snapshot.prevTs).toBe('2026-09-01T00:00:00.000Z');
    expect(data.snapshot.delta.length).toBeGreaterThan(0);
    expect(data.snapshot.delta.some((r) => r.diff !== null && r.diff !== 0)).toBe(true);
  });
});
```

- [ ] **Шаг 2: Запусти тесты — убедись, что падают**
      Запуск: `npx vitest run tests/unit/adapters/dashboard-render.test.ts tests/unit/use-cases/build-dashboard.test.ts`
      Ожидание: FAIL — `Cannot find module .../build-dashboard.js` и `.../commands/dashboard.js`.
- [ ] **Шаг 3: Напиши минимальную реализацию**

`src/app/use-cases/build-dashboard.ts` (полностью):

```typescript
import { buildEffectivenessReport, type EffectivenessReport, type EffectivenessThresholds } from './effectiveness.js';
import { buildAnalyticsReport, type AnalyticsReport, type LifecycleThresholds } from './build-analytics.js';
import { computeSnapshotDelta, type DeltaRow } from './snapshot-delta.js';
import type { SnapshotEntry } from '../../adapters/fs/effectiveness-snapshots.js';
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import type { PricingTable } from '../../domain/pricing.js';
import type { Clock } from '../../ports/clock.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { RelationLog } from '../../ports/relation-log.port.js';

/** Единый JSON-документ `wolf dashboard --json` (§6.1 спеки аналитики). */
export interface DashboardData {
  generatedAt: string;
  effectiveness: EffectivenessReport;
  analytics: AnalyticsReport;
  snapshot: { prevTs: string | null; delta: DeltaRow[] };
}

/**
 * Композиция дашборда: effectiveness + analytics + дельта к последнему снапшоту.
 * Чистая сборка данных — рендер отдельно (адаптер CLI). prevSnapshot null → delta [].
 */
export async function buildDashboard(
  deps: { store: MemoryStore; log: EventLog; relations: RelationLog; clock: Clock },
  input: {
    signals: SignalEvent[];
    runLogText: string | null;
    thresholds: EffectivenessThresholds;
    pricing?: PricingTable;
    analyticsThresholds?: Partial<LifecycleThresholds>;
    prevSnapshot: SnapshotEntry | null;
  }
): Promise<DashboardData> {
  const effectiveness = await buildEffectivenessReport(
    { store: deps.store, log: deps.log, relations: deps.relations },
    {
      signals: input.signals,
      runLogText: input.runLogText,
      thresholds: input.thresholds,
      ...(input.pricing !== undefined ? { pricing: input.pricing } : {}),
    }
  );
  const analytics = await buildAnalyticsReport(
    { store: deps.store, log: deps.log, clock: deps.clock },
    {
      signals: input.signals,
      runLogText: input.runLogText,
      ...(input.analyticsThresholds !== undefined ? { thresholds: input.analyticsThresholds } : {}),
      ...(input.pricing !== undefined ? { pricing: input.pricing } : {}),
    }
  );
  return {
    generatedAt: deps.clock.now().toISOString(),
    effectiveness,
    analytics,
    snapshot: {
      prevTs: input.prevSnapshot !== null ? input.prevSnapshot.ts : null,
      delta: input.prevSnapshot !== null ? computeSnapshotDelta(input.prevSnapshot.report, effectiveness) : [],
    },
  };
}
```

`src/adapters/cli/commands/dashboard.ts` (полностью):

```typescript
import { Command, Option } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeCwd } from '../cli-entry.js';
import { readSignals } from '../../fs/session-metrics-log.js';
import { readSnapshots } from '../../fs/effectiveness-snapshots.js';
import { loadWolfConfigSync } from '../../fs/config-file.js';
import { resolveThresholds } from '../../../app/use-cases/effectiveness.js';
import { buildDashboard, type DashboardData } from '../../../app/use-cases/build-dashboard.js';
import { filterAnalytics } from '../../../app/use-cases/build-analytics.js';
import { createCliContainer } from '../../../bootstrap/container.js';

/** §6.1 + D8 спеки аналитики: консольный дашборд — Unicode-таблицы, спарклайны,
 * статусы-значки; ноль зависимостей, БЕЗ записи файлов (HTML отложен). Рендер —
 * чистые экспортируемые функции (тестируемость, детерминизм: без ANSI-цветов и
 * без terminal width). baseDir инъектится для тестов (прецедент: memory-effectiveness.ts). */

const BARS = '▁▂▃▄▅▆▇█';

/** Спарклайн: [] → '', все значения ≤ 0 → '▁'×n, иначе v/max → символ шкалы (max → '█'). */
export function sparkline(values: number[]): string {
  if (values.length === 0) return '';
  const max = Math.max(...values);
  if (max <= 0) return BARS[0].repeat(values.length);
  return values.map((v) => BARS[Math.floor((v / max) * (BARS.length - 1))]).join('');
}

/** Обрезка ячейки: > 40 символов → 39 + '…' (ширина терминала НЕ читается — детерминизм e2e). */
function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** Unicode-таблица: `│` между колонками, рамки ┌┬┐├┼┤└┴┘, ширина = max ширина контента. */
export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const rowLine = (cells: string[]) => cells.map((c, i) => ` ${clip(c ?? '').padEnd(widths[i] ?? 0)} `).join('│');
  const border = (left: string, mid: string, right: string) =>
    left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right;
  return [
    border('┌', '┬', '┐'),
    rowLine(headers),
    border('├', '┼', '┤'),
    ...rows.map(rowLine),
    border('└', '┴', '┘'),
  ].join('\n');
}

/** Значок статуса L1-блока: OK/WARN/BAD/NO_DATA -> ✓/!/✗/· */
export function statusMark(status: 'OK' | 'WARN' | 'BAD' | 'NO_DATA'): string {
  if (status === 'OK') return '✓';
  if (status === 'WARN') return '!';
  if (status === 'BAD') return '✗';
  return '·';
}

/** null/undefined → '-', остальное — строкой (колонки с nullable-полями). */
function cell(v: unknown): string {
  return v === null || v === undefined ? '-' : String(v);
}

/** Секция health (L1): блоки effectiveness со статусами + totals. */
function renderHealth(d: DashboardData): string {
  const r = d.effectiveness;
  const holdout =
    r.rules.prevented === null || r.rules.checked === null ? 'n/a' : `${r.rules.prevented}/${r.rules.checked}`;
  const e = r.tools.economy;
  const economy = e.sufficient
    ? `medianTool=${e.medianTool} medianAll=${e.medianAll}`
    : `n/a: ${e.reason ?? 'not enough data'}`;
  const silent = r.delivery.silentShare === null ? 'n/a' : `${r.delivery.silentShare.toFixed(1)}%`;
  const noise =
    r.noise.share === null ? 'n/a' : `${r.noise.writeOnly}/${r.noise.totalObjects} = ${r.noise.share.toFixed(1)}%`;
  const routing =
    r.routing.length === 0
      ? 'n/a'
      : r.routing.map((row) => `${row.model}: tasks=${row.tasks} median=${row.medianWeighted}`).join(' | ');
  return [
    '== health ==',
    `rules: ${statusMark(r.rules.prevented === null ? 'NO_DATA' : 'OK')} active=${r.rules.activeRules} prevented/checked: ${holdout}`,
    `tools: ${statusMark(e.sufficient ? 'OK' : 'NO_DATA')} count=${r.tools.toolCount} usage=${r.tools.totalUsage} economy: ${economy}`,
    `delivery: ${statusMark(r.silentStatus)} events=${r.delivery.deliveryEvents} triggered=${r.delivery.triggeredObjects} silentRules=${r.delivery.silentRules} (${silent})`,
    `noise: ${statusMark(r.noiseStatus)} ${noise}`,
    `routing: ${routing}`,
    `totals: runs=${cell(r.totals.runs)} weighted=${cell(r.totals.sumWeighted)}`,
  ].join('\n');
}

/** Секция ledgers (L2): таблицы memory/tools/rules/agents/outliers. */
function renderLedgers(d: DashboardData): string {
  const parts: string[] = ['== ledgers =='];

  const memory = filterAnalytics(d.analytics, { view: 'memory', top: 20 });
  if (memory.view === 'memory') {
    parts.push(
      renderTable(
        ['id', 'type', 'lifecycle', 'age', 'deliveries', 'triggers', 'complaints', 'last_used'],
        memory.rows.map((r) => [
          r.id,
          r.type,
          r.lifecycle,
          cell(r.age_days),
          cell(r.deliveries),
          cell(r.triggers),
          cell(r.complaints),
          cell(r.last_used),
        ])
      )
    );
  }

  const tools = filterAnalytics(d.analytics, { view: 'tools', top: 20 });
  if (tools.view === 'tools') {
    parts.push(
      renderTable(
        ['name', 'origin', 'status', 'usage', 'errors', 'promotion'],
        tools.rows.map((r) => [
          r.name,
          r.origin,
          cell(r.status),
          cell(r.usageCount),
          cell(r.errorCount),
          cell(r.promotion),
        ])
      )
    );
  }

  const rules = filterAnalytics(d.analytics, { view: 'rules', top: 20 });
  if (rules.view === 'rules') {
    parts.push(
      renderTable(
        ['id', 'prevented', 'checked', 'silent', 'title'],
        rules.rows.map((r) => [r.id, cell(r.prevented), cell(r.checked), r.silent ? 'yes' : 'no', r.title])
      )
    );
  }

  const agents = filterAnalytics(d.analytics, { view: 'agents', top: 20 });
  if (agents.view === 'agents') {
    parts.push(
      renderTable(
        ['agent', 'runs', 'weighted', 'avg_ms', 'fail_%', 'compl by/about', 'prevented'],
        agents.rows.map((r) => [
          r.agent,
          cell(r.runs),
          cell(r.weighted),
          cell(r.avgDurationMs),
          cell(r.failureRatePct === null ? null : r.failureRatePct.toFixed(1)),
          `${r.complaintsBy}/${r.complaintsAbout}`,
          cell(r.holdoutPrevented),
        ])
      )
    );
  }

  const outliers = filterAnalytics(d.analytics, { view: 'outliers', top: 10 });
  if (outliers.view === 'outliers') {
    parts.push(
      renderTable(
        ['ts', 'model', 'weighted', 'cost', 'title'],
        outliers.runs.map((r) => [
          cell(r.ts),
          cell(r.model),
          cell(r.weighted),
          cell(r.costUsd === null ? null : `$${r.costUsd}`),
          cell(r.title),
        ])
      )
    );
  }

  return parts.join('\n');
}

/** Секция trends (L3): спарклайны по снапшотам, недельная воронка, cache-hit, readiness, steward. */
function renderTrends(baseDir: string, d: DashboardData): string {
  const parts: string[] = ['== trends =='];

  const snaps = readSnapshots(baseDir);
  parts.push(`noise.share: ${sparkline(snaps.map((s) => s.report.noise.share ?? 0))}`);
  parts.push(`silentShare: ${sparkline(snaps.map((s) => s.report.delivery.silentShare ?? 0))}`);
  parts.push(`totals.sumWeighted: ${sparkline(snaps.map((s) => s.report.totals.sumWeighted))}`);

  const funnel = filterAnalytics(d.analytics, { view: 'funnel', top: 20 });
  if (funnel.view === 'funnel') {
    parts.push(
      renderTable(
        ['week', 'writes', 'delivers', 'triggers', 'W->D %', 'D->T %'],
        funnel.weeks.map((r) => [
          r.week,
          cell(r.writes),
          cell(r.delivers),
          cell(r.triggers),
          cell(r.writeToDeliverPct === null ? null : r.writeToDeliverPct.toFixed(1)),
          cell(r.deliverToTriggerPct === null ? null : r.deliverToTriggerPct.toFixed(1)),
        ])
      )
    );
  }

  const tot = d.effectiveness.totals;
  const cacheHit =
    tot.sumTokens !== null && tot.sumTokens.input + tot.sumTokens.cache_read > 0
      ? `${((tot.sumTokens.cache_read / (tot.sumTokens.input + tot.sumTokens.cache_read)) * 100).toFixed(1)}%`
      : 'n/a (no raw token data yet)';
  parts.push(`cache-hit ratio: ${cacheHit}`);

  const readiness = filterAnalytics(d.analytics, { view: 'readiness', top: 20 });
  if (readiness.view === 'readiness') {
    parts.push(`experiment readiness: runs=${readiness.readiness.totalRuns} withArm=${readiness.readiness.withArm}`);
  }

  const steward = filterAnalytics(d.analytics, { view: 'steward', top: 20 });
  if (steward.view === 'steward') {
    parts.push(`steward mutations/week: ${sparkline(steward.steward.mutationsByWeek.map((w) => w.total))}`);
  }

  return parts.join('\n');
}

export function dashboardCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('dashboard').description(
    'Console dashboard: health, ledgers, trends (unicode tables and sparklines; no files written)'
  );

  cmd
    .addOption(new Option('--tab <tab>', 'Render a single section').choices(['health', 'ledgers', 'trends']))
    .option('--json', 'Machine-readable JSON output of the whole dashboard', false);

  cmd.action(async (options) => {
    // пороги effectiveness: override из config поверх дефолтов (битый конфиг → дефолты)
    let config: ReturnType<typeof loadWolfConfigSync> = undefined;
    try {
      config = loadWolfConfigSync(baseDir);
    } catch {
      config = undefined;
    }
    const thresholds = resolveThresholds(config?.learning?.effectivenessThresholds);

    let runLogText: string | null = null;
    try {
      runLogText = readFileSync(join(baseDir, '.wolf', 'run-log.jsonl'), 'utf-8');
    } catch {
      runLogText = null; // ENOENT — run-log ещё не пишется
    }

    const { store, log, relations, clock } = createCliContainer(baseDir);
    const data = await buildDashboard(
      { store, log, relations, clock },
      {
        signals: readSignals(baseDir),
        runLogText,
        thresholds,
        ...(config?.pricing !== undefined ? { pricing: config.pricing } : {}),
        ...(config?.analytics?.thresholds !== undefined ? { analyticsThresholds: config.analytics.thresholds } : {}),
        prevSnapshot: readSnapshots(baseDir).at(-1) ?? null,
      }
    );

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const tab = options.tab as 'health' | 'ledgers' | 'trends' | undefined;
    if (tab === undefined || tab === 'health') console.log(renderHealth(data));
    if (tab === undefined || tab === 'ledgers') console.log(renderLedgers(data));
    if (tab === undefined || tab === 'trends') console.log(renderTrends(baseDir, data));
  });

  return cmd;
}
```

`src/adapters/cli/cli-entry.ts` — две правки (после правок задачи 9):

После `import { analyticsCommand } from './commands/analytics.js';` добавить:

```typescript
import { dashboardCommand } from './commands/dashboard.js';
```

После `program.addCommand(analyticsCommand());` добавить:

```typescript
program.addCommand(dashboardCommand());
```

- [ ] **Шаг 4: Запусти тесты — убедись, что проходят**
      Запуск: `npx vitest run tests/unit/adapters/dashboard-render.test.ts tests/unit/use-cases/build-dashboard.test.ts`
      Ожидание: PASS — все 4 теста (2 describe × 2).
- [ ] **Шаг 5: Типы + smoke**
      Запуск: `npm run lint && npm run build && node dist/bootstrap/cli.js dashboard`
      Ожидание: lint/build без ошибок; stdout содержит `== health ==`, `== ledgers ==`, `== trends ==`; файл `dashboard.html` в cwd не появился.
- [ ] **Шаг 6: Закоммить**

```bash
git add src/app/use-cases/build-dashboard.ts src/adapters/cli/commands/dashboard.ts src/adapters/cli/cli-entry.ts tests/unit/adapters/dashboard-render.test.ts tests/unit/use-cases/build-dashboard.test.ts
git commit -m "feat(cli): wolf dashboard — console unicode tables and sparklines"
```

Покрывает: критерий приёмки 7 (юнит-часть).

---

### Задача 12: e2e + docs + финальная проверка

**Файлы:**

- Test: `tests/e2e/analytics.e2e.ts` (создать)
- Create: `docs/guide/analytics.md`
- Modify: `docs/guide/signal-log.md` (новые опц. поля run-события + пример записи)

- [ ] **Шаг 1: Напиши e2e-сценарии**

`tests/e2e/analytics.e2e.ts` (полностью; прецедент `tests/e2e/insights.e2e.ts` — tmpProject/runCli/afterEach-rmSync):

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('analytics + dashboard golden scenarios (spec 2026-09-03)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /** PATH-stub opencode: одна NDJSON-строка — sessionID + step-finish с токенами (M1). */
  function installOpencodeStub(dir: string): void {
    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(
      join(dir, 'bin', 'opencode'),
      '#!/bin/sh\nprintf \'%s\\n\' \'{"sessionID":"s-e2e","part":{"type":"step-finish","tokens":{"input":100,"output":20,"cache":{"read":50}}}}\'\n'
    );
    chmodSync(join(dir, 'bin', 'opencode'), 0o755);
  }

  /** Последняя непустая JSONL-строка файла как объект. */
  function lastJsonLine(text: string): Record<string, unknown> {
    const lines = text
      .trim()
      .split('\n')
      .filter((l) => l !== '');
    return JSON.parse(lines[lines.length - 1] ?? '{}') as Record<string, unknown>;
  }

  it('run flags -> run-log/run-signal; snapshot -> delta; analytics views (acceptance 1,2,4,5,6)', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    // --- сценарий 1: прогон с экспериментальными флагами (критерий 1).
    // routing-объекта в свежем проекте нет -> memory-run напечатает warning в stderr
    // и уйдёт на fallback-модель — это ок, статус 0.
    installOpencodeStub(dir);
    const run = runCli(
      [
        'run',
        '--agent',
        'dev',
        '--title',
        'e2e',
        '--experiment',
        'exp1',
        '--arm',
        'wolf',
        '--task-id',
        't-1',
        '--',
        'hi',
      ],
      dir,
      { PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}` }
    );
    expect(run.status).toBe(0);

    const entry = lastJsonLine(readFileSync(join(dir, '.wolf', 'run-log.jsonl'), 'utf-8'));
    expect(entry.session).toBe('s-e2e');
    expect((entry.tokens as { input: number }).input).toBe(100);
    expect(typeof entry.duration_ms).toBe('number');
    expect((entry.experiment as { arm: string }).arm).toBe('wolf');
    expect((entry.experiment as { task_id: string }).task_id).toBe('t-1');

    const signals = readFileSync(join(dir, '.wolf', 'metrics', 'session-metrics.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const runSignal = signals.find((e) => e.event === 'run');
    expect(runSignal).toBeDefined();
    expect(typeof runSignal?.duration_ms).toBe('number');
    expect((runSignal?.tokens as { input: number }).input).toBe(100);
    expect((runSignal?.experiment as { id: string }).id).toBe('exp1');

    // --- сценарий 2: снапшот + дельта (критерий 2), тот же dir
    const snap = runCli(['effectiveness', '--snapshot'], dir);
    expect(snap.status).toBe(0);
    expect(snap.stdout).toContain('snapshot appended');

    const added = runCli(
      ['add', '--type', 'decision', '--title', 'post-snapshot decision', '--body', 'changes noise'],
      dir
    );
    expect(added.status).toBe(0);

    const eff = runCli(['effectiveness'], dir);
    expect(eff.status).toBe(0);
    expect(eff.stdout).toContain('delta vs');

    // --- сценарий 3: analytics-представления (критерии 4-6), тот же dir
    for (let i = 1; i <= 3; i++) {
      const c = runCli(
        ['complain', '--about', 'skill:x', '--rule', 'r', '--proposal', 'p', '--text', `жалоба ${i}`],
        dir
      );
      expect(c.status).toBe(0);
    }

    const memory = runCli(['analytics', '--view', 'memory', '--json'], dir);
    expect(memory.status).toBe(0);
    const memoryPayload = JSON.parse(memory.stdout) as { view: string; rows: Array<Record<string, unknown>> };
    expect(memoryPayload.view).toBe('memory');
    expect(Array.isArray(memoryPayload.rows)).toBe(true);
    const row = memoryPayload.rows[0];
    expect(row).toHaveProperty('lifecycle');
    expect(row).toHaveProperty('age_days');
    expect(row).toHaveProperty('deliveries');

    const silentRules = runCli(['analytics', '--view', 'rules', '--silent', '--json'], dir);
    expect(silentRules.status).toBe(0);

    const tools = runCli(['analytics', '--view', 'tools', '--json'], dir);
    expect(tools.status).toBe(0);
    const toolsPayload = JSON.parse(tools.stdout) as { rows: unknown[] };
    expect(Array.isArray(toolsPayload.rows)).toBe(true); // может быть пуст — ок

    const readiness = runCli(['analytics', '--view', 'readiness', '--json'], dir);
    expect(readiness.status).toBe(0);
    const readinessPayload = JSON.parse(readiness.stdout) as {
      readiness: { totalRuns: number; withArm: number };
    };
    expect(readinessPayload.readiness.totalRuns).toBeGreaterThanOrEqual(1);
    expect(readinessPayload.readiness.withArm).toBe(1);

    const steward = runCli(['analytics', '--view', 'steward', '--json'], dir);
    expect(steward.status).toBe(0);
    const stewardPayload = JSON.parse(steward.stdout) as {
      steward: { complaintFunnel: { filed: number } };
    };
    expect(stewardPayload.steward.complaintFunnel.filed).toBeGreaterThanOrEqual(3);
  });

  it('dashboard renders three sections, --tab selects one, no files written (acceptance 7)', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    const asJson = runCli(['dashboard', '--json'], dir);
    expect(asJson.status).toBe(0);
    const data = JSON.parse(asJson.stdout) as Record<string, unknown>;
    expect(data).toHaveProperty('effectiveness');
    expect(data).toHaveProperty('analytics');
    expect(data).toHaveProperty('snapshot');

    const tab = runCli(['dashboard', '--tab', 'trends'], dir);
    expect(tab.status).toBe(0);
    expect(tab.stdout).toContain('trends');

    const full = runCli(['dashboard'], dir);
    expect(full.status).toBe(0);
    expect(full.stdout).toContain('health');
    expect(full.stdout).toContain('ledgers');
    expect(full.stdout).toContain('trends');

    // D8: дашборд ничего не пишет на диск (HTML-витрина отложена)
    expect(existsSync(join(dir, 'dashboard.html'))).toBe(false);
  });
});
```

- [ ] **Шаг 2: Запусти e2e**
      Запуск: `npm run e2e`
      Ожидание: PASS — оба сценария `analytics + dashboard golden scenarios` зелёные, регресс соседних e2e не сломан.
- [ ] **Шаг 3: Напиши документацию**

`docs/guide/analytics.md` (полностью; русский — внутренняя документация):

````markdown
# Аналитика эффективности: `wolf analytics`, `wolf dashboard`, снапшоты

Канон — спека `docs/superpowers/specs/2026-09-03-analytics-metrics-dashboard-design.md`.
Этот гайд — практическая документация команд витрины: что вызывать, как настраивать,
что лежит в JSON. Аналитика — только агрегация существующих логов, без LLM.

## Команды

### `wolf analytics` — выборки для Стюарда

| Вызов                                     | Ответ                                                         |
| ----------------------------------------- | ------------------------------------------------------------- |
| `--view memory --class dead --json`       | DEAD-объекты: id, тип, возраст, last_used, счётчики           |
| `--view memory --class sleeper [--top N]` | редко используемые объекты                                    |
| `--view memory [--type <тип>] [--top N]`  | полный memory ledger + garbage ratio                          |
| `--view rules [--silent]`                 | ranking по holdout_prevented; `--silent` — только молчащие    |
| `--view tools [--origin script\|native]`  | tool ledger: usage, ошибки, lifecycle, promotion-кандидаты    |
| `--view funnel [--weeks N]`               | конверсия write→deliver→trigger по неделям                    |
| `--view agents [--agent <имя>] [--top N]` | per-agent объём, стоимость, ошибки, жалобы, достижения        |
| `--view steward [--weeks N]`              | мутации, жалобная воронка, рецидивы, churn, доля авто-мутаций |
| `--view outliers [--top N]`               | самые дорогие прогоны (weighted; $ при pricing)               |
| `--view readiness`                        | готовность к экспериментам (доля прогонов с arm)              |
| `--view all`                              | все секции подряд                                             |

Общие флаги: `--json` (машинный вывод — дефолт для агентского потребления),
`--top N` (лимит строк, дефолт 20), `--weeks N` (окно воронки, дефолт 8).

MCP-инструмент `analytics` принимает те же параметры (`view/class/type/origin/
agent/top/weeks/silent`) и возвращает тот же JSON, что `--json`.

### `wolf dashboard` — консольный дашборд

- без флагов — три секции в stdout: `health` (L1-статусы), `ledgers` (L2-таблицы),
  `trends` (L3-спарклайны `▁▂▃▄▅▆▇█` по снапшотам);
- `--tab health|ledgers|trends` — одна секция;
- `--json` — единый JSON-документ `DashboardData`;
- Unicode-таблицы и спарклайны рендерятся прямо в терминал, файлы НЕ пишутся
  (HTML-витрина отложена, решение D8 спеки).

### `wolf effectiveness --snapshot` — снапшоты и дельты

- `--snapshot` — сериализует полный отчёт и аппендит в
  `.wolf/metrics/effectiveness-snapshots.jsonl` (append-only, история для трендов);
- обычный вызов при наличии ≥1 снапшота печатает дельту к последнему
  (`delta vs <ts>` по числовым полям блоков).

## Конфигурация

`.wolf/config.yaml`:

```yaml
# $-конверсия: map модель -> $/Mtok; без блока $-поля скрыты (числа не выдумываем)
pricing:
  zai-coding-plan/glm-5.3:
    input: 0.6
    output: 2.2
    cache_read: 0.08

# пороги lifecycle-классификации памяти (D7: дефолты 14 дней / 3 использования)
analytics:
  thresholds:
    new_days: 14
    workhorse_uses: 3
```

## JSON-формат

`wolf analytics --view <v> --json` возвращает payload секции: `{view, rows, ...}`
(например, memory — `rows` per-object + `garbage {dead, base, ratioPct}`),
`--view all` — полный `AnalyticsReport`: ledgers (memory/tools/rules), funnel,
agents, steward, outliers, readiness.

`wolf dashboard --json` возвращает `DashboardData`:

- `generatedAt` — ISO-время сборки;
- `effectiveness` — полный `EffectivenessReport` (rules/tools/delivery/noise/
  routing + totals: суммы токенов, средняя duration, cost-per-success);
- `analytics` — полный `AnalyticsReport`;
- `snapshot` — `{prevTs, delta}`: дельта к последнему снапшоту
  (`{path, prev, curr, diff}` по числовым полям), `prevTs: null` — снапшотов ещё нет.

## Сбор данных

| Данные                                            | Источник                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| run-события (объём, токены, duration, experiment) | `.wolf/run-log.jsonl` + run-сигналы `.wolf/metrics/session-metrics.jsonl` |
| deliveries/жалобы/tool_error                      | сигнальный лог `.wolf/metrics/session-metrics.jsonl`                      |
| рождения/мутации/срабатывания                     | event log `.wolf/events.jsonl` (actor, memory_id)                         |
| объекты памяти                                    | markdown-стор `.wolf/memory/`                                             |
| снапшоты для трендов                              | `.wolf/metrics/effectiveness-snapshots.jsonl`                             |

Всё уже пишется штатными командами (`run`, `complain`, `scaffold`, `tool expose`)
— аналитика только агрегирует, новых сборщиков нет.
````

`docs/guide/signal-log.md` — после абзаца «`gen_ai.modelID` присутствует в каждой записи…» (перед разделом «## Классификатор ошибок (D1.2)») вставь:

````markdown
### Новые опциональные поля run-события (M1 спеки аналитики 2026-09-03)

Обратно-совместимо: старые записи без этих полей читаются как раньше.

| Поле          | Тип                                      | Откуда                               |
| ------------- | ---------------------------------------- | ------------------------------------ |
| `duration_ms` | number                                   | замер `wolf run` вокруг spawn        |
| `tokens`      | `{input, output, cache_read}`            | суммы сырых токенов по step-finish   |
| `experiment`  | `{id, arm: 'wolf'\|'baseline', task_id}` | флаги `--experiment/--arm/--task-id` |

Пример записи:

```jsonc
{
  "ts": "2026-09-03T12:00:00.000Z",
  "event": "run",
  "session_id": "s-e2e",
  "gen_ai": { "modelID": "zai-coding-plan/glm-5.3", "agent": "dev" },
  "orchestration": { "task": "e2e", "actor": "user:cli" },
  "weighted": 205,
  "duration_ms": 1520,
  "tokens": { "input": 100, "output": 20, "cache_read": 50 },
  "experiment": { "id": "exp1", "arm": "wolf", "task_id": "t-1" },
  "outcome": "ok",
}
```
````

- [ ] **Шаг 4: Финальная проверка плана**
      Запуск: `npm run check`
      Ожидание: все шаги зелёные — english-surface gate OK, prettier check без расхождений, `tsc --noEmit` без ошибок, build OK, `vitest run` PASS (юниты + e2e-конфиг отдельным прогоном уже зелёный из шага 2).
      Если `format:check` красный (ручное редактирование code-style) — запусти `npm run format` и повтори `npm run check`.
- [ ] **Шаг 5: Закоммить**

```bash
git add tests/e2e/analytics.e2e.ts docs/guide/analytics.md docs/guide/signal-log.md
git commit -m "test(e2e): analytics/dashboard/effectiveness-snapshot scenarios + docs (analytics guide)"
```

Покрывает: критерии приёмки 1–9 (e2e-проверки критериев 1, 2, 4–7; критерий 9 — `npm run check`; критерии 3, 8 проверяются юнит/e2e задач 3–10 совместно).
