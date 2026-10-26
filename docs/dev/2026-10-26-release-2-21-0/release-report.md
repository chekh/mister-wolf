# Release report — Wolf 2.21.0 (opencode config surface: both project locations)

## Metadata

| Поле                  | Значение                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Версия                | **2.21.0** (с 2.20.1)                                                                                                                                                              |
| Дата                  | 2026-10-26                                                                                                                                                                         |
| Тред                  | `mem_20261025_2_21_0_ostatki_audita_konfigov_opencode_21fb37` (переведён в `completed`)                                                                                            |
| task_id               | `release-2.21.0-config-surface`                                                                                                                                                    |
| Основание             | §6.7 аудита opencode v2 (`docs/dev/2026-10-25-opencode-v2-config-audit/audit.md`, §3 строка 18) + решение владельца `mem_20261026_resheniya_vladeltsa_po_6_6_6_8_audita_op_48eb3d` |
| База `main` до merge  | `a55bc48`                                                                                                                                                                          |
| Merge-коммит (`main`) | **`06c2ec0`** (`--no-ff`, «merge(2.21.0): opencode config surface — both project locations, doctor/init/uninstall aware»)                                                          |
| Тег                   | **`v2.21.0`** (annotated) → объект `4292138`, указывает на `06c2ec0`                                                                                                               |
| Ветка                 | `release/2.21.0` (сохранена; worktree `.worktrees/release-2.21.0` удалён)                                                                                                          |
| Исполнитель           | executor-lead (L1) + 3 воркера (implementer / researcher / reviewer) + 2 цикла ревью                                                                                               |
| Профиль               | **LITE** — одна поверхность поведения, без новых публичных API; изменения в порту — один опциональный параметр `writeConfig(..., { createFile })`                                  |
| npm                   | `mister-wolf@2.21.0` (latest, trusted publishing + provenance)                                                                                                                     |
| GitHub Release        | https://github.com/chekh/mister-wolf/releases/tag/v2.21.0                                                                                                                          |
| Сайт                  | https://chekh.github.io/mister-wolf/ (бейдж `v2.21.0`, секция `[2.21.0] - 2026-10-26` в changelog EN+RU)                                                                           |

## Summary

Релиз 2.21.0 выпущен полностью: merge в `main`, tag, npm (trusted publishing + provenance), GitHub Release, деплой сайта, проверки на опубликованном артефакте.

Содержание — ровно один функциональный пункт (§6.7 аудита opencode v2): Wolf читает конфиг opencode в двух локациях — корневой `<root>/opencode.json(c)` и `<root>/.opencode/opencode.json(c)` — с приоритетом у `.opencode` (opencode v2 мержит корневой файл раньше, `.opencode` позже, то есть перекрывает). `doctor`, `init` и `uninstall` учитывают обе локации. Место записи wolf-ключей не изменилось: по-прежнему корневой конфиг, в `.opencode/` wolf не пишет никогда.

Пункт §6.6 (`temperature`) закрыт решением владельца «оставить как есть» без правок кода; §6.8 (миграция `.opencode/command/` → `commands/`) перенесён в 2.22.0.

Ревью вернуло 1 major + 5 minor + 2 nit; после цикла правок — 0 major, 2 minor + 2 nit, вердикт `APPROVED`. Два minor и два nit отложены на 2.22.0 по прямой рекомендации ревьюера (см. «Остаточные риски»).

## Changes

