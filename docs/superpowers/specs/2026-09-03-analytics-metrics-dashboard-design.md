# Дизайн: система аналитики эффективности — метрики, реестры, дашборд

|               |                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Дата          | 2026-09-03                                                                                                                                                                                                          |
| Ревизия       | 4 — agent ledger по трёхуровневой схеме (объём/проблемы/достижения per-agent) + view steward (мутации, жалобная воронка, SLA, рецидивы, churn); 3 — tool ledger разделён по происхождению (script vs model-native), promotion-сигналы; 2 — дашборд переведён в консоль, контур доступа Стюарда (CLI-обзоры + MCP); 1 — исходная                                                                                    |
| Статус        | На ревью владельца; реализация — после аппрува → wolf-plan → worktree                                                                                                                                               |
| Источники     | Аудит механизмов сбора (эта сессия): `src/adapters/cli/opencode-run-metrics.ts`, `src/adapters/cli/commands/memory-run.ts`, `src/adapters/fs/session-metrics-log.ts` (Ф20), `src/app/use-cases/effectiveness.ts`, `src/app/use-cases/generate-insights.ts`, `src/domain/tool-economy.ts`; урок методики `mem_20260824_v2_a3ed39` (весовые токены); внешние методики: Copilot RCT (Peng et al. 2023), SWE-bench, SPACE, DORA 2024 |
| Следующий шаг | Аппрув владельца → wolf-plan → реализация в worktree `.worktrees/<имя-задачи>`                                                                                                                                      |

## 1. Проблема

Wolf собирает богатые сырые данные (run-log, сигнальный лог Ф20, event log памяти,
holdout-счётчики Ф22), но аналитический слой развивает их слабо:

1. **Агрегаты без сущностей.** Все отчёты схлопывают данные в доли и медианы:
   noise share говорит «25% памяти мусор», но не отвечает «вот список мёртвых
   записей». Per-object след использования (рождение → доставки → срабатывания →
   жалобы) восстановим из существующих логов, но нигде не агрегируется.
2. **Дыры сбора:** нет wall-clock времени прогона (D1); `parseRunMetrics`
   получает сырые токены {input, output, cache.read} из NDJSON, но выбрасывает,
   оставляя только weighted с зашитыми коэффициентами 0.1/5 (D2); нет
   временных рядов — отчёты эфемерны, снапшотов нет (D3); нет конверсии в $
   (D4); нет экспериментальных примитивов (experiment/arm/task_id) —
   сравнительные методики (RCT, golden tasks) не на что опереть (D5).
3. **Нет витрины.** CTO-оценка абсолютной эффективности невозможна без
   дашборда абсолютных величин и трендов.

Задача владельца: (а) добор механизмов сбора так, чтобы ЛЮБАЯ методика
оценки (сравнительная или абсолютная) могла лечь на данные потом; (б) система
аналитики, отвечающая на конкретные вопросы о работе системы; (в) дашборд.

## 2. Принятые решения

