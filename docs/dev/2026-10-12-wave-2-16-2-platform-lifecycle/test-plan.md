---
slug: wave-2-16-2-platform-lifecycle
title: Волна 2.16.2 — тест-план
status: approved
created: 2026-10-12
---

# Тест-план волны 2.16.2

Профиль: vitest (unit/integration/e2e-конфиг), tmp-фикстуры, без реальных секретов и сети.
Правило TDD: новое поведение (T-02..T-07) — RED до реализации (тесты пишутся первыми,
фиксируются падением, затем реализация). Дополнение контента (T-01) — тест рядом с шаблоном.

## REQ-01 — версионное правило в AGENTS.md

| ID | Сценарий | Уровень | Файл |
|---|---|---|---|
| V-1 | Given templates/base/AGENTS.md; When читать файл; Then содержит маркер-фразу «полный X.Y.Z» и пример «2.16.2» | unit | tests/unit/templates/version-rule.test.ts (новый) |
| V-2 | Given инициализированный проект; When wolf sync/init --full; Then AGENTS.md обновляется синком со свежим штампом (существующее поведение доставки) | integration | tests/integration/base-set-init.test.ts (существующие, зелёные — регрессия) |
| V-3 | Счётчик скиллов = 19 (существующие ассерты) | integration | tests/integration/base-set-init.test.ts:39,48 |

Oracle: текст правила — память mem_20261012_nomer_versii (полный X.Y.Z). V-2/V-3 — без
изменений, доказывают, что доставка и счётчики не регрессировали.

## REQ-02 — детект mismatch (T-02, T-03)

| ID | Сценарий | Уровень | Файл |
|---|---|---|---|
| D-1 | Given state с плагином set=2.14.0, штамп на файле; When detect; runtime=v2 (fake detectVersion); Then mismatch с рекомендацией --repair | unit | tests/unit/use-cases/platform-mismatch.test.ts |
| D-2 | set=2.14.1 + runtime v2 → null (граница DUAL_SINCE) | unit | там же |
| D-3 | runtime v1 → null (однонаправленность, F-05) | unit | там же |
| D-4 | runtime absent/unparseable → null + причина в skip-строке | unit | там же |
| D-5 | state отсутствует → null (без скана диска) | unit | там же |
| D-6 | запись state есть, штамп на файле отсутствует → запись исключена | unit | там же |
| D-7 | Given проект с mismatch; When runDoctor (deps с detectMismatch); Then entry.issues содержит строку | unit | tests/unit/use-cases/doctor.test.ts (расширить) |
| D-8 | runDoctor без detectMismatch — прежнее поведение (совместимость фейков) | unit | там же |

## REQ-02 — repair (T-04) + e2e (T-07)

| ID | Сценарий | Уровень | Файл |
|---|---|---|---|
| R-1 | Given проект с v1-штампами (set=2.14.0) и канон-конфигом; When repairPlatform; Then файлы перерендерены со свежим set, конфиг unchanged/каноничен | unit | tests/unit/use-cases/repair-platform.test.ts |
| R-2 | Идемпотентность: второй repair → «content identical» + «unchanged», zero writes | unit | там же |
| R-3 | dry-run: контент и mtime файлов/конфига не изменены; план напечатан | unit | там же |
| R-4 | Гвард: нет .opencode и конфига → skip «no opencode install», ноль записей (F-01) | unit | там же |
| R-5 | mutated-skip: локально правленный штампованный файл остаётся нетронутым | unit | там же |
| R-6 | orphaned: штампованный файл вне набора → в отчёте с рекомендацией, не удалён (F-02) | unit | там же |
| R-7 | CLI: wolf doctor --repair = repairPlatform+repairStorage в одном отчёте; --dry-run без --repair → ошибка (существующее поведение) | unit | tests/unit/cli/memory-doctor.test.ts (если есть; иначе через e2e) |
| E-1 | e2e: установлен под v1 (set=2.14.0 + fake opencode v2 bin) → doctor сообщает → --repair чинит → штамп/конфиг/контент валидны → повторный doctor чист; --dry-run не пишет | e2e | tests/e2e/platform-repair.e2e.ts |

Oracle E-1: «плагин/MCP работают» = (a) в контенте плагина есть v2-маркер dual entry
(`server`/`ctx.session` — из шаблона 2.14.1+); (b) opencode.json содержит mcp.wolf,
default_agent=mr-wolf, subagent_depth=2. Fake bin: временный каталог на PATH раньше
реального, скрипт `opencode` печатает `opencode v2.0.24`.

## REQ-03 — uninstall (T-05, T-06)

| ID | Сценарий | Уровень | Файл |
|---|---|---|---|
| U-1 | План (без --yes) не меняет файловую систему (снапшот до/после равен), exit 0 | unit | tests/unit/use-cases/uninstall.test.ts |
| U-2 | --yes удаляет только штампованные из state; чужой файл в .opencode/plugins нетронут; пустые каталоги wolf удалены, непустые остались | unit | там же |
| U-3 | Легаси: state отсутствует → штампованные файлы в плане; удаление по --yes | unit | там же (F-03) |
| U-4 | AGENTS.md/CLAUDE.md отсутствуют в entries; skip-строка «kept by design» (F-04) | unit | там же |
| U-5 | opencode.json: mcp.wolf, default_agent=mr-wolf, subagent_depth=2 вычищены; чужой mcp-сервер и subagent_depth=5 сохранены; файл не удаляется | unit | там же (F-07) |
| U-6 | .mcp.json: mcpServers.wolf удалён; чужие ключи нетронуты | unit | там же |
| U-7 | .wolf/ сохранена с явным сообщением; --purge удаляет (после --yes) | unit | там же |
| U-8 | Отсутствующие конфиги → skip с причиной; отсутствующий .opencode → пустой план «nothing to remove» | unit | там же |
| U-9 | Идемпотентность: повторный uninstall → пустой план, exit 0 | unit | там же |
| U-10 | CLI: план без --yes печатает entries; --purge без --yes — план с пометкой; --yes выполняет | unit/e2e | tests/e2e/uninstall.e2e.ts (CLI-прогон через tmp-проект) |
| U-11 | Частичный сбой: read-only файл → ошибка действия в отчёте, остальные удаляются, exit 1 | unit | tests/unit/use-cases/uninstall.test.ts |

## NFR

- NFR-01 (идемпотентность) → R-2, U-9, E-1 (повторный doctor).
- NFR-02 (безопасность) → U-2, U-4, U-5, R-4, R-5, D-5, U-1.

## Команды

- targeted: `npx vitest run tests/unit/use-cases/platform-mismatch.test.ts tests/unit/use-cases/repair-platform.test.ts tests/unit/use-cases/uninstall.test.ts tests/e2e/platform-repair.e2e.ts`
- full: `npm run check`; `npx vitest run --maxWorkers=2 --minWorkers=1`; `npx vitest run`; `npm run e2e` (build + e2e-конфиг).

## Setup/cleanup

Все фикстуры — mkdtemp в os.tmpdir(); cleanup в afterEach; PATH-фейк — временный bin-каталог
с высоким приоритетом только на время прогона; реальный opencode/npm не вызывается;
публикация/теги отсутствуют в тестах.

## Сверка с планом

T-01→V-1..3; T-02/T-03→D-1..8; T-04→R-1..7; T-05/T-06→U-1..11; T-07→E-1; NFR покрыты.
Пробелов нет; новый AC не вводится (CR не требуется).
