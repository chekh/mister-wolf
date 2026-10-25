---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — отчёт реализации фазы 2 (T7–T11)
status: complete
created: 2026-10-25
task: wave-2-20-0-impl-f2
thread: mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7
branch: dev/wave-2-20-0-upgrade-intentions
baseline: bb4f560
head: см. `git log` (цикл 1 — `e734a98`, цикл 2 — коммит исправлений)
mode: FULL (утверждённый plan.md, Ф2)
---

# Ф2 — решения владельца: отчёт реализации (T7–T11)

RESULT: **DONE** (контракты design §4.7–§4.13/§4.18 реализованы, гейт
зелёный, независимое ревью 2 — `APPROVED`, 0 critical / 0 major / 3 minor;
процессные отклонения — «Отклонения» п.1–3, диспетчеризация воркеров
недоступна → линейное исполнение, см. FRICTION).

## Metadata

- task_id: `wave-2-20-0-impl-f2`; входы: `plan.md` (approved), `design.md`
  (approved), `test-plan.md`, `phase4-review-f1.md`, `phase4-rereview-f1.md`.
- Диапазон: `bb4f560..HEAD` — 5 задач (6 коммитов) + цикл исправлений 1 → 2
  (`be28fbf`, `a179bbf`) + финальный docs-коммит; полный отчёт ревью 1 —
  `phase4-rereview-f2.txt`, ревью 2 — `phase4-rereview-f2-cycle2.txt`.
- Методики: wolf-execute (исполнение линейное — см. FRICTION), TDD
  (RED/GREEN зафиксированы), verification-before-completion (гейт ниже).
- Коммит-гигиена: каждый коммит прошёл свои точечные тесты и `npx tsc --noEmit`.
  `db40309` (Ф1, known-red) остаётся `git bisect: skip` — история не переписана.

## Summary

Реализованы пять задач Ф2 строго последовательно на общих файлах
(`decisions.ts` + `memory-upgrade.ts`):

| Задача | Что сделано                                                                                                                                                                                                                                                                                                                                                                                                                        | Коммит    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| T7     | `collectDecisions` (read-only, нумерация реестр → карта → AGENTS.md, `diverged` по `owner_skill`), матрица §4.8 «глагол × класс», двухфазная валидация, `applyResolutions` (take/keep/protect/pin, бэкап §4.12, свидетель `{hash, origin, base}`), `--resolve` в CLI, диспетчеризация §4.18 (`--check` > `--here`, `--resolve` до npm-фазы), m-1 (одна строка `faces:`), m-3 (`kind` из `map.files`), `renderFreshFile(AGENTS.md)` | `8d1a2a3` |
| T8     | `line-diff.ts` (LCS, лимиты 4000/200, хунки с контекстом, CRLF-нормализация, детерминизм), `--show <file\|N>` read-only (protect, обе версии, diff, подсказка `=take`; вне карты — `base: n/a`, без `=take`), `resolveShowTarget`                                                                                                                                                                                                  | `1806c60` |
| T9     | `--review`: TTY-цикл `[n/m]` с diff ≤ 40 строк, клавиши `t/k/p/v/s` + `a` («ко всем похожим»: вопрос о глаголе, перечень до применения) + `q`, EOF завершает; non-TTY — нумерованный список + готовая команда `--resolve`, exit 2, ни байта записей; `diverged` — секция `steward zone`, держит exit 2 и не адресуется                                                                                                             | `9a168bb` |
| T10    | Правило 6′ §4.3 включается проходом (`--yes`) в парке и `--here`: mutated → `backupLocalFile` → эталон → свидетель; дайджест §4.12 называет файл и путь бэкапа (`took base` / `removed`), protect/pin/kept не бэкапируются; `hint: … run wolf upgrade --review` в TTY без `--yes`                                                                                                                                                  | `b32c5ff` |
| T11    | `wolf.upgrade/1` и `wolf.upgrade.check/1`: единственный JSON в stdout, фаза 1 молчит, argv ребёнка несёт `--json` (`upgrade-projects --json`), npm-сбой → документ `exit 1` с `error`; `mode` resolve/show/here печатают свой документ и до npm-фазы не доходят; `decisions[].n` из `collectDecisions` (паритет с non-TTY текстом), `diverged`/`protections` — из тех же данных; `--review --json` → ошибка                        | `55737b6` |
| —      | Регенерация `docs/reference/cli.md` (генератор) + отметки T7–T11 в `plan.md`; help без `(default: [])`                                                                                                                                                                                                                                                                                                                             | `f42af98` |

