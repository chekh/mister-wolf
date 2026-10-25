---
phase: 6 (T15a)
task_id: wave-2-20-0-impl-t15a
follow_up: wave-2-20-0-impl-t15a-fix2 (закрытие документационной фазы после рестарта среды)
status: complete
---

# T15a — документы, сайт, версия 2.20.0

## Metadata

| Поле                    | Значение                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| task_id                 | `wave-2-20-0-impl-t15a`                                                                                                                                                                                                                                                                          |
| cwd                     | `/Users/chekh/Development/mister-wolf/.worktrees/wave-2-20-0-upgrade-intentions`                                                                                                                                                                                                                 |
| ветка                   | `dev/wave-2-20-0-upgrade-intentions`                                                                                                                                                                                                                                                             |
| база                    | `8a312fc` (Ф1–Ф3 + T14 приняты)                                                                                                                                                                                                                                                                  |
| коммиты задачи          | `7eba541` (chore: version + update map), `b3544ee` (docs: поверхности + dogfood)                                                                                                                                                                                                                 |
| коммиты координатора    | `d3db7b4` (fix: отступы онбординг-блока в шаблоне + guard-тест), `abba767` (chore: refresh штампов `.opencode`) — приняты по находкам этой задачи; HEAD верификации = `39e7653` (после фикса e2e-теста)                                                                                          |
| коммиты закрытия (fix2) | `1c0dfac` — `docs(2.20.0): T15 — docs review fixes (guide EN/RU, CHANGELOG, README pair)`; `39e7653` — `test(2.20.0): T15 — upgrade-park-modes reads the set version from package.json`; `docs(2.20.0): T15 — docs review verdict and report` — этот отчёт + дословный вывод (sha — в `git log`) |
| ревью документации      | 2 цикла, `opencode run --standalone --agent worker-reviewer` (свежий контекст): цикл 1 — запрос на правки (2 блокирующих), цикл 2 — **APPROVED**; дословный вывод — `phase6-docs-review.txt`                                                                                                     |
| восстановление          | после рестарта среды: незакоммиченные правки документации были сверены с продуктом построчно (часть утверждений оказалась ложной — исправлена), дословный вывод ревью восстановлен повторным прогоном                                                                                            |
| версия                  | `2.20.0` (`package.json` = единственный источник; тег — T15b на `main`)                                                                                                                                                                                                                          |
| методика                | wolf-release-docs (полный текст загружен до работы), using-skills, verification-before-completion                                                                                                                                                                                                |
| режим                   | FULL                                                                                                                                                                                                                                                                                             |
| дата                    | 2026-10-25                                                                                                                                                                                                                                                                                       |

## Summary

Все поверхности таблицы плана закрыты, EN/RU согласованы, генерируемые файлы получены генераторами
(`generate-cli-reference`, `sync-changelog` внутри `docs:build`), `update-map.json` перегенерирован под
2.20.0 (расширение allowlist согласовано с L0), версия поднята, dogfood выполнен на живом `AGENTS.md`
репозитория (блок v2 → v3, текст вне блока байт-в-байт, повторный проход — `28 identical`), метрика §1
измерена read-only по живому парку из 5 проектов (baseline 2.19.0 против HEAD-CLI 2.20.0), `docs:build`,
`npm run check` (215 файлов / 1888 тестов) и `npm run e2e` (61 файл / 233 теста) зелёные. Независимое ревью документации — см. §«Находки ревью»: цикл 1 дал две
блокирующие находки (ложное обещание предупреждения о дубле `protect`; «блочный режим по умолчанию»),
обе закрыты текстом и проверены живыми прогонами, цикл 2 — **APPROVED**, блокирующих нет. Публикация/тег/merge не
выполнялись (T15b), чекбокс T15 в plan.md не отмечен.

## Task Decomposition

Классификация **до** исполнения (playbook executor-lead v3). Воркеры недоступны платформенно
(см. §FRICTION), поэтому классификация ниже — фактическая, а исполнение одиночное.

| Класс                                                                         | Признаки               | Объём                              | Исполнитель (план → факт)                                          |
| ----------------------------------------------------------------------------- | ---------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| Исследование фактов (design §4.1–4.18, §5, CLI help, код)                     | не правки              | ~900 строк design + 5 прогонов CLI | `worker-researcher` → **сам** (глубина субагентов = 1)             |
| CHANGELOG 2.20.0                                                              | 1 файл, факто-плотно   | ~90 строк                          | `worker-implementer` → **сам**                                     |
| Новая пара страниц Upgrade EN/RU + сайдбар                                    | 3 файла, новый контент | ~600 строк                         | `worker-implementer` → **сам**                                     |
| Обновления 4 пар страниц (platform, base-set, configuration, troubleshooting) | 8 файлов               | ~250 строк                         | `worker-implementer` → **сам**                                     |
| README-пара                                                                   | 2 файла                | ~25 строк                          | **сам** (TRIVIAL)                                                  |
| Версия + карта + генераторы + dogfood + метрика + коммиты                     | интеграция             | —                                  | **сам** (lead-owned по playbook)                                   |
| Независимое ревью (2 мандата)                                                 | отдельный голос        | —                                  | `worker-reviewer` через `opencode run --standalone` (вне процесса) |

Файлов кода (`src/**`, `tests/**`) задача не касалась; всё — документы, версия и сгенерированные артефакты.

## Карта «возможность → страница → источник истины → проверка»

