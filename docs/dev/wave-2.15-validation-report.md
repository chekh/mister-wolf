# Валидация волны 2.15 на main — приёмочный след (V)

## Metadata

- Дата: 2026-10-08, чекаут `/Users/chekh/Development/mister-wolf`, ветка `main`
- HEAD на момент прогона: `4771c4c` (docs: базовый набор 18 скиллов…)
- Тип задачи: валидационная (код не менялся; прогоны + фиксация фактов)
- Исполнитель: executor-lead; воркеры не привлекались (0/5)

## Summary

**V-PASS — 8/8 критериев ✅.** Отклонений, требующих задачи-источника, не обнаружено.

## Task Decomposition

| #   | Критерий                     | Класс                          | Исполнитель |
| --- | ---------------------------- | ------------------------------ | ----------- |
| 1   | §6.1 scaffold artifact       | TRIVIAL (прогон)               | сам         |
| 2   | §6.2 sync-идемпотентность    | TRIVIAL (прогон)               | сам         |
| 3   | §6.3 doctor-находки (vitest) | TRIVIAL (прогон)               | сам         |
| 4   | §6.4 базовый набор скиллов   | SIMPLE (прогоны + tmp)         | сам         |
| 5   | §6.5 intake e2e + телеметрия | TRIVIAL (прогон)               | сам         |
| 6   | §6.6 роадмап ×1              | TRIVIAL (прогон)               | сам         |
| 7   | §6.7 downstream reset        | SIMPLE (прогон + tmp-сценарий) | сам         |
| 8   | §6.8 полный гейт             | TRIVIAL (прогон, e2e в nohup)  | сам         |

Обоснование: механические прогоны без правок кода — исследовательских и кодовых подзадач нет, воркеры не требовались.

## Validation Results (по критериям)

### 1. §6.1 scaffold artifact — ✅

tmp: `/private/tmp/wolf-215-v1-bV06`

