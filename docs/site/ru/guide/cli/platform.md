# Платформа и обслуживание

## `wolf init`

Инициализировать память Mr. Wolf для проекта (интерактивно в TTY; неинтерактивный режим требует `--model`).

| Опция              | Описание                                                                          |
| ------------------ | --------------------------------------------------------------------------------- |
| `--platform <ids>` | Явный список платформ через запятую (opencode,claude); заменяет текущий набор     |
| `--model <id>`     | Модель для Mr. Wolf и его агентов (`<providerID>/<modelID>`); обязательна вне TTY |
| `--recreate`       | Забэкапить битый .wolf/config.yaml и пересоздать из дефолтов                      |

В терминале `wolf init` спросит модель интерактивно; в скриптах и CI передавай `--model` явно.

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

Счётчики использования + экономика переиспользования (сигнальный лог + legacy run-log). Канонический источник — сигнальный лог; исторический `.wolf/run-log.jsonl` ещё подмешивается в переходном окне — запусти `wolf migrate run-log`, чтобы архивировать его и убрать двойной счёт.

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

### `wolf migrate run-log`

Архивирует устаревший `.wolf/run-log.jsonl` в `.wolf/metrics/archive/run-log-<дата>-legacy.jsonl` (локальная дата; при коллизии имени — следующий свободный суффикс `-2`, `-3`). Запусти после обновления, если `wolf run` раньше писал run-лог: пока legacy-файл на месте, analytics считает старые прогоны дважды — канонический источник теперь сигнальный лог. Перенос — rename (содержимое не переписывается); команда печатает счётчик строк. Идемпотентно: файла нет → `nothing to migrate`, exit 0.

```bash
wolf migrate run-log
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

## `wolf sync`

Перерендерить базовый набор Wolf (только штампованные файлы; память не трогается).

```bash
wolf sync
```

## `wolf run`

Запустить opencode с моделью из routing-объекта Wolf; записать взвешенную стоимость токенов в лог.

```bash
wolf run <prompt> [options]
```

| Опция               | Описание                                                                        |
| ------------------- | ------------------------------------------------------------------------------- |
| `--agent <name>`    | Имя агента opencode                                                             |
| `--title <title>`   | Метка запуска в логе                                                            |
| `--session <sid>`   | Продолжить сессию opencode                                                      |
| `--tool <name>`     | Пометить запуск как использующий тул(ы) (повторяемая)                           |
| `--experiment <id>` | Id эксперимента (сравнительные методики, например RCT)                          |
| `--arm <choice>`    | Arm эксперимента (`wolf` \| `baseline`)                                         |
| `--task-id <id>`    | Id задачи (пишется top-level при передаче; дублируется в эксперименте)          |
| `--campaign <id>`   | Id кампании (top-level `campaign_id`; группирует прогоны для `--view campaign`) |
| `--trace-id <id>`   | Trace id (дефолт — свежий uuid)                                                 |
| `--attempt <n>`     | Номер попытки в рамках задачи                                                   |

Обогащение прогонов (raw-токены, `duration_ms`, поля эксперимента в логах) — см. [Аналитика](/ru/guide/cli/analytics#обогащение-wolf-run).

```bash
wolf run "Проведи ревью изменений" --title "review"
```

## `wolf upgrade`

Обновить глобальную установку `wolf` до последней npm-версии (выполняет `npm install -g mister-wolf@latest`).

| Опция     | Описание                                                       |
| --------- | -------------------------------------------------------------- |
| `--check` | Только проверить наличие новой версии, ничего не устанавливать |

```bash
wolf upgrade --check
```