| Возможность / утверждение              | Адресат                      | Страница                                                                                             | Источник истины                                        | Проверка                                                                                            |
| -------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ---- | ------- | ------------------------------------------------------------------ |
| Имена файлов вместо счётчиков (REQ-01) | владелец парка               | upgrade §«Reading the plan», platform §`wolf upgrade`                                                | `--check` фактический вывод; §4.15                     | прогон фикстуры: `mutated: …`, `1 differ: AGENTS.md`                                                |
| Штамп-исцеление (REQ-02)               | обновляющийся                | upgrade §plan, base-set §«Stamped files»                                                             | §4.4; правило 5 §4.3                                   | dogfood: `AGENTS.md` differ → identical после прохода; повторный проход `28 identical`              |
| Онбординг-блок v3 (REQ-03)             | обновляющийся                | upgrade §«AGENTS.md and the onboarding block», base-set §«The onboarding block», troubleshooting §12 | §4.5; `templates/base/AGENTS.md`                       | dogfood: `<!-- wolf:onboarding v3 -->`, текст вне блока байт-в-байт (1413/1413)                     |
| `init` чинит `mcp.wolf` (REQ-04)       | новый пользователь           | configuration §«Platform configs and `mcp.wolf`», upgrade §«init and a missing mcp.wolf»             | §4.14                                                  | `init --help`; код `writeConfig` (unchanged/written/replaced)                                       |
| `protect` в frontmatter (REQ-05)       | владелец файла               | upgrade §«Holding a file forever», base-set, troubleshooting §11                                     | §4.1 (грамматика/нормализация/вставка), §4.3 правило 2 | фикстура: `protect: true` вставлен последней строкой frontmatter; конфликт → `=protect` → `current` |
| `protect` не попадает в model-запрос   | владелец файла               | upgrade §limitations, CHANGELOG (Added)                                                              | §5 (живой прогон v2.1.4, capture-proxy)                | цитата §5: 200, "occurrences of `protect` in body: 0"                                               |
| `--resolve` (REQ-06)                   | владелец парка               | upgrade §«Applying a decision», platform                                                             | §4.8 (матрица глаголов, двухфазность)                  | фикстура: `1=take                                                                                   | keep | protect | pin`, ошибки `cannot keep … conflict stays`, `target listed twice` |
| `--review` (REQ-07)                    | владелец парка               | upgrade §«Reviewing decisions», platform                                                             | §4.9                                                   | фикстура non-TTY: список + рецепт, exit 2, без записи                                               |
| `--show` (REQ-08)                      | владелец парка               | upgrade §«Looking at one file», platform                                                             | §4.10                                                  | фикстура: `protect: none`, `witness: render @ 2.20.0`, diff, `release:`                             |
| Protections в `--check` (REQ-09)       | владелец парка               | upgrade, platform, base-set                                                                          | §4.11                                                  | фикстура и живой парк: `Protections: none` / секция с `behind (base 2.20.0)`                        |
| `--yes` + бэкапы (REQ-10)              | скрипты/CI                   | upgrade §«Silent runs», troubleshooting §14                                                          | §4.12 (формат `.wolf/backup/upgrade/<date>/<rel>`)     | фикстура: `local saved: .wolf/backup/upgrade/2026-10-25/…`; dogfood `--yes`                         |
| `--json` (REQ-11)                      | интеграторы                  | upgrade §«Machine channel», platform                                                                 | §4.13 (две схемы, стабильность)                        | фикстура: `wolf.upgrade/1`, `wolf.upgrade.check/1` — фактические документы                          |
| `diverged` — зона Стюарда              | владелец парка               | upgrade §limitations, platform exit-модель                                                           | §4.7, §4.9, §4.16                                      | живой парк: `diverged: [executor-lead v1]`, не адресуем, держит exit 2                              |
| Миграция state `{hash, origin, base}`  | обновляющийся/откатывающийся | CHANGELOG Upgrade notes, base-set                                                                    | §4.2                                                   | код `loadSyncState` (легаси-нормализация); dogfood: state перезаписан новым форматом                |
| Откат к 2.19.0 = `mutated`             | обновляющийся                | CHANGELOG Upgrade notes, upgrade §limitations                                                        | §4.2 + baseline-код 2.19.0 (сравнение со строкой)      | baseline-прогон установленного 2.19.0 (см. §метрика)                                                |
| `wolf sync` — алиас ещё работает       | обновляющийся                | platform §`wolf sync`, README                                                                        | `src/adapters/cli/commands/memory-sync.ts:36`          | `node dist/bootstrap/cli.js sync --help` — команда существует                                       |

## Changes

### Коммит `7eba541` — `chore(2.20.0): version 2.20.0 и карта обновления релиза`