- `scaffold artifact demo` → 4 файла в `docs/dev/2026-10-08-demo/`: requirements.md, design.md, plan.md, test-plan.md
- front-matter requirements.md: `slug: demo / title: demo / status: draft / created: 2026-10-08` ✅
- `scaffold artifact demo-fix --fix` → 2 файла: requirements.md (с заготовкой CR-журнала: «## 3. Журнал изменений (CR)… CR-2026-10-08-01: <что и почему>… downstream:») + plan.md ✅
- повторный `scaffold artifact demo` → `Error: Artifact folder already exists: …/2026-10-08-demo`, `exit=1`; файлов по-прежнему 4+2 ✅
- `scaffold artifact Bad_Slug` → `Error: Invalid slug "Bad_Slug" (expected ^[a-z0-9][a-z0-9-]*$)`, `exit=1` ✅

### 2. §6.2 sync-индекс идемпотентен — ✅

Основной чекаут. `M1=1791486761`, после `node dist/bootstrap/cli.js sync` → `M2=1791486761`, **M1 == M2** (mtime не изменился). stdout содержит `docs/dev/INDEX.md: unchanged` (EN-эквивалент «без изменений», english-surface гейт). Прочие записи — `skipped — content identical (M2)`. Pre-existing незатрекнутые файлы чекаута на результат не повлияли.

### 3. §6.3 doctor-находки — ✅

- `npx vitest run tests/e2e/doctor-artifacts.e2e.ts --config tests/e2e/vitest.config.ts` → **2/2 passed** (4.9s)
- `npx vitest run tests/unit/use-cases/lint-artifacts.test.ts` (без конфига) → **12/12 passed**
- Примечание (известная особенность, указана в брифе): совмещённый запуск с e2e-конфигом прогоняет только e2e-файл — конфиг фильтрует юнит-путь; запуск раздельный, оба зелёные.

### 4. §6.4 скиллы конвейера в базовом наборе — ✅

- `npx vitest run tests/unit/conveyor-skills-guard.test.ts tests/unit/intake-skill-guard.test.ts` → **8/8 passed**
- `npx vitest run tests/integration/base-set-init.test.ts` → **4/4 passed**
- Ручной tmp (`/private/tmp/wolf-215-v4-EveE`, `init --model zai-coding-plan/glm-5.2`): `ls .opencode/skills` → **18 скиллов**, все 5 названных присутствуют: `wolf-design`, `wolf-testplan`, `wolf-skill-intake`, `receiving-code-review`, `writing-skills` (дефолт-18 ✅)
- Повторный init: **36 строк `skipped`** (18 скиллов + 18 команд/агентов), `opencode.json: unchanged`, `init-report: already exists — not duplicating` ✅
- Примечание (флаги запуска tmp-сценария, не дефекты): неинтерактивный `init` требует `--model <id>` и маркер корня проекта (`README.md`).

### 5. §6.5 e2e контура кандидата — ✅

- `npx vitest run tests/e2e/skill-intake.e2e.ts --config tests/e2e/vitest.config.ts` → **5/5 passed** (4.9s)
- Телеметрия C5: `.wolf/metrics/skill-invocations.jsonl` существует, **35 записей** (2797 байт); хвост валидный: `{"ts":"2026-10-08T13:44:07.384Z","skill":"wolf-sdd","agent":"mr-wolf"}`

### 6. §6.6 роадмап покрыт ровно один раз — ✅

- `node dist/bootstrap/cli.js doctor` на main: секции `## Artifacts` в выводе **нет** (grep → 0) — analyze-doc зарегистрирован, дублей нет
- `ls docs/dev/roadmap/` → ровно: `wave-2.16.md, wave-2.17.md, wave-2.18.md, wave-2.19.md, backlog.md, rejected.md` ✅
- Примечание: doctor попутно подрезал запись в registry от tmp-проекта моего init-сценария: `/private/tmp/wolf-215-v4-EveE: sandbox — pruned (os tmpdir)` — штатная самоочистка, к волне отношения не имеет.

### 7. §6.7 e2e эволюции — ✅

- `npx vitest run tests/unit/use-cases/lint-artifacts.test.ts -t "downstream reset"` → **1 passed** (11 skipped — фильтр работает)
- Ручной tmp-сценарий (`/private/tmp/wolf-215-v7-8HYg`, `scaffold artifact evo`):
  - Заполнен requirements.md: REQ-01 (AC + Источник), CR-строка `CR-2026-10-08-01 … downstream: design, plan`; статусы: requirements=approved, design=approved, test-plan=approved, **plan.md=draft** (прочтение критерия — по уточнению в скобках «plan.md в draft»; при approved во всех 4 было бы 2 находки, что противоречит ожиданию «находки по plan.md нет»)
  - `doctor` → находка: `требует сброса статуса design.md → draft (остался approved)`; **находок по plan.md нет** ✅ (попутная штатная находка `2026-10-08-evo не упомянута в файлах волн` — tmp-артефакт вне волн, к критерию не относится)
  - Сброс design.md → draft: повторный `doctor` — находок сброса **0** («молчит» по downstream) ✅

### 8. §6.8 полный гейт — ✅

- `npm run check` → зелёный. Состав (package.json): `check-english-surface && format:check && lint && build && test:run`. Тесты: **154 файлов / 1147 тестов passed**, включая `cli-reference-guard` (49.9s). Duration 125s.
- Полный e2e (`nohup npm run e2e`, лог `/private/tmp/wolf-215-e2e-10082214.log`): **Test Files 46 passed (46), Tests 182 passed (182)**, Duration 964.60s (~16 мин), вхождений «failed» в логе — 0.
- Хвост e2e-лога:

```
 ✓ tests/e2e/solve-empty.e2e.ts  (1 test) 16061ms

> mister-wolf@2.14.1 build
> tsc

 ✓ tests/e2e/brief-content.e2e.ts  (1 test) 13700ms

> mister-wolf@2.14.1 build
> tsc

 ✓ tests/e2e/add-scope.e2e.ts  (3 tests) 12985ms

 Test Files  46 passed (46)
      Tests  182 passed (182)
   Start at  22:15:08
   Duration  964.60s (transform 884ms, setup 182ms, collect 105.27s, tests 858.17s, environment 0ms, prepare 407ms)
```

## Workers Used

Не привлекались (0/5) — все 8 критериев TRIVIAL/SIMPLE механические прогоны.

## Changes

Кодовая база не менялась. Создан только этот отчёт-файл (незакоммичен — коммиты брифом не поручены). tmp-каталоги сценариев: `/private/tmp/wolf-215-v1-bV06`, `/private/tmp/wolf-215-v4-EveE`, `/private/tmp/wolf-215-v7-8HYg`, лог e2e: `/private/tmp/wolf-215-e2e-10082214.log`.

## FRICTION / Примечания

- FRICTION нет. Все особенности (e2e-конфиг фильтрует юнит-путь; EN-вывод sync; `--model` для неинтерактивного init) известны или сняты на месте.
- Жалоб на правила не зарегистрировано (триггеров W1–W4 нет; неоднозначность п.7 снята скобкой самого критерия, прочтение зафиксировано выше).