1. **Код поверхности конфига** (`feat(2.21.0)`, `ea11575`) — 8 файлов:
   - `src/adapters/platforms/opencode-config-keys.ts` — реестр: `CONFIG_LOCATIONS` (`.opencode` → `root`, порядок приоритета чтения), `WRITE_LOCATION_ID`, чистые `locatePath` / `mergeConfigs` / `mergeSurface`. Кандидат, ключ, локация и способ проверки идут через реестр — строковых литералов путей в адаптере нет.
   - `src/adapters/platforms/opencode-adapter.ts` — `loadSurface` (обе локации + эффективный вид), `readConfig` (слейдженный вид), `writeConfig` (решения по эффективному виду, запись только в корень), `removeWolf` / `removeWolfKeys` (снятие наших ключей оттуда, где они реально объявлены), `configIssues` (проверки по эффективному виду, сломанный файл называется).
   - `src/ports/platform-adapter.port.ts` — `writeConfig(projectRoot, cmd, opts?: { createFile?: boolean })`: `createFile: false` — режим repair-only. Докстринг `configFile` уточнён (может перечислять несколько файлов).
   - `src/app/use-cases/init-project.ts` — одна точка: минимальный init передаёт `{ createFile: false }`.
   - `src/app/use-cases/uninstall.ts` — текст плана «no config file» → «no readable config file» (битый конфиг ≠ отсутствующий).
2. **Тесты** — +24 кейса: обе локации, приоритет `.opencode`, doctor без ложного «wolf entry missing», init без второго ключа, uninstall из фактической локации, изоляция битого файла по локациям, repair-only режим минимального init, `mergeSurface`.
3. **Документация** (`docs(2.21.0)`, `157d89b`) — 8 файлов, 5 пар EN/RU: `guide/configuration.md` (новая секция «Where the config file lives» / «Где живёт файл конфига»), `guide/mcp.md`, `guide/troubleshooting.md` (§15), `guide/cli/platform.md`.
4. **Версия и журнал** (`chore(2.21.0)`, `adc4b61`) — `npm version 2.21.0 --no-git-tag-version`; `CHANGELOG.md` §`[2.21.0] - 2026-10-26`; `update-map.json` (30 файлов базового набора без изменений, 6 лиц); зеркала changelog на сайте пересобраны `scripts/sync-changelog.mjs` (вручную не правились).

## Task Decomposition

| Подзадача                                              | Класс   | Исполнитель        | Обоснование                                                              |
| ------------------------------------------------------ | ------- | ------------------ | ------------------------------------------------------------------------ |
| Профиль, бриф, декомпозиция, гейты                     | TRIVIAL | сам                | решения владельца прочитаны, профиль LITE зафиксирован                   |
| Реализация поверхности конфига + тесты                 | MEDIUM  | worker-implementer | 2 исходника + порт + use-case + 3 тестовых файла, ~900 строк             |
| Карта документационной поверхности и версии сайта      | SIMPLE  | worker-researcher  | read-only обход 27 EN-страниц + 27 RU-зеркал + скрипты сборки            |
| Независимое ревью (2 цикла)                            | MEDIUM  | worker-reviewer    | независимость от исполнителя обязательна; 2 цикла по находкам            |
| Документация (5 пар EN/RU) + CHANGELOG                 | SIMPLE  | сам                | общий текст — один владелец записи; правка по содержанию, не механически |
| Версия, update-map, `docs:build`                       | TRIVIAL | сам                | package.json — единственный источник версии                              |
| Merge `--no-ff`, push, tag, публикация, GitHub Release | TRIVIAL | сам                | git-зона lead'а; порядок — по брифу и правилу памяти о публикации        |
| Живая проверка на опубликованном артефакте             | SIMPLE  | сам                | чистая установка `mister-wolf@2.21.0` + фикстура с `.opencode`           |
| Отчёт, запись в память, триаж жалобы                   | TRIVIAL | сам                | один файл + две записи в память                                          |

## Workers Used

| Воркер             | Циклов | Что делал                                                             | Вердикт/итог                                              |
| ------------------ | ------ | --------------------------------------------------------------------- | --------------------------------------------------------- |
| worker-implementer | 2      | реализация поверхности + тесты; цикл 2 — правки по находкам F-01…F-10 | DONE_WITH_CONCERNS → все находки закрыты                  |
| worker-researcher  | 1      | карта документации, версия сайта, зеркала changelog, образец 2.20.1   | DONE_WITH_CONCERNS (поправка посылки брифа)               |
| worker-reviewer    | 2      | независимое ревью соответствия и качества                             | CHANGES_REQUIRED → **APPROVED** (0 major, 2 minor, 2 nit) |

