---
slug: wave-2-32-0-upgrade-ux-memory-ids
title: '2.32.0 — волна: тест-план'
status: draft
created: 2026-11-06
baseline: 98252ff8
---

# 2.32.0 — волна — тест-план

Источник сценариев — [plan.md](plan.md) (AC брифов T02–T07) и [design.md](design.md)
(контракт ID). Пометка «реализовано» означает покрытие в коде этой волны, а не прогон
на живом парке.

## Прогоны

- Точечные: `npx vitest run <путь>`; отдельный файл — при правке одной поверхности.
- Полный гейт: `npm run check` (english-surface → prettier → tsc → build → vitest).
- E2E: `npm run e2e` (сборка + `tests/e2e`), точечно — `npx vitest run --config tests/e2e/vitest.config.ts <файл>`.
- Doctor/артефакты: `node dist/bootstrap/cli.js doctor` (в т.ч. lint `docs/dev`).
- JSON-контракт: `wolf upgrade --here --json` на одном фикстуре до/после — побайтное сравнение.

## T02 — отчёт upgrade (реализовано)

| ID  | Given/When/Then                                                                                                             | Маппинг                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| S01 | Даны статусы info/ok/warn/error/skip → в styled и plain каждая строка несёт свой глиф; `●/✓/·` различимы в mono             | `tests/unit/adapters/report-renderer.test.ts`                                             |
| S02 | Дан проект с деталями (base-set/faces/verify/needs decision) → у деталей нет глифа статуса, текст в колонке статусных строк | там же (R15.1/R15.2 + snapshot)                                                           |
| S03 | Даны решения трёх кодов → три отдельные строки в порядке conflict → skipped-mutated → diverged, `diverged` присутствует     | `tests/unit/use-cases/upgrade-projects.test.ts`, `tests/integration/upgrade-park.test.ts` |
| S04 | Парковый проход и `--here` → одинаковый формат деталей (одна реализация)                                                    | `tests/integration/upgrade-here.test.ts`, `upgrade-park.test.ts`                          |
| S05 | `--json` на том же фикстуре → документ `wolf.upgrade/1` не изменился                                                        | ручная сверка до/после + `tests/e2e/upgrade-park-modes.e2e.ts`                            |

## T03/T03b — доставка рамки

| ID  | Given/When/Then                                                                                                        | Маппинг                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| S06 | Инъекция using-skills → заголовок сообщает доставку и не требует действия; FALLBACK-ветка отлична и явно деградирована | `tests/unit/adapters/render/plugin-injection.test.ts`                     |
| S07 | Доставленный канон жалоб → нет титула «(v2)»                                                                           | ревью текста + grep в гейте                                               |
| S08 | Живое лицо жалоб → обновлено контуром Стюарда                                                                          | **BLOCKED** каналом атрибуции (стадия 1); перенесено на решение владельца |

## T05 — английские ID

| ID  | Given/When/Then                                                                                                                                                                 | Маппинг                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| S09 | `slug=release-plan`, дата 2026-11-06 → `mem_20261106_release-plan_<hash6>`                                                                                                      | `tests/unit/adapters/hash-id-generator.test.ts`                                                            |
| S10 | slug в верхнем регистре/с пробелами → нормализован; кириллица/пусто/невалидные символы → fallback `mem_<date>_<hash6>` без слов                                                 | там же                                                                                                     |
| S11 | Тот же slug+дата дважды → одинаковый ID (детерминизм); прежнего поведения с мс нет                                                                                              | там же                                                                                                     |
| S12 | Коллизия: тот же id, другой title/type → `-2`, затем `-3`; тот же title/type → отказ с подсказкой                                                                               | `tests/e2e/add-collision-guard.e2e.ts`, `tests/unit/use-cases/*`                                           |
| S13 | Старые транслитерированные ID читаются, ищутся, supersede работает; document-ref ID не изменились                                                                               | `tests/unit/adapters/scan-doc-id*`, `tests/e2e/migrate-doc-ids.e2e.ts`, `tests/unit/adapters/document-id*` |
| S14 | CLI `--slug` и MCP `slug` проходят до генератора; невалидный slug — fallback + предупреждение в stderr; отсутствующий slug — fallback без предупреждения (сигнал — id без слов) | `tests/e2e/add-slug.e2e.ts`, `tests/unit/use-cases/add-memory-object.test.ts`                              |
| S15 | English-surface: в `src/adapters/**` нет кириллицы в строковых литералах                                                                                                        | `scripts/check-english-surface.mjs` (в `npm run check`)                                                    |

## T06 — пакет цели: scaffold

| ID  | Given/When/Then                                                                                                                                                | Маппинг                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| S16 | `wolf scaffold artifact <slug>` → созданы `pre-requirements.md`, `requirements.md`, `change-request.md`, `design.md`, `test-plan.md`, `plan.md` в этом порядке | `tests/unit/use-cases/scaffold-artifact.test.ts`, `tests/e2e/scaffold-artifact.e2e.ts` |
| S17 | `--fix` → `requirements.md` + `plan.md` (CR-документ и pre-requirements не создаются)                                                                          | там же                                                                                 |
| S18 | Папка уже есть, часть документов отсутствует → top-up создаёт только недостающие, существующие байт-в-байт                                                     | там же                                                                                 |
| S19 | Папка уже есть и все документы на месте → сообщение «добавлять нечего», без записи и без ошибки                                                                | там же                                                                                 |
| S20 | Нет активного claim → отказ до любых записей (прежний guard)                                                                                                   | там же                                                                                 |

## T07 — правила и докдок

| ID  | Given/When/Then                                                                                                                                                            | Маппинг                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| S21 | `change-request.md` без frontmatter / с CR без обязательных полей → lint finding (warn)                                                                                    | `tests/unit/**/lint-artifacts*`                                                             |
| S22 | CR ссылается на несуществующий REQ → finding                                                                                                                               | там же                                                                                      |
| S23 | Исторические пакеты `docs/dev/*` без CR-документа → новых findings нет (только warn-уровень и только при наличии файла)                                                    | `tests/e2e/doctor-artifacts.e2e.ts` + `wolf doctor` на репозитории                          |
| S24 | Документы правил описывают порядок пакета и поток «замечание → change-request → pre-requirements/requirements → design → test-plan → plan»; имя файла совпадает с шаблоном | ревью текста (`project-rules.md`, `wolf-brainstorm/SKILL.md`, `artifact-pipeline.md` EN/RU) |
