---
slug: wave-2-20-0-upgrade-intentions
title: wave-2-20-0-upgrade-intentions — отчёт Ф1 (ядро, T1–T6)
status: complete
created: 2026-10-25
task: wave-2-20-0-impl-f1
thread: mem_20261024_upgrade_ux_namereniya_vladeltsa_i_tikhiy_e6daf7
branch: dev/wave-2-20-0-upgrade-intentions
baseline: 0574e7c
---

# Ф1 — ядро (T1–T6): отчёт исполнения

## Metadata

- task_id: `wave-2-20-0-impl-f1`
- RESULT: **DONE** (гейт фазы зелёный; см. ACCEPTANCE ниже — решение за L0)
- ветка: `dev/wave-2-20-0-upgrade-intentions`, база-код `0574e7c` (v2.19.0), старт ветки `6b7682e`
- коммиты фазы: `fcbb36e`, `db40309`, `5d58de6`, `55c8cbb`, `a6a3649`, `94e1c59`
- рабочее дерево: чистое, кроме pre-existing `.opencode/skills/**` (plugin-inject, не трогал и не коммитил)

## Summary

Ф1 закрыта: ключ `protect` (грамматика/нормализация/вставка/снятие) → свидетель
`{hash, origin, base}` + атомарная запись → единый порядок правил §4.3 в трёх режимах
(protect / исцеление штамп-дрейфа / kept / take-on-mutated / бэкап правила 7) и порт
целиком → версионированный onboarding-блок v3 с agnostic-детектом → коды
`protected`/`kept` и protect/kept у orphan → имена файлов в выводе прохода и `--check`.
`npm run check` зелёный: 212 файлов / 1780 тестов, exit 0.

## Task Decomposition (классификация ДО исполнения)

| Задача | Объём по контракту                                                      | Класс по таблице playbook | Плановый исполнитель | Факт             |
| ------ | ----------------------------------------------------------------------- | ------------------------- | -------------------- | ---------------- |
| T1     | `protect-key.ts` + unit-тест (≈300 строк, 2 файла, без архитектуры)     | SIMPLE                    | сам                  | сам              |
| T2     | `sync-state.ts` + unit-тест (≈200 строк, 2 файла)                       | SIMPLE                    | сам                  | сам              |
| T3     | рендерер + порт + stamp + 3 файла тестов (≈600 строк, 6 файлов)         | COMPLEX                   | worker-implementer   | сам (FRICTION-1) |
| T4     | AGENTS-блок в рендерере + шаблон + 2 интеграционных теста (4 файла)     | MEDIUM                    | worker-implementer   | сам (FRICTION-1) |
| T5     | verify-карта + project-step + 2 файла тестов (4 файла)                  | MEDIUM                    | worker-implementer   | сам (FRICTION-1) |
| T6     | `memory-upgrade.ts` + `upgrade-projects.ts` + 4 файла тестов (6 файлов) | MEDIUM                    | worker-implementer   | сам (FRICTION-1) |

Классификация сделана до первой правки; T1/T2 изначально планировались параллельно,
T3 — после обоих, T4/T5 — параллельно после T3, T6 — после T5 (граф plan.md §«Фазы и
зависимости»). Диспетчеризация оказалась недоступной (см. FRICTION-1), поэтому
исполнение велось последовательно по тому же графу зависимостей с сохранением
TDD-цикла на каждую задачу.

**Расхождение брифа и плана (не блокирует):** бриф называет T6 задачей Ф1, в
`plan.md` T6 записан в разделе «Ф2 — решения владельца». Выполнял по брифу (T1…T6);
чекбокс T6 отмечен в его разделе плана.

## Changes