| Файл                                | Что                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`, `package-lock.json` | `npm version 2.20.0 --no-git-tag-version`; lock согласован (2 строки)                                                                                       |
| `update-map.json`                   | перегенерирован: `version 2.20.0`, `prev 2.19.0`, `agents_md: changed / append-block`, 30 файлов `unchanged`, 6 лиц; `--verify` — «in sync with templates/» |

### Коммит `b3544ee` — `docs(2.20.0): T15 — …` (17 файлов, +1065/−61)

| Файл                                       | Что                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHANGELOG.md`                             | секция `## [2.20.0] - 2026-10-25`: Added (имена файлов, `--resolve/--review/--show/--json`, `protect` + спайк, Protections, бэкапы, `init`/`mcp.wolf`, onboarding v3, `diverged`), Changed (свидетель, `--check` read-only, report-only `deprecated`, `kept`, inspection vocabulary), Fixed (4 механических дефекта 2.19.0), Upgrade notes (миграция state, откат, парк целиком, `protect` на старых версиях, отсутствие GC, orphan, тихий режим, regression guard) |
| `README.md` / `README.ru.md`               | раздел обновления: новые флаги + рабочий пример «конфликт → `--review` → `protect`»; `wolf sync` — «алиас ещё работает в 2.20.0»                                                                                                                                                                                                                                                                                                                                    |
| `docs/site/guide/upgrade.md` (new)         | EN: три слоя намерений, `--check`, `--review`, `--show`, `--resolve` (матрица глаголов × класс цели), `protect` (грамматика, нормализация, отказ без frontmatter, `grep`-аудит), `--yes` + бэкапы/восстановление, `--json` (две схемы), `AGENTS.md`/онбординг v3, `init`/`mcp.wolf`, ограничения, полный круг + скриптовый вариант                                                                                                                                  |
| `docs/site/ru/guide/upgrade.md` (new)      | RU-пара с тем же смыслом и теми же командами/дефолтами                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/site/.vitepress/config.ts`           | пункты сайдбара: EN `Upgrading`, RU `Обновление` (группа OPERATE / ЭКСПЛУАТАЦИЯ)                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/site/guide/cli/platform.md` + RU     | `wolf upgrade`: 7 флагов с дефолтами, контракт диспетчеризации, несовместимые пары, фактический `--check` фикстуры, классы, exit-модель с `diverged`, «нет авто-merge»; `wolf sync` — deprecation-формулировка исправлена (алиас живёт в 2.20.0)                                                                                                                                                                                                                    |
| `docs/site/guide/base-set.md` + RU         | исходы прохода: `updated (stamp drift healed)`, `protected`, `kept`; маркер v3; подраздел про два режима `AGENTS.md` и сломанные маркеры; совет «не снимайте штамп — объявите `protect`»                                                                                                                                                                                                                                                                            |
| `docs/site/guide/configuration.md` + RU    | подраздел «Platform configs and `mcp.wolf`»: починка, идемпотентность, когда конфиг НЕ создаётся, битый JSONC                                                                                                                                                                                                                                                                                                                                                       |
| `docs/site/guide/troubleshooting.md` + RU  | 4 новых рецепта: 11 `mutated` без нужды → `protect`/`pin`, 12 сломанные онбординг-маркеры, 13 битый frontmatter после ручной правки, 14 восстановление из `.wolf/backup/upgrade/`                                                                                                                                                                                                                                                                                   |
| `AGENTS.md`                                | dogfood: онбординг-блок v2 → v3 (единственные изменения в файле)                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/site/changelog/index.md` + RU mirror | генератор `sync-changelog` (85 392 байта)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/reference/cli.md`                    | генератор `generate-cli-reference` — **без diff**: уже актуален после T11; все новые флаги присутствуют (`--resolve` L1043, `--show` L1045, `--review` L1047, `--json` L1049)                                                                                                                                                                                                                                                                                       |

### Закрытие fix2 — правки по ревью (цикл 1 → цикл 2)

