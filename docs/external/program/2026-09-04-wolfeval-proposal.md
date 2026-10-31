# WolfEval — внешнее предложение методики (вход для спеки 2026-09-04)

> Источник: внешний обзор, предоставлен владельцем 2026-09-04. Сохранён как есть,
> без правок. Статус: черновик-предложение; решения по обрезке — в спеке
> docs/superpowers/specs/2026-09-04-wolfeval-v1-design.md

## Рекомендация

Для Mr. Wolf нужна не обычная серия benchmark-задач, а **доказательная методика по тезисам проекта**:

> **Claim-driven randomized longitudinal evaluation** — проверка каждого значимого утверждения Wolf через контролируемые продольные A/B-эксперименты, абляции компонентов, повторные прогоны и объективную проверку конечного состояния.

Условно её можно назвать **WolfEval**.

Главная единица испытания — **не один промпт и не одна сессия, а траектория проекта из нескольких связанных сессий**. Именно на такой дистанции должны проявляться основные свойства Wolf:

- накопление знаний;
- продолжение работы после потери контекста;
- повторное использование решений и инструментов;
- актуализация устаревших знаний;
- работа L0/L1/L2;
- восстановление после сбоев;
- изменение поведения после жалобы;
- отсутствие деградации уже освоенного поведения.

## 1. Что должно доказывать исследование

Главная продуктовая гипотеза:

> При одинаковой базовой модели, инструментах и исходном состоянии проекта Mr. Wolf позволяет завершать больше длительных проектных задач, с большей повторяемостью, меньшей стоимостью успешного результата и меньшим участием человека — без роста критических ошибок и регрессий.

Это существенно лучше гипотез уровня «правило записалось в память» / «playbook был доставлен» — они доказывают, что механизм работает технически, но не доказывают пользу.

## 2. Судьба текущих B1–B3

Сохранить как тесты инфраструктуры (scripts/smoke/, conformance), но не считать доказательством эффективности:

- B1: dry-результаты заданы fixture-NDJSON; в live-прогоне формулировки веток различаются («почини максимально дёшево» vs «найди причину и почини») — смешение эффекта Wolf с эффектом промпта.
- B2: dry-режим помещает факт в ответ Wolf после двух шагов, baseline — после четырёх; тест парсера, не поведения.
- B3: качество ретроспективы не ассертится, PASS/FAIL только про механику.

Разделение: scripts/smoke/ (механика) / scripts/conformance/ (инварианты) / playground-lab/benchmarks/ (поведение моделей) / playground-lab/campaigns/ (системный эффект). Dry-fixtures — E1, не E4.

## 3. Единица эксперимента — проектная кампания

```text
сессия 1 → сохранённый опыт
сессия 2 → повторное использование
сессия 3 → изменение проекта
сессия 4 → конфликт старого и нового знания
сессия 5 → сбой и восстановление
сессия 6 → жалоба и изменение playbook
сессия 7 → проверка переноса на новую задачу
```

Каждая сессия — чистый диалоговый контекст; состояние репо и `.wolf` сохраняется; история разговора не переносится.

## 4. Параллельные ветки, не crossover

Идентичные клоны проекта, параллельно:

- **A. Strong baseline**: та же модель/тулы/README/AGENTS.md, обычный поиск, разрешение создавать документацию и заметки, тот же бюджет. Не «агент без памяти».
- **B. Full Wolf**: память, bootstrap/call/brief, lifecycle/supersede, checkpoints, acceptance, playbooks, L0/L1/L2, Council по trigger policy, Steward, tool registry.
- **C. Абляции**: по одному компоненту, своя пара на тезис (static docs vs memory; memory vs memory+process; single agent vs L0/L1/L2; Council on/off; Steward mutation vs human rule; registry on/off).

## 5. Семьи кампаний WolfEval