| T   | Что сделано                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Коммит    | Тесты                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| T1  | `src/domain/protect-key.ts` (новый): `parseProtect`, `normalizeManaged`, `insertProtect` (последняя строка блока, EOL закрывающего `---`, структурная проверка (а)/(б)/(в) до возврата, отказ `no-yaml-frontmatter`/`frontmatter-unparsable`), `removeProtect`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `fcbb36e` | `tests/unit/domain/protect-key.test.ts` — 35 ✓                                                                 |
| T2  | `sync-state.ts`: `SyncEntry {hash, origin:'render'\|'keep', base}`, нормализация легаси-строк при чтении (`base` из штампа файла или `0.0.0`, без перезаписи файла), `saveSyncState` → tmp+rename, без `*.tmp` после записи                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `db40309` | `tests/unit/adapters/render/sync-state.test.ts` — 11 ✓ (легаси, round-trip, атомарность, key-only потребители) |
| T3  | `stamp.ts`: `stripStampLines` — единственный регекс (использует и `insertStamp`); порт целиком (`RenderOutcome.protected/protect/kept/backup`, `InspectOutcome.*`, `InspectAction += protected/kept`, `BackupHook`, `SyncBaseSetOptions.takeMutated`, `ProtectEntry`, `listProtections`, `renderFreshFile`); рендерер: единый `classify` (missing → protect → unstamped → identical → heal → mutated → 6.5 kept → rewrite), исцеление `updated` + reason, правило 6′ с бэкапом, правило 7 с бэкапом при наличии хука, `listProtections` (включая вне-карты, `behind:null`), `renderFreshFile`; AGENTS.md whole-file получил правила 6/6.5/7 **и** take/бэкап 6′/7 (F1-ревью m-2: `opts.takeMutated` пробрасывается в `syncAgentsMd`, правило 7 бэкапит при отсутствии свидетеля) | `5d58de6` | renderer 32 ✓, stamp 8 ✓, sync-base-set 6 ✓, sync-state 11 ✓                                                   |
| T4  | `templates/base/AGENTS.md` → маркер `v3` + строка про `protect`/`--review`/`--resolve`; рендерер: `findOnboardingBlock` (любая версия, `broken`), `templateBlock`, `syncAgentsBlock` (замена только `[start,end)`, текст выше/ниже байт-в-байт, сломанные маркеры → `foreign`/skipped с причиной), литерал `v2` удалён — детект по префиксу; append-ветка только в `init`; protect-гейта в блочной ветке нет                                                                                                                                                                                                                                                                                                                                                                     | `55c8cbb` | b0-sync 5 ✓ (R03-1/2/5/7), b0-init 10 ✓ (R03-3/4)                                                              |
| T5  | `verify-against-map.ts`: `VerifyCode += protected\|kept`, `syncFact`/`fileVerdict` перекрывают ожидание категории, хвост вне карты сохраняет эти коды (иначе конфликт); `project-step.ts`: protect/kept у orphan до drift-конфликта (через `parseProtect` + свидетель), `ProjectReport.backups` из исходов с `backup`                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `a6a3649` | verify-against-map 41 ✓, upgrade-projects 20 ✓, project-step (integration, вне allowlist) 10 ✓                 |
| T6  | `freshnessDetails`: `N differ: <все пути>`; `verifyNameLines` (единая реализация для прохода и `--here`): `needs decision: <путь проекта> (<код>), …`, `N protected (intentional)`, `N kept (local): <пути>`, `faces: <owner_skill> diverged`; `classifyProject`: `protected`/`kept` → `current`, `details` из `InspectOutcome.detail` + строка `detail: … — treated as foreign (…)`; пути карты переводятся в проектные тем же `projectPath`                                                                                                                                                                                                                                                                                                                                    | `94e1c59` | memory-upgrade.check 14 ✓, upgrade-check 1 ✓, upgrade-park 4 ✓, upgrade-projects 20 ✓                          |

## Workers Used

Воркеров — 0. Две попытки спавна (`worker-implementer` для T1 и T2) вернули
`Subagent depth limit reached (1)`; повторная попытка после этого не имеет смысла без
изменения конфигурации платформы (`experimental.subagent_depth`). Исследование,
реализация, тесты и git-операции выполнены L1 внутри scope и allowlist задач.
Независимого ревью воркером не было — это ограничение передаётся L0 вместе с
acceptance (см. Risks).

## Validation Results

Точечные прогоны по задачам (все exit 0):

```
npx vitest run tests/unit/domain/protect-key.test.ts                          # 35 passed
npx vitest run tests/unit/adapters/render/sync-state.test.ts                  # 11 passed
npx vitest run tests/unit/adapters/render/opencode-renderer.test.ts \
  tests/unit/adapters/render/stamp.test.ts \
  tests/unit/use-cases/sync-base-set.test.ts tests/unit/adapters/render/sync-state.test.ts  # 57 passed (4 files)
npx vitest run tests/integration/b0-sync.test.ts tests/integration/b0-init.test.ts          # 15 passed (2 files)
npx vitest run tests/unit/use-cases/verify-against-map.test.ts               # 41 passed
npx vitest run tests/unit/use-cases/upgrade-projects.test.ts                 # 20 passed
npx vitest run tests/unit/adapters/commands/memory-upgrade.check.test.ts     # 14 passed
npx vitest run tests/integration/upgrade-check.test.ts                       # 1 passed
npx vitest run tests/integration/upgrade-park.test.ts                        # 4 passed
npx tsc --noEmit                                                             # TypeScript: No errors found
```

Гейт фазы (`npm run check`: english-surface → prettier → tsc → build → vitest):

```
Test Files  212 passed (212)
     Tests  1780 passed (1780)
exit 0
```

