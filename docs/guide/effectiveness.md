# Панель эффективности и A/B-бенчмарки

## `wolf effectiveness` — как читать панель

Единая сводка по пробегу памяти. Только агрегация существующих логов
(канонический сигнальный лог `.wolf/metrics/session-metrics.jsonl`, event-log,
relations, tool stats), без LLM. Пустые данные печатаются честно как
`n/a` / `not enough data` — панель никогда не выдумывает числа.

```
$ wolf effectiveness
effectiveness panel (mileage aggregation, no LLM):
rules: active=17 | prevented/checked: 0/0
tools: count=0 | usage=0 | economy: n/a: not enough data (tool runs: 0, total: 3, need ≥ 3 in each group) [INFO]
delivery: events=24550 | triggered=10 | silentRules=0 (not enough delivery data)
noise: 416/485 = 85.8% [BAD]
documents: 183 (registered refs, not part of the noise metric) [INFO]
archived: 71 (outside the noise metric) [INFO]
routing: zai-coding-plan/glm-5.2: tasks=3 median=22868.2
totals: runs=2 processFailures=0 weighted=42736 cache=n/a avg=n/a
cost: n/a (no pricing configured)
model zai-coding-plan/glm-5.2: runs=2 processFailures=0 cost=n/a cost/completedRun=n/a
thresholds: noise ok<20 warn<=40 bad | silent ok<30
```

### Блоки

| Блок                        | Откуда данные                                                                                                                         | Что значит                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules`                     | память + holdout-поля Ф22 (`wolf learn validate`)                                                                                     | активные правила; суммарные prevented/checked по валидированным draft'ам. `n/a` — validate ещё не гонялся                                                                                                                                                                                                                                                                                                                                                           |
| `tools`                     | tool-объекты + run-сигналы (сигнальный лог)                                                                                           | реестр инструментов, суммарный `usage_count`, экономика переиспользования (медианы weighted; методика — [tool-economy.md](./tool-economy.md)). Информативный, без статуса                                                                                                                                                                                                                                                                                           |
| `delivery`                  | delivery-события сигнального лога                                                                                                     | доставок всего, сколько объектов реально срабатывало (`wolf call` штампует `deliveredIds`), доля молчащих правил                                                                                                                                                                                                                                                                                                                                                    |
| `noise`                     | event-log + relations                                                                                                                 | доля объектов «пишется-но-не-читается»: нет ни одной связи и ни одного события кроме `memory.added` (методика аудита [memory-audit-2026-08-29](../planning/memory-audit-2026-08-29.md)). Калибровка 2026-08-30: `document-ref` исключены (и из числителя, и из знаменателя) — это функциональный индекс документов; событие `memory.scan.updated` (обновление сканом) считается использованием, такой объект — не шум                                               |
| `documents`                 | память, type `document-ref`                                                                                                           | информативная строка: сколько зарегистрированных ссылок на документы; в метрике шума не участвуют (использование = регистрация/обновление сканом)                                                                                                                                                                                                                                                                                                                   |
| `archived`                  | память, status `archived`                                                                                                             | информативная строка: сколько объектов заархивировано. **Archived исключены из метрики шума** (и из числителя, и из знаменателя) — архивация (`wolf transition <id> archived`) легитимный способ снижения шума: без исключения transition помечал бы объект «использованным», и метрика почти не улучшалась                                                                                                                                                         |
| `routing`                   | run-сигналы сигнального лога (legacy run-log — compat-мерж до архивации `wolf migrate run-log`, см. [signal-log.md](./signal-log.md)) | по каждой модели: задач и медиана weighted. Информативный                                                                                                                                                                                                                                                                                                                                                                                                           |
| `totals` / `cost` / `model` | run-сигналы `.wolf/metrics/session-metrics.jsonl` (M3; НЕ run-log)                                                                    | блок абсолютов: runs и processFailures (`outcome ≠ ok`), суммы weighted и raw-токенов, cache-hit ratio `cache_read/(input+cache_read)`, средняя duration_ms; по моделям — runs/processFailures и costPerCompletedRun (`$cost/completedRuns`). `$`-поля только при `pricing` в конфиге (см. [analytics.md](./analytics.md)), иначе честное `n/a (no pricing configured)`; `n/a` также пока не накоплены M1-данные (записи без `tokens`/`duration_ms`). Информативный |

### Пороги (E1.2)

Статус ставится только там, где есть основа для оценки; остальные блоки —
информативные `[INFO]`:

- **noise**: `<20%` OK · `20–40%` WARN · `>40%` BAD
- **silentRules**: `<30%` OK · `≥30%` BAD
- данных мало → блок без статуса («мало delivery-данных», «n/a»), это не OK и не BAD.

Дефолты — константы в `src/app/use-cases/effectiveness.ts`
(`DEFAULT_EFFECTIVENESS_THRESHOLDS`). Override в `.wolf/config.yaml`:

```yaml
learning:
  effectiveness_thresholds:
    noise_ok: 25 # проценты
    noise_warn: 50
    silent_ok: 40
