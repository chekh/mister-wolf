# Модель памяти

Эта страница — единственный источник таксономии памяти Wolf.

С 2.13 таксономия Wolf — **семь типов** (было 26). Суть не в переименовании, а в перераспределении ответственности:

- **7 типов вместо 26.** Выбор «куда записать» теперь решается за секунду, а не экзаменом по таксономии.
- **Фасет** — «характер записи» из закрытого словаря, выбирается из списка при add; свободный ввод запрещён. Фасеты есть только у note.
- **Цвета — только подсветка**: они маркируют фасеты в выводе терминала и никогда сами по себе не несут смысла.
- **`note` — универсальный тип.** Всё, что не rule, lesson, decision, thread, complaint или tool, — это note с фасетом.
- `blocker`, `info-request` и `open-question` **больше не типы** — это статусы thread.

## Семь типов

| Тип         | Что собой представляет                                | Где живёт (thread / shared)    | Жизненный цикл                                                       | Поля сверх базовых                                                                                   |
| ----------- | ----------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `rule`      | стоящая инструкция, которой агент следует             | — / `shared/rules`             | active, superseded, obsolete, proposed, accepted, rejected, archived | `scope` (project\|global), `applies_to`, `trigger`, `trigger_keywords`                               |
| `lesson`    | грабли или практика, которые должны всплывать позже   | `lessons/` / `lessons/`        | полный (active, open, resolved, stale, conflicting, paused, …)       | `trigger_keywords`                                                                                   |
| `decision`  | выбранный вариант и то, что он победил                | `decisions/` / `decisions/`    | active, superseded, rejected, obsolete                               | `thread` (опционально)                                                                               |
| `thread`    | многошаговая работа в процессе                        | `threads/<tid>/WORK-THREAD.md` | active, paused, blocked, waiting_answer, open, completed, archived   | `goal` (обязателен), `current_state`, `next_steps`                                                   |
| `complaint` | поданная жалоба на правило или плейбук                | `notes/` / `shared/complaints` | open, resolved, rejected, archived                                   | `about`, `rule`, `evidence`, `proposal`, `triage`, `resolution`, `dispatch_ages`, `corroborations`   |
| `tool`      | зарегистрированный скрипт для reuse                   | — / `shared/tools`             | candidate, active, deprecated, archived                              | `name`, `script_path`, `language`, `contract_*`, `usage_count`, `last_used_at`, `deprecation_reason` |
| `note`      | всё остальное: наблюдение, контекст, метрика, история | `notes/` / `shared/notes`      | полный                                                               | `facet` (enum, обязателен при add)                                                                   |

## Какой тип выбрать

| Ситуация                                               | Пишите         |
| ------------------------------------------------------ | -------------- |
| «нужно, чтобы агент всегда делал X» (или никогда)      | `rule`         |
| «наткнулся на грабли — пусть не повторяют»             | `lesson`       |
| «выбрали Y вместо Z»                                   | `decision`     |
| «идёт многошаговая работа»                             | `thread`       |
| «что-то не так с правилом или плейбуком»               | `complaint`    |
| «регистрирую скрипт для reuse»                         | `tool`         |
| всё остальное — наблюдение, контекст, метрика, история | `note` + фасет |

## Фасеты

Фасет — **«характер записи»**. Словарь по умолчанию закрытый, семь значений: `howto`, `pitfall`, `context`, `metric`, `history`, `legacy`, `constraint`.

| Фасет        | Характер записи                    |
| ------------ | ---------------------------------- |
| `howto`      | проверенный способ что-то сделать  |
| `pitfall`    | грабли, которых надо избегать      |
| `context`    | фон, который нужен читателю        |
| `metric`     | число, за которым стоит следить    |
| `history`    | как всё стало так                  |
| `legacy`     | устаревшее, но ещё держит нагрузку |
| `constraint` | граница, которую надо уважать      |

Механика:

- фасет **выбирается из списка** при add (`--facet`); свободный ввод запрещён — ошибка перечисляет допустимые значения: `Error: Invalid facet "x" for type "note" (valid values: …)`;
- `facet` **обязателен для `note`** и **запрещён для остальных типов**;
- словарь настраивается: `facets.character` в `.wolf/config.yaml` (7–10 значений) — см. [Конфигурация](/ru/guide/configuration).

## Цвета фасетов

