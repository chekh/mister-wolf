# nomem-N1 (EXP-20260903-x2)

- **cwd:** /tmp/wolf-x2-nomem (HEAD-эквивалент e40504e, память 8 объектов, урока english-gate нет)
- **Команда:** `opencode run --agent worker-implementer --model zai-coding-plan/glm-5.2 --format json "$(cat x2-prompt.txt)" < /dev/null` (hang-guard 480s)
- **EXIT=unknown, WALL=480s, HANG=1 → F21**

## Что произошло

- В stdout JSONL — **0 событий** (единственная строка в файле — инжект `F21: DEADLINE 480s reached`); stderr пуст (0 байт). При kill небуферизованный stdout не спасён — событий могло быть больше, чем видно.
- SQLite opencode: сессия `ses_f947efd25ffeolLbwPG1cj9j75` (directory=/private/tmp/wolf-x2-nomem) создана **11:20:12** — ~6 минут ПОСЛЕ запуска прогона (~11:14:25), обновлена 11:21:12, **tokens 0|0|0** → **F22** (статистика недоступна).
- router.log nomem: записи `worker-implementer playbook=hit injected=yes` в 11:21:19 и 11:22:25 — волчий плагин загрузился и инжектил, но ответа модели сессия не дождалась.
- Контекст машины: параллельно живут 6 интерактивных opencode-сессий (БД 7.7 GB, активные записи в 11:01–11:24 в main/Tender-проектах) — вероятная причина задержки старта/первого токена (конкурентная нагрузка/очередь провайдера), но это наблюдение, не диагноз.

## Метрики

| input | cache_read | output | вес | tool | wall |
|---|---|---|---|---|---|
| — | — | — | **статистика недоступна (F22)** | 0 (JSONL пуст) | 480s (F21 kill) |

- `npm run check` запусков: нет данных; x2-note.md: **не создан** (файла нет).
- Gate-контакт: нет данных (0 tool_use событий в сохранённом stdout).

## F20-контроль

- До: `.wolf/` = cache/, config.yaml, memory/, router.log (224 байта); `wolf list | wc -l` = **8**.
- После: состав `.wolf/` неизменен (router.log подрос до 382 байт — штатная работа wolf-router плагина, не контаминация); `wolf list | wc -l` = **8**. Незваных файлов/записей НЕТ → F20-фактов нет.
