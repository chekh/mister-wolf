# X2 setup notes (эксперимент EXP-20260903-x2)

Статус: MITIGATED — базовые линии обеих песочниц зелёные, прогоны выполняются (обновляется по ходу).

## Митигация F21 (решение lead, симметричная для обоих вариантов)

- Источник: `templates/opencode/plugins/wolf-session-start.js` (git main) = новая версия, заголовок `Mr.Wolf session bootstrap`; догfood-копия `.opencode/plugins/wolf-session-start.js` главного репо = старая, `Mr.Wolf session recap` (MARKER — строка 30).
- Причина красного fresh-init: тест `tests/unit/wolf-session-start-plugin.test.ts` импортирует плагин из `.opencode/` **cwd-проекта** (не из templates) и ожидает 'recap'; в свежем archive+init плагин создаётся из templates ('bootstrap') → 2 теста детерминированно красные; в главном репо замаскировано tracked-копией 'recap'.
- Митигация: копирование main-догfood копии плагина в ОБЕ песочницы (nomem — A′.1, playground — B′.1), симметрично; продукт-код main не тронут.
- Флак memory-integrity (5000ms timeout): при повторной базовой линии nomem НЕ воспроизвёлся (866/866 зелёные с первого повтора).

## Результаты базовых линий

- nomem (после митигации): `npm run check` EXIT=0, 134 files / 866 tests passed, wall **80s** (первый красный прогон: 145s, 3 fail — см. выше; после копирования 'recap'-плагина зелёный с первого раза, флак memory-integrity не воспроизвёлся).
- playground (после митигации): `npm ci` EXIT=0 (wall 20s); `npm run check` EXIT=0, 128 files / 821 tests passed, wall **100s**. Note: build через dist-симлинк пишет в dist главного репо — ожидаемо (по брифу), не чинилось.
- Разница числа тестов (866 vs 821, файлов 134 vs 128): nomem = свежий снапшот main (новее 037bbfb), playground = 037bbfb + e40504e. Наследие свежести снапшотов, как в X1; gate-скрипты идентичны.

## Митигация playground (B′)

- Плагин sync'нут тем же cp; сетап-коммит в playground (лабораторное репо, прецедент X1): **e40504e** «X2 setup: sync wolf-session-start plugin with main dogfood copy (fresh-init check red — lab mitigation)» — новый HEAD для ресетов между прогонами (вместо 037bbfb).
- `git status --porcelain` после check: только `?? dist` (node_modules gitignored).

## Состав памяти (инвентарь для карты; файлы memory-inventory-*.txt)

- **WOLF-MEM (playground)**: 113 объектов — document-ref'ы всех документов, 6 playbook'ов, rule routing, decision acceptance, project-scan context, init-report, и ГЛАВНОЕ: **урок mem_20260903_npm_run_check_english_surface_gate_tolko_2b589c** («npm run check: english-surface gate — только src/adapters/**.ts строковые литералы; docs/**/*.md гейтом не покрываются»). `search "english"` → находит урок ✅.
- **NO-MEM (/tmp/wolf-x2-nomem)**: 8 объектов — 6 playbook'ов, rule routing, init-report (это то, что создаёт сам init без bootstrap). `search "english"` → **0 results** ✅ (критерий приёмки).
- Девиация оператора: первый снимок nomem-инвентаря был ошибочно выполнен с cwd=playground (обе list-команды показывали playground-память, 113=113) — перезапущен с корректным cwd=/tmp/wolf-x2-nomem, файл memory-inventory-nomem.txt перезаписан (8 строк).

## Фаза A — что сделано (NO-MEM /tmp/wolf-x2-nomem)