| #   | Решение                                                                                                                                                                                                                   | Альтернатива, которую отклонили                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Три уровня аналитики: L1 Health (агрегаты/тренды/статусы), L2 Ledgers (per-entity следы: объект памяти, тул, правило, модель/агент), L3 Trends (когорты, дифы снапшотов, будущие эксперименты)                              | Только агрегаты (текущее состояние): не отвечает ни на один вопрос уровня «эта запись используется?»                                                                                        |
| D2  | Аналитика строится назад от 10 вопросов владельца (§4) — каждая метрика отвечает на конкретный вопрос; метрики без вопроса не вводим                                                                                       | Каталог «всех возможных метрик»: раздувание, необслуживаемая витрина                                                                                                                        |
| D3  | Сырые токены — новые опциональные поля рядом с weighted (backward-compatible); weighted остаётся каноном сравнений (урок a3ed39)                                                                                            | Заменить weighted: ломает существующие отчёты и накопленную историю                                                                                                                         |
| D4  | duration меряет сам `wolf run` вокруг spawn (harness-независимо), не парсинг NDJSON                                                                                                                                        | Вытаскивать длительность из step-finish событий opencode: формат чужого NDJSON — не контракт Wolf, хрупко                                                                                   |
| D5  | Экспериментальные примитивы = опциональные поля прогона (`experiment`, `arm: 'wolf'\|'baseline'`, `task_id`), без движка экспериментов и runner'а — методики ложатся на данные позже                                        | `wolf bench` / golden-task runner сейчас: YAGNI, сбор данных должен идти с первого дня, методика выбирается позже (прямое требование владельца)                                             |
| D6  | Снапшоты — append-only `.wolf/metrics/effectiveness-snapshots.jsonl`, полная копия отчёта + дельта к последнему при обычном вызове                                                                                          | Хранить только последние N: теряется история для трендов; SQLite/БД: против инвариантов проекта (append-only файлы, derived/rebuildable)                                                    |
| D7  | Lifecycle-классификация памяти по числу использований и возрасту: uses ≥ 3 → WORKHORSE; uses 1–2 → SLEEPER; uses 0 при возрасте ≤ 14 дней → NEW; uses 0 при возрасте > 14 дней → DEAD. Пороги — параметры config.yaml (`analytics.thresholds`: `newDays`, `workhorseUses`) | Плоский noise share: не отличает новичка от мёртвой записи, не даёт списка действий. Фиксированные пороги без конфига: частота использования памяти сильно зависит от проекта               |
| D8  | Дашборд — консольный: `wolf dashboard` рендерит Unicode-таблицы и текстовые спарклайны (`▁▂▃▄▅▆▇█`) прямо в терминал, без зависимостей и без записи файлов; `--json` — машинный вывод. HTML-витрина — отложена (добавится опциональным флагом при появлении потребности) | Серверный веб-дашборд: против local-first философии; chart-библиотеки и HTML-файл по умолчанию: зависимость/артефакт ради того, что терминал показывает сразу; прямое решение владельца — «выводиться в консоль по команде wolf dashboard» |
| D9  | $-конверсия только при явном `pricing` в config.yaml; без прайса блок $ скрыт — числа не выдумываем (прецедент EconomyResult.sufficient)                                                                                    | Зашивать прайсы в код: цены меняются, источник должен быть у владельца                                                                                                                      |
| D10 | Мутации файлов скиллов/агентов не трекаем новым сборщиком: git log = источник истины об изменениях файлов, `memory.scan.updated` = свежесть регистрации                                                                   | Файловый вотчер: дублирует git, лишний сборщик; прямое решение владельца в обсуждении                                                                                                       |
| D11 | Tool ledger разделяет происхождение: `script` — объекты реестра `type:'tool'` (кастомные скрипты в `.wolf/tools/`, полный lifecycle register→use→expose→deprecate) vs `model-native` — тула модели (MCP, встроенные), которых в реестре нет и которые видны только через run-log `--tool` и tool_error. Экономика у них разная: reuse скрипта = экономия на пересоздании, у нативного экономики создания нет. Действия Стюарда разные: script — expose/fix/deprecate; native — вне юрисдикции Wolf. Promotion-сигналы: script в candidate с usage_count ≥ 3 → кандидат на expose; имя, многократно встречающееся в логах без регистрации → кандидат на register (прецедент pattern_threshold=3, правило search-before-write) | Смешанный пул «все тула подряд»: невозможна ни экономика переиспользования (у native её нет), ни путь зрелости скрипта; различие категорий установлено владельцем, реестр `tool` уже моделирует только скрипты |

## 3. Модель эффективности: воронка ценности

```
ЗАХВАТ ──→ ДОСТАВКА ──→ ВОЗДЕЙСТВИЕ ──→ ЭФФЕКТ
 качество    trigger      поведение     токены/время/$/ошибки
(garbage)   (coverage)   (holdout)      (экономика)
        guardrails: шум, stale, конфликты, tool-ошибки
```

Аналитическая ценность — локализация разрыва: захват растёт, эффект нет →
проблема в доставке; доставка растёт, holdout пуст → память не меняет поведение.
Каждый отчёт дашборда принадлежит ячейке этой воронки.

## 4. Десять вопросов → метрики → источники

