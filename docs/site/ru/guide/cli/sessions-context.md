# Сессии и контекст

## `wolf scan`

Сканировать проект и сохранить снимок контекста.

```bash
wolf scan
```

## `wolf brief`

Бриф агента по последнему scan + памяти.

```bash
wolf brief
```

## `wolf recap`

Сводка активной памяти: правила, треды, блокеры, вопросы, решения.

```bash
wolf recap
```

## `wolf call`

Получить активные call-инъекции (cold-start).

```bash
wolf call [--for <topic>] [--thread <thread-id>] [--compact [chars]]
```

| Опция                  | Описание                        |
| ---------------------- | ------------------------------- |
| `--for <topic>`        | Тема для матчинга инъекций      |
| `--thread <thread-id>` | Id треда для thread-режима      |
| `--compact [chars]`    | Бюджет в символах (дефолт 1200) |

```bash
wolf call --for "vitest" --compact
```

## `wolf insights`

Эвристический анализ памяти (Level 1, без LLM).

| Опция             | Описание                                                                        |
| ----------------- | ------------------------------------------------------------------------------- |
| `--topic <topic>` | Фильтр по теме: точный тег или подстрока в заголовке/тексте                     |
| `--type <type>`   | Линза: patterns, technical_debt, decisions, lessons, activity (дефолт patterns) |

```bash
wolf insights --type technical_debt
```

## `wolf session`

Сессии и чекпоинты.

### `wolf session checkpoint`

Чекпоинт рабочего треда. Опции: `--thread <thread-id>`, `--created-by <actor>` (дефолт `user:cli`).

```bash
wolf session checkpoint --thread thr_001
```

### `wolf session wrap-up`

Вручную создать session-summary недавних событий. Опции: `--title <title>`, `--tags <tags>`.

```bash
wolf session wrap-up --title "Сессия: настройка CI"
```

## `wolf diff`

Изменения треда с чекпоинта.

```bash
wolf diff <thread-id> [--since <checkpoint-id>]
```

## `wolf solve`

Собрать solve pack для проблемы памяти.

```bash
wolf solve <problem> [--save] [--thread <id>]
```

`--save` — сохранить запрос на починку памяти; `--thread <id>` — привязать его к треду.

```bash
wolf solve "битые relation-ссылки" --save
```
