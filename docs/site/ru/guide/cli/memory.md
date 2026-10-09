# Память

Канонические входы — пятёрка глаголов: `add`, `get`, `edit`, `list`/`search`, `archive`, плюс `wolf relation` для рёбер между объектами. Остальное на этой странице — plumbing: скрыт из `wolf --help`, жив для скриптов и жалобного контура.

## `wolf add`

Добавить объект памяти.

```bash
wolf add [options]
```

| Опция                       | Описание                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--type <type>`             | Тип памяти: `rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note`                                                                  |
| `--title <title>`           | Заголовок                                                                                                                                        |
| `--body <body>`             | Текст                                                                                                                                            |
| `--tags <tags>`             | Теги через запятую                                                                                                                               |
| `--confidence <confidence>` | Уверенность (low\|medium\|high)                                                                                                                  |
| `--importance <n>`          | Важность от 0 до 1                                                                                                                               |
| `--set <k=v>`               | Доп. поле key=value (повторяемый; значение «[a,b]» — строковый массив)                                                                           |
| `--scope <scope>`           | Поле scope для типов с ним (rule: project\|global)                                                                                               |
| `--facet <facet>`           | Фасет note. Обязателен для `note`: howto\|pitfall\|context\|metric\|history\|legacy\|constraint. Свободный ввод — ошибка: словарь фасетов закрыт |
| `--created-by <actor>`      | Автор (дефолт: env WOLF_ACTOR, иначе user:cli)                                                                                                   |

```bash
wolf add --type lesson --title "Вит-тесты падают от кэша" --body "В CI — флаг --no-cache" --tags "vitest,ci" --confidence medium

wolf add --type note --title "Ловушка кэша CI" --body "vitest нужен --no-cache" --facet pitfall
```

У каждого типа есть и генерённый неймспейс: те же базовые флаги плюс типоспецифичные — `wolf note add --facet <choice>`, `wolf thread add --goal <goal> --current-state <s> --next-steps <a,b>` и т.д. Неймспейсы генерируются из таксономии — см. [модель памяти](/ru/guide/memory).

## `wolf list`

Список объектов памяти.

```bash
wolf list [options]
```

| Опция               | Описание                                               |
| ------------------- | ------------------------------------------------------ |
| `--type <type>`     | Фильтр по типу                                         |
| `--status <status>` | Фильтр по статусу                                      |
| `--stale`           | Только stale-объекты (не обновлялись 30 дней)          |
| `--facet <facet>`   | Фильтр notes по характеру (howto\|pitfall\|context\|…) |

`list` — перечисление с фильтрами; нужен полнотекстовый запрос — бери `search`, дублей опций у пары нет.

```bash
wolf list --type decision --stale
wolf list --facet pitfall
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
| `--facet <facet>`                                  | Фильтр notes по характеру (howto\|pitfall\|context\|…)                |
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
wolf search "cache" --facet pitfall
```

### Colon-запросы

Сама строка запроса поддерживает префиксы `поле:значение` по индексируемым колонкам:

- `type:lesson`, `status:active` — фильтр по колонке type / status;
- `title:checklist`, `body:redis`, `tags:deploy` — фильтр по колонке title / body / tags;
- префиксы комбинируются со словами: `type:lesson redis` — уроки, в которых встречается redis.

Неизвестный префикс — не ошибка: `tag:deployment` (такой колонки нет) отбрасывает префикс и ищет значение как обычное слово. Остальное — FTS-поиск по словам: `AND`/`OR` работают как операторы, `NOT`/`NEAR` — обычные слова, фразы в кавычках деградируют до AND своих слов, дефисные токены ищут обе части.

Структурные флаги выше (`--type`, `--status`, `--tag`, …) делают ту же фильтрацию с точным матчингом и остаются рекомендованным путём для скриптов; colon-запросы хороши в интерактивной разовой разведке.

## `wolf edit`

Правка заголовка и/или текста объекта памяти. Каждое изменение проходит diff-аудит: в `events.jsonl` падает событие `memory.edited` с payload `{memory_id, field, before, after}`, значения обрезаются до 200 символов.

```bash
wolf edit <id> [--title <t>] [--body <b>] [--actor <actor>]
```

- `--title <t>` — новый заголовок;
- `--body <b>` — новый текст;
- `--actor <actor>` — автор правки (дефолт `user:cli`).

`edit` — для правок-фиксов (опечатки, формулировки), не меняющих смысл записи. Для смыслной замены создай новый объект и сделай `wolf supersede` старому — цепочка `superseded_by` останется целой.

```bash
wolf edit mem_001 --title "Вит-тесты падают от кэша (ревизия)"
```

## `wolf archive`

Архивировать объект памяти. Сахар для `transition --status archived`; `transition` остаётся полной матрицей статусов.

```bash
wolf archive <id> [--actor <actor>]
```

`--actor <actor>` — автор архивации (дефолт `user:cli`).

```bash
wolf archive mem_042
```

## `wolf relation`

Типизированные рёбра между объектами памяти. Лог рёбер append-only: `remove` дописывает компенсирующую запись вместо удаления.

### `wolf relation add`

Записать связь между двумя объектами.

```bash
wolf relation add <subject> <predicate> <object> [--source <source>]
```

`--source <source>` — источник связи (дефолт `agent`).

```bash
wolf relation add mem_001 supports mem_002
```

### `wolf relation list`

Список связей — прямые и обратные рёбра, вывод `subject -predicate-> object`.

```bash
wolf relation list [--of <id>] [--json]
```

- `--of <id>` — только рёбра этого объекта (обе стороны);
- `--json` — вывод в JSON.

```bash
wolf relation list --of mem_001
```

### `wolf relation remove`

Удалить связь по id. В `relations.jsonl` дописывается компенсирующая запись `removed: true`; рёбра с `removed` больше не читаются. Откат удаления — убрать эту запись: сам лог остаётся append-only.

```bash
wolf relation remove <id>
```

`id` — идентификатор связи (см. `relation list`).

## Plumbing

Скрыто из `wolf --help`, живо для скриптов и жалобного контура:

### wolf update

`wolf update <id> [--set k=v …] [--inc field=n …] [--tags …] [--actor …]` — команда триажа Стюарда для жалоб: triage-поля (`triage|resolution`), монотонные счётчики (`dispatch_ages|corroborations`).

### wolf supersede

`wolf supersede <old-id> <new-id>` — смыслная замена записи: старому объекту — `superseded` + `superseded_by` на новый, затем переиндексация.

### wolf transition

`wolf transition <id> <status> [--actor …]` — полная матрица статусов жизненного цикла (см. [переходы жизненного цикла](/ru/guide/memory#приложение-жизненный-цикл-объектов)); `archive` закрывает типовой выход.

### wolf rebuild-index

`wolf rebuild-index` — перестроить SQLite-индекс поиска из объектов памяти.