| #   | Вопрос владельца                                             | Метрика                                                                                     | Источник (есть/будет)                          |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Q1  | «Эта запись никогда не использовалась?»                      | Memory ledger per-object: age, deliveries, triggers, complaints, last_used, lifecycle-класс  | store + delivery-сигналы + event log + жалобы (всё есть) |
| Q2  | «Доля мусорной памяти?»                                      | garbage ratio = DEAD / активные, с трендом; список DEAD с действием (archive/supersede)     | то же + пороги D7                              |
| Q3  | «Эффективность инструментов?»                                | Tool ledger: usage_count, error rate по классам, тренд; reuse economy                        | реестр тулов + tool_error (есть)               |
| Q4  | «Какие правила реально спасают?»                             | Rule ranking по holdout_prevented; silent rules                                              | Ф22 + silentRuleIds (есть)                     |
| Q5  | «Какой агент/модель дешевле за УСПЕШНУЮ задачу?»             | cost-per-success: weighted, duration, failure rate по (model, agent)                         | run-log + M1 duration                          |
| Q6  | «Растёт ли отдача памяти?»                                   | Конверсия воронки по неделям: write → deliver → trigger → prevent                            | event log + сигналы (есть)                     |
| Q7  | «Насколько дорогой кэш?»                                     | cache-hit ratio = cache_read / (input + cache_read), тренд; доля дорогого input              | M1 raw-токены                                  |
| Q8  | «Что съедает бюджет?»                                        | Top-N дорогих прогонов (weighted и $), outliers                                              | run-log (есть)                                 |
| Q9  | «Стало ли лучше после изменения X?»                          | Диф последнего снапшота с предыдущим по всем блокам                                          | M2 снапшоты                                    |
| Q10 | «Готовы ли к эксперименту?»                                  | Доля прогонов с arm/task_id, объём выборки по группам                                        | M1 примитивы                                   |
| Q11 | «Кто чаще/больше работает? У кого проблемы/достижения?»      | Agent ledger per `gen_ai.agent`/`actor`: runs, weighted, duration, failure rate, tool errors, жалобы на/от агента, holdout_prevented его правил | сигналы (run/complaint/tool_error) + event log actor — всё есть |
| Q12 | «Что делает Стюард и как он справляется?»                    | Мутации по видам/периодам; жалобная воронка (подано→триаж→resolved/rejected), SLA-нарушения, рецидивы, churn объектов; доля авто-мутаций | event log actor + complaint-сигналы — всё есть |

## 5. Механизмы

### M1. Обогащение прогона (fix D1, D2, D5)

- `parseRunMetrics` (`src/adapters/cli/opencode-run-metrics.ts`): дополнительно
  суммировать сырые токены по step-finish частям — `tokensIn`, `tokensOut`,
  `cacheRead`; `weighted` сохраняется без изменений.
- `wolf run` (`src/adapters/cli/commands/memory-run.ts`): замер
  `duration_ms` (Date.now вокруг spawn); новые опции `--experiment <id>`,
  `--arm <wolf|baseline>`, `--task-id <id>` (все опциональны).
- Схемы записей (обратно-совместимо, все новые поля опциональны):
  - `RunLogEntry` (`src/domain/tool-economy.ts`): + `session`, `duration_ms`,
    `tokens {input, output, cache_read}`, `experiment {id, arm, task_id}`;
  - `SignalEvent` (`src/adapters/fs/session-metrics-log.ts`): + те же поля
    в run-события.
- Существующие вызовы без новых флагов пишутся как раньше — ничего не ломается.

### M2. Снапшоты отчётов (fix D3, Q9)

- `wolf effectiveness --snapshot`: сериализует полный `EffectivenessReport`
  в JSON и аппендит в `.wolf/metrics/effectiveness-snapshots.jsonl`
  (reader/writer — новый адаптер рядом с `session-metrics-log.ts`).
- Обычный вызов `wolf effectiveness` при наличии ≥1 снапшота печатает дельту
  к последнему (по числовым полям блоков).

### M3. Абсолютные величины + pricing (fix D3, D4; Q5, Q7, Q8)

- Effectiveness получает блок 6 «Абсолюты» из run-log: суммы weighted и raw
  токенов за период (неделя) и всего, по моделям; count runs; средняя
  duration; cost-per-success по (model, agent).
- `pricing` в config.yaml (`src/adapters/fs/config-file.ts`): map
  model → {input, output, cache_read} ($/Mtok). При наличии — $-стоящие поля
  в блоке абсолютов; при отсутствии — блок $ скрыт (D9).
- Cache-hit ratio (Q7) — из raw-токенов; `null` до накопления M1-данных.

### M4. Динамика мутаций (fix D6-инсайты; Q6)

