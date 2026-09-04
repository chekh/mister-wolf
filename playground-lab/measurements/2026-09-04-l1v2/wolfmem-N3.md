# wolfmem-N3 — INVALID: silent truncation (EXP-20260904-l1v2)

- **cwd:** /Users/chekh/Development/mister-wolf/playground (память 115, урок присутствует)
- **Команда:** wolf-session.sh --agent worker-implementer --timeout 600 --no-global
- **opencode EXIT=0 (sessions.jsonl), WALL=244s** — но прогон НЕВАЛИДЕН: сессия оборвана, задача НЕ выполнена.

| input | cache_read | output | вес | tool | wall |
|---|---|---|---|---|---|
| 15775 | 154304 | 990 | 36155.4 | 12 (rtk×7, bash×3, grep×1, read×1) | 244s |

- ses_f92f4fcfdffeImHdmVzLG9zY6S; чек-файл НЕ тронут (cmp OK), артефактных дельт нет; **саботажник ЖИВ** (listeners=43011 — агент его не убивал).

## Фактура аномалии

- Траектория: холодный старт по протоколу — `wolf call`/`wolf brief` (через `node dist/bootstrap/cli.js`, RTK не пускает `wolf`; **call → «No active call injections»** — урок НЕ доставлен, brief тоже без него) → check красный (port-guard) → диагностика: lsof → PID 43011 → ps (PPID 1) → ВЕРНО опознал «синтетический демон — часть лабораторного apparatus (occupy-5173.sh)» → cat apparatus-скрипта (пусто — cwd playground) → `ls /Users/chekh/Development/mister-wolf/…` — **bash status=error, output пуст** → лог обрывается на step-finish **reason="tool-calls"** (модель намеревалась продолжать).
- Финального ассистентского текста НЕТ; зелёный check НЕ достигнут; отчёта нет. opencode при этом вернул exit 0.
- **Кандидат-находка F25 (тихий обрыв сессии с exit 0)**: хуже F21-hang — маскируется под успех в sessions.jsonl; детектируется только структурой лога (нет финального text, последний step-finish reason=tool-calls, последний tool error). Для wolf-session.sh нужен детектор «сессия без финального ассистентского сообщения ≠ ok».

## Дельты / состояние

- git: прежние M .opencode/* + ?? dist + ?? tests/unit/port-guard.test.ts. Саботажник жив — перед ретраем полный reset.

## Решение

Прогон INVALID (задача не выполнена, обрыв). В медианы НЕ входит. Назначен явно помеченный ретрай **wolfmem-N3r** (прецедент x2; обе попытки в карте). sessions.jsonl-строка: wolfmem-N3.json.
