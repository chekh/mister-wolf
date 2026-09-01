# Платформа и обслуживание

## `wolf init`

Инициализировать память Mr. Wolf для проекта (идемпотентно, неинтерактивно).

| Опция              | Описание                                                                      |
| ------------------ | ----------------------------------------------------------------------------- |
| `--platform <ids>` | Явный список платформ через запятую (opencode,claude); заменяет текущий набор |
| `--recreate`       | Забэкапить битый .wolf/config.yaml и пересоздать из дефолтов                  |

```bash
wolf init --platform opencode,claude
```

## `wolf bootstrap`

Сканировать проект и создать черновую стартовую память: proposed-правила, document-ref'ы, work-thread. Опции: `--created-by <actor>`.

```bash
wolf bootstrap
```

## `wolf mcp`

Запустить MCP-сервер (stdio).

```bash
wolf mcp
```

## `wolf scaffold`

Создать рамку платформы opencode (agent|skill|command) + playbook в памяти Wolf.

```bash
wolf scaffold <kind> <name> [options]
```

| Аргумент/опция         | Описание                                       |
| ---------------------- | ---------------------------------------------- |
| `<kind>`               | Тип рамки: agent, skill, command               |
| `<name>`               | Имя рамки                                      |
| `--persona <text>`     | Текст тела agent-рамки (только agent)          |
| `--model <model>`      | model во frontmatter агента (только agent)     |
| `--from-playbook <id>` | Переиспользовать существующий playbook id      |
| `--created-by <actor>` | Автор (дефолт: env WOLF_ACTOR, иначе user:cli) |

```bash
wolf scaffold agent apprentice --persona "Ты ученик" --model "your-model-id"
```

## `wolf tool`

Библиотекарь инструментов.

### `wolf tool register`

Зарегистрировать скрипт как tool-объект (копирует в `.wolf/tools/`). Опции: `--name <name>` (уникальное), `--language <language>` (typescript, python, bash, ...), `--contract-in <text>`, `--contract-out <text>`, `--contract-env <text>`, `--notes <text>` (тело объекта), `--force` (пропустить проверку похожих тулов), `--created-by <actor>`.

```bash
wolf tool register <script-path> --name check --contract-in "нет" --contract-out "exit 0/1"
```

### `wolf tool list`

Список; `--status <status>` (active, candidate, deprecated, archived).

### `wolf tool use`

Отметить использование (+1 к usage_count, напомнит контракт).

```bash
wolf tool use <name-or-id>
```

### `wolf tool expose`

(Пере)сгенерировать `.opencode/skills/<name>/SKILL.md` (идемпотентно).

### `wolf tool deprecate`

Вывести тул в deprecated (требуется причина): `--reason <text>`.

```bash
wolf tool deprecate <name-or-id> --reason "заменён линтером"
```

### `wolf tool revive`

Оживить deprecated-тул (deprecated → active).

### `wolf tool stats`

Счётчики использования + экономика переиспользования из `.wolf/run-log.jsonl`.

```bash
wolf tool list --status active
wolf tool use check
```

## `wolf taxonomy`

Таксономия памяти.

### `wolf taxonomy sync`

Регенерировать `memory_types.core` в `.wolf/config.yaml` из кода-канона.

### `wolf taxonomy show`

Напечатать эффективную таксономию (код-канон + проектные типы).

## `wolf migrate`

Разовая миграция layout: `objects/<type>/` → `threads/<tid>/<subdir>/` + `shared/`. По умолчанию dry-run; `--apply` — выполнить.

```bash
wolf migrate --apply
```

## `wolf validate`

Проверить целостность хранилища; `--fix` — карантин битых объектов.

```bash
wolf validate --fix
```

## `wolf doctor`

Проверить все зарегистрированные проекты: binary vs schema version, платформенные конфиги, чистка мёртвых записей.

```bash
wolf doctor
```

## `wolf run`

Запустить opencode с моделью из routing-объекта Wolf; записать взвешенную стоимость токенов в лог.

```bash
wolf run <prompt> [options]
```

| Опция             | Описание                                              |
| ----------------- | ----------------------------------------------------- |
| `--agent <name>`  | Имя агента opencode                                   |
| `--title <title>` | Метка запуска в логе                                  |
| `--session <sid>` | Продолжить сессию opencode                            |
| `--tool <name>`   | Пометить запуск как использующий тул(ы) (повторяемая) |

```bash
wolf run "Проведи ревью изменений" --title "review"
```