| Файл                                        | Что                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHANGELOG.md`                              | REQ-05: дубль `protect` — «первый побеждает, остальные игнорируются, предупреждения нет»; REQ-01: пути — для `mutated`/`conflict`/`differ`, `diverged` — stewarded-секция; `diverged`-пункт называет поверхности (`--review`, `--resolve`, `faces:`), `--check` — exit 0 без секции; `--check --json` — `diverged[]` в режиме парка; witness/`kept` — убрано невидимое info-обещание, база остаётся в свидетеле |
| `docs/site/guide/upgrade.md` + RU           | §`protect`: дубликаты без warn; §`AGENTS.md`: режимы переставлены и названы честно (штампованный whole-file — свежий `init`; блочный — существовавший файл); §limitations: `diverged` печатают `--review`/`--resolve`/`faces:`, `--check` — нет                                                                                                                                                                 |
| `docs/site/guide/base-set.md` + RU          | §«The onboarding block»: те же два режима в правильном порядке; вводный абзац: новый файл получает блок в составе штампованного рендера, существующему — дописывается                                                                                                                                                                                                                                           |
| `docs/site/guide/configuration.md` + RU     | дерево `.wolf/`: добавлен `backup/upgrade/<date>/` (без GC)                                                                                                                                                                                                                                                                                                                                                     |
| `docs/site/guide/cli/platform.md` + RU      | `wolf sync`: алиас жив, текст уведомления `removed in 2.20.0` устарел; список несовместимых пар флагов полон                                                                                                                                                                                                                                                                                                    |
| `docs/site/guide/troubleshooting.md` + RU   | рецепт 12: разделены «нет закрывающего маркера» (detail) и «нет открывающего» (просто `foreign`)                                                                                                                                                                                                                                                                                                                |
| `README.md` / `README.ru.md`                | `--json`: обе схемы (`wolf.upgrade/1`; `wolf.upgrade.check/1` с `--check`)                                                                                                                                                                                                                                                                                                                                      |
| `docs/site/changelog/index.md` + RU mirror  | перегенерированы `sync-changelog` из CHANGELOG.md (85 851 байт)                                                                                                                                                                                                                                                                                                                                                 |
| `tests/unit/onboarding-block-guard.test.ts` | уже в `d3db7b4`: побайтовое равенство блока `AGENTS.md` ↔ `templates/base/AGENTS.md` + проверка, что продолжения списка не дедентованы; RED на до-фиксовом шаблоне подтверждён (1 битая строка), сейчас 2/2 зелёные                                                                                                                                                                                             |
| `tests/e2e/upgrade-park-modes.e2e.ts`       | `SET` (версия набора в фикстуре) больше не пинится к `2.19.0`, а читается из `package.json` — после бампа версии `7eba541` старый пин ломал весь файл на этапе `beforeAll` (`expected '2.20.0' to be '2.19.0'`); сценарий (штамп-дрейф, `map ${SET}`) сохранён                                                                                                                                                  |
| `phase6-docs-review.txt`                    | дословный вывод обоих циклов ревью (в т.ч. весь ход живых прогонов)                                                                                                                                                                                                                                                                                                                                             |

### Коммиты координатора, принятые по находкам этой задачи

| Коммит    | Что                                                                                                                                                                                                                                          | Почему от меня                                                                                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `d3db7b4` | `templates/base/AGENTS.md` + корневой `AGENTS.md`: восстановлен отступ продолжения пункта «Номер версии X.Y.Z»; новый guard `tests/unit/onboarding-block-guard.test.ts` (блок = шаблон байт-в-байт, продолжения списка не с нулевой колонки) | dogfood выявил, что блок v3 рендерится с дедентированным продолжением списка; документировать это как норму было бы неверно — блок зона волфа, но markdown в нём обязан оставаться списком                                                             |
| `abba767` | 28 файлов `.opencode/**` приведены к шаблонам 2.20.0 (штамп 2.17.1 → 2.20.0), state переписан                                                                                                                                                | снимает отклонение 3: дерево больше не грязное, базовый набор репозитория обновлён; 3 предсуществующих локальных расхождения `.opencode/skills/{using-skills,wolf-execute,wolf-sdd}` и неотслеживаемый `wolf-draft/` сознательно оставлены вне коммита |

## Workers Used

**0 воркеров.** `subagent` вернул `Subagent depth limit reached (1)` — я запущен как субагент, платформа не
разрешает вложенность. Следствия и компенсация:

- вся работа выполнена одиночно (декомпозиция в §Task Decomposition сохранена как фактическая);
- независимый голос получен вне процесса субагентов: `opencode run --standalone --agent worker-reviewer`
  (отдельная сессия, свой контекст) — см. §«Находки ревью»;
- лимит воркеров (5) не израсходован.

## Validation Results

### Версия и карта

| Проверка           | Команда                                         | Результат                                                         |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------- |
| версия             | `npm version 2.20.0 --no-git-tag-version`       | `v2.20.0`; `package.json` = `2.20.0`                              |
| lock согласован    | `git diff package-lock.json`                    | 4 строки (version ×2), без дрейфа                                 |
| карта              | `node scripts/generate-update-map.mjs`          | `version 2.20.0, prev 2.19.0, 30 files (30 unchanged), 6 faces`   |
| самопроверка карты | `node scripts/generate-update-map.mjs --verify` | `in sync with templates/ (30 file targets, 6 faces, prev 2.19.0)` |
| CLI из дерева      | `node dist/bootstrap/cli.js --version`          | `2.20.0`                                                          |

### Генераторы и сборка сайта

| Проверка                  | Команда                                                               | Результат                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| сборка сайта (финал)      | `npm run docs:build`                                                  | exit `0`; `generate-cli-reference: docs/reference/cli.md regenerated` (диффа нет — справка уже актуальна); `sync-changelog: docs/site/changelog/index.md (85851 bytes) + ru mirror`; `vitepress build` — `build complete in 63.90s`                        |
| секция 2.20.0 на сайте    | `grep "## \[2.20.0\]" docs/site/changelog/index.md`                   | строка 11, 8 вхождений «2.20.0» в EN и 8 в RU                                                                                                                                                                                                              |
| новые флаги в справочнике | `grep -- "--resolve\|--review\|--show\|--json" docs/reference/cli.md` | L1030–1049 (`upgrade`), L1617 (`upgrade-projects --json`)                                                                                                                                                                                                  |
| english-surface           | `node scripts/check-english-surface.mjs`                              | `OK (93 files checked)`                                                                                                                                                                                                                                    |
| prettier                  | `npx prettier --check "docs/**/*.md" README.md`                       | после `--write` 5 файлов — «All files formatted correctly»                                                                                                                                                                                                 |
| полный гейт (финал)       | `npm run check`                                                       | exit `0`: english-surface `OK (93 files)`, prettier, tsc, build, vitest — **215 файлов / 1888 тестов passed** (68.66 s); в их числе `update-map` repo-guard (`map.version` = 2.20.0, карта в sync), `cli-reference-guard` и новый `onboarding-block-guard` |
| e2e: промежуточный прогон | `npm run e2e`                                                         | exit `1`: **1 suite failed** — `tests/e2e/upgrade-park-modes.e2e.ts` (`expected '2.20.0' to be '2.19.0'`): тест T14 жёстко пинил `SET = '2.19.0'`, после бампа версии `7eba541` штампы шаблонов стали `2.20.0`. Остальные 60 файлов / 223 теста — passed   |
| e2e: фикс теста           | `SET` читается из `package.json` (единственный источник версии)       | файл отдельно: `10 tests passed` (15.82 s) — сценарий парка снова рабочий на текущем релизе                                                                                                                                                                |
| e2e (финал)               | `npm run e2e`                                                         | exit `0`: **61 файл / 233 теста passed**, длительность **507.48 s** (collect 66.53 s, tests 440.34 s); прогон после фикса `SET`                                                                                                                            |

### Ревью документации (обязательный гейт, свежий контекст)

