# Управление работой

Управление работой в 2.13 — треды, решения и правила, всё через пятёрку глаголов и генерённые type-неймспейсы (см. [Память](/ru/guide/cli/memory)).

## Куда ушли blocker / info-request / article

Отдельные типы удалены; их работа переехала на notes и статусы тредов:

| До 2.13        | Теперь                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `blocker`      | `wolf note add --facet pitfall` для знания или статус треда `blocked`, пока работа ждёт внешнего разрешения |
| `info-request` | `wolf note add --facet context` или статус треда `waiting_answer`, когда вопрос задан наверх                |
| `article`      | `wolf note add --facet context`                                                                             |

## `wolf thread`

Рабочий тред несёт живой контекст одного куска работы. Создание — `wolf add --type thread` или генерённый неймспейс `wolf thread add`:

```bash
wolf thread add [options]
```

Опции сверх общих флагов `add` (`--title`, `--body`, `--tags`, `--confidence`, `--importance`, `--set`, `--created-by`):

- `--goal <goal>` — цель треда (обязателен);
- `--current-state <state>` — текущее состояние;
- `--next-steps <steps>` — следующие шаги через запятую.

```bash
wolf thread add --title "Сайт документации" --goal "Выпустить VitePress-сайт" \
  --current-state "черновики страниц готовы" --next-steps "написать страницы,сборка,деплой"
```

Тред лежит на диске как `threads/<thread-id>/WORK-THREAD.md`. Список тредов — `wolf thread list [--status <status>] [--stale]` (генерённый неймспейс).

### Статусы треда

`active`, `paused`, `blocked`, `waiting_answer`, `open`, `completed`, `archived`. Три «ждущих» статуса поглотили бывшие отдельные типы:

- `blocked` — тред ждёт внешнего разрешения (бывший `blocker`);
- `waiting_answer` — вопрос задан наверх (бывший `info-request`);
- `open` — открытый вопрос без адресата.

Когда ситуация разрешилась, тред возвращается в `active` или сразу уходит в `archived`:

```bash
wolf transition mem_thread_01 blocked # уперлись во внешний блокер
wolf transition mem_thread_01 active # разрешено — продолжаем работу
```

### От `thread brief` к `recap`

`wolf thread brief <id>` удалён. Окно над активной работой — одна команда `wolf recap`: правила, треды, блокеры, вопросы и решения одной сводкой.

## `wolf decision`

Генерённый неймспейс. `wolf decision add` — общие флаги `add` плюс `--thread <thread-id>` (родительский тред); `wolf decision list [--status <status>] [--stale]` — список решений.

```bash
wolf decision add --title "Worktrees для работы над доками" \
  --body "Trunk-based; работа в .worktrees/<task>." --thread mem_thread_01
```

## `wolf rule`

Правила добавляются только по запросу пользователя — агенты сами правила не сеют. Генерённый неймспейс: `wolf rule add` добавляет к общим флагам `--scope <project|global>`, `--applies-to <items>`, `--trigger <trigger>` и `--trigger-keywords <items>`; `wolf rule list` — список правил.

```bash
wolf rule add --title "Коммит после работы" \
  --body "Каждая завершённая задача коммитится" --scope project
```

## `wolf relation`

Типизированные рёбра связывают рабочие артефакты: решения с тредами, notes с решениями:

```bash
wolf relation add mem_002 supports mem_thread_01
```

- `wolf relation list [--of <id>] [--json]` — обе стороны объекта, вывод `subject -predicate-> object`;
- `wolf relation remove <id>` — дописывает компенсирующую запись (`removed: true`) в `relations.jsonl`; лог append-only, рёбра с `removed` не читаются, откат удаления — убрать запись.

Полный справочник: [Память](/ru/guide/cli/memory).
