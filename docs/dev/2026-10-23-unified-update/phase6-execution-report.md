---
slug: unified-update
title: unified-update — отчёт исполнения Ф6
status: final
created: 2026-10-24
---

# unified-update — отчёт исполнения Ф6 (волна 2.19.0)

Executor-lead: сессия exec-2-19-0-unified-update (Ф1–Ф5 — ACCEPTED).
Thread: mem_20261023_volna_2_19_0_unified_update_odno_obnovle_15b75a.
Методики: wolf-sdd (T13), wolf-release-docs (T15, применён целиком).
Режим: все длинные прогоны — синхронно, вывод в файл; коммиты — lead.

## Metadata

- T13 интеграция: MEDIUM → lead (гейты + мерж — зона lead по playbook).
- T15 документация: MEDIUM → lead (правки поверхностей); независимое
  ревью планировалось worker-reviewer ×2 — спавн недоступен (см. FRICTION),
  оба мандата выполнены lead'ом последовательными проходами с раздельными
  критериями; независимость ограничена — честно зафиксировано ниже.

## Summary

Ф6 завершена: T13 — волна влита в main (merge `6f8eda3`, main до
`497f9ae`, behind 0) после полного check (210 файлов / 1704 теста, exit 0)
и полного e2e (60 файлов / 223/223, exit 0, 442 с; первый прогон поймал
интеграционный долг Ф2 — фикс `a2c1d02`); NFR-замеры собраны. T15 —
unified update задокументирован по всем опорным поверхностям (карта ниже),
`wolf sync` помечен deprecated по всему дереву, examples verified,
docs:build зелёный. Версия/тег/npm/сайт — НЕ тронуты (релизный чек-лист
отдельной диспетчеризацией).

## Task Decomposition

| Задача           | Класс  | Исполнитель              | Статус |
| ---------------- | ------ | ------------------------ | ------ |
| T13 гейты+мерж   | MEDIUM | lead                     | DONE   |
| T15 документация | MEDIUM | lead (+попытка воркеров) | DONE   |

## T13 — интеграция (числа)

- **Артефакты до мержа** (`12f248a`): design.md — заголовок логотип-секции
  «блочный вордмарк MR. WOLF» (тело уже содержало финальный вордмарк по
  mem\_…a989dd/…201c0e) + env `WOLF_UPGRADE_CHILD_BIN` в §«Контракт spawn»
  (downstream Ф5 п.7); roadmap-v2.md — новая секция «8. Релизные волны»
  (статус 2.19.0). Отчёты фаз — уже в ветке, влиты мержем.
- **Полный check (worktree, a2c1d02)**: 210 файлов, 1704/1704, exit 0.
- **Полный e2e**: первый прогон — 1 падение/223:
  `distribution.e2e` tarball-гвард не пропускал `update-map.json`
  (долг коммита `a091b30` Ф2 — files+=update-map.json без расширения
  гварда; e2e впервые в волне дошёл до него). Фикс `a2c1d02`
  (allow-list += update-map.json). Полный повтор: **60 файлов, 223/223,
  exit 0, 441.8 с** (бюджет ≥1200 с — уложен с 2.7× запасом).
- **NFR**: NFR-01 — R01.3 (парк не тронут при npm-сбое) и R08.1 (—check
  read-only, слепок парка байт-в-байт) зелёные в check; NFR-02 — N02.1
  (идемпотентность повторного прохода) зелёный; NFR-03 — полный e2e
  442 с; upgrade-exec.e2e 5.9 с; фактический `--check` по живому парку
  реестра (6 проектов) < 6 с при бюджете ≤180 с на 20 проектов; скан
  уложен в ориентир ≤5 с (Ф5/T12).
- **Мерж**: main чист на `497f9ae` (behind 0, ahead 23 у ветки);
  `git merge --no-ff dev/unified-update-2-19-0` в стиле репо
  («merge(2.19.0): …») → **`6f8eda3`** (48 файлов, +8229/−45).
- **Check на main (6f8eda3)**: 210 файлов, 1704/1704, exit 0 — то же
  дерево, что проверено в worktree.

## T15 — документация (по wolf-release-docs)

Коммит **`8e76e83`** (23 файла; SHA для вердиктов ревью).

### Карта покрытия (возможность → адресат → страницы → источник → пример → проверка)