| Проверка                 | Команда                                                                 | Результат                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| цикл 1 (мандаты A+B)     | `opencode run --standalone --agent worker-reviewer` (opencode `v2.1.4`) | 9 находок мандата A (2 блокирующих), 2 мандата B; дословный вывод — `phase6-docs-review.txt` (строки 1–2320)                                                                         |
| правки по блокирующим    | см. §Changes «Закрытие fix2»                                            | 2 блокирующих + 6 неблокирующих закрыты текстом; `src/**` не менялся                                                                                                                 |
| цикл 2 (перепроверка)    | тот же агент, свежий контекст                                           | **VERDICT: APPROVED**, `CYCLE-1-BLOCKERS: 1 — resolved; 2 — resolved`, новых находок нет (`phase6-docs-review.txt`, строки 2321–3611)                                                |
| guard-тест блока         | `npx vitest run tests/unit/onboarding-block-guard.test.ts`              | 2/2 passed; на до-фиксовом шаблоне (`git show d3db7b4^`) проверка продолжений даёт 1 битую строку — регресс отступов ловится                                                         |
| живая проверка бэкапов   | фикстура: два `take` одного файла за день                               | `.wolf/backup/upgrade/2026-10-25/.../SKILL.md` → `SKILL-2.md` (доке соответствует)                                                                                                   |
| живая проверка `missing` | фикстура: `rm` файла карты, три глагола                                 | `--check` → счётчик `1 missing`; `=take` пишет эталон; `=keep` → `nothing to keep: the file does not exist — use take`; `=protect` → `cannot protect the file: no YAML frontmatter…` |
| живая проверка `--json`  | фикстура: `--check`, `--here`, `--show`, `--review`                     | `wolf.upgrade.check/1` (check, exit 0) и `wolf.upgrade/1` (here/show, mode совпадает); `--review --json` → `error: --review is interactive; --json is not supported`, exit 1         |

### Dogfood (REQ-02/REQ-03 на живом файле репозитория)

Условия: worktree не наследует `.wolf/` (память живёт в основном чекауте), поэтому проход в worktree
отказывает честно: `Error: no wolf memory in … — run wolf init first`. Чтобы не трогать ни живой реестр, ни
память проекта, память создана одноразово (`.wolf/memory`), а `WOLF_SANDBOX` указан в tmp — все записи
реестра/конфига ушли в sandbox. После проверки `.wolf/` удалён; `~/.config/wolf/projects.yaml` не менялся
(`f9655302adf00405c97b36124bf69cf7a4a652c9` до и после).

| Шаг                            | Команда                                  | Результат                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «до»                           | `md5 AGENTS.md`                          | `92dd773095d4c3bb29c25e1aa62d326c`; блок `<!-- wolf:onboarding v2 -->` (строка 28), штампы проекта `2.17.1`                                                                                             |
| план (bare `--here`, non-TTY)  | `upgrade --here`                         | план + `Cancelled: --yes is required`, exit `0`, файлов не тронуто (md5 тот же)                                                                                                                         |
| проход                         | `upgrade --here --yes`                   | `base-set: 28 updated, 3 conflict`; `faces: … seeded ×6`; `verify: 34/37 ok · 3 needs decision`; `needs decision: .opencode/skills/{using-skills,wolf-execute,wolf-sdd}/SKILL.md (conflict)`; exit `0`  |
| «после»                        | `md5 AGENTS.md`                          | `2ea30afc0b311610bdb8b3fd5900170a`; блок `v3`, строка про `protect`/`--review`/`--resolve` появилась                                                                                                    |
| текст вне блока                | python-сравнение с вырезанием блока      | **byte-identical: True**, 1413 / 1413 байт                                                                                                                                                              |
| повторный проход               | `upgrade --here --yes`                   | `base-set: 28 identical, 3 conflict`; `faces: … skipped-live`; `faces seeded 0` → идемпотентность                                                                                                       |
| `--check` после                | `upgrade --here --check`                 | `stamps 2.20.0 · map 2.20.0`, ни `differ`, ни `mutated`; остались только 3 предсуществующих `foreign` файла                                                                                             |
| ре-верификация после `d3db7b4` | python-сравнение блока и внешнего текста | текст вне блока по-прежнему **byte-identical** состоянию до прохода (1413 байт до блока, после блока — пусто); блок v3 **байт-в-байт равен** `templates/base/AGENTS.md` (то же держит новый guard-тест) |

Три `conflict` — предсуществующая грязь worktree (те же 3 файла были `M` в `git status` до задачи,
плюс неотслеживаемый `.opencode/skills/wolf-draft/`); проход их не перезаписал (wx-политика), это и есть
проверка «чужие файлы не трогаются».

### Метрика успеха §1 (read-only, живой парк)

Парк из 5 проектов (`~/.config/wolf/projects.yaml`), запись в live-проекты не производилась. Реестр не
изменён (хеш тот же до/после всех прогонов). Baseline снят **установленным 2.19.0** (`/usr/local/bin/wolf`,
`--version` → 2.19.0), «после» — HEAD-CLI из этого дерева.

| Проект               | 2.19.0 (baseline)                                                                      | 2.20.0 (HEAD-CLI)                                                                            | Причина / вердикт                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `mister-wolf`        | `current` (stamps 2.19.0)                                                              | `behind` — `1 differ: AGENTS.md`                                                             | блок v2 в проекте, шаблон v3; путь назван, лечится одним проходом (доказано dogfood)                                                          |
| `adminvps`           | `current`                                                                              | `behind` — `1 differ: AGENTS.md`                                                             | то же                                                                                                                                         |
| `trading-signal`     | `current`                                                                              | `behind` — `1 differ: AGENTS.md`                                                             | то же                                                                                                                                         |
| `Tender`             | `unknown` — `foreign: .opencode/agents/mr-wolf.md`                                     | `behind` — `1 differ: AGENTS.md` + `foreign: .opencode/agents/mr-wolf.md`                    | чужой файл остаётся чужим; добавился названный differ блока                                                                                   |
| `opencode-nineroute` | `needs decision` — `mutated: .opencode/skills/using-skills/SKILL.md` (без других имён) | `needs decision` — `1 differ: AGENTS.md` + `mutated: .opencode/skills/using-skills/SKILL.md` | правка **настоящая**: `--show` показал локальный раздел «Дополнительный режим draft» поверх базы; адресуется `--resolve <файл>=keep\|protect` |
| `diverged`           | — (не печатается)                                                                      | `mister-wolf / faces/executor-lead.md v1` — отдельная секция, не адресуем                    | зона Стюарда, честно видимо; держит exit 2 по §4.16                                                                                           |
| `Protections`        | —                                                                                      | `Protections: none`                                                                          | ключей `protect` в парке ещё нет (день релиза)                                                                                                |