В выводе `list`, `search` и `call` фасеты подсвечиваются цветом — **только подсветка**, не канал смысла:

- `howto` зелёный, `pitfall` красный, `context` синий, `metric` жёлтый, `history` пурпурный, `legacy` серый (dim), `constraint` циан.
- Цвета включаются **только в интерактивном терминале (TTY)**. Пайп и не-TTY вывод — то, что получают агенты — автоматически плоский текст.
- Отключается переменными `NO_COLOR` и `WOLF_NO_COLOR`.
- Карта цветов статическая, в коде, а не в конфиге; кастомные фасеты из `facets.character` рендерятся без цвета.

## Статусы thread: blocked, waiting_answer, open

Бывшие типы `blocker`, `info-request` и `open-question` — теперь статусы треда (`thread`):

| Статус           | Смысл                         |
| ---------------- | ----------------------------- |
| `blocked`        | тред ждёт внешнего разрешения |
| `waiting_answer` | тред задал вопрос наверх      |
| `open`           | открытый вопрос без адресата  |

Разрешение: → `active` (работа продолжается) или → `archived` (забросили). Содержательное наполнение — impact и workaround блокера, текст вопроса — живёт note'ом в треде с подходящим фасетом.

## Чтение данных до 2.13

Существующая инсталляция продолжает работать без миграции — старые данные читаются через alias-чтение:

- старые frontmatter-типы отображаются как новые по карте миграции (`blocker` → `note` + фасет `pitfall` и т.д.);
- старые каталоги (`documents/`, `sessions/`, `councils/`, `escalations/`, `calls/`, `playbooks/`, `blockers/`) остаются корнями чтения; первый update переносит объект на новый путь.

Полная карта и порядок миграции: [Миграция на 2.13](/ru/guide/migration-2.13).

## Примеры

```bash
# повседневная фиксация: note с фасетом
wolf add --type note --facet pitfall \
  --title "SQLite WAL ломается на NFS" \
  --body "WAL требует shared memory; держите индекс на локальном диске." \
  --tags "sqlite,ops"

# многошаговая работа: тред (goal обязателен)
wolf thread add --title "Релиз 2.13" \
  --goal "Довести волну таксономии" \
  --current-state "Доки в работе" \
  --next-steps "дописать гайд по памяти,прогнать проверки"

# урок, который должен всплывать на смежной работе
wolf add --type lesson \
  --title "Перед новым скриптом запускать wolf search" \
  --body "Похожий скрипт часто уже есть в tool-памяти." \
  --set trigger_keywords="[script,tool,rewrite]" --confidence medium

# фасет — полноценный фильтр
wolf list --type note --facet pitfall
```

Полный список флагов: [справочник CLI](/ru/guide/cli/memory).

## Приложение: жизненный цикл объектов

