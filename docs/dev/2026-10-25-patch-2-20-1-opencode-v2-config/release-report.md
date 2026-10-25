# Release report — Wolf 2.20.1 (opencode v2 config correctness)

## Metadata

| Поле                  | Значение                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Версия                | **2.20.1** (с 2.20.0)                                                                                                                             |
| Дата                  | 2026-10-25                                                                                                                                        |
| Тред                  | `mem_20261025_patch_2_20_1_subagent_depth_pod_experime_aa8af3`                                                                                    |
| task_id               | `release-2-20-1`                                                                                                                                  |
| База `main` до merge  | `38aceab`                                                                                                                                         |
| Merge-коммит (`main`) | **`4225da6`** (`--no-ff`, «merge(2.20.1): opencode v2 config — experimental.subagent_depth, native mcp.servers, doctor validation, key registry») |
| Тег                   | **`v2.20.1`** (annotated) → объект `1ec8024`, указывает на `4225da6`                                                                              |
| Ветка                 | `fix/2.20.1-opencode-v2-config` (сохранена; worktree удалён)                                                                                      |
| Исполнитель           | executor-lead (L1), без воркеров                                                                                                                  |
| Профиль               | FIX-релиз исполненного плана: релизный конвейер, кода не меняли                                                                                   |

## Summary

Патч 2.20.1 выпущен полностью: merge в `main`, tag, npm (trusted publishing + provenance),
GitHub Release, деплой сайта, выравнивание парка, проверки на опубликованном артефакте.
Код с момента зелёного гейта (`f558031`) не менялся — проверено diff'ом до релиза:
`git diff --stat f558031..HEAD -- src tests` пуст, в `f558031..HEAD` только `docs/dev`.

Единственное, что пришлось доделать сверх чек-листа брифа, — документационный гейт релиза:
README (EN/RU), `guide/mcp` (EN/RU) и `guide/getting-started` (EN/RU) продолжали обещать плоскую
форму `mcp.wolf` и верхнеуровневый `subagent_depth`, которые 2.20.1 больше не пишет. Это
прямое противоречие выпуску в пользовательском пути установки, поэтому пары исправлены и
сайт пересобран/перезадеплоен (см. «Changes», коммит `docs(2.20.1): stale mcp.wolf claims…`).

## Changes

1. `npm version 2.20.1 --no-git-tag-version`; `CHANGELOG.md`: `## [Unreleased]` → `## [2.20.1] - 2026-10-25`
   (пустой `[Unreleased]` не оставлен, как в 2.20.0).
2. `node scripts/generate-update-map.mjs` → `update-map.json`: `version 2.20.1, prev 2.20.0, 30 files
(30 unchanged), 6 faces`; `--verify` → in sync.
3. `npm run docs:build` → CLI reference перегенерирован, `sync-changelog` обновил пары
   `docs/site/changelog` + RU, vitepress build `9.28s`, exit 0.
4. Коммит в ветке `ee622af` — `chore(2.20.1): version 2.20.1, update map and generated docs`
   (6 файлов: CHANGELOG, package.json, package-lock, update-map, 2 changelog-страницы).
5. Merge `--no-ff` в `main` → `4225da6`; push `2545f55..4225da6`; tag `v2.20.1` + push.
6. Документационный гейт (после деплоя, до отчёта): исправлены устаревшие утверждения
   `mcp.wolf` / `subagent_depth` в README EN/RU, `docs/site/guide/mcp.md` (+RU),
   `docs/site/guide/getting-started.md` (+RU); сниппет opencode приведён к нативной форме
   `{ "type": "local", "command": ["wolf","mcp"], "disabled": false }`. Сборка сайта повторена.
7. `chore(2.20.1): align .opencode base-set with installed CLI` — штатный результат
   `wolf upgrade --yes` по живому проекту: 30 файлов базового набора + `wolf-sync-state.json`,
   diff строго stamp-only (`set=2.20.0` → `set=2.20.1`, 0 содержательных строк), как в 2.20.0.
8. Этот отчёт: `docs(2.20.1): release report`.

## Task Decomposition