Разбор по категориям ложных сигналов (задача §1):

| Категория ложного сигнала 2.19.0              | Вхождений на 2.20.0                                  | Чем закрыто                                                                                                |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ложный `mutated` от штамп-дрейфа              | **0**                                                | правило 5 §4.3: healing до проверки свидетеля (dogfood: 28 файлов обновлены без `mutated`)                 |
| вечный `behind · 1 differ` от онбординг-блока | **0 needs-decision**; 4 × `behind` с названным путём | блок версионно-агностичен и обновляется на месте; `behind` честен (v2 в проекте) и исчезает за один проход |
| differ без имени                              | **0**                                                | REQ-01: `1 differ: AGENTS.md`, списки не усечены                                                           |
| ложный сигнал по `mcp.wolf`                   | **0**                                                | `--check` конфиги не инспектирует; совет doctor теперь выполним (`init` чинит запись)                      |
| настоящих needs-decision                      | **1**                                                | `opencode-nineroute` — реальная локальная правка, названа путём, разрешима одной командой                  |

Итог: **0 ложных needs-decision** на живом парке; единственный needs-decision — настоящий и именованный;
`diverged` вынесен отдельной секцией и не притворяется адресуемым решением.

Ограничение измерения: «после» измерено HEAD-CLI из дерева (2.20.0 не опубликован, `available: 2.19.0` —
ожидаемо до публикации). `--check` для живого парка записи не требует — эскалация не понадобилась.

### Прочие проверки

