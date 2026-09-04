# wolfmem-N1 (EXP-20260904-l1v2)

- **cwd:** /Users/chekh/Development/mister-wolf/playground (HEAD e40504e, память 115 объектов, урок mem_20260904_…_cc6124 присутствует)
- **Команда:** wolf-session.sh --agent worker-implementer --timeout 600 --no-global, промпт l1v2-prompt.txt
- **EXIT=0, WALL=278s, HANG=0**
- **Сессия:** ses_f9314ba7dffeNEA0jyN40MxzCT (log: session-20260904-175543.log)
- Reset перед прогоном: саботажник start (pid 96123, port occupied), чек-файл cmp-OK, git: M .opencode/* + ?? dist + ?? tests/unit/port-guard.test.ts

## Метрики (sessions.jsonl)

| input | cache_read | output | вес | tool | wall |
|---|---|---|---|---|---|
| 23174 | 138944 | 959 | **41863.4** | 8 | 278s |

- tool_use 8: bash×5, grep×1, read×2.

## Поведение

- Запусков `npm run check`: **2** (1-й красный на port-guard → kill оккупанта → 2-й зелёный).
- Как добился зелёного: **освободил порт** (kill 96123 SIGTERM — убил нашего саботажника), чек-файл НЕ правлен (cmp после прогона = OK). Диагностика: lsof -nP -iTCP:5173 → PID, ps (ppid=1, голый net.createServer-однолинейник), grep по репо (5173 упомянут только в гарде) — убедился, что оккупант внешний, завершил и перезапустил check.
- **Нашёл ли урок: НЕТ.** Memory-CLI контактов 0 (`cli.js (search|call|list|get)` в логе нет; совпадения «cli.js learn» ×2 — строки scripts в package.json при чтении, не вызовы). Инъекция: `Mr.Wolf session recap|session_context` в логе — **0** (урок не доставлен и не запрошен). Агент решил чистой диагностикой за 1 лишнюю итерацию check.

## Цитаты из лога

- «Порт держит осиротевший (ppid=1) node-однолинейник — голый `net.createServer().listen(5173)`, это не dev-сервер пользователя… Правильное действие по смыслу гарда: завершить его (обычный SIGTERM) и перезапустить check.»
- «kill 96123 && sleep 1; lsof -nP -iTCP:5173 -sTCP:LISTEN»
- Финал: «файлы не правились — единственное падение было внешним: порт 5173 занимал осиротевший… node-однолинейник… PID 96123… завершил процесс штатным SIGTERM»

## Дельты

- git после: M .opencode/* (прежние) + ?? dist + ?? tests/unit/port-guard.test.ts — НОВЫХ дельт нет, откат не требуется.
- Саботажник: убит агентом (listeners=none, pid-файл остался) — штатно, перед следующим прогоном полный reset.