| Подзадача                                    | Класс   | Исполнитель | Обоснование                                      |
| -------------------------------------------- | ------- | ----------- | ------------------------------------------------ |
| Preflight (состояние ветки/гейта)            | TRIVIAL | сам         | 3 команды, без правок                            |
| Версия + CHANGELOG + update map + docs:build | SIMPLE  | сам         | 6 известных файлов, механические правки          |
| Merge / push / tag                           | TRIVIAL | сам         | git — зона lead'а                                |
| Наблюдение workflow                          | TRIVIAL | сам         | `gh run watch`                                   |
| Проверки npm + чистая установка              | SIMPLE  | сам         | изолированный tmp-каталог                        |
| Живой `init` + `doctor` на фикстуре          | SIMPLE  | сам         | временный проект вне репо, `WOLF_SANDBOX`        |
| Проверка сайта                               | TRIVIAL | сам         | curl по 7 адресам                                |
| Выравнивание парка                           | SIMPLE  | сам         | штатная команда `wolf upgrade --yes` → `--check` |
| Документационный гейт + правка пар страниц   | SIMPLE  | сам         | 7 файлов, фактические правки из живого конфига   |
| Release report                               | TRIVIAL | сам         | один файл                                        |

Воркеров не спавнил: все подзадачи TRIVIAL/SIMPLE по таблице и последовательно зависимы
(git-операции и публикация — зона lead'а).

## Workers Used

Нет. Воркер-лимит (5) не тронут, FRICTION нет.

## Validation Results

### Гейт workflow (GitHub Actions)

| Workflow                    | Run                                                           | Статус  | Длительность |
| --------------------------- | ------------------------------------------------------------- | ------- | ------------ |
| `Publish` (`push/v2.20.1`)  | https://github.com/chekh/mister-wolf/actions/runs/40229997303 | success | 8m0s         |
| `CI` (`push/main`)          | https://github.com/chekh/mister-wolf/actions/runs/40229995391 | success | 2m54s        |
| `Deploy Docs` (`push/main`) | https://github.com/chekh/mister-wolf/actions/runs/40229995457 | success | 1m11s        |

`Publish` шаги: tag↔package.json sanity, checks, E2E, pack dry-run, publish (OIDC). Публикация —
trusted publishing: `Signed provenance statement … from GitHub Actions`, transparency log
`logIndex=3467976223`, `829` файлов, `+ mister-wolf@2.20.1`. Ручного `npm publish` не было.

### npm и установка из реестра

| Проверка         | Команда                                                          | Результат                                                     |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| версия в реестре | `npm view mister-wolf version --prefer-online`                   | `2.20.1` (пропагация ~1 мин: первые опросы отдавали `2.20.0`) |
| канал latest     | `npm view mister-wolf dist-tags.latest --prefer-online`          | `2.20.1`                                                      |
| чистая установка | `npm i mister-wolf@2.20.1` в пустом `$TMPDIR/rel-2.20.1-install` | `found 0 vulnerabilities`                                     |
| бинарь           | `npx wolf --version`                                             | `2.20.1`                                                      |

### Живой `init` на чистом проекте (главный фикс)

Фикстура: `/Users/chekh/Development/wolf-release-check-2.20.1` (вне os-tmpdir — иначе `doctor`
прунит запись), изолированный `WOLF_SANDBOX`, CLI установленного пакета 2.20.1.

| Утверждение                                                                                 | Результат                                                                   |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `mcp.servers.wolf` = `{type:local, command:["wolf","mcp"], disabled:false}`, без `codemode` | **PASS**                                                                    |
| `experimental.subagent_depth = 2`                                                           | **PASS**                                                                    |
| верхнеуровневого `mcp.wolf` нет                                                             | **PASS**                                                                    |
| верхнеуровневого `subagent_depth` нет                                                       | **PASS**                                                                    |
| `default_agent = mr-wolf`                                                                   | **PASS**                                                                    |
| повторный `init --yes`                                                                      | `opencode.json: unchanged`, sha256 `0b0449a4…` до и после — **байт-в-байт** |
| `wolf doctor` на этом проекте                                                               | `ok (schema v2)`, exit `0`, замечаний по ключам нет                         |

Негативный контроль (тот же фикстур: `experimental.subagent_depth=1` + плоский `mcp.wolf`):
`doctor` назвал оба расхождения (`top-level mcp.wolf is foreign and deprecated`,
`experimental.subagent_depth=1 — the three-level scheme needs >=2`), `doctor --repair`/`init`
чужое значение не перезаписали — гварды работают. Фикстура и её sandbox после проверки удалены.

### Сайт после деплоя (сборка ≠ деплой)

| Страница                                       | HTTP      | Ключи                                                                                                  |
| ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `guide/configuration` EN / RU                  | 200 / 200 | `mcp.servers` есть, `experimental.subagent_depth` есть                                                 |
| `guide/troubleshooting` EN / RU                | 200 / 200 | `mcp.servers`, `experimental.subagent_depth` есть                                                      |
| `changelog` EN / RU                            | 200 / 200 | секция `[2.20.1] - 2026-10-25`                                                                         |
| главная                                        | 200       | `2.20.1` ×3 (навбар), `2.19.x` нет                                                                     |
| `guide/mcp` EN / RU (после правки)             | 200 / 200 | ключ `mcp.servers.wolf`, сниппет `"servers": { "wolf": {…} }`; `"enabled": true` больше не встречается |
| `guide/getting-started` EN / RU (после правки) | 200 / 200 | `mcp.servers.wolf`, `experimental.subagent_depth`                                                      |

Повторный деплой после правки пар README/`mcp`/`getting-started` — коммит `e3cbd9c`:
`CI` https://github.com/chekh/mister-wolf/actions/runs/40231329182 — success, 2m39s;
`Deploy Docs` https://github.com/chekh/mister-wolf/actions/runs/40231329232 — success, 1m5s.
Проверка страниц выше — уже после этого деплоя.

### GitHub Release

`v2.20.1` — «2.20.1 — opencode v2 config correctness», `isDraft=false`, `isPrerelease=false`,
заметки = секция `## [2.20.1]` из `CHANGELOG.md`.

### Парк после релиза

`wolf upgrade --yes` (CLI 2.20.0 → 2.20.1, затем проход): `updated 3 · up-to-date 0 · needs decision 2 ·
errors 0`, verify `37/37 ok` на обновлённых проектах.

| Проект                                                 | Итог                           | Остаток                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mister-wolf` (`/Users/chekh/Development/mister-wolf`) | `needs decision`, verify 36/37 | лицо `executor-lead` diverged — память/зона Стюарда, `--resolve` не адресует; базовый набор обновлён (stamp-only)                                              |
| `adminvps`                                             | `updated`, 37/37               | —                                                                                                                                                              |
| `trading-signal`                                       | `updated`, 37/37               | —                                                                                                                                                              |
| `Tender`                                               | `needs decision`, 36/37        | `conflict: .opencode/agents/mr-wolf.md` — чужой файл, не перезаписан; проект числится «out of coverage», но штатный проход его затрагивает (факт зафиксирован) |
| `opencode-nineroute`                                   | `updated`, 37/37               | —                                                                                                                                                              |

`wolf upgrade --check` после прохода: CLI `2.20.1 · available 2.20.1`; `mister-wolf`, `adminvps`,
`trading-signal`, `opencode-nineroute` — `current` (stamps 2.20.1 · map 2.20.1); `Tender` —
`unknown — out of coverage` (stamps 2.20.1 · map 2.20.1 · foreign `.opencode/agents/mr-wolf.md`), exit `0`.
Проход также сообщил: 8 проектов с памятью Wolf вне реестра (самолечение при первом вызове).

## Остаточные риски и ограничения

1. **Плоская `mcp.wolf` в живых конфигах парка не мигрирована.** `wolf doctor` по парку
   предупреждает все пять зарегистрированных проектов (`mister-wolf`, `adminvps`, `trading-signal`,
   `Tender`, `opencode-nineroute`): `wolf entry is in the deprecated top-level mcp.wolf form — run wolf
init to migrate it to mcp.servers.wolf`. Это ожидаемо: `wolf upgrade` конфиги платформ не
   переписывает, а бриф запрещает ручную правку живых конфигов. Штатный путь — `wolf init`
   (или `wolf doctor --repair`) в каждом проекте; решение за владельцем.
2. **`docs/site/guide/upgrade.md` (EN/RU)** сохраняет исторический раздел «`init` и пропавший
   `mcp.wolf`» — это описание прежнего поведения 2.20.0, не инструкция; оставлено как журнал.
3. **`doctor` по репо** содержит пре-существующие артефактные замечания (docs/dev governance,
   orphaned worktree scopes) — не связаны с релизом, не чинились (pre-existing failure).
4. **Пропагация npm** ~1 мин: сразу после `Publish` реестр ещё отдавал `2.20.0`.
5. `Tender` — «out of coverage», но штатный проход его затрагивает (так и было заявлено в брифе);
   его чужой `mr-wolf.md` оставлен нетронутым.

## Итоговые артефакты

- Merge: `4225da6` в `main` (запушен), tag `v2.20.1` (объект `1ec8024`, запушен); поверх —
  `6d52970` (правка пар документации) и `e3cbd9c` (выравнивание базового набора), запушены.
- Ветка `fix/2.20.1-opencode-v2-config` сохранена; worktree `.worktrees/patch-2-20-1-opencode-v2-config`
  удалён, `git worktree prune` выполнен, дерево `main` чистое.
- npm `mister-wolf@2.20.1` (latest), GitHub Release `v2.20.1`, сайт задеплоен и проверен на 2.20.1.