| Проверка                              | Результат                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--check` строго read-only в фикстуре | sha-дайджест `.opencode .wolf AGENTS.md` до/после `--here --check` в репозитории — идентичен (`daa1aafe…`)                    |
| `--check` read-only в живом парке     | хеш реестра до/после — идентичен; `git status` живых проектов не проверялся (записи не было по контракту §4.11 + тест NFR-03) |
| `init --help`, `upgrade --help`       | фактические тексты совпадают с описанными флагами                                                                             |
| `sync --help`                         | команда существует → документация говорит «алиас ещё работает», а не «удалён»                                                 |

## Находки ревью (независимый reviewer, два мандата)

Ревью выполнено дважды в **свежем контексте** отдельным процессом
(`opencode run --standalone --agent worker-reviewer`, opencode `v2.1.4`); дословный вывод обоих циклов —
`phase6-docs-review.txt`. Мандаты: **A** — фактическое соответствие продукту (команды, флаги, дефолты,
exit-коды, `protect`/`kept`/`diverged`, миграции, CHANGELOG), **B** — полезность для нового пользователя
и обновляющегося владельца (воспроизводимость примеров, честность ограничений).

### Цикл 1 — вердикт: запрос на правки (2 блокирующих)

Дословно: «ВЕРДИКТТ: ЗАПРОС НА ПРАВКИ … МАНДАТ-A: 9 находок (2 блокирующих, 1 P1, 3 P2, 3 P3) …
МАНДАТ-B: 2 находки (P2, P3)». Подтверждено живыми прогонами: правки предыдущего цикла (счётчик `missing`
vs `--json.missing[]`, коллизия `SKILL-2.md`, формат `steward zone`, режимы `--json`-схем без `check`),
таблица «глагол × цель», exit-модель, fail-safe `protect`, бэкапы, свидетель, миграция блока v2→v3.

| #   | Находка                                                                                                                                                                                                                                    | Вердикт по проверке                                                | Что сделано                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Дубль ключа `protect` обещал предупреждение `protect declared twice, first value wins` — в продукте его нет (`grep` по `src/` и `dist/` → 0; `parseProtect` молча берёт первый; живой прогон двух ключей → `protect: true · ok`, без warn) | **подтверждено, блокирующее**                                      | Текст приведён к продукту в CHANGELOG (пункт REQ-05), `upgrade.md` EN/RU: «первый побеждает, остальные игнорируются, предупреждение не печатается, ближайшая запись снимает все строки ключа». Повторно проверено ревью: `=pin`/`=protect`/`=keep` оставляют 1/1/0 строк                                                                                                                                                                                                                                |
| B2  | «Блочный режим — по умолчанию для проекта, инициализированного wolf» — свежий `init` пишет штампованный whole-file `AGENTS.md`                                                                                                             | **подтверждено, блокирующее**                                      | Переписано в `upgrade.md` EN/RU и `base-set.md` EN/RU (+ вводный абзац base-set): штампованный whole-file — то, что пишет свежий `init`; блочный — то, что `init` **дописывает**, если `AGENTS.md` уже существовал; `upgrade` блок не дописывает. Проверено живыми прогонами: fresh `init` → первая строка `<!-- wolf:rendered … 2.20.0 -->`; `init` поверх существующего файла → блок v3 дописан, исходные байты — точный префикс, штампа 0; `upgrade --here --yes` внешний файл не тронул (`foreign`) |
| P1  | Обещание info-строки `locally accepted (keep) at <base>, base <X.Y.Z>` — ни одна поверхность её не печатает                                                                                                                                | подтверждено                                                       | CHANGELOG: принятый файл остаётся `kept`, не делает проект `behind`, база записана в свидетеле, виден как `kept (local)`                                                                                                                                                                                                                                                                                                                                                                                |
| P2  | REQ-01: «каждый needs-decision (`mutated`/`diverged`/`conflict`) с путём» — `diverged` в `--check` не печатается, `--here --check --json` даёт `diverged: []`                                                                              | подтверждено                                                       | CHANGELOG: пути — для `mutated`/`conflict`/`differ`; `diverged` — своя stewarded-секция (`--review`, `--resolve`, строка `faces:` прохода), `--check` всегда exit 0 и лиц не печатает, `diverged[]` в JSON — режим парка                                                                                                                                                                                                                                                                                |
| P2  | Дерево `.wolf/` в `configuration.md` без `backup/upgrade/<date>/`                                                                                                                                                                          | подтверждено                                                       | Добавлено в EN/RU-дерево                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P2  | «Удаление `wolf sync` запланировано на более поздний релиз» против фактического сообщения `removed in 2.20.0`                                                                                                                              | подтверждено (сообщение устарело — дефект продукта, вне allowlist) | `platform.md` EN/RU: алиас жив, текст уведомления устарел — так и написано                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P3  | Список несовместимых пар флагов неполон                                                                                                                                                                                                    | подтверждено                                                       | Дополнен по `upgradeRoute` (`--review`+`--show`/`--check`, `--show`+`--check`, `--resolve`+`--check`) в EN/RU                                                                                                                                                                                                                                                                                                                                                                                           |
| P3  | README: `--json` назван только `wolf.upgrade/1`                                                                                                                                                                                            | подтверждено                                                       | EN/RU: обе схемы, `wolf.upgrade.check/1` с `--check`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P3  | Рецепт 12: detail `onboarding markers broken` только при пропавшем закрывающем маркере; при пропавшем открывающем — просто `foreign`                                                                                                       | подтверждено                                                       | Рецепт EN/RU разделяет два случая                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Цикл 2 — вердикт: APPROVED (блокирующих нет)

Дословно:

```text
VERDICT: APPROVED
CYCLE-1-BLOCKERS: 1 — resolved (...); 2 — resolved (...)
NEW-FINDINGS:
(нет блокирующих и нет новых фактических искажений; одно наблюдение-не-находка ниже в SUMMARY)
```

Наблюдение цикла 2 (не находка): формулировка «the next write strips every `protect:` line» точна для
нормализации; при `=protect`/`=pin` запись затем кладёт одну каноническую строку — ложно не является.
Не проверено ревью: интерактивный TTY-цикл `--review` (нет TTY; non-TTY ветка покрыта) и живой ремонт
`mcp.wolf` (проверен статически и тестами инициализации).

Инцидент прозрачности цикла 2: reviewer при первом `init` в фикстуре случайно записал её в живой
`~/.config/wolf/projects.yaml` (пустой `WOLF_SANDBOX` из-за несовпадения имён переменных) и немедленно
удалил запись; проверено после: 5 записей, прежний состав, фикстур нет. Репозиторий не тронут.

## Отклонения от брифа

1. **Расширение allowlist: `update-map.json`** (согласовано с L0 в ходе задачи). Причина: карта релиза не
   обновлялась ни одной задачей волны, а без неё `pin` фиксирует 2.19.0, `--check` печатает `map 2.19.0`
   против CLI 2.20.0, а категория `changed` для `AGENTS.md` отсутствует. Карта получена генератором
   (`--verify` зелёный), вручную не правилась. Это **пробел плана**, а не только allowlist.
2. **Dogfood выполнен с `--yes`**, а не bare `upgrade --here`: bare в non-TTY печатает план и завершается
   `Cancelled: --yes is required` (exit 0, без записи) — это штатное поведение 2.19.0/2.20.0, зафиксировано
   в evidence. Дополнительно worktree не содержит `.wolf/`, поэтому память создана одноразово и удалена;
   `WOLF_SANDBOX` исключил записи в живой конфиг.
3. **`.opencode/**` перештампован dogfood-проходом — РАЗРЕШЕНО координатором** (`abba767`): 28 файлов
базового набора приведены к шаблонам 2.20.0 и закоммичены, state переписан. Вне коммита осознанно остались
только предсуществующие локальные расхождения `.opencode/skills/{using-skills,wolf-execute,wolf-sdd}`(их текст новее шаблона — plugin-inject, в 2.20.0 не входит) и неотслеживаемый`.opencode/skills/wolf-draft/`.
Исходная проблема (грязное дерево, блокирующее merge) снята; запрет брифа на `.opencode/skills/\*\*` относился
   к этим трём файлам, а не к stamp-обновлениям набора.
4. **`wolf sync` в коде противоречит себе**: команда существует в 2.20.0, но её уведомление говорит
   `removed in 2.20.0`. Правка `src/**` — вне allowlist T15; документация описывает фактическое поведение
   («алиас ещё работает»), расхождение вынесено в риски.
5. **Асимметрия UX, зафиксированная как есть**: нештампованный файл на месте цели карты в `--check` даёт
   класс проекта `unknown — out of coverage` (`foreign`), а проход — `conflict` с просьбой решить. В
   документации описано буквально; для L0 это кандидат в отдельную задачу (класс `needs-decision` был бы
   честнее).

6. **Отступ в онбординг-блоке (найдено dogfood'ом, исправлено координатором `d3db7b4`)**: шаблон v3 рендерил
   продолжение пункта списка с нулевой колонки — блок оставался «валидным» для prettier, но markdown-список
   распадался на абзац. Исправлено в шаблоне и в корневом `AGENTS.md`, закрыто guard-тестом
   `tests/unit/onboarding-block-guard.test.ts` (RED до фикса). Урок: dogfood проверяет не только «блок
   обновился», но и «блок остался корректным markdown».

7. **Вывод ревью потерян при рестарте среды — ревью перезапущено целиком.** Дословный вывод цикла 1
   восстановлен повторным прогоном в свежем контексте (`opencode run --standalone --agent
worker-reviewer`); он же подтвердил уже внесённые незакоммиченные правки (счётчик `missing`,
   `SKILL-2.md`, `steward zone`, режимы `--json`-схем) и нашёл две новые блокирующие находки
   (см. §«Находки ревью»). Цикл 2 — APPROVED.

8. **Дефекты продукта, найденные попутно (вне allowlist T15 — документация описывает факт):**
   (a) `wolf sync` печатает `removed in 2.20.0`, хотя команда жива; (b) дубль ключа `protect`
   игнорируется молча (первый побеждает) — поведение задокументировано как есть;
   (c) `--here --check` не сообщает `diverged`-лица (`diverged: []`), они видны только в режиме
   парка. Кандидаты в отдельную задачу, не в T15.

9. **Инцидент прозрачности на ревью:** reviewer при первом `init` в фикстуре записал её в живой
   `~/.config/wolf/projects.yaml` (пустой `WOLF_SANDBOX` из-за несовпадения имён переменных),
   немедленно удалил запись и восстановил файл; после ревью проверено — 5 записей прежнего состава.
   Живые проекты и память не тронуты.

10. **Правка e2e-теста T14 (`tests/e2e/upgrade-park-modes.e2e.ts`) — вне исходного allowlist, но
    требуется AC(4).** Тест пинил `SET = '2.19.0'`; после бампа версии `7eba541` (эта же задача)
    шаблоны штампуются `2.20.0`, и файл падал на `beforeAll` (`expected '2.20.0' to be '2.19.0'`),
    не запуская свои 10 тестов. Правка — одна строка: версия набора читается из `package.json`
    (единственный источник версии по правилу репозитория); сценарий не ослаблен (штамп-дрейф,
    `map ${SET}`, heal, exit-модель).

11. **Правки документации оказались закоммичены параллельной сессией до моего коммита**: `1c0dfac`
    (`docs(2.20.0): T15 — docs review fixes (guide EN/RU, CHANGELOG, README pair)`) появился в ветке
    в ходе работы. Содержимое сверено (`git show --stat 1c0dfac` = рабочая копия, 15 файлов, +85/−80);
    отчёт и дословный вывод ревью остались за мной и коммитятся отдельно.

## Риски

| Риск                                                                                                   | Влияние                                                    | Что делать                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 3 предсуществующих расхождения `.opencode/skills/{using-skills,wolf-execute,wolf-sdd}` + `wolf-draft/` | проход в репозитории покажет `conflict`; вне этого коммита | решение L0: локальный контент новее шаблона (plugin-inject) — объявить `protect` или оставить |
| `available: 2.19.0` в `--check` до публикации                                                          | ожидаемо, но читатель может принять за дефект              | после публикации проверить `available: 2.20.0` (план, шаг 8)                                  |
| 4 проекта парка показывают `behind` из-за блока v2                                                     | выглядит как «шум» сразу после релиза                      | это честное отставание; исчезает после `wolf upgrade` каждого проекта (доказано dogfood)      |
| `diverged` лицо `executor-lead v1` в живом проекте                                                     | держит exit 2, не адресуемо                                | зона Стюарда: отдельный вызов, не T15                                                         |
| Бэкапы не GC-ятся                                                                                      | рост `.wolf/backup/upgrade/`                               | документировано; чистка вручную                                                               |
| `protect` у старых версий = `mutated`                                                                  | парк, обновлённый наполовину, даёт шум                     | CHANGELOG: обновлять парк целиком; откат лечится повторным апгрейдом/восстановлением state    |
| Regression guard зависит от версии opencode                                                            | будущий opencode может пробросить ключ                     | живой прогон оставлен как tripwire (T14), лекарство `--resolve <файл>=keep`                   |
| Уведомление `wolf sync` говорит `removed in 2.20.0` при живой команде                                  | читатель видит противоречие с докой                        | дока описывает факт; устаревший текст — дефект продукта, кандидат в отдельную задачу          |
| Дубль ключа `protect` игнорируется молча                                                               | владелец может ждать предупреждения                        | дока говорит прямо «предупреждения нет»; кандидат в улучшение продукта                        |
| `--here --check` не показывает `diverged`-лица                                                         | локальная проверка не видит дрейф лица                     | смотреть парковый `--check` (там секция и `diverged[]`); задокументировано                    |
| Внешний reviewer может писать в живой реестр при пустом `WOLF_SANDBOX`                                 | загрязнение `~/.config/wolf/projects.yaml`                 | бриф внешнему ревьюеру задаёт `WOLF_SANDBOX` явно; инцидент этого прогона устранён и проверен |

## FRICTION

- **Платформа: `subagent` → `Subagent depth limit reached (1)`.** Роль lead'а требует декомпозиции и
  воркеров, но на глубине 1 они недоступны: документационная задача MEDIUM/COMPLEX выполнена одиночно,
  контекст израсходован на research+writing. Компенсация — независимое ревью отдельным процессом
  (`opencode run --standalone --agent worker-reviewer`). Если вложенность не поднимается
  (`experimental.subagent_depth`), исполнительские брифы для субагентов стоит формулировать как
  «одиночное исполнение + внешний reviewer».
- **`timeout` отсутствует в macOS-окружении** (zsh: `command not found: timeout`) — обёртки для внешних
  команд в брифе лучше не предполагать.
- **`format:check` покрывает неотслеживаемые отчёты `docs/dev/**`.** Новый отчёт не проходит
`npm run check`на самой первой стадии, пока его не отформатирует prettier; отчёт пишется сразу
формато-совместимым (или`npx prettier --write` перед гейтом).
- **`opencode run --standalone --agent worker-reviewer` печатает весь ход живых прогонов** (≈2 400 строк
  на цикл). Дословный вывод нужно сразу перенаправлять в файл (`>> phase6-docs-review.txt`), иначе он
  съедает контекст исполнителя; в отчёт идут вердикт и сжатая таблица находок.