1. `git archive main` → /tmp/wolf-x2-nomem — ок (28 entries).
2. Фильтр X1 (`rm -rf .opencode AGENTS.md opencode.json .opencode.json .wolf docs/site/public playground-lab .external-research`) — ок (22 entries).
3. README-PLAYGROUND.md скопирован — ок.
4. Pristine-эталон ДО init: /tmp/wolf-x2-nomem-pristine (rsync -a, excl node_modules) — ок.
5. dist-симлинк: /tmp/wolf-x2-nomem/dist → /Users/chekh/Development/mister-wolf/dist — ок.
6. `wolf init --model zai-coding-plan/glm-5.2` — EXIT=0. Создано: .wolf (memory skeleton), 6 агентов (.opencode/agents/), 13 скиллов, .opencode/command/analyze-doc|complain|doc-review, 2 плагина (wolf-router.ts, wolf-session-start.js), AGENTS.md, complaint-protocol.md + 3 playbook'а, opencode.json (mcp.wolf, default_agent=mr-wolf, subagent_depth=2), routing (primary zai-coding-plan/glm-5.2), init-report mem_20260903_init_report_wolf_x2_nomem_536afc.
7. Приёмка отсутствия урока: `wolf search "english"` → **`0 results for "english"`** (EXIT=0). Урока в NO-MEM нет — критерий приёмки выполнен.
8. opencode.json (дословно): `{"mcp":{"wolf":{"type":"local","command":["wolf","mcp"],"enabled":true}},"default_agent":"mr-wolf","subagent_depth":2}`.
9. `npm ci` — EXIT=0, wall **15s** (обёртка date +%s; npm пишет 14s), 207 пакетов.
10. `npm run check` — **EXIT=1, wall 145s. СТОП.**

## Хвост вывода npm run check (дословно)

```
 Test Files  2 failed | 132 passed (134)
      Tests  3 failed | 863 passed (866)
   Start at  23:55:58
   Duration  72.83s (transform 5.14s, setup 3.04s, collect 70.11s, tests 115.79s, environment 95ms, prepare 85.34s)

EXIT=1 CHECK_WALL=145s
```

Упавшие (3):

1. `tests/integration/memory-integrity.test.ts > (а) массовая запись ~50 объектов` — `Test timed out in 5000ms`. Изолированный повтор `npx vitest run tests/integration/memory-integrity.test.ts` → **4/4 passed, EXIT=0** → флак-таймаут под полной загрузкой, НЕ блокер.
2. `tests/unit/wolf-session-start-plugin.test.ts > injects recap into the first user message` — `expected '<session_context>\nMr.Wolf session bo…' to contain 'Mr.Wolf session recap'` — **детерминированный блокер**.
3. `tests/unit/wolf-session-start-plugin.test.ts > injects only once (marker guard)` — `expected [] to have a length of 1 but got +0` — тот же корень.

## Корневая причина блокера (диагностика)

- Тест импортирует `../../.opencode/plugins/wolf-session-start.js` из **cwd-проекта** (не из templates).
- В git main: `templates/opencode/plugins/wolf-session-start.js` пишет заголовок **`Mr.Wolf session bootstrap`**, а тест (main, строки 34/48) ожидает **`Mr.Wolf session recap`**.
- В главном репо тест зелёный лишь потому, что tracked-копия `.opencode/plugins/wolf-session-start.js` уже 'recap'-формата — она маскирует отставание templates.
- Свежий `git archive main` репо-копии `.opencode` НЕ содержит (создаётся только `wolf init`-ом из templates → 'bootstrap') → 2 теста детерминированно красные в ЛЮБОМ свежем окружении archive+init.
- Playground: `.opencode/plugins/wolf-session-start.js` = 'bootstrap' (grep) → check в playground упадёт на тех же 2 тестах (Фаза B п.2 не выполнялась: npm ci там ещё не сделан).

## Следствие для эксперимента

Задача агентам X2 — «…добейся зелёного npm run check». При несдвигаемо красных 2 юнит-тестах (несвязанных с задачей) измерение «итераций до зелёного» контаминировано в ОБОИХ вариантах симметрично → эксперимент в текущей конфигурации невалиден. Требуется решение уровня lead:
- фикс templates/opencode/plugins/wolf-session-start.js в main ('recap'-формат) + пересборка dist, ИЛИ
- копирование 'recap'-версии плагина в обе песочницы как митигация сетапа (симметрично), ИЛИ
- изменение задачи/гейта.