Лимит воркеров (5) не превышен. FRICTION — см. ниже.

## Validation Results

### Гейты workflow (GitHub Actions)

| Workflow                    | Run         | Статус  | Длительность |
| --------------------------- | ----------- | ------- | ------------ |
| `Publish` (`push/v2.21.0`)  | 40326178489 | success | 6m29s        |
| `CI` (`push/main`)          | 40326152423 | success | 2m58s        |
| `Deploy Docs` (`push/main`) | 40326152376 | success | 1m6s         |

`Publish`: sanity «тег ↔ версия в package.json», `npm run check`, `npm run e2e`, pack dry-run, publish (OIDC + provenance).

### Локальные гейты lead'а (ветка `release/2.21.0`, база `a55bc48`)

| Проверка         | Команда                                             | Exit | Результат                                                              |
| ---------------- | --------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| Полный гейт      | `npm run check`                                     | 0    | 215 файлов / 1982 теста — зелёные                                      |
| E2E              | `npm run e2e`                                       | 0    | 61 файл / 233 теста — зелёные                                          |
| Сборка сайта     | `npm run docs:build`                                | 0    | CLI-справочник и зеркала changelog пересобраны, vitepress build 27s    |
| english-surface  | `node scripts/check-english-surface.mjs`            | 0    | 94 файла — кириллицы в литералах `src/adapters/**` нет                 |
| Обновление карты | `node scripts/generate-update-map.mjs` + `--verify` | 0    | version 2.21.0, prev 2.20.1, 30 файлов (30 unchanged), 6 лиц — in sync |

Известная флакующая проверка (не связана с релизом): `tests/unit/adapters/cli/face-recover-cli.test.ts` — маргинальный таймаут 5s под нагрузкой; воспроизводится и на pristine-коде (контрольный прогон со stash), к коду релиза отношения не имеет.

### Живая проверка на опубликованном артефакте (mister-wolf@2.21.0)

Чистая установка в изолированный каталог; фикстура вне `os.tmpdir` (иначе `doctor` прунит запись), изолированный `WOLF_SANDBOX`.

| Утверждение                                                           | Результат                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| минимальный `init` в проекте, где конфиг только в `.opencode`         | `platform opencode: skipped — no root opencode.json to repair — the project config is .opencode/opencode.json; a minimal init never creates a platform config`; корневой `opencode.json` **не создан**                           |
| `doctor` на том же проекте                                            | `ok (schema v2)`, замечаний нет — **нет ложного `wolf entry missing`**                                                                                                                                                           |
| `uninstall --yes`                                                     | `config opencode: removed [mcp.servers.wolf, default_agent=mr-wolf, subagent_depth=2]`; ключи сняты **из `.opencode/opencode.json`** (файл, где они реально объявлены), `$schema` пользователя сохранён, корневой файл не создан |
| `init --platform opencode` (конфиг в `.opencode` без `default_agent`) | корневой `opencode.json` создан с `default_agent` + `experimental.subagent_depth` и **без второго `mcp.servers.wolf`**; `.opencode/opencode.json` не тронут                                                                      |
| версия в реестре                                                      | `npm view mister-wolf version` → `2.21.0`, `dist-tags.latest` → `2.21.0` (пропагация ~1 мин: сразу после Publish отдавал `2.20.1`)                                                                                               |

### npm, реестр и сайт

