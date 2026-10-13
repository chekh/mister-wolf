# Отчёт: планирование волны 2.17 (wave-2-17-plan)

## Metadata

- task_id: wave-2-17-plan
- Тред: `mem_20261012_2_17_litsa_artefakt_versii_mutatsiya_vol_b69113`
- Роль: executor-lead (L1); дата: 2026-10-13
- Вход: requirements.md approved (CR-2026-10-13-01) + design.md r3 APPROVED +
  решения владельца `mem_20261013_vladelets_variant_b_po_req_05_nfr_01_pla_cca07b`
- Статус: DONE (планирование; исполнение — после приёмки плана L0)

## Summary

CR-2026-10-13-02 внёс три решения владельца в requirements/design (вариант Б —
правка wolf-router-плагина в волне, MCP v1, визы ADR-3/ADR-6/граница сессии).
План T-01…T-11 с зависимостями и разделом «Документация и сайт» + полный релизный
чек-лист; тест-план покрывает REQ-01…REQ-10/NFR-01…NFR-03. Ревью worker-reviewer:
CHANGES_REQUIRED (1 major + 5 minor) — все 6 findings обработаны. Полный гейт
`npm run check` зелёный (164/1233), doctor по папке чист, english-surface OK.
Коммиты: 5d779af (housekeeping), 651054f (артефакт), + отчёт.

## Changes

- requirements.md: REQ-05 AC2 усилен (граница = новая сессия/чат) + новый AC
  (сессия старше TTL не получает новую версию; новая сессия — актуальную);
  NFR-01 переформулирован (инварианты доставки + измеримый AC переработки
  TTL-теста); §6 — граница зафиксирована владельцем; журнал CR-2026-10-13-02.
- design.md: шапка (вход CR-2026-10-13-02); таблица модулей и список схемных
  изменений — wolf-router «вариант Б»; ADR-4 переформулирован (путь поиска не
  меняется, кэш — вариант Б); §Отказов — механика вариант Б (мемоизация по
  session-id + версионированный кэш head; остаточные случаи №1/№2 устраняются);
  NFR-03 — правки ограничены кэшем доставки; «Решения для визы» — подтверждены
  владельцем, п.4 → вариант Б; таблица трассировки обновлена.
- plan.md: заполнен (T-01…T-11, зависимости, сверка план↔test-plan, релизный
  чек-лист 8 пунктов).
- test-plan.md: заполнен (сценарии по всем REQ/NFR с Given/When/Then, маппинг,
  прогоны, изоляция fixtures/fake-timers).
- housekeeping: docs/dev/INDEX.md (реестр), docs/dev/roadmap/wave-2.17.md
  (вопросы драфта решены, статус requirements approved) — книга природы волны.

## Task Decomposition

| Задача                        | Содержание                                | Зависимости    | Класс          |
| ----------------------------- | ----------------------------------------- | -------------- | -------------- |
| CR-правки requirements/design | три решения владельца, вариант Б          | —              | SIMPLE (лично) |
| plan.md T-01…T-11             | декомпозиция + зависимости + релиз-раздел | CR             | SIMPLE (лично) |
| test-plan.md                  | сценарии REQ/NFR + прогоны                | план           | SIMPLE (лично) |
| ревью                         | worker-reviewer (CLI-fallback)            | план+тест-план | воркер         |

Код не тронут (scope: только docs/) — исполнение после приёмки L0.

## Workers Used

- worker-reviewer (opencode run, FOREGROUND): ревью плана/тест-плана по
  wolf-review. Вердикт CHANGES_REQUIRED; F-01 major (остаточный случай №1 без
  сценария), F-02…F-06 minor (анкер taxonomy.test.ts + осознанная правка «7»→8;
  REQ-04 AC2 вместо AC3; квалификация WOLF_SESSION `opc-`; сценарии
  list/search proposal и scaffold face-id). Все 6 обработаны в plan/test-plan.
- Штатный Task-спавн упал: «Subagent depth limit reached (1)» — не дефект
  agent modes (2.16.3), а глубина вложенности; CLI-fallback сработал. Урок:
  `mem_20261013_spavn_subagenta_iz_executor_lead_padaet_63be9c`.

## Validation Results

- `npm run check` FOREGROUND: OK — english-surface + prettier + lint + build +
  164 test files / 1233 tests passed (~32s).
- `wolf doctor`: по папке 2026-10-12-wave-2-17-faces находок нет (имеющиеся `!` —
  pre-existing в папках 2.16.1/2.16.2/hotfix-2.16.3, вне scope).
- `node scripts/check-english-surface.mjs`: OK (85 files).
- `npx prettier --check` по папке + INDEX + roadmap: OK.
- Рабочее дерево чистое после коммитов.

## Commits

- `5d779af` — housekeeping (INDEX + roadmap wave-2.17, книга природы волны)
- `651054f` — артефакт: CR-2026-10-13-02 + plan.md + test-plan.md
- (этот отчёт — следующий коммит той же папки)

## CR-дельта (CR-2026-10-13-02)

1. REQ-05: +AC «сессия старше TTL», AC2 уточнён границей (новая сессия/чат).
2. NFR-01: переименован/переформулирован — инварианты доставки + измеримый AC
   переработки TTL-теста (`wolf-router-plugin.test.ts:218`).
3. §6: граница «следующего задания» зафиксирована владельцем.
4. MCP v1 подтверждён; визы ADR-3/ADR-6/граница подтверждены (design п.1–5).

## Открытые вопросы / риски

- Приёмка плана и исполнение — за L0/владельцем (исполнение не стартовано).
- T-08 — единственная задача с правкой кода плагина в волне; риск регрессии
  доставки закрыт переработанным TTL-тестом и существующими тестами доставки.
- Doctor-находки чужих папок (2.16.1/2.16.2/hotfix: CR без downstream-отметок и
  пр.) — pre-existing, вне scope, рекомендация отдельным housekeeping.
- Бэклог (вне волны): MCP-обёртки face/propose.

## COMPLAINT-TRIAGE

COMPLAINT-TRIAGE: seen 0 → resolved 0 / rejected 0 / escalated 0 / open 0

## FRICTION

FRICTION: 1× Task-спавн субагента — «Subagent depth limit reached (1)» из
executor-lead-сессии (сама субагент); обошёл через `opencode run --agent
worker-reviewer` FOREGROUND (timeout 900s). Урок записан в память Wolf.