## Changes (файлы)

- `src/app/use-cases/decisions.ts` (новый, ~760 строк): реестр, разбор/валидация
  `--resolve`, применение, типы JSON-схем §4.13, `similarTargets`,
  `resolveShowTarget`.
- `src/domain/line-diff.ts` (новый): LCS-diff с лимитами и хунками.
- `src/adapters/cli/commands/memory-upgrade.ts`: диспетчеризация §4.18 (единая
  точка), `--resolve/--show/--review/--json`, документы §4.13, argv/re-exec,
  дайджест бэкапов в `--here`.
- `src/app/use-cases/upgrade-projects.ts`: экспорт `planOf`/`ProjectPlan`/
  `PlanStatus`; m-1/m-3; `takeMutated` в шаг; `backupDigestLines` (единственная
  реализация формата дайджеста); structured `projects`/`plan` для JSON.
- `src/app/use-cases/project-step.ts`: `ProjectStepOpts.takeMutated`, хук бэкапа
  собирается рядом с `backupLocalFile` (второго формата нет).
- `src/adapters/render/opencode/opencode-renderer.ts`:
  `renderFreshFile('AGENTS.md')` (эталон цели `agents_md`).
- `src/adapters/cli/commands/upgrade-projects.ts`: опция `--json`, документ
  ребёнка без баннера/человеческих строк, без интерактивных вопросов.
- Тесты: новые `tests/unit/use-cases/decisions.test.ts`,
  `tests/unit/domain/line-diff.test.ts`; расширены
  `tests/unit/adapters/commands/memory-upgrade.here.test.ts`,
  `memory-upgrade.check.test.ts`, `upgrade-projects.test.ts` (CLI),
  `tests/unit/use-cases/upgrade-projects.test.ts`, `sync-base-set.test.ts`
  (pass-through остался), `tests/integration/upgrade-here.test.ts`,
  `upgrade-park.test.ts`, `tests/unit/adapters/render/opencode-renderer.test.ts`.
- `docs/reference/cli.md` — **сгенерирован** (`node scripts/generate-cli-reference.mjs`),
  не правился вручную; T15 пересоберёт через `npm run docs:build`.

## Task Decomposition (классификация ДО исполнения)

| Задача | Класс (playbook) | Признаки                                                                | Исполнитель по плану | Факт                |
| ------ | ---------------- | ----------------------------------------------------------------------- | -------------------- | ------------------- |
| T7     | COMPLEX          | новый модуль + общий CLI-файл + матрица/два режима + риск потери данных | worker-implementer   | lead (см. FRICTION) |
| T8     | MEDIUM           | 2 файла кода + тесты, новый алгоритм с лимитами                         | worker-implementer   | lead                |
| T9     | COMPLEX          | интерактивный цикл + IO-шов + общий файл                                | worker-implementer   | lead                |
| T10    | MEDIUM           | 5 файлов (проброс режима + дайджест)                                    | worker-implementer   | lead                |
| T11    | COMPLEX          | 4 файла + сквозной контракт argv/re-exec + две JSON-схемы               | worker-implementer   | lead                |

## Workers Used

Ни одного. **FRICTION (системная причина):** диспетчеризация воркеров
недоступна в этой сессии — `subagent` отвечает
`Subagent depth limit reached (1)`: исполнитель L1 запущен как субагент, а
`experimental.subagent_depth` в конфигурации = 1, поэтому `worker-*` спавнить
нельзя. Роль не расширялась самовольно: включён разрешённый playbook'ом
линейный маршрут `wolf-execute` («диспетчеризация недоступна или не нужна»),
тест-дисциплина TDD и обязательный гейт сохранены. Рекомендация владельцу
инфраструктуры: `experimental.subagent_depth: 2` (L1 должен спавнить L2) —
иначе каждая фаза FULL выполняется лидом вручную и лимит воркеров не
работает.

## Validation Results (EVIDENCE)

