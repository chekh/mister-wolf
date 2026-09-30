# Обновление до 2.13

Страница для владельца живой инсталляции, обновляющегося на 2.13. Пакет приезжает обычным путём (`wolf upgrade` + `wolf sync`); внимания требует память: меняется таксономия, существующие объекты переносит одноразовая команда `wolf migrate taxonomy`.

## Что меняется

- Канон — теперь **7 типов памяти**: `rule`, `lesson`, `decision`, `thread`, `complaint`, `tool`, `note` (см. [Модель памяти](/ru/guide/memory)).
- **19 старых типов схлопываются в `note` + фасет** — полная карта ниже.
- **`blocker` / `info-request` / `open-question` становятся статусами thread**: `blocked` / `waiting_answer` / `open`.
- **Create-команды удалены** (CLI и MCP): `wolf create`, `wolf thread create`, MCP-инструменты `create_*`. Замена — `wolf add --type <type>` и `transition`; ошибка удаления уже содержит подсказку.
- **`effectiveness` / `dashboard` / `insights`** — скрытые синонимы `wolf analytics --view <view>` (удаление в 2.15).

Подробности: [Модель памяти](/ru/guide/memory), [Обзор CLI](/ru/guide/cli/overview).

## Карта «старый тип → куда»

Полная карта миграции (спека 2.13 §5.4):

| Старый тип                                              | → Новый     | Фасет / примечание                                                           |
| ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `rule`                                                  | `rule`      | —                                                                            |
| `lesson`                                                | `lesson`    | —                                                                            |
| `decision`                                              | `decision`  | —                                                                            |
| `complaint`                                             | `complaint` | —                                                                            |
| `tool`                                                  | `tool`      | —                                                                            |
| `work-thread`                                           | `thread`    | переименование типа; файлы не двигаются                                      |
| `blocker`                                               | `note`      | фасет `pitfall`; если thread задан и статус был active → треду `blocked`     |
| `info-request`                                          | `note`      | фасет `context`; если thread задан и open → треду `waiting_answer`           |
| `open-question`                                         | `note`      | фасет `context`; если thread задан и open → треду `open`                     |
| `observation`                                           | `note`      | фасет `legacy`                                                               |
| `context`                                               | `note`      | фасет `context`                                                              |
| `article`                                               | `note`      | фасет `context`                                                              |
| `session-summary`                                       | `note`      | фасет `history`                                                              |
| `session-checkpoint`                                    | `note`      | фасет `history`                                                              |
| `report`                                                | `note`      | фасет `history`                                                              |
| `council-question`                                      | `note`      | фасет `context`                                                              |
| `council-opinion`                                       | `note`      | фасет `context`                                                              |
| `synthesis`                                             | `note`      | фасет `context`                                                              |
| `document` (alias) / `document-ref` / `document-native` | `note`      | фасет `legacy`; `source.path` сохраняется                                    |
| `escalation`                                            | `note`      | фасет `legacy`                                                               |
| `decision-request`                                      | `note`      | фасет `legacy`                                                               |
| `playbook`                                              | `note`      | фасет `howto`                                                                |
| `call-injection`                                        | `note`      | фасет `howto`; активные перестают доставляться пулом `call` — см. отчёт ниже |
| `task-brief`                                            | project-тип | не трогается                                                                 |

## wolf migrate taxonomy

- Dry-run **по умолчанию**: печатает план, ничего не меняет.
- `--apply` выполняет миграцию.
- `--force` — применять даже при нечистом git-статусе `.wolf/memory` (без git — только с `--force` и предупреждением).

Требование: **чистый git-статус `.wolf/memory` перед `--apply`** — память версионируется git'ом, автобэкап не строится. Рекомендуемый порядок владельца:

```bash
git add .wolf && git commit -m "memory: pre-2.13 snapshot"
wolf migrate taxonomy            # dry-run: читай отчёт
wolf migrate taxonomy --apply
```