```

Поля опциональны: незаданные берутся из дефолтов. Применённый override панель
помечает ` (config override)` в строке `thresholds:`.

### Что делать при BAD

- **noise BAD** — память растёт быстрее, чем потребляется:
  - прогоните `wolf learn decay` — очередь `review_required` по пробегу (TTL в сессиях);
  - аудит по методике [memory-audit-2026-08-29](../planning/memory-audit-2026-08-29.md):
    обычно топ-шум — `session-summary` (нужна retention-политика), у `article` —
    дренаж очереди `proposed`; `document-ref` в метрике не участвуют (строка
    `documents:` — индекс регистраций, «использование» = обновление сканом);
  - тяжёлое лечение — консолидация/суперсиды однотипных lesson/observation;
  - архивирование шумовых объектов (`wolf transition <id> archived`) выводит
    их из метрики шума (строка `archived:`) — легитимный способ снижения noise.
- **silentRules BAD** — правила доставляются, но не срабатывают (ноль доставок
  за окно 30 сессий при ≥20 delivery): пересмотрите `trigger_keywords`
  (`wolf get <id>` → правка), слабые правила супсидите через `wolf supersede`.
- **economy n/a** — мало помеченных запусков: помечайте переиспользование
  `wolf run --tool <name>` (минимум 3 задачи на группу).
- **routing** — медиана weighted по моделям выросла на тех же типах задач →
  кандидат на смену routing-объекта (только человеком, через `wolf supersede`).

## Снапшоты и дельты (M2)

`wolf effectiveness --snapshot` сериализует полный отчёт и аппендит в
`.wolf/metrics/effectiveness-snapshots.jsonl` (append-only история для трендов).
Обычный вызов при наличии ≥1 снапшота дополнительно печатает дельту к последнему
(`delta vs <ts>` по числовым полям блоков). Снапшоты питают секцию trends
`wolf dashboard` — команды витрины и JSON-форматы: [analytics.md](./analytics.md).

## A/B-бенчмарки `scripts/bench/`

Три сценария «с Wolf vs без Wolf» в tmp-проектах. Формат — как у
`scripts/demo/`: self-checking на **механике** (PASS/FAIL за логи и таблицу),
**качество LLM не ассертуется** — модель недетерминирована.

```bash
bash scripts/bench/b1-repeat-debug.sh --dry   # по умолчанию dry, без LLM
bash scripts/bench/b1-repeat-debug.sh --live  # реальные opencode-вызовы (~минуты)
```

| Скрипт                | Сценарий                                                                                          | Метрика                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `b1-repeat-debug.sh`  | известная поломка решается дважды; A — активное правило + доставка `wolf call`, B — пустая память | weighted, шаги, счётчик доставки                    |
| `b2-bootstrap.sh`     | новый проект; A — init+bootstrap+brief, B — холодный старт                                        | weighted/шаги до первого упоминания факта из README |
| `b3-retrospective.sh` | сессия с N событиями; A — `wolf session wrap-up`, B — голый пересказ                              | покрытие чеклиста маркеров, weighted                |

- Отчёт каждого прогона: `.wolf/bench/<name>.json`; сравнительная таблица — в stdout.
- `--live` делает реальные opencode-вызовы: запускать только вручную; внутри
  `npm test`/e2e live заблокирован guard'ом. Dry подменяет LLM-прогоны
  fixture-NDJSON (помечено `dry-fixture`) — механика веток исполняется по-настоящему.
- e2e-покрытие: `tests/e2e/bench-dry.e2e.ts` — только dry-режим.

### Ограничения методики

- **LLM недетерминирован**: одиночный прогон ни о чём не говорит — сравнивайте
  **тренды** по серии прогонов (минимум 3–5 live-запусков на ветку), не одну пару.
- Экономика (weighted) зависит от модели и промпта: сравнивайте ветки одного
  прогона между собой, а не прогоны между днями.
- b2 «шаг до факта» — механический grep фиксированных фактов README; b3
  «покрытие маркеров» — grep чеклиста в итоговом тексте. Это прокси-метрики
  полноты, не оценка качества рассуждений.
- b3: `wolf session wrap-up` сегодня пересказывает event-log Wolf, а не
  сигнальный лог — покрытие маркеров сигналов будет занижено (известное
  ограничение, отмечено в шапке скрипта). weighted ветки A честно равен 0:
  wrap-up — локальная команда, LLM не тратится.

### Ручная разметка live-прогонов (M1/D5)

Помимо bench-скриптов, любой live-прогон можно пометить экспериментальными
примитивами: `wolf run --experiment <id> --arm wolf|baseline [--task-id <id>]`.
Поля пишутся в run-log и run-сигнал (семантика набора флагов —
[signal-log.md](./signal-log.md)); движка экспериментов нет — методики (RCT,
golden tasks) ложатся на данные позже. Накопленный объём смотрится через
`wolf analytics --view readiness` ([analytics.md](./analytics.md)).