| Утверждение 2.19.0                                                                                                                                                     | Адресат          | Поверхности                                                                                                                                  | Источник поведения                                                                            | Пример                                            | Проверка                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Одна команда: npm-фаза + проход реестра (re-exec, склейка вывода)                                                                                                      | все пользователи | README-пара; site cli/platform EN+RU; cli/index таблица; cli.md (generated)                                                                  | memory-upgrade.ts (runUpgradeWithProjects, reExec), upgrade-projects.ts                       | 3 команды + expected combined run                 | форматы строк из кода (STATUS_TEXT/MARKERS/counters/SECTION_TITLE); help из свежего dist |
| --check read-only сводка CLI+парка; классификация current/behind/needs decision/unknown; unknown ≠ актуально                                                           | владелец парка   | site cli/platform EN+RU; README-пара                                                                                                         | memory-upgrade.ts --check-ветка, update-map.ts                                                | **фактический запуск** (живой парк, 2.19.0-ветка) | вывод сохранён (f6-help/f6--check), сверено с кодом                                      |
| --here: полный шаг в cwd вне реестра                                                                                                                                   | точечный апдейт  | те же                                                                                                                                        | upgradeHereAction (REQ-14)                                                                    | опция в help + таблица                            | targeted 59/59 (ветка here/check)                                                        |
| --yes; не-TTY без --yes → план + «Cancelled: --yes is required», exit 0                                                                                                | CI/скрипты       | site cli/platform EN+RU                                                                                                                      | upgrade-projects.ts (opts.tty && confirm)                                                     | фраза в exit-параграфе                            | строка из кода                                                                           |
| exit-коды 0/1/2; 2 = needs decision                                                                                                                                    | CI               | site cli/platform EN+RU; troubleshooting №10                                                                                                 | upgrade-projects.ts exit-модель                                                               | текст                                             | код                                                                                      |
| spawn-сбой после npm → «CLI updated; projects not touched…», exit 1; повтор = продолжение                                                                              | аварийный путь   | troubleshooting №10 EN+RU; site cli/platform EN+RU                                                                                           | memory-upgrade.ts (ENOENT → UserFacingError)                                                  | цитата сообщения                                  | дословно из кода                                                                         |
| Что НЕ гарантируется: карта покрывает перечисленное; unknown; удаления по подтверждению; незарегистрированные — только hint (топ-5); память не трогается; linked-отказ | ожидания         | site cli/platform EN+RU; README-пара                                                                                                         | upgrade-projects.ts (scanLines, confirm покрывает удаления ADR-4), memory-upgrade.ts (linked) | параграф                                          | сверено с кодом                                                                          |
| pinned/worktree/missing — планы показаны, проход пропущен                                                                                                              | пограничные      | site cli/platform (counters)                                                                                                                 | upgrade-projects.ts (planOf)                                                                  | counters-строка примера                           | код                                                                                      |
| wolf sync deprecated → upgrade --here, removal 2.20.0; алиас остаётся регенератором docs/dev/INDEX.md                                                                  | миграция         | site: cli/platform (блок-цитата), base-set, cli/index, transfer, delivery, telemetry, artifact-pipeline, migration-2.13 — EN+RU; README-пара | memory-sync.ts (DEPRECATED-строка), syncArtifactIndex вызывается ТОЛЬКО из memory-sync.ts     | DEPRECATED-строка                                 | grep-кард «wolf sync» по сайту (без changelog): непомеченных рекомендаций не осталось    |
| Терминальный стандарт (renderer T3)                                                                                                                                    | консистентность  | site cli/platform (формат вывода в примерах)                                                                                                 | report-renderer.ts                                                                            | примеры                                           | формат из кода                                                                           |

Не менялись (осознанно): CHANGELOG.md — запись создаётся на релизном шаге
(`npm version`, правило памяти); страница Changelog сайта — generated
(sync-changelog через docs:build, уже зелёный, запись появится с
CHANGELOG); docs/concept/\* — unified update не меняет концептуальную
модель; getting-started/configuration/mcp/organization/memory/feedback —
упоминаний update-поведения не содержат (сквозной grep), базовый сет —
обновлён (base-set-пара).

### Код-правки в составе T15 (user-facing текст, по 1 строке)

- cli-entry.ts spec: «Update wolf and registered projects: npm phase +
  projects pass (--check, --here)» (видно в `wolf --help`);
- memory-upgrade.ts description: «One command updates everything…» —
  прежний текст умалчивал проектный проход (дрейф REQ-01);
- docs/reference/cli.md — регенерирован ТОЛЬКО генератором (+4/−4) после
  build; cli-reference-guard зелёный (в targeted 59/59).