## Окружение

- main HEAD на момент снапшота: 037bbfb (по брифу); рабочее дерево главного репо = main (diff по трём файлам плагина/теста пуст), `git status` главного репо чист кроме `?? playground-lab/measurements/2026-09-03-x2/`.
- Флаки-заметка: memory-integrity 5000ms таймаут — кандидат на повышение testTimeout (вне scope).

## Ретрай 2026-09-04 (единый источник playground HEAD)

Причина ретрая: прошлая попытка сетапила nomem из main HEAD → дрейф версий (866 vs 821 тестов). Теперь ЕДИНСТВЕННЫЙ источник кода = **playground HEAD e40504e** (подтверждено `git rev-parse --short HEAD`).

1. **Верификация урока в WOLF-MEM** (cwd=playground): `wolf search "english"` → найден `mem_20260903_npm_run_check_english_surface_gate_tolko_2b589c [lesson] npm run check: english-surface gate — только src/adapters/**.ts строковые литералы; docs/**/*.md гейтом не покрываются` ✅.
2. **Пересоздание nomem**: старые /tmp/wolf-x2-nomem и /tmp/wolf-x2-nomem-pristine удалены; `git archive HEAD` из playground → /tmp/wolf-x2-nomem, EXIT=0.
3. **Фильтр**: `rm -rf .wolf .opencode AGENTS.md opencode.json .opencode.json` — только волчьи артефакты, код не тронут (симметрия с playground обязательна).
4. **dist-симлинк**: /tmp/wolf-x2-nomem/dist → /Users/chekh/Development/mister-wolf/dist.
5. **Идентичность кода до init**: `diff -rq playground /tmp/wolf-x2-nomem` (excl .wolf/.opencode/AGENTS.md/opencode.json/node_modules/dist/.git) → **EXIT=0, дельт НОЛЬ** — побайтово идентичны.
6. **init**: `wolf init --model zai-coding-plan/glm-5.2` → EXIT=0. Создано: memory skeleton, 6 агентов, 13 скиллов (в первоначальной записи W1 «12» — опечатка; факт 13=13 в обеих песочницах подтверждён `ls .opencode/skills | wc -l` при ревью), 3 команды, 2 плагина, AGENTS.md, playbook'и, opencode.json (mcp.wolf, default_agent=mr-wolf, subagent_depth=2), routing (primary zai-coding-plan/glm-5.2), init-report `mem_20260904_init_report_wolf_x2_nomem_873f34`, проект зарегистрирован.
7. **Митигация плагина** (симметрично e40504e в playground, где плагин уже 'recap'): main-dogfood 'recap'-копия wolf-session-start.js скопирована поверх → grep "Mr.Wolf session recap" = 1 ✅.
8. **Приёмка отсутствия урока**: `wolf search "english"` (cwd=nomem) → **`0 results for "english"`**, EXIT=0 ✅.
9. **npm ci**: EXIT=0, wall **140s** (hang-guard 300s не сработал), лог /tmp/x2-nomem-npmci.log.
10. **Baseline check**: EXIT=0, wall **100s** (hang-guard 480s не сработал), лог /tmp/x2-nomem-baseline-check.log. Vitest: **Test Files 128 passed (128), Tests 821 passed (821)** — число тестов теперь ИДЕНТИЧНО playground (дрейф версий устранён).
11. **Инвентари** (обновлены): memory-inventory-wolfmem.txt = **113 объектов**; memory-inventory-nomem.txt = **8 объектов** (6 playbook + rule routing + init-report — дефолт init, уроков нет).
12. **Чистота playground**: `git status --porcelain` → только `?? dist` — как ожидалось.

Логика сравнения: 866→821 фиксировано, обе песочницы на одном коде e40504e; единственная разница — .wolf-память (113 объектов с уроком vs 8 дефолтных без урока).
