# Мышление и совет

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

Операции совета.

### `wolf council tally`

Подсчитать голоса. Опции: `--question-id <id>`, `--quorum <n>` (минимум голосов), `--threshold <x>` (порог консенсуса 0–1, дефолт 0.5).

### `wolf council synthesize`

Синтез из мнений совета. Опции: `--question-id <id>`, `--recommendation <text>`, `--created-by <actor>`.