### Примеры и границы

- Воспроизводимый основной: `wolf upgrade --check` — **фактический запуск**
  свежесобранного dist (2.18.5-бинарник ветки), живой парк реестра.
- Пограничные: pinned (counters+план-статусы), вне карты → unknown
  («вне покрытия не значит актуален»), не-TTY без --yes (Cancelled,
  exit 0) — все в platform-секциях EN+RU.
- Комбинированный прогон помечен «Expected»: не запускался (npm-фаза
  установила бы пакет в систему — вне границ Ф6); каждая строка сверена
  с кодом (SECTION_TITLE, STATUS_TEXT, MARKERS.plain, counters-порядок,
  verify-формат) — утверждение формата верифицируемо, значение — ожидаемое.

### Проверки T15

- targeted: 8 сьютов 59/59 (guard, here/check/проход unit+integration) —
  описания не сломали тесты; tsc 0; prettier чист.
- `npm run docs:build` — exit 0 (generate-cli-reference → sync-changelog
  → vitepress build; битых ссылок нет, 9.4 с).
- Полный `npm run check` после T15-коммита: **210 файлов, 1704/1704,
  exit 0**.

### Независимое ревью (ограничение честно зафиксировано)

Планировалось: worker-reviewer ×2 (факты; читатель) отдельной чистой
сессией. Спавн недоступен: «Subagent depth limit reached (1)» — сессия
lead'а сама вложенная. FRICTION записан. Выполнено lead'ом, двумя
последовательными проходами с раздельными критериями, оба к SHA 8e76e83:

- **Мандат 1 (факты)**: PASS — расхождений нет; проверено: exit-модель
  0/1/2 и «Done/Done with attention/Failed» (upgrade-projects.ts:236–238);
  «Cancelled: --yes is required» exit 0 (162–180); spawn-сбой сообщение
  (memory-upgrade.ts); counters-порядок (218–232); STATUS_TEXT/MARKERS
  (report-renderer.ts:43–49); pinned-гвард (276–278); скан-строка
  self-healing (451–472); «stamps only, unreliable» (memory-upgrade.ts:590);
  INDEX-регенерация только в memory-sync.ts (grep syncArtifactIndex);
  cli.md ≡ фактический help dist.
- **Мандат 2 (читатель)**: PASS_WITH_NIT — 1 nit: в код-блоке
  artifact-pipeline команда `wolf sync` без инлайн-пометки; окружена
  двумя объясняющими deprecation-пометками в том же файле — не блокер,
  не чинил (шум правки дороже). EN/RU-пары согласованы; непомеченных
  рекомендаций sync не осталось; якоря #wolf-upgrade существуют.

## Changes (коммиты Ф6)

- `12f248a` — синхронизация артефактов волны до мержа (design, roadmap).
- `a2c1d02` — интеграционный фикс e2e-гварда (долг a091b30).
- `6f8eda3` — merge --no-ff волны в main (48 файлов, +8229/−45).
- `8e76e83` — T15 документация (23 файла).
- merge отчёта Ф6 (этот коммит) + довлитие ветки в main вторым --no-ff.

## COMPLAINT-TRIAGE / FRICTION

`COMPLAINT-TRIAGE: seen 0 → resolved 0 / rejected 0 / escalated 0 / open 0`
(очередь пуста при каждой приёмке Ф6).

FRICTION:

1. rtk-хук подменяет вывод npm-команд — обход «вывод в файл + чтение
   файлом» штатный (урок применён).
2. Спавн субагентов недоступен (depth limit 1) — ревью T15 выполнено
   lead'ом; системная проблема окружения, эскалируется координатору:
   ревью-вердикты волн с вложенного executor-lead сейчас возможны только
   самостоятельные.

## Риски / что дальше

- Границы соблюдены: версия 2.18.5, без тега/npm/деплоя/GitHub Release.
- Wolf-парк владельца: mister-wolf needs decision (mutated
  .opencode/agents/mr-wolf.md), 3 проекта behind, —check показывает;
  реальный проход по живому парку — решение владельца после релиза.
- UX-вопросы Ф4 (скан после cancel/пустого реестра; plural-формы) —
  в пакет приёмки волны, не блокеры.
- Готовность к релизному чек-листу 2.19.0: код и доки в main, гейты
  зелёные, карта покрытия закрыта. Следующий шаг — релизная диспетчеризация
  (version → CHANGELOG → docs:build (changelog-страница подтянется) →
  tag/publish/site по чек-листу из плана волны).