- Агрегация event log по неделям (те же 8 бакетов, что insights density):
  added / updated / superseded / resolved / transitioned, в разбивке по типам
  объектов (rule, lesson, tool, документ-рефы — где применимо).
- Место: расширение `generateInsights` (analysisType 'activity'); данные уже
  в `deps.log.readAll()`.

### M5. Реестры и воронка (Q1–Q4, Q6, Q8) — ядро L2

Новый use-case `buildAnalyticsReport` (`src/app/use-cases/`, порты те же:
store, signals, event log, relations — чистая детерминированная агрегация, без LLM):

- **Memory ledger**: на каждый активный объект — created_at, age_days,
  deliveries (delivery-сигналы `detail.name`), triggers (event log
  `memory_id` ≠ memory.added), complaints (complaint-сигналы
  `detail.object_id`), holdout_prevented/checked (у rule/lesson), last_used;
  lifecycle-класс D7.
- **Garbage ratio**: DEAD / активные, тренд по неделям.
- **Tool ledger** (D11): происхождение `origin: 'script' | 'model-native'`
  (script = имя в реестре `type:'tool'`; native = только в логах); для script —
  usage_count, last_used_at, статус lifecycle, error rate по классам, тренд;
  для native — только появления в атрибуциях и tool_error. Promotion-кандидаты:
  script candidate с usage_count ≥ `patternThreshold` → expose; имя native,
  встреченное ≥ порога, → register.
- **Rule ranking**: убыв. holdout_prevented; отдельный список silent rules.
- **Воронка по неделям**: write (memory.added) → deliver (delivery-события)
  → trigger (уникальные сработавшие) → prevent (holdout_prevented за неделю).
- **Top-N outliers**: N=10 самых дорогих прогонов (weighted; $ при pricing).
- **Agent ledger** (Q11): per-agent (L0/L1/L2 по actor-конвенции
  `agent:<имя>`) — runs, weighted, duration (после M1), failure rate, tool
  error rate; жалобы: поданные агентом (`orchestration.actor`) и на агента
  (`detail.about`); достижения: успешные прогоны, holdout_prevented у
  правил/уроков с `created_by` агента.
- **Steward view** (Q12): мутации за период по видам (transition/supersede/
  resolve/repair/tool-mutation — из event log по actor); жалобная воронка
  (подано → resolved/rejected, время жизни, SLA-эскалации `dispatch_ages`);
  рецидивы (повторная жалоба на тот же объект после repair); churn (объект
  с ≥2 мутациями за окно); доля авто-мутаций (`actor='system:wolf'`).
- **Experiment readiness** (Q10): доля прогонов с arm, выборки по группам.

## 6. Дашборд и контур доступа Стюарда

### 6.1 Консольный дашборд `wolf dashboard`

- Команда `wolf dashboard` (`src/adapters/cli/commands/dashboard.ts`):
  - композирует buildAnalyticsReport + EffectivenessReport + снапшоты
    (use-case `buildDashboard` — сборка данных, рендер отдельно);
  - по умолчанию рендерит все три секции последовательно в stdout;
  - `--tab health|ledgers|trends` — одна секция; `--json` — машинный вывод
    единого JSON-документа.
- Рендер (D8): Unicode-таблицы (обрезка длинных заголовков под ширину
  терминала), текстовые спарклайны `▁▂▃▄▅▆▇█` для трендов, цветовые статусы
  ok/warn/bad; ноль зависимостей, запись файлов не требуется.
- Три секции:
  1. **Health** (L1): блоки effectiveness с статусами, абсолюты M3, воронка
     текущего периода;
  2. **Ledgers** (L2): таблицы — memory ledger (Q1/Q2), tool ledger (Q3),
     rule ranking (Q4), agent ledger (Q11), top-N (Q8);
  3. **Trends** (L3): спарклайны по снапшотам (Q9), недельная воронка (Q6),
     cache-hit ratio (Q7), experiment readiness (Q10), активность Стюарда и
     жалобная воронка (Q12).

### 6.2 Контур Стюарда: `wolf analytics` + MCP-инструмент

Стюард оптимизирует память (архивация мёртвых, пересмотр тихих правил,
починка тулов) — ему нужны не «картинки», а выборки с фильтрами, машинно
читаемые. Одна CLI-команда с обзорами + зеркалирование в MCP (Стюард —
агент, работает через `mr-wolf_*`; прецедент регистрации: `insights` в
`registerMemoryTools` / `mcp-schemas.ts`):

