# Дизайн: P0 — семантическая честность аналитики (verdict задачи, coverage, data-quality)

|               |                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Дата          | 2026-09-04                                                                                                                                                                                          |
| Ревизия       | 1                                                                                                                                                                                                   |
| Статус        | Скоуп утверждён владельцем (диалог 2026-09-04); реализация — wolf-sdd                                                                                                                               |
| Источники     | Принятое ревью аналитики `mem_20260904_prinyato_revyu_analitiki_ot_paneli_aktiv_e49c92` (пункты 1, 2, 5, 8 + scored_task_rate); тред `mem_20260904_dorozhnaya_karta_analitiki_p0_p4_dokazat_ef36dc` |
| Следующий шаг | План + реализация wolf-sdd в worktree → merge в main. Релиз — отдельной командой владельца (v2.5.0, breaking)                                                                                       |

## 1. Проблема

Аналитика v2.3.x называет «успехом» завершение процесса с кодом 0: model могла не
решить задачу, нарушить scope, оставить красные тесты — всё это `outcome: ok`.
Производные показатели (`failures`, `failureRatePct`, `costPerSuccess`) вводят в
заблуждение. Дополнительно: «воронка» смешивает популяции, сигнальный лог не
валидируется схемой, покрытие телеметрией не измеряется.

P0 не строит новой архитектуры (это P1–P3) — он делает существующие числа
семантически честными и готовит контур data-quality.

## 2. Решения

| #   | Решение                                                                                                                                                                                                                                                                                                             | Альтернатива, отклонённая                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D1  | Переименования в отчётах/JSON (breaking, v2.5.0): `successes→completedRuns`, `failures→processFailures`, `failureRatePct→processFailureRatePct`, `costPerSuccess→costPerCompletedRun`; секция `funnel→weeklyActivity` (текст: «Weekly activity», без W→D→T)                                                         | Оставить имена со сносками: честная сноска не заменяет семантику (тезис ревью)                 |
| D2  | Новое сигнальное событие `task_evaluated` (SignalEventName +4-е значение): `detail.verdict: accepted\|rejected\|partial\|inconclusive`, `detail.scorer: human\|deterministic\|llm_judge\|hidden_tests`, `criteria_passed/criteria_total`, `critical_failure: boolean`, связь по `session_id` и/или `detail.task_id` | Автоскоринг hidden-тестами: это P3; P0 — пост-хок человеческий/L0 verdict                      |
| D3  | Писатель вердикта — новая CLI-команда `wolf task-eval --verdict <v> [--scorer <s>] [--session <id>] [--task-id <id>] [--criteria-passed N --criteria-total M] [--critical-failure] [--note <text>]` → `appendSignal`; писатель — L0/человек по итогам приёмки                                                       | Встраивание вердикта в `wolf run` (верdict известен только после приёмки, не в момент запуска) |
| D4  | В аналитике: `accepted` считается ТОЛЬКО из `task_evaluated` с `verdict: accepted`, связка по `session_id` → run-сигналы. `costPerAcceptedTask = sumWeighted(accepted-связанных run) / accepted`; null при отсутствии данных. Agent ledger: колонка `accepted` рядом с `completedRuns`                              | Включать partial: размывает семантику; считать по task_id без сессий: link ненадёжен до P1     |
| D5  | Coverage: `coverage.scoredTaskRatePct = task_evaluated / runs` (+`scored`, `runs`); dashboard/analytics печатают строку `coverage: partial — scored X/Y (Z%)` при <100%; это интерим-прокси (честный знаменатель — P1)                                                                                              | Ждать P1: предупреждение нужно сейчас, чтобы числами не пользовались как полными               |
| D6  | Zod-схема `SignalEventSchema`: обязательные `ts`, `event`; `gen_ai`/`orchestration` — объекты с nullable-полями; неизвестные поля отбрасываются; невалидная строка → счётчик malformed (строка по-прежнему пропускается, но НЕ молча)                                                                               | strict + падение на битой строке: один битый лог не должен ронять аналитику (инвариант Ф20)    |
| D7  | Data-quality в отчёте: `dataQuality.validEventRatePct`, `dataQuality.malformedLines` — в `AnalyticsReport` + строка в dashboard; это первый элемент data-quality панели ревью (п.8)                                                                                                                                 | Полная панель (orphan/duplicate/complete-trace): требует P1-идентичности, рано                 |
| D8  | Переименование поля `funnel` в `AnalyticsReport` на `weeklyActivity` — в том же breaking-релизе; содержимое (бакеты writes/delivers/triggers) не меняется, cohort-воронка — P1/P2 после instrumentации стадий                                                                                                       | Менять содержимое сейчас: стадии eligible/injected/cited требуют P1-событий                    |

## 3. Не делаем (границы P0)

Канонический event log и SQLite-проекция (P1), инструментирование harness/плагина
(P1), handoff/review/acceptance события (P2), стадии памяти retrieved/injected/cited
(P2), matched tool ROI (P3), experiment/campaign сущности (P3), HTML-export (P4).

## 4. Критерии приёмки

1. В выводах `analytics`/`effectiveness`/dashboard и в JSON нет старых имён
   (`successes`, `failures`, `failureRatePct`, `costPerSuccess`, `funnel`) — греп;
   новые имена присутствуют; CHANGELOG `[Unreleased]` содержит breaking-заметку.
2. `wolf task-eval` пишет валидное `task_evaluated`-событие (roundtrip-тест:
   запись → readSignals → zod OK); невалидный verdict/scorer отклоняются.
3. `accepted`/`costPerAcceptedTask` считаются только из accepted-верdict'ов,
   связанных по session_id; при пустых данных — null (unit-тест на фикстурах).
4. Секция называется Weekly activity (текст/dashboard), поле JSON — `weeklyActivity`.
5. `coverage.scoredTaskRatePct` в отчёте; строка `coverage: partial …` в dashboard
   при <100% (тест).
6. Битая строка в `session-metrics.jsonl` инкрементирует `malformedLines`,
   `validEventRatePct` корректен (unit-тест); аналитика не падает.
7. `npm run check` зелёный; все изменения покрыты тестами.

## 5. Open questions

Нет — вилки (писатель вердикта (a), breaking-релиз v2.5.0, интерим-прокси
coverage) утверждены владельцем в диалоге.