| Проверка                                                            | Результат                                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| npm latest                                                          | `2.21.0`                                                                                                                                    |
| GitHub Release                                                      | `v2.21.0` — «2.21.0 — opencode config surface: both project locations», не draft/prerelease; заметки = секция `## [2.21.0]` из CHANGELOG.md |
| Главная сайта                                                       | HTTP 200, бейдж `v2.21.0`                                                                                                                   |
| `guide/configuration`, `guide/mcp`, `guide/troubleshooting` (EN+RU) | HTTP 200, бейдж `v2.21.0`, новая секция о двух локациях на месте                                                                            |
| `changelog/` и `ru/changelog/`                                      | HTTP 200, секция `[2.21.0] - 2026-10-26`                                                                                                    |

## Остаточные риски и ограничения

1. **Долг из ревью 2.21.0 отложен на 2.22.0** (по рекомендации самого ревьюера; вердикт `APPROVED`): N-01 — план `uninstall` при битом корневом конфиге говорит «no readable config file», хотя ключи из здоровой `.opencode` всё же снимаются (план недооценивает, данные не в опасности); N-02 — у `mergeSurface` нет прямого теста (покрыт сквозными тестами адаптера); N-03 — ранний `skipped` не называет битые файлы (доктор называет); N-04 — `removeWolf` молча игнорирует битый файл (у порта нет канала `reason`).
2. **Приоритет `.opencode` над корнем подтверждён документацией opencode v2** (`v2/docs/config`, исходники `services/www/src/docs/content/config.mdx`: «later configs override earlier ones only for conflicting keys», «every discovered `.opencode` config overrides every direct config»), но **живой пробы на реальном opencode v1/v2 в этом релизе не было** — ограничение аудита §9.5 остаётся в силе.
3. **Wolf читает только конфиги в корне проекта**, тогда как opencode v2 ищет конфиги вверх по дереву. Это соответствует брифу (две проектные локации) и не является дефектом 2.21.0, но расхождение с платформой остаётся.
4. **Потеря JSONC-комментариев при `wolf uninstall`** — сознательный shortcut (AST-редактор вне scope). Новое: blast radius вырос на `.opencode/opencode.jsonc`; задокументировано в CHANGELOG и на сайте.
5. **В релиз вошли 2 непушенных коммита чистки репозитория** (`554574a` — удаление 10 дорелизных агентов и конвейера `autorefine`; `520f5e0` — удаление дорелизного шаблона мастер-плана). `templates/base` они не трогали, `update-map.json` их не содержит → пользовательского эффекта нет, в CHANGELOG они не внесены (по уточнению владельца).
6. **Выравнивание собственного `.opencode` парка (stamp-only) не выполнялось**: бриф запрещает правки набора агентов в этом релизе. Проект остаётся со штампом 2.20.1 до ближайшего `wolf upgrade --yes` после установки 2.21.0.
7. **Пропагация npm** ~1 мин: сразу после `Publish` реестр ещё отдавал `2.20.1` в поле `version` (dist-tag `latest` обновился сразу).
8. Строка отчёта init может перечислить `mcp.servers.wolf` рядом с именем корневого файла, если сервер объявлен в `.opencode`, а в корень дописаны другие ключи (ключи в отчёте — эффективные, файл — фактически записанный). Косметическая неточность, отложена на 2.22.0.

## Итоговые артефакты

- Merge `06c2ec0` в `main` (запушен, вместе с двумя коммитами чистки репозитория, ожидаемыми по решению владельца); tag `v2.21.0` (annotated, объект `4292138` → `06c2ec0`) запушен.
- npm `mister-wolf@2.21.0` (latest), GitHub Release `v2.21.0`, сайт задеплоен и проверен на 2.21.0.
- Ветка `release/2.21.0` сохранена; worktree `.worktrees/release-2.21.0` удалён, `git worktree prune` выполнен, дерево `main` чистое.
- Память Wolf: `mem_20261026_2_21_0_opublikovan_poverkhnost_chteniya_0f6701` (запись о публикации) и `mem_20261026_istoriya_tred_2_21_0_ostatki_audita_konf_def27a` (закрытие треда, факт — в `current_state` треда, который CLI не даёт править).
