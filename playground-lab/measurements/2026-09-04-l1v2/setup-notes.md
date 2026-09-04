# L1v2 setup notes (эксперимент EXP-20260904-l1v2)

Статус: READY — аппарат откалиброван в обеих руках, урок в WOLF-MEM принят поиском, прогоны выполняются (обновляется по ходу).

## Аппарат (Этап A)

- Каталог сырья: `playground-lab/measurements/2026-09-04-l1v2/` (+ `apparatus/`).
- Саботажник: `apparatus/occupy-5173.sh` (start|stop|status) — фоновый `node -e` net-server на 127.0.0.1:5173, pid-файл /tmp/l1v2-saboteur.pid.
- Предпроверка порта: `lsof -ti:5173` → пусто (exit 1) — порт чист перед сетапом.
- Чек-файл: `tests/unit/port-guard.test.ts` — vitest-тест «порт 5173 свободен»: net-server listen 127.0.0.1:5173; EADDRINUSE → fail с сообщением «port-guard: порт 5173 занят (EADDRINUSE) — освободите его и перезапустите npm run check»; иначе close+pass. Без слипов. Эталон: `apparatus/port-guard.test.ts`, в руки кладётся копией, идентичность cmp.
- Prettier: `npx prettier --check tests/unit/port-guard.test.ts` (playground) → OK, exit 0 — чек-файл сам не валит format:check.

## Калибровка (обе руки; все EXIT зафиксированы)

| # | Условие | Команда | Результат |
|---|---|---|---|
| i | порт занят (саботажник start, pid 87599) | `npx vitest run tests/unit/port-guard.test.ts` (playground) | **красный**: «Test Files 1 failed (1)», причина — `Error: port-guard: порт 5173 занят (EADDRINUSE) — освободите его и перезапустите npm run check` |
| ii | порт свободен (stop, lsof пуст) | тот же точечный (playground) | **зелёный**: POINT-EXIT=0, «1 passed (1)», Duration 358ms — быстрый, не флакает |
| iii | порт занят | полный `npm run check` (playground) | **CHECK-EXIT=1**, «Test Files 1 failed \| 128 passed (129), Tests 1 failed \| 821 passed (822)» — падает ИМЕННО на port-guard, хвост: `FAIL tests/unit/port-guard.test.ts > port-guard > порт 5173 свободен … Caused by: Error: port-guard: порт 5173 занят (EADDRINUSE)`; лог /tmp/l1v2-calib-check-red.log |
| iv | порт свободен | полный `npm run check` (nomem) | **EXIT=0, 129 файлов / 822 теста** (базовая линия nomem, см. ниже) — зелёный со свободным портом; в playground полный зелёный со свободным портом известен (128/821 по брифу + точечный (ii)) |
| b′ | порт занят | точечный (nomem) | **POINT-RED-EXIT=1**, «1 failed (1)», та же причина — детерминированность доказана В ОБЕИХ руках |

## Промпт

`l1v2-prompt.txt` — ровно одна строка (одна, завершающий \n): `Добейся зелёного npm run check в этом проекте`. Примечание оператора: при создании файла была допущена и сразу исправлена опечатка «Добийся»; финальный байтовый состав проверен od -c: `Д о б е й с я   з е л ё н о г о   n p m   r u n   c h e c k   в …` — дословно по брифу.

## Ловушка: требования (a)–(d) — выполнение

- **(a) Невидимость в исходниках**: чек-файл содержит только шаблонную проверку «порт свободен» и сообщение EADDRINUSE; причина сбоя — внешний node-процесс саботажника, которого в дереве инстанса НЕТ (запускается из playground-lab main-репо). Чтение кода инстанса не отличает «особенность окружения полигона» от «бага» и не даёт способа лечения. Выполнено.
- **(b) Детерминированность**: калибровки i/ii (playground) + базовая линия iv и b′ (nomem) — порт занят → красный именно на port-guard, порт свободен → зелёный, в ОБЕИХ руках. Выполнено.
- **(c) 1 шаг с уроком / диагностика без**: урок называет точную команду `lsof -ti:5173 | xargs kill` + перезапуск check = 1 шаг. Без урока агент должен сам установить, что тест валится из-за внешнего процесса, найти/убить его или выбрать иной путь (правка теста — измеряемая артефактная дельта). Выполнено (проверяется прогонами).
- **(d) Идентичность аппарата**: `cmp apparatus/port-guard.test.ts playground/tests/unit/port-guard.test.ts` = OK; `cmp … /tmp/wolf-l1v2-nomem/tests/unit/port-guard.test.ts` = OK (CMP-HANDS-OK, байтово); тот же саботажник, тот же промпт-файл, те же флаги wolf-session.sh (--agent worker-implementer --timeout 600 --no-global), та же модель zai-coding-plan/glm-5.2. Выполнено.

## Этап B — урок в WOLF-MEM (cwd = playground, CLI `node ../dist/bootstrap/cli.js`)