Каждый объект несёт статус из union в **18 статусов** — 16 общих плюс `blocked` и `waiting_answer`, специфичные для треда (см. [Статусы thread](#статусы-thread-blocked-waiting_answer-open)):

`active`, `open`, `resolved`, `stale`, `conflicting`, `superseded`, `archived`, `paused`, `completed`, `answered`, `rejected`, `obsolete`, `proposed`, `accepted`, `candidate`, `deprecated`, `blocked`, `waiting_answer`.

Переходы (зеркалируют `ALLOWED_TRANSITIONS` в коде; эффективное множество для типа = матрица ∩ декларированный lifecycle типа):

| Переход                                                         | Куда                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `active`                                                        | stale, superseded, archived, conflicting, completed, resolved, obsolete, answered, deprecated, paused, blocked, waiting_answer, open |
| `open`                                                          | resolved, rejected, archived, answered, active                                                                                       |
| `resolved` / `completed` / `answered` / `rejected` / `obsolete` | archived                                                                                                                             |
| `stale`                                                         | active, archived                                                                                                                     |
| `conflicting`                                                   | active, archived                                                                                                                     |
| `paused`                                                        | active, archived                                                                                                                     |
| `blocked`                                                       | active, archived — тред: работа продолжается или тред заброшен                                                                       |
| `waiting_answer`                                                | active, archived — тред: ответ пришёл или вопрос снят                                                                                |
| `proposed`                                                      | accepted, rejected, archived                                                                                                         |
| `accepted`                                                      | active, obsolete, archived                                                                                                           |
| `candidate`                                                     | active, deprecated, archived                                                                                                         |
| `deprecated`                                                    | active, archived (реанимация tool)                                                                                                   |
| `superseded` / `archived`                                       | терминальные — переходов нет                                                                                                         |

Для `thread` (lifecycle: `active`, `paused`, `blocked`, `waiting_answer`, `open`, `completed`, `archived`) эффективные переходы: `active` → `paused` / `blocked` / `waiting_answer` / `open` / `completed` / `archived`; `paused` / `blocked` / `waiting_answer` / `open` → `active` или `archived`; `completed` → `archived`.

Команды:

```bash
wolf transition mem_002 accepted   # смена статуса (актор: --actor, дефолт user:cli)
wolf supersede mem_001 mem_002     # mem_001 заменён mem_002: status=superseded + superseded_by
wolf get mem_001 --latest          # дойти по цепочке до актуального
```

`supersede` валидирует оба id, ставит старому объекту `status: 'superseded'` + `superseded_by: <newId>`, пишет событие `memory.superseded` и переиндексирует поиск. `superseded` и `archived` терминальные — «назад» только новым объектом.

### Графемы статусов

Статус всегда читается по форме узла и подписи — цвет лишь вторичное усиление. Те же восемь графем используются в документации, CLI и hero-терминале:

| Графема                                                                                                                       | Статус      | Значение                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------- |
| <span class="wolf-glyph wg-active" aria-hidden="true">──●</span>                                                              | ACTIVE      | действует                             |
| <span class="wolf-glyph wg-verified" aria-hidden="true">──✓</span>                                                            | ACCEPTED    | проверен, принят                      |
| <span class="wolf-glyph wg-proposed" aria-hidden="true">──◆</span>                                                            | PROPOSED    | черновик, ждёт ревью                  |
| <span class="wolf-glyph wg-blocked" aria-hidden="true">──×</span>                                                             | OPEN        | требует внимания — блокеры, вопросы   |
| <span class="wolf-glyph wg-stale" aria-hidden="true">──○</span>                                                               | STALE       | не окупается, кандидат в отставку     |
| <span class="wolf-glyph wg-superseded" aria-hidden="true"><span class="wg-old">○──</span><span class="wg-new">●</span></span> | SUPERSEDED  | заменён новым, цепочка                |
| <span class="wolf-glyph wg-archived" aria-hidden="true">──□</span>                                                            | ARCHIVED    | терминальный, хранится для истории    |
| <span class="wolf-glyph wg-conflict" aria-hidden="true">●╱●</span>                                                            | CONFLICTING | два объекта претендуют на одну правду |

## Приложение: оси управления

Три оси отделяют рабочие заметки от канона и держат накопленное знание честным:

| Ось            | Значения                                                                                              | Смысл                                        |
| -------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `memory_class` | working \| canonical                                                                                  | рабочее состояние против устоявшегося канона |
| `truth_role`   | proposed_knowledge \| accepted_knowledge \| source_of_truth (для `agent:*` дефолт proposed_knowledge) | эпистемический вес записи                    |
| `lifetime`     | long_term \| short_term \| session                                                                    | как долго объект должен иметь значение       |

Вместе с жизненным циклом это делает устаревшее знание видимым, а заменённое — достижимым, но не на пути: записанное агентом по умолчанию не притворяется источником истины.

## Приложение: инъекции

`wolf call` собирает контекст для начала сессии (или вызова). Механика:

1. База: все active `call-injection` — до-2.13-тип или его форма 2.13, note с `alias_origin: call-injection`.
2. `--for <topic>`: матчинг `trigger_keywords` по токенам темы + FTS-fallback по индексу (limit 10); присоединяются active `lesson` и `rule` с совпавшими `trigger_keywords`; если ничего не нашлось — fallback: до 3 правил без ключевого совпадения.
3. `--thread <id>`: добавляются все active правила со scope=project + active блокеры этого треда.
4. Ранжирование по `finalScore` (importance, confidence, давность updated_at).
5. Бюджет: `--compact` без числа → 1200 символов, числом → N; без флага — без лимита; сверх бюджета — truncated.
6. Результат: `{ blocks, truncated, deliveredIds }`.

```bash
wolf call                          # всё активное
wolf call --for "vitest" --compact # по теме, бюджет 1200 символов
wolf call --thread thr_001 --compact 800
```

Та же механика работает и на стороне агента: память через MCP плюс платформенные интеграции не дают сессии начинать вслепую.