| #   | Claim / AC                              | Команда / процедура                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | cwd | revision             | exit / результат                                  |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------- | ------------------------------------------------- |
| E1  | T7 green                                | `npx vitest run tests/unit/use-cases/decisions.test.ts tests/integration/upgrade-here.test.ts tests/integration/upgrade-park.test.ts tests/unit/adapters/commands/memory-upgrade.here.test.ts tests/unit/use-cases/upgrade-projects.test.ts tests/unit/adapters/render/opencode-renderer.test.ts`                                                                                                                                                                                                                                                                               | wt  | `8d1a2a3`            | exit 0, 6 файлов / **106 passed**                 |
| E2  | T8 green                                | `npx vitest run tests/unit/domain/line-diff.test.ts tests/unit/use-cases/decisions.test.ts tests/integration/upgrade-here.test.ts tests/integration/upgrade-park.test.ts tests/unit/adapters/commands/memory-upgrade.here.test.ts`                                                                                                                                                                                                                                                                                                                                              | wt  | `1806c60`            | exit 0, 5 файлов / **52 passed**                  |
| E3  | T9 green                                | `npx vitest run tests/unit/use-cases/decisions.test.ts tests/unit/domain/line-diff.test.ts tests/unit/adapters/commands/memory-upgrade.here.test.ts tests/integration/upgrade-here.test.ts tests/integration/upgrade-park.test.ts`                                                                                                                                                                                                                                                                                                                                              | wt  | `9a168bb`            | exit 0, 5 файлов / **58 passed**                  |
| E4  | T10 green                               | `npx vitest run tests/unit/use-cases/upgrade-projects.test.ts tests/unit/use-cases/decisions.test.ts tests/unit/use-cases/sync-base-set.test.ts tests/unit/adapters/commands/upgrade-projects.test.ts tests/unit/adapters/render/opencode-renderer.test.ts tests/integration/upgrade-here.test.ts tests/integration/upgrade-park.test.ts tests/integration/project-step.test.ts`                                                                                                                                                                                                | wt  | `b32c5ff`            | exit 0, 8 файлов / **134 passed**                 |
| E5  | T11 green                               | `npx vitest run tests/unit/adapters/commands/memory-upgrade.check.test.ts tests/unit/adapters/commands/upgrade-projects.test.ts tests/unit/adapters/commands/memory-upgrade.here.test.ts tests/unit/use-cases/decisions.test.ts tests/unit/domain/line-diff.test.ts tests/unit/use-cases/upgrade-projects.test.ts tests/unit/use-cases/sync-base-set.test.ts tests/integration/upgrade-here.test.ts tests/integration/upgrade-park.test.ts tests/integration/upgrade-check.test.ts tests/integration/project-step.test.ts tests/unit/adapters/render/opencode-renderer.test.ts` | wt  | `55737b6`            | exit 0, 12 файлов / **180 passed**                |
| E6  | Типы на каждом коммите                  | `npx tsc --noEmit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | wt  | каждый из 6 коммитов | exit 0 (`TypeScript: No errors found`)            |
| E7  | Формат                                  | `npx prettier --check <изменённые файлы>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | wt  | `f42af98`            | exit 0                                            |
| E8  | Полный гейт                             | `npm run check` (english-surface → format:check → tsc → build → vitest)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | wt  | `f42af98`            | см. «Гейт» ниже (свежий прогон после правки help) |
| E9  | Паритет text↔json                       | park-тест R11-1/R11-2: номера non-TTY `--review` = `decisions[].n`, два прогона `--json` байт-идентичны; `exit` документа = `process.exitCode`                                                                                                                                                                                                                                                                                                                                                                                                                                  | wt  | `55737b6`            | exit 0, 10 тестов `upgrade-park`                  |
| E10 | keep идемпотентен сквозным тестом       | `decisions.test` R06-5/N02-2 + `upgrade-park` R06-5: `--resolve …=keep` → полный проход → файл байт-в-байт, `kept`, exit 0; правка → `mutated`                                                                                                                                                                                                                                                                                                                                                                                                                                  | wt  | `8d1a2a3`            | exit 0                                            |
| E11 | Ни одной перезаписи/удаления без бэкапа | `take`/`--yes`/правило 7 — только после `backupLocalFile` (N05-1/2, R10-1/3/5); сбой бэкапа отменяет запись (файл и свидетель байт-в-байт)                                                                                                                                                                                                                                                                                                                                                                                                                                      | wt  | `8d1a2a3`, `b32c5ff` | exit 0                                            |
| E12 | `--check` read-only                     | `inspectBaseSet`/`listProtections` не пишут; снапшот mtime+sha256 в `opencode-renderer.test` и `upgrade-check` не изменён                                                                                                                                                                                                                                                                                                                                                                                                                                                       | wt  | `55737b6`            | exit 0                                            |
| E13 | Неизвестная цель — без записей          | `planResolutions` собирает все ошибки до записи (R06-3, дубли R06-7); снапшот не меняется                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | wt  | `8d1a2a3`            | exit 0                                            |
| E14 | Рабочее дерево                          | `git status --short`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | wt  | `f42af98`            | только pre-existing `.opencode/skills/**`         |