Затронутые интеграционные сценарии брифа (`b0-sync`, `b0-init`, `upgrade-check`)
входят в эти 212 файлов и зелёные; отдельные прогоны дали 5 / 10 / 1 passed.

Проверка уникальности регекса штампа (T3): `grep -rn "wolf:rendered" src` даёт только
`src/adapters/render/stamp.ts` (строки 9/11/15/22) и комментарий в `protect-key.ts` —
второй копии регекса нет.

Идемпотентность и read-only (NFR-02/NFR-03) зафиксированы тестами:
`R02-1` (после исцеления повтор — `skipped`, файл байт-в-байт), `inspect: … ноль
записей` (снапшот `mtime+content` всех файлов проекта до/после, включая
`wolf-sync-state.json`), `kept` (второй проход не пишет), `take-on-mutated` (бэкап
до записи, свидетель `origin:'render'`).

## Изменения ожиданий существующих тестов

1. `tests/integration/upgrade-check.test.ts` — `3 differ` → `2 differ: .opencode/agents/mr-wolf.md, AGENTS.md`.
   Причина предписана дизайном: файл, отличающийся только строкой штампа
   (`using-skills/SKILL.md`, `set=2.17.1`), в инспекции даёт `identical` (§4.4: «проходу
   нечего решать», `--check` не показывает `behind` для штамп-дрейфа). Ослабления нет:
   добавлено более сильное утверждение — оба differ-пути названы, `3 differ` запрещён.
2. `tests/unit/adapters/commands/memory-upgrade.check.test.ts`,
   `tests/unit/use-cases/upgrade-projects.test.ts`, `tests/integration/upgrade-park.test.ts` —
   только добавленные кейсы/строки (R01-1, R01-2, R03-5, protected/kept), существующие
   ожидания не менялись.
3. Других изменённых ожиданий нет; ни один тест не ослаблен и не пропущен.

## Отклонения

1. **T2-коммит промежуточно красный на `opencode-renderer.test.ts`** (4 теста сравнения
   свидетеля). Причина: `loadSyncState` начал отдавать `SyncEntry`, а рендерер до T3
   сравнивал `sha256(current) !== state.files[rel]` (объект никогда не равен строке).
   Гейт T2 по плану — только `sync-state.test.ts` + `tsc`; правка рендерера — allowlist
   T3, поэтому чинил следующей задачей (`5d58de6`, 32/32 зелёные). Отмечено как
   известный транзиент, чтобы bisect не читался как регресс фазы.
2. **Dispatching воркеров недоступен** (FRICTION-1) — задачи MEDIUM/COMPLEX исполнены
   L1. Промпты воркеров были подготовлены полностью (контракт, allowlist, edge-cases,
   инструменты), но не доставлены.
3. **`ProjectReport.backups` — опциональное поле.** Обязательное ломало бы report-литералы
   в тестах вне allowlist T5 (`memory-upgrade.here.test.ts`,
   `adapters/commands/upgrade-projects.test.ts`). `runProjectStep` заполняет его всегда;
   потребители T10/T11 обязаны читать `report.backups ?? []`.
4. **Правило 7 §4.3 пишет бэкап только при наличии хука** (`SyncBaseSetOptions.takeMutated.backup`).
   В F1 хук передаётся только тестами; боевой бэкап-хук (`backupLocalFile`) появляется в
   T7/T10 — до этого поведение правила 7 совпадает с 2.19.0 (перезапись без бэкапа).
   Это следствие дизайна (единственный носитель хука в порту), зафиксировано в
   комментарии рендерера.
5. **AGENTS.md whole-file не лечится от штамп-дрейфа.** §4.5 говорит «поведение 2.19.0
   без изменения»; исцеление (§4.4) применяется к целям base-set. Правила 6/6.5/7 к
   AGENTS.md применены.
6. **`tests/unit/use-cases/doctor.test.ts` не менялся**: код `doctor.ts` уже использует
   префикс маркера (plan.md T4: «изменений в нём не требуется»); allowlist — разрешение,
   не обязанность.
7. **`faces: <owner_skill> diverged`** в F1 строится из `ProjectReport.seed`
   (`kind:'diverged'`, basename без `-playbook.md`) — `collectDecisions().diverged`
   появляется только в T7; формат строки совпадает с §4.15, источник заменится в T7 без
   смены вывода.

## Обработка ревью Ф1 (F1-fix, 2026-10-25)

