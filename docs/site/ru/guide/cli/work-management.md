# Управление работой

## `wolf thread`

Рабочие треды.

### `wolf thread create`

Создать тред. Опции: `--title <title>`, `--goal <goal>`, `--current-state <state>` (дефолт `""`), `--next-steps <steps>` (через запятую), `--created-by <actor>`.

```bash
wolf thread create --title "Релиз 1.1" --goal "Закрыть блокеры и опубликовать" --next-steps "CI,CHANGELOG"
```

### `wolf thread list`

Список тредов.

### `wolf thread brief`

Бриф треда.

```bash
wolf thread brief <thread-id>
```

## `wolf decision`

Решения.

### `wolf decision add`

Добавить решение. Опции: `--title <title>`, `--body <body>`, `--thread <thread-id>`, `--based-on <ids>` (артефакты-основания, через запятую), `--created-by <actor>`.

```bash
wolf decision add --title "SQLite вместо JSON" --body "FTS нужен" --based-on "mem_001,mem_002"
```

### `wolf decision list`

Список решений; `--thread <thread-id>` — фильтр по треду.

## `wolf blocker`

Блокеры.

### `wolf blocker add`

Добавить блокер. Опции: `--title <title>`, `--impact <impact>`, `--workaround <workaround>`, `--thread <thread-id>`, `--created-by <actor>`.

```bash
wolf blocker add --title "GitHub CI не стартует" --impact "релиз стоит" --workaround "локальный прогон check"
```

### `wolf blocker list`

Список блокеров; `--thread <thread-id>`.

### `wolf blocker resolve`

Закрыть блокер; `--by <artifact-id>` — закрывший артефакт.

```bash
wolf blocker resolve <id> [--by <artifact-id>]
```

## `wolf info-request`

Запросы информации.

### `wolf info-request create`

Создать. Опции: `--title <title>`, `--thread <thread-id>`, `--question <question>`, `--detour-reason <reason>` (почему это уводит сессию в сторону), `--expected-answer <answers>` (через запятую), `--needed-for <items>`, `--preliminary-answer <answer>` (дефолт `""`), `--created-by <actor>`.

### `wolf info-request list`

Список; `--thread <thread-id>`.

## `wolf article`

Статьи (знания).

### `wolf article add`

Добавить. Опции: `--title <title>`, `--thread <thread-id>`, `--summary <summary>`, `--body <body>`, `--answers <ids>` (закрытые info-request id), `--supports <items>`, `--evidence <items>`, `--created-by <actor>`.

### `wolf article list`

Список; `--thread <thread-id>`.

## `wolf rule`

Правила.

### `wolf rule add`

Добавить правило (только пользователь). Опции: `--title <title>`, `--body <body>`, `--scope <scope>` (project\|global), `--applies-to <items>` (пути/паттерны), `--trigger <trigger>` (когда применять), `--created-by <actor>`.

```bash
wolf rule add --title "Коммит после работы" --body "Каждая завершённая задача коммитится" --scope project
```

### `wolf rule list`

Список правил.

## `wolf relation`

Связи между объектами.

### `wolf relation add`

Записать связь; `--source <source>` — источник связи (дефолт `agent`).

```bash
wolf relation add <subject> <predicate> <object> [--source <source>]

# например:
wolf relation add mem_001 supports mem_002
```
