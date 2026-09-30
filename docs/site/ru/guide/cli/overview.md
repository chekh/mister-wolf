# Справочник CLI

Бинарник `wolf` — человеко-скриптовая поверхность Mr. Wolf. Проверка установки: `wolf --version`; у каждой команды и подкоманды есть `-h, --help`.

С 2.13 CLI честный: `wolf --help` укладывается в 30 строк, plumbing-команды скрыты, видимый слой — это тот слой, которым и предназначено пользоваться.

## Пятёрка глаголов

Повседневная работа с памятью — пять глаголов:

| Глагол               | Что делает                                                                             |
| -------------------- | -------------------------------------------------------------------------------------- |
| `wolf add`           | Создать объект памяти (`--type rule\|lesson\|decision\|thread\|complaint\|tool\|note`) |
| `wolf get <id>`      | Прочитать объект по id (`--latest` проходит по цепочке `superseded_by`)                |
| `wolf edit <id>`     | Правка заголовка/текста существующего объекта; каждое изменение попадает в diff-аудит  |
| `wolf list`/`search` | Перечисление с фильтрами (`list`) или полнотекстовый запрос (`search`)                 |
| `wolf archive <id>`  | Уволить объект (сахар для `transition archived`)                                       |

Полный справочник: [Память](/ru/guide/cli/memory).

Вокруг глаголов — `wolf relation` (типизированные рёбра между объектами) и три окна состояния: `wolf recap` (что активно прямо сейчас), `wolf brief` (бриф для агента), `wolf analytics --view <readiness|effectiveness|dashboard>`. До-2.13-имена окон `insights`, `effectiveness`, `dashboard` ещё работают как скрытые устаревшие синонимы и будут удалены в 2.15.

## Генерённые type-неймспейсы

Каждый тип таксономии получает свой неймспейс — `wolf <type> add` и `wolf <type> list` — генерируется из декларации таксономии: обязательные поля декларации становятся обязательными флагами, enum — choices.

```bash
wolf note add --facet pitfall … # facet — choice; свободный ввод — ошибка
wolf thread add --goal "Ship docs" --next-steps "write,build"
```

Сама таксономия — в [модели памяти](/ru/guide/memory).

## `create` удалён

`wolf create` в 2.13 удалён осознанно, без синонима — скрипты получают понятную ошибку вместо молчаливого дрейфа поведения:

```text
Error: command 'create' was removed in wolf 2.13 — use `wolf add --type <type>` instead. See CHANGELOG (Migration section).
```

`wolf thread create` падает так же, с подсказкой `wolf add --type thread`. Заметки о миграции: [Миграция на 2.13](/ru/guide/migration-2.13).

## Страницы справочника

- [Память](/ru/guide/cli/memory) — пятёрка глаголов, связи, plumbing
- [Сессии и контекст](/ru/guide/cli/sessions-context)
- [Управление работой](/ru/guide/cli/work-management) — треды, решения, правила
- [Аналитика](/ru/guide/cli/analytics)
- [Платформа и обслуживание](/ru/guide/cli/platform)

## Общие конвенции

- `wolf <cmd> --help` (или `-h`) — дословный интерфейс любой команды и подкоманды.
- Plumbing (`update`, `supersede`, `transition`, `rebuild-index`, `migrate`, …) скрыт из help, но жив для скриптов и жалобного контура — см. [Память](/ru/guide/cli/memory).
- `--created-by <actor>` / `--actor <actor>` — автор мутации (дефолт: env `WOLF_ACTOR`, иначе `user:cli`); часть steward-команд по умолчанию пишет `steward:archivist`.
- `--tags`/`--applies-to` и прочие списки — через запятую; повторяемые опции можно передавать несколько раз.
- Булевы флаги по умолчанию `false`, если не указано иное.