## Гейт

- `npx tsc --noEmit` — exit 0 на каждом коммите (E6).
- `npm run check` — финальный прогон на дереве после цикла исправлений 1 → 2:
  **exit 0, 214 файлов / 1861 passed**. Предыдущий прогон на дереве после `ea2df6a` (collector
  повторяемого `--resolve` без default + перегенерированный справочник). Два
  промежуточных прогона были красными по двум причинам, обе устранены и
  перепроверены: (а) `cli-reference-guard` — справочник отставал от новых
  флагов (регенерация, Отклонения п.7); (б) `previous is not iterable` в
  collector'е `--resolve` после снятия `(default: [])` (`collectResolve`
  получает `previous = undefined`) — исправлено `[...(previous ?? []), value]`,
  тест R06-9 зелёный.
- Живой CLI-смоук на собранном `dist` (E15) — все новые режимы вне тестового
  контура: check-json → review → show → resolve-json → check-json.
- Целевые интеграционные: `tests/integration/upgrade-here.test.ts` (7),
  `upgrade-park.test.ts` (10), `upgrade-check.test.ts` (1) — зелёные.
- `npm run e2e` — не входит в гейт Ф2 (T14, правило проекта «E2E после плана»).

## Отклонения от контракта

1. **Allowlist T7 расширен lead'ом:** `opencode-renderer.ts` + его unit-тест —
   только `renderFreshFile('AGENTS.md')`. Без этого `take`/`--show` на
   AGENTS.md невыполнимы (эталон не возвращался: метод обходил только
   `templateFiles`). Правка — 8 строк + тест, файл уже в scope Ф2 (allowlist T10).
2. **`DecisionRegistry.projects`** — аддитивное поле к §4.7 (имя/корень активных
   проектов). Нужно, чтобы `--resolve/--show <project>/<rel>` и `<rel>`
   работали и на целях без решения (differs/missing/protected/orphan), где
   реестр по определению пуст.
3. **`diverged` — read-only зеркало предиката посева** в `decisions.ts`
   (`templateBody` + `initiator ∈ {seed,migration}` → не diverged). В проекте нет
   read-only инспектора лиц, а `collectDecisions` обязан быть read-only;
   источник истины указан комментарием (`seed-base-playbooks.ts`). Риск дрейфа —
   см. Риски №1.
4. **m-1 закрыт иначе, чем буквально в плане:** единственный владелец строки
   `faces:` — построители секций прохода (источник `report.seed`), из
   `verifyNameLines` дубль удалён; `collectDecisions().diverged` — единственный
   источник для новых режимов (`--resolve/--review/--show`, секция
   `steward zone`). Вызывать `collectDecisions` внутри прохода — второй полный
   скан реестра; видимый результат (одна строка, `match(/faces:/g).length===1`)
   зафиксирован тестом `decisions.test` m-1.
5. **`--here --check` (T11):** read-only через существующий `runUpgradeCheck`
   с реестром из одного проекта (cwd) — `--check` проверяется раньше `--here`,
   записей нет. Полная here-инспекция с секцией Protections остаётся T13.
   JSON-документ `--here --check` уже собирается (`wolf.upgrade.check/1`).
6. **`--yes`-хук бэкапа собирается в `project-step.ts`** (рядом с единственной
   `backupLocalFile`), а не в `decisions.ts`, как сказано в §4.12: вызывающие
   передают `takeMutated: true`; второй копии формата бэкапа нет, `--resolve`
   по-прежнему использует `backupLocalFile` напрямую.
7. **`docs/reference/cli.md` перегенерирован** (генератор, не ручная правка):
   иначе `cli-reference-guard` красный из-за новых флагов. T15 всё равно
   пересоберёт через `npm run docs:build`.
8. **Обновлено ожидание существующего park-теста R01.1:** `--yes` теперь
   забирает mutated (§4.12) — «требует решения» в фикстуре обеспечено
   безштампованным conflict-файлом (его `--yes` не берёт), добавлена проверка
   бэкапа и сохранности правки. Это изменение поведения по контракту T10, не
   ослабление ассертов.
9. **Тест hint/дайджеста добавлен в `tests/unit/use-cases/upgrade-projects.test.ts`**
   (план называл вариант `adapters/commands`); под тестом — тот же модуль
   (`runUpgradeProjects`), формат дайджеста вынесен в единственную
   `backupDigestLines`.