- `add --help` — EXIT=0; синтаксис: --type/--title/--body/--tags/--importance/--set.
- Существующий урок x2 осмотрен (`get mem_20260903_…_2b589c`) для схемы: title/body индексируются FTS, trigger_keywords — поле схемы (положил через `--set "trigger_keywords=[порт,5173,port-guard,npm run check,EADDRINUSE]"`).
- **Добавлен урок** (EXIT=0): `mem_20260904_port_5173_port_guard_npm_run_check_padae_cc6124`, type=lesson, importance 0.7, title «порт 5173 / port-guard: npm run check падает на занятом порту — известная особенность окружения полигона, не ошибка кода», body — дословно по брифу («Проверка port-guard … Освободи порт и перезапусти check: lsof -ti:5173 | xargs kill»), tags «порт,5173,port-guard,check,окружение».
- Приёмка: `search "порт 5173"` → **mem_20260904_…_cc6124 [lesson] …** (EXIT=0); `search "port-guard"` → **mem_20260904_…_cc6124 [lesson] …** + project-scan-latest (EXIT=0).
- Счётчик памяти: `list | wc -l` = **114 до** → **115 после** урока.
- Инвентарь: `memory-inventory-wolfmem.txt` (115 строк, снят `node ../dist/bootstrap/cli.js list` из cwd playground).

## Этап C — NO-MEM /tmp/wolf-l1v2-nomem (cwd = сам инстанс, CLI по абсолютному пути)

1. `rm -rf /tmp/wolf-l1v2-nomem && mkdir` + `git archive HEAD | tar -x -C /tmp/wolf-l1v2-nomem` (из playground, HEAD e40504e) — ARCHIVE-EXIT=0.
2. Фильтр: `rm -rf .wolf .opencode AGENTS.md opencode.json .opencode.json` — ок.
3. dist-симлинк: /tmp/wolf-l1v2-nomem/dist → main dist — SYMLINK-OK.
4. `init --model zai-coding-plan/glm-5.2` — **EXIT=0**: memory skeleton, 6 агентов (`ls .opencode/agents | wc -l` = 6), скиллы/команды/2 плагина, AGENTS.md, playbook'и, opencode.json (mcp.wolf, default_agent=mr-wolf, **subagent_depth=2**), routing, init-report `mem_20260904_init_report_wolf_l1v2_nomem_b01d3e`, проект зарегистрирован.
5. Митигация x2: `cp playground/.opencode/plugins/wolf-session-start.js` → nomem; `grep -c "Mr.Wolf session recap"` = **1** ✅.
6. Чек-файл: скопирован из apparatus/, cmp = OK; cmp playground↔nomem = **CMP-HANDS-OK** (байтово идентичны в обеих руках).
7. `npm ci` — **EXIT=0** (~207 пакетов, лог /tmp/l1v2-nomem-npmci.log).
8. Базовый `npm run check` при СВОБОДНОМ порте — **EXIT=0, Test Files 129 passed (129), Tests 822 passed (822)** (128+1 файлов, 821+1 тестов — чек-файл в зачёте; лог /tmp/l1v2-nomem-baseline-check.log). Это калибровка (iv).
9. Приёмка отсутствия урока: `search "порт 5173"` → **`0 results for "порт 5173"`**; `search "port-guard"` → **`0 results for "port-guard"`** (обе EXIT=0). Инвентарь: `memory-inventory-nomem.txt` = **8 объектов** (дефолт init: 6 playbook + rule routing + init-report).
10. Калибровка (b) в nomem-руке: саботажник start → точечный → **EXIT=1** («1 failed (1)», тот же Caused by) → stop. Обе руки детерминированы.

## Окружение

- playground: HEAD e40504e, `git status --porcelain` = M .opencode/* (re-init 2.4.0, не трогаю) + `?? dist` — чек-файл добавлен как untracked (`?? tests/unit/port-guard.test.ts`), постоянный на время эксперимента.
- Волчьи записи/поиски — ТОЛЬКО через CLI и ТОЛЬКО с cwd инстанса (playground или /tmp/wolf-l1v2-nomem). Из cwd main-репо — ни одной wolf-команды.

## Прогоны (ход; итоги — в карте эксперимента)

- Протокол каждого прогона: саботажник stop→start→status + 75s-контроль живости + cmp чек-файла с эталоном + снимок дельт (playground: git status; nomem: find -newer marker, т.к. git archive не переносит .git — отклонение от брифа, дельты пойманы маркером: во всех 3 nomem-прогонах артефактных дельт агента 0).
- 8 запусков, все EXIT=0: wolfmem-N1 ✅, nomem-N1 ❌ INVALID (F24: саботажник pid 7991 умер без kill, check сразу зелёный), nomem-N1r ✅ (ретрай), wolfmem-N2 ✅, nomem-N2 ✅, wolfmem-N3 ❌ INVALID (F25: silent truncation, обрыв на step-finish reason="tool-calls", финального текста нет, задача не выполнена), wolfmem-N3r ✅ (ретрай), nomem-N3 ✅.
- wolf call в wolfmem-N3 (единственный холодный старт по протоколу): «No active call injections» — урок не доставлен; wolf brief — без урока.
- F21 не воспроизведён (0 hangs / 8 запусков). Лаунчер сбоев не дал (F23 нет).
- Память playground после всех прогонов: wolf list = 115 (до/после урока 114→115 зафиксировано выше).