| Вызов                                                                 | Ответ                                                                | Действие Стюарда                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| `wolf analytics --view memory --class dead --json`                     | DEAD-объекты: id, тип, возраст, last_used, счётчики                   | кандидаты на archive                  |
| `wolf analytics --view memory --class sleeper [--top N]`               | редко используемые                                                    | пересмотр формулировок/триггеров      |
| `wolf analytics --view memory [--type <тип>] [--top N]`                | полный ledger                                                         | общий осмотр                          |
| `wolf analytics --view rules [--silent]`                               | ranking по holdout_prevented; с `--silent` — только молчащие          | суперсид/переформулировка правил      |
| `wolf analytics --view tools [--origin script\|native] [--top N]`     | tool ledger: usage, error rate, lifecycle (script); атрибуции (native); promotion-кандидаты | expose/register/починка/удаление      |
| `wolf analytics --view funnel [--weeks N]`                             | конверсия по неделям                                                  | локализация разрыва воронки           |
| `wolf analytics --view outliers [--top N]`                             | самые дорогие прогоны                                                 | приоритет оптимизации                 |
| `wolf analytics --view agents [--agent <имя>] [--top N]`              | agent ledger: объём, стоимость, ошибки, жалобы, достижения                   | коучинг агентов, ротация ролей        |
| `wolf analytics --view steward [--weeks N]`                           | мутации Стюарда, жалобная воронка, SLA, рецидивы, churn                      | настройка контуров ремонта/жалоб      |
| `wolf analytics --view readiness`                                      | experiment readiness                                                  | готовность к сравнительным методикам  |

Общие флаги: `--json` (машинный вывод, дефолт для агентского потребления),
`--top N` (лимит строк, дефолт 20). Реестр действий (archive/supersede) —
за Стюардом по governance-правилам: analytics отдаёт данные, не решения.

MCP-инструмент `analytics` повторяет CLI-схему (view/class/type/top) и
возвращает тот же JSON, что `--json`; рендер в терминал — только CLI.

## 7. Не строим (границы)

Движок экспериментов и golden-task runner (примитивов D5 достаточно для
будущих методик); серверный дашборд, chart-зависимости и HTML-витрина
(отложена опциональным флагом, D8); файловый трекер мутаций скиллов (D10);
LLM-суммаризации отчётов; новые события сбора (всё уже пишется — M4/M5
только агрегируют).

## 8. Тестирование и приёмка

Проверка: `npm run check` (vitest + tsc + lint). Юнит-тесты на чистые
агрегации (lifecycle-классификация, воронка, дельты снапшотов, pricing);
e2e на CLI: run→логи→dashboard. Критерии приёмки (проверяются по отчёту
исполнителя):

1. `wolf run` с флагами `--experiment/--arm/--task-id` пишет в run-log И
   run-сигнал duration_ms, raw-токены и экспериментальные поля; без флагов —
   формат записей совместим со старым (старый run-log читается).
2. `wolf effectiveness --snapshot` аппендит снапшот; повторный вызов печатает
   дельту к последнему снапшоту.
3. `wolf effectiveness` содержит блок абсолютов (суммы за период, по моделям,
   cost-per-success); с pricing — $-поля, без — их нет.
4. Команда `wolf analytics` возвращает по `--view memory` memory ledger
   с per-object следом и lifecycle-классификацией; garbage ratio сходится
   с длиной списка DEAD; фильтры `--class/--type/--top` и `--json` работают.
5. Tool ledger разделяет `origin` script/model-native; promotion-кандидаты
   (candidate + usage ≥ порога; частое native-имя без регистрации) определяются
   согласно D11.
6. `--view agents` отдаёт per-agent объём/ошибки/жалобы, сходящиеся с
   run- и complaint-сигналами; `--view steward` — воронку жалоб и мутации,
   сходящиеся с event log.
7. `wolf dashboard` рендерит три секции в stdout (Unicode-таблицы,
   спарклайны), `--tab` показывает одну секцию, `--json` валиден; записи
   файлов нет.
8. MCP-инструмент `analytics` зарегистрирован и возвращает тот же JSON,
   что `wolf analytics --json`.
9. `npm run check` зелёный.

## 9. Open questions

Нет — пороги lifecycle фиксируются дефолтами 14 дней / 3 использования с
конфигурированием (D7).