10. **`--json` в фазе 2 печатает `cli.available: null`:** `npm view` выполняет
    только фаза 1; ребёнок значения не получает, а контракт §4.13 допускает
    `null`. Паритет с текстом по `exit`/`n`/путям сохранён.
11. **F1-ревью rr-1/rr-2 не трогались** (вне scope Ф2): `restampAgents` с
    пользовательским frontmatter и допущение «EOL файла = EOL первой строки» —
    остаются известными minor'ами для T14/T15.

## Цикл исправлений 1 → 2 (по `phase4-rereview-f2.txt`)

Независимое ревью 1: `SUMMARY: 0 critical / 3 major / 8 minor`,
`VERDICT: CHANGES_REQUIRED`. Узкий цикл исправлений (без пересмотра архитектуры):

| Находка                                                                                    | Решение                                                                                                                                                                                  | Тест                                                                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **M-1** `--json` pass: `local-newer`/`linked-refusal` — пустой stdout, exit-паритет сломан | `phase1JsonDoc` (exit/available/error): local-newer → документ `exit 0` с `cli.available`; linked-refusal → документ `exit 1` + `error` + `rethrow` (как npm-сбой)                       | `upgrade-projects.test.ts` «M-1: --json local-newer … linked-refusal»                      |
| **M-2** `--json --resolve`: бэкапы не попадают в документ                                  | аддитивное top-level поле `backups` в `UpgradeJson` (минор-совместимо, §4.13): заполняется в resolve (пути бэкапов), pass (плоский список по проектам), here; `--show` — пусто           | `upgrade-here.test.ts` «M-2: --json --resolve …=take …» (путь из JSON существует на диске) |
| **M-3** AGENTS.md со сломанными onboarding-маркерами нумеровался как решение               | `collectDecisions`: `foreign` с `detail` — наблюдение, не решение (§4.5 «needs-decision НЕ выставляется»)                                                                                | `decisions.test.ts` «M-3: сломанные onboarding-маркеры»                                    |
| m-1 пустой/неизвестный ввод в TTY-`--review` = молчаливый skip                             | цикл переспрашивает экран до валидной клавиши/`q`/EOF (§4.9)                                                                                                                             | `memory-upgrade.here.test.ts` «R07-1/m-1: переспрос»                                       |
| m-2 знаки diff в review инвертированы                                                      | diff строится `lineDiff(эталон, локальный)` — `−` эталон, `+` локальные (§4.9)                                                                                                           | тот же тест (строки `-# A base` / `+# A local`)                                            |
| m-3 «… ещё N строк» — RU в CLI                                                             | `… N more lines` (EN-поверхность)                                                                                                                                                        | `line-diff.test.ts`                                                                        |
| m-4 `skippedProjects` нигде не печатались                                                  | `skippedProjectLines`: `skipped projects: N` + `[reason]` в `--resolve` и non-TTY `--review`                                                                                             | покрыто отчётом; отдельный тест не добавлялся (строки видны в смоуке)                      |
| m-5 `--check --review` молча брал check                                                    | несовместимая пара → error exit 1 (§4.18, по аналогии с `--check --show`)                                                                                                                | `memory-upgrade.here.test.ts` route-тест                                                   |
| m-6 текст отказа `keep` на conflict                                                        | `conflict stays: use protect (hold) or take (base)` (design §4.8), orphan-строка не изменена                                                                                             | `decisions.test.ts` R06-6                                                                  |
| m-7 deprecated-mutated в реестре vs report-only в `--check`                                | оставлено как есть: реестр следует поведению прохода (§4.7: mutated — решение), `--check`-классификация deprecated — поведение T6/REQ-11; расхождение поверхностей зафиксировано для T14 | —                                                                                          |
| m-8 `take` на защищённом без бэкапа, если отличие только в строке `protect`                | отклонено: design §4.8 прямо исключает снятие ключа из NFR-05 («снятие ключа — намеренное действие владельца»); бэкап контента при реальном отличии есть                                 | R06-4                                                                                      |

После исправлений: 185 точечных тестов зелёные (12 файлов), `tsc` exit 0,
`npm run check` — финальный прогон ниже по тексту (счётчики обновлены).

### Цикл 2 (повторное ревью)