## Отчёт dry-run

Формат (проверено на живых данных):

- таблица плана: `id | old type | new (facet/status) | from | to`;
- `summary by type: …` — счётчики по старым типам;
- блок WARNING про **активные call-injections**: после миграции они перестают доставляться пулом `call` — перенеси их `trigger_keywords` в lesson/rule или заархивируй;
- блок конфликтов (не трогаются — см. ниже);
- финальная строка счётчиков: `migrated: N | thread status changes: N | conflicts: N | unparsable: N` (`migrated` в dry-run остаётся 0 — ничего ещё не записано).

Конфликты (тред не-active с активным поглощаемым статусом, либо несколько разных поглощаемых статусов у одного треда) и unparsable-файлы **не трогаются** — разбери их вручную и запусти повторно. Exit code `2` при конфликтах, даже с `--apply` (остальной план при этом выполняется).

Пример (синтетические id):

```
# wolf migrate taxonomy (mode: dry-run)

| id | old type | new (facet/status) | from | to |
|----|----------|--------------------|------|----|
| mem_20260101_legacy_blocker_abcd12 | blocker | note / facet: pitfall / thread -> blocked | threads/thr_20260101_payments_refactor/blockers/mem_20260101_legacy_blocker_abcd12.md | threads/thr_20260101_payments_refactor/notes/mem_20260101_legacy_blocker_abcd12.md |
| mem_20260102_old_context_efgh34 | context | note / facet: context | shared/notes/mem_20260102_old_context_efgh34.md | shared/notes/mem_20260102_old_context_efgh34.md |
| mem_20260103_call_inject_ijkl56 | call-injection | note / facet: howto | shared/calls/mem_20260103_call_inject_ijkl56.md | shared/notes/mem_20260103_call_inject_ijkl56.md |
| thr_20260101_payments_refactor | work-thread | thread / thread -> blocked | threads/thr_20260101_payments_refactor/WORK-THREAD.md | threads/thr_20260101_payments_refactor/WORK-THREAD.md |

summary by type: blocker: 1, context: 1, call-injection: 1, work-thread: 1

thread status changes:
  thr_20260101_payments_refactor: active -> blocked (cause: blocker mem_20260101_legacy_blocker_abcd12)

active call-injections (WARNING):
  mem_20260103_call_inject_ijkl56: shared/calls/mem_20260103_call_inject_ijkl56.md -> shared/notes/mem_20260103_call_inject_ijkl56.md
  after migration these stop being delivered by the call pool (spec 2.13 §5.4);
  move trigger_keywords to a lesson/rule or archive them

migrated: 0 (dry-run) | thread status changes: 1 | conflicts: 0 | unparsable: 0
rollback: git checkout .wolf/memory && wolf rebuild-index
```

## Идемпотентность и откат

- Повторный `--apply` — no-op: план из 0 строк. Признак «мигрировано» — поле `type`: объекты с одним из 7 новых типов пропускаются.
- Откат: `git checkout .wolf/memory && wolf rebuild-index`.
- После успешного `--apply` пустые старые каталоги удаляются.

## Скрипты и промпты на create

`wolf create`, `wolf thread create` и MCP-инструменты `create_*` больше нет. Замени их на `wolf add --type <type>` (создание) и `transition` (смена статуса); ошибка удаления содержит точную подсказку. После обновления перезапусти живые сессии агентов — старые промпты могут всё ещё ссылаться на удалённые команды.

## Без миграции тоже работает

Alias-чтение позволяет не мигрировать немедленно:

- старые типы во frontmatter читаются как новые цели (`list` / `get` / `search`);
- старые каталоги остаются корнями чтения;
- первый `update` объекта переписывает его в канонический тип и путь.

Миграция нужна, чтобы **писать** по-новому и получить фильтры и цвета консистентно — alias-чтение это слой совместимости, а не целевое состояние.