Фактическое состояние после исправлений (коммиты `fix(2.20.0): F1 review — …`):
M-1 (init на штампованном `AGENTS.md`: штамп → текущая база, свидетель по
нормализованному контенту, повторный `init` — no-op, проход/`--check` —
`current`/`identical`), m-2 (`AGENTS.md` получает `SyncBaseSetOptions`: take с
бэкапом 6′ и бэкап правила 7 — правило «AGENTS.md whole-file получил 6/6.5/7»
выше дополнено 6′/7 с бэкапом), m-4 (`protect` блокирует удаление removed-цели,
любое удаление — с бэкапом `.wolf/backup/upgrade/<date>/…`), m-5 (порядок
«исцеление выше `kept`» подтверждён и зафиксирован тестом + строкой design §4.3),
m-7 (блок `AGENTS.md` получает EOL файла — CRLF без смешения), m-8 п.1/п.2
(тесты `kept` для `AGENTS.md` и init на штампованном файле), m-9 (`db40309` —
known-red, `git bisect`: skip, история не переписана). m-1/m-3/m-6 остаются
явными пунктами T7/T14 — см. `plan.md`. Полный разбор «находка → сделано →
evidence» — в `phase4-review-f1.md`, раздел «Обработка находок».

## Risks

1. **Нет независимого ревью** (воркер-ревьюер недоступен). Компенсация: тесты на каждое
   новое правило + полный `npm run check`; L0 принимает по ACCEPTANCE ниже. Рекомендация:
   прогнать `worker-reviewer` в среде с разрешённой глубиной субагентов до приёмки волны.
2. **Миграция свидетеля.** После волны state-файл содержит объекты; откат к 2.19.0 увидит
   объекты как `mutated` по всем файлам свидетеля (design ADR-8, данные не теряются).
   Лечение — удаление/восстановление `.opencode/wolf-sync-state.json` или повторный
   апгрейд.
3. **`protect` у файла с `protect: false`** нормализация снимает строку, но файл не
   перезаписывается (правило 4 `identical`): строка остаётся в файле, повторный проход
   стабилен. Поведение соответствует §4.1/§4.3, но пользователь может ждать удаления
   строки — покрыто только косвенно (`R05-5` на трёх правках ключа).

## FRICTION

1. **`subagent` недоступен: `Subagent depth limit reached (1)`** на обоих вызовах
   (`worker-implementer`, T1 и T2, старт фазы). Платформа не разрешает вложенных
   субагентов (`experimental.subagent_depth`), поэтому схема «L1 → worker-\*» в этой
   сессии неработоспособна. Следствия: (а) задачи MEDIUM/COMPLEX исполнены L1 —
   расход контекста L1 выше планового; (б) нет независимого ревью уровня задачи;
   (в) параллельность T1∥T2 и T4∥T5 не использована. Правка блока «Инструменты» не
   помогает — ограничение платформы, не тула. Прошу L0 либо включить глубину субагентов
   для фазы Ф2, либо подтвердить схему «L1 исполняет сам» (тогда FRICTION снимается
   как принятая политика).

## COMPLAINT

Не подавал: сбой `subagent` — недоступность инструмента/платформы, а не дефект правила
(playbook: «Сбой тула → FRICTION, не жалоба»). Правило «MEDIUM/COMPLEX → воркеры»
остаётся корректным; не покрыт только случай недоступной диспетчеризации — он вынесен
в FRICTION-1 как предложение правки.

## ACCEPTANCE (по AC брифа)

| AC                                                                  | Подтверждение                                                                                                                                                                | Evidence                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| (1) T1…T6 по design без самовольных расширений                      | выполнено; расширения перечислены в «Отклонения» 3/4/7 и не меняют контрактов §4.1–§4.6, §4.15                                                                               | таблица Changes, диффы коммитов       |
| (2) на каждый AC/сценарий фазы зелёный тест, краевые случаи покрыты | покрыты R02-1/2/3/4, R03-1/2/3/4/5/7, R05-5/6/7 (CRLF, нет frontmatter, ключ в теле, дубли, `false`, пусто/не-грамматика, кавычки/отступ/таб), R01-1/2, N04-1, NFR-02/NFR-03 | перечень прогонов выше                |
| (3) `npm run check` зелёный, счётчики приведены                     | 212 файлов / 1780 тестов, exit 0                                                                                                                                             | Validation Results                    |
| (4) идемпотентность и read-only проверены тестами                   | повтор после исцеления — `skipped`, файл байт-в-байт; `inspectBaseSet` — снапшот `mtime+content` идентичен, включая `wolf-sync-state.json`                                   | T3-тесты R02-1/«ноль записей»         |
| (5) allowlist соблюдён, дерево чистое кроме pre-existing skills     | все правки — в файлах allowlist задач T1…T6; `git status` — только `.opencode/skills/**`                                                                                     | `git status --short`, коммиты         |
| (6) чекбоксы и отчёт отражают факт, коммиты на месте                | T1…T6 отмечены `[x]` со строкой «Сделано → коммит …»                                                                                                                         | `plan.md` строки 49/67/85/109/132/149 |