`phase4-rereview-f2-cycle2.txt`: **`VERDICT: APPROVED`, 0 critical / 0 major /
3 minor**. Все три major цикла 1 закрыты фактически (независимый прогон
`npm run check`: 214 файлов / 1860 тестов; M-1/M-2/M-3 — с чувствительными
тестами, регрессий нет). Три minor цикла 2 закрыты в финальном коммите:
метаданные отчёта приведены к `bb4f560..HEAD`; добавлен тест
`skippedProjectLines` (m-4 цикла 1) в `--resolve` и non-TTY `--review`; ветка
`a` → «back» больше не пропускает текущую цель (`i--` и переспрос).
m-7/m-8 остаются задокументированными отклонениями (оба опираются на design
§4.7/§4.8 и приняты ревью 2).

## Риски

1. `diverged`-предикат продублирован формулой (не общим кодом) — при изменении
   правил посева лиц реестр решений может разойтись с проходом. Покрыто unit-тестом
   (равенство тел, `seed/migration`, отсутствие лица).
2. `--json.protections`/`diverged` в документе ребёнка считаются установленным
   CLI (реестр + реальные шаблоны), а факты прохода — фикстурной картой в тестах;
   продуктовый путь един (installed CLI), но тестовый контур смешивает шаблоны.
3. `--resolve/--show/--review` в парке сканируют все активные проекты
   (`inspectBaseSet` + лица + защиты) — read-only, но O(парка); на больших
   парках это заметная задержка. Оптимизация (кэш/ленивый обход) — вне волны.
4. `--here --check` пока идёт через парковую сводку (один проект), а не через
   `upgradeCheckHereAction`: вывод отличается от §4.11 (нет секции Protections) —
   закрывает T13; инвариант read-only соблюдён.
5. `protect` для AGENTS.md отклоняется безусловно (даже при ручном frontmatter)
   — решение L0; `--show` для AGENTS.md может показать `protect: none` у файла,
   который пользователь считал защищённым.
6. Остаточный риск провайдера: `protect` в модель-запрос не попадает (спайк
   R-01, v2.1.4); regression-guard — T14.

## FRICTION

1. **`subagent` depth limit 1** — воркеры `worker-*` недоступны L1 (см.
   «Workers Used»); линейное исполнение по `wolf-execute` с сохранением TDD и
   гейтов. Системная проблема конфигурации, не тула задачи.
2. Мелочь процесса: правки options/help делались текстовыми заменами, и после
   prettier-переформатирования два якоря (`.option('--resolve …')`,
   `.option('--show …')`) перестали совпадать — флаги `--show/--review/--json`
   не попали в команду до финальной проверки `--json --check` (поймано тестом
   R11-5). Урок: после prettier — проверять фактический help командой
   `node dist/bootstrap/cli.js upgrade --help` (сделано на финальном дереве:
   все флаги на месте, справочник сгенерирован).

## COMPLAINT

Нет. Триггеры W1–W4 не срабатывали: предписания playbook'а и брифа не
противоречили друг другу; недоступность диспетчеризации — сбой инструмента
(FRICTION), а не правило. `wolf list --type complaint --status open` → пусто:
`COMPLAINT-TRIAGE: seen 0 → resolved 0 / rejected 0 / escalated 0 / open 0`.

## ACCEPTANCE (по AC приёмки L0)

| AC                                                                                   | Статус       | Evidence                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (1) REQ-06/07/08/10/11 AC покрыты зелёными тестами, включая парковый режим и re-exec | подтверждено | E1–E5, E9; R06-9/R11-4/R11-8 (argv, npm не позван)                                                                                                                  |
| (2) keep идемпотентен сквозным тестом                                                | подтверждено | E10                                                                                                                                                                 |
| (3) ни одной перезаписи/удаления без бэкапа                                          | подтверждено | E11 (сбой бэкапа → файл и свидетель целы)                                                                                                                           |
| (4) `--check` read-only подтверждён снапшотом                                        | подтверждено | E12 (T13 расширит на Protections/`--here`)                                                                                                                          |
| (5) нумерация детерминирована и совпадает text↔json                                  | подтверждено | E9 (два прогона байт-идентичны; `n` = текст review)                                                                                                                 |
| (6) `npm run check` зелёный, коммиты зелёные                                         | подтверждено | E6, E8, «Гейт»                                                                                                                                                      |
| (7) независимое ревью без critical/major                                             | подтверждено | цикл 1 — `phase4-rereview-f2.txt` (0/3/8, major исправлены); цикл 2 — `phase4-rereview-f2-cycle2.txt`: **APPROVED, 0 critical / 0 major / 3 minor** (minor закрыты) |
| (8) план и отчёт отражают факт                                                       | подтверждено | `plan.md` T7–T11 `[x]` + коммиты; этот отчёт                                                                                                                        |
