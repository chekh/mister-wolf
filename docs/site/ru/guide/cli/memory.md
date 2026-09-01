# Память

## `wolf add`

Добавить объект памяти.

```bash
wolf add --type <type> --title <title> [options]
```

| Опция                       | Описание                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--type <type>`             | Тип памяти: decision, lesson, observation, session-summary, open-question, context, work-thread, info-request, article, blocker, session-checkpoint, rule, document-ref, document-native, task-brief, report, council-question, council-opinion, synthesis, escalation, decision-request, call-injection, playbook, tool |
| `--title <title>`           | Заголовок                                                                                                                                                                                                                                                                                                                |
| `--body <body>`             | Текст                                                                                                                                                                                                                                                                                                                    |
| `--tags <tags>`             | Теги через запятую                                                                                                                                                                                                                                                                                                       |
| `--confidence <confidence>` | Уверенность (low\|medium\|high)                                                                                                                                                                                                                                                                                          |
| `--importance <n>`          | Важность от 0 до 1                                                                                                                                                                                                                                                                                                       |
| `--set <k=v>`               | Доп. поле key=value (повторяемый; значение «[a,b]» — строковый массив)                                                                                                                                                                                                                                                   |
| `--scope <scope>`           | Поле scope для типов с ним (rule: project\|global)                                                                                                                                                                                                                                                                       |
| `--created-by <actor>`      | Автор (дефолт: env WOLF_ACTOR, иначе user:cli)                                                                                                                                                                                                                                                                           |

```bash
wolf add --type lesson --title "Вит-тесты падают от кэша" --body "В CI — флаг --no-cache" --tags "vitest,ci" --confidence medium
```

## `wolf list`

Список объектов памяти.

| Опция               | Описание                                      |
| ------------------- | --------------------------------------------- |
| `--type <type>`     | Фильтр по типу                                |
| `--status <status>` | Фильтр по статусу                             |
| `--stale`           | Только stale-объекты (не обновлялись 30 дней) |

```bash
wolf list --type decision --stale
```

## `wolf get`

Получить объект по id.

```bash
wolf get <id> [--latest]
```

`--latest` — пройти по цепочке `superseded_by` до актуального объекта.

```bash
wolf get mem_001 --latest
```

## `wolf search`

Поиск по объектам памяти (FTS).

```bash
wolf search <query> [options]
```

| Опция                                              | Описание                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `--type <type>` / `--status <status>`              | Фильтры по типу / статусу                                             |
| `--tag <tag>`                                      | Фильтр по тегу (повторяемый)                                          |
| `--confidence <confidence>`                        | low\|medium\|high                                                     |
| `--min-importance <n>` / `--max-importance <n>`    | Границы важности                                                      |
| `--created-after <iso>` / `--created-before <iso>` | Окно создания                                                         |
| `--limit <n>`                                      | Максимум результатов                                                  |
| `--file-path <path>`                               | По связанному/исходному файлу                                         |
| `--hide-superseded`                                | Скрыть superseded (по умолчанию показываются с пометкой [superseded]) |
| `--include-superseded`                             | Deprecated no-op: superseded показываются по умолчанию                |

```bash
wolf search "supersede" --type rule --hide-superseded
```

## `wolf supersede`

Заменить объект памяти другим: старому — `status: superseded` + `superseded_by`.

```bash
wolf supersede <old-id> <new-id>
```

## `wolf transition`

Сменить статус жизненного цикла объекта.

```bash
wolf transition <id> <status> [--actor <actor>]
```

`--actor <actor>` — автор перехода (дефолт `user:cli`).

```bash
wolf transition mem_002 accepted
```

## `wolf rebuild-index`

Перестроить SQLite-индекс поиска из объектов памяти.

```bash
wolf rebuild-index
```
