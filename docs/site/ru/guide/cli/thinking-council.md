# Мышление

## `wolf think`

Структурированные последовательности мышления (goal → мысли → вывод).

### `wolf think start`

Начать. Опции: `--goal <goal>`, `--thread <thread-id>`, `--created-by <actor>` (принимается для единообразия; на scratch не сохраняется).

### `wolf think add`

Добавить мысль. Опции: `--sequence <id>`, `--type <type>` (hypothesis, reasoning, evidence, concern), `--text <text>`.

### `wolf think conclude`

Завершить решением с встроенным trace мышления. Опции: `--sequence <id>`, `--title <title>`, `--body <body>`, `--created-by <actor>`.

### `wolf think abandon`

Отбросить без решения. Опции: `--sequence <id>`.

```bash
wolf think start --goal "Выбрать стратегию кэша"
wolf think add --sequence seq_001 --type hypothesis --text "SQLite-кэш снимет боль"
wolf think conclude --sequence seq_001 --title "SQLite-кэш" --body "FTS и один файл"
```

## `wolf council`

Конверты консилиума для методики [«Экспертный консилиум»](/ru/guide/council): вопрос, мнения экспертов, синтез — сохраняются как memory-notes со связями.

### `wolf council record`

Записать конверт консилиума из JSON-файла. Опции: `--input <json-file>` (путь к файлу конверта), `--created-by <actor>` (по умолчанию env `WOLF_ACTOR`, иначе `user:cli`).

Запись валидирует строгую v2-схему конверта, хранит canonical JSON и идемпотентна по `request_key`: повтор не создаёт дублей.

```bash
wolf council record --input council.json
```