- 6.1 Cold start (стек, команды, ограничения + практическая задача; скрытые критерии).
- 6.2 Продолжение работы в новой сессии (обрыв, восстановление цели, без повторной работы).
- 6.3 Перенос знания: exact repeat → near transfer → far transfer (holdout не содержит готового ответа).
- 6.4 Устаревшее знание: правило X → архитектура меняется → Y superseding X → провокация использования X; supersede-цепочка, отказ при недостатке данных.
- 6.5 Шум и нерелевантная память (отрицательный контроль): false retrieval rate, false activation rate, stale knowledge usage, NoiseTax.
- 6.6 L0/L1/L2 и независимая приёмка (acceptance criteria, scope, дублирование работы).
- 6.7 Council на развилках с последствиями (NetCouncilValue = ΔQuality − λ·ΔCost).
- 6.8 Накопление инструментов (создание → reuse → смена контракта → update/deprecated; ToolROI).
- 6.9 Self-learning и антидеградация: ветки A (без исправления) / B (человек пишет правило) / C (complaint → Steward → candidate → holdout → activation); LearningGain, TransferGain, Regression; holdout скрыт от Стюарда.

## 7. Метрики

Первичные (4): Campaign Success Rate; Cost per Successful Campaign (CPSC); Human Minutes per Success; Critical Failure Rate (ложная приёмка, повреждение, superseded-правило, scope violation, потеря данных — не усреднять).

Вторичные: first-pass success; pass^k (τ-bench); wall-clock; токены; tool calls; recovery rate; stale-memory error rate; handoff loss; duplicate work; false acceptance rate; tool reuse; learning transfer; regression rate; time-to-payback.

Оценка — по приоритету: скрытые тесты → состояние файлов/базы → exit codes → инварианты памяти → хэши артефактов → обязательные поля acceptance package → детерминированная рубрика → человек → LLM-as-judge. Утверждение агента не доказательство.

## 9. Статистика

A/A до A/B (проверка reset, измерителя, порядка, нестабильности провайдера). Pilot: 6 семей × 4 кампании × 2 ветки × 3 запуска = 144. Затем confirmatory: заморозка заданий/scorers, новые holdout-варианты, ≥5 запусков, публикация всех прогонов. Bootstrap по кампаниям (кластеры), не по ранам.

## 10. Два режима бюджета

Equal-budget (одинаковые пределы) vs Natural-operation (своя норма, всё измеряется). PaybackSession = min t: CumulativeValue_Wolf(t) > CumulativeValue_Baseline(t).

## 11. Гейт E4

Гипотеза до запуска; control/treatment определены; strong baseline; промпты идентичны вне исследуемого механизма; хэши task set и scorers; unseen holdout; повторные live-прогоны; проверка конечным состоянием; сырые traces и расходы; CI; отрицательные контроли; protected regression suite; границы доказательства; воспроизводимость.

## 12. Тип claim → тип проверки

Детерминированный conformance-тест для «L0 не вызывает L2 напрямую»; schema-тест для полей acceptance package; integration для доставки playbook; repeated behavioral benchmark для «агент следует playbook»; longitudinal A/B для «память уменьшает стоимость повторной задачи»; ablation для L0/L1/L2; fork benchmark для Council; pre/post holdout для жалобы; protected regression для самообучения; cumulative ROI для инструментов.

## 13. Организация в репозитории

```text
playground-lab/
  benchmarks/wolfeval-v1/
    protocol.md, claims.yaml, arms.yaml, task-families/,
    campaign-instances/, hidden-oracles/, protected-suite/,
    run-configs/, analysis/, reports/
  measurements/WEV-001/
    runs.jsonl, traces/, costs.csv, scorer-results.jsonl, environment-lock.json
  experiments/2026-09-xx-wev-001-core-value.md
```

Карточка до запуска: experiment_id, claim_ids, hypothesis, primary_metrics, safety_metrics, arms, minimum_practical_effect, runs_per_campaign, stopping_rule, task_set_hash, scorer_hash. После старта hypothesis/metrics/stopping rule не редактируются.

## 14. Порядок

WEV-001 «накопительный эффект» (cold start → задача → новая сессия → связанная задача → смена правила → конфликт знания → обрыв → восстановление → повторяющаяся операция/tool). Ветки: strong baseline vs full Wolf без автоматической self-learning mutation. Затем WEV-002 (complaint-driven learning: no mutation / human rule / Steward rule; near+far holdout, negative controls, delayed retention, protected regression, rollback).

Центральный вопрос: «Создал ли Wolf за несколько сессий больше принятой человеком работы на единицу денег и внимания, чем тот же агент без Wolf, и сохранил ли выигрыш после изменений, сбоев и накопления знаний?»
