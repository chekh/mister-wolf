# Основные концепции

## Объекты памяти

Всё есть память: решения, уроки, правила, документы, процессы, инструменты. Каждый объект — markdown-файл с id, автором (`created_by`), статусом и типизированными полями. Layout v2:

- объекты треда: `memory/threads/<tid>/<subdir>/<id>.md`
- общие объекты: `memory/shared/<subdir>/<id>.md`
- work-thread: `memory/threads/<tid>/WORK-THREAD.md`

Объекты связаны отношениями (`wolf relation add <subject> <predicate> <object>`) и версионируются через supersede-цепочки: `wolf get <id> --latest` идёт по `superseded_by` до актуального объекта.

## Типы объектов

Каноническая таксономия — 25 типов (24 активных + 1 deprecated):

| Тип                  | Назначение                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `document`           | deprecated (легаси-документ)                                                                                        |
| `decision`           | решения; lifecycle active→superseded/rejected/obsolete                                                              |
| `lesson`             | уроки; поля trigger*keywords + draft-поля (pattern_key, evidence, holdout*\*)                                       |
| `observation`        | наблюдения; поля жалобы (about, complaint, semantic, trigger) — канал `wolf complain`                               |
| `session-summary`    | итоги сессий; threads/sessions                                                                                      |
| `open-question`      | открытые вопросы; defaultStatus: open                                                                               |
| `context`            | контекст-заметки; notes                                                                                             |
| `work-thread`        | рабочие потоки; layout `threads/<tid>/WORK-THREAD.md`; поля goal (req), current_state, next_steps                   |
| `info-request`       | запросы информации; поля question, detour_reason, expected_answer (req)                                             |
| `article`            | статьи (знания); proposed→accepted                                                                                  |
| `blocker`            | блокеры; поле impact (req)                                                                                          |
| `session-checkpoint` | чекпоинты сессий                                                                                                    |
| `rule`               | правила; scope (project\|global), draft-поля + decay-поля                                                           |
| `document-ref`       | ссылка на внешний документ; требует source.path                                                                     |
| `document-native`    | нативный документ                                                                                                   |
| `task-brief`         | бриф задачи; executor, priority (req)                                                                               |
| `report`             | отчёт                                                                                                               |
| `council-question`   | совет: вопрос                                                                                                       |
| `council-opinion`    | совет: мнение (vote)                                                                                                |
| `synthesis`          | совет: синтез (recommendation)                                                                                      |
| `escalation`         | эскалация                                                                                                           |
| `decision-request`   | запрос решения                                                                                                      |
| `call-injection`     | инъекции для `wolf call`; поля trigger_keywords, related_objects                                                    |
| `playbook`           | плейбук; steps, owner_skill, version (req)                                                                          |
| `tool`               | «инструмент как память»; defaultStatus: candidate; name, script_path, language (req); тело скрипта в `.wolf/tools/` |

## Жизненный цикл

16 статусов: `active`, `open`, `resolved`, `stale`, `conflicting`, `superseded`, `archived`, `paused`, `completed`, `answered`, `rejected`, `obsolete`, `proposed`, `accepted`, `candidate`, `deprecated`.

Допустимые переходы (эффективные для типа = глобальная матрица ∩ lifecycle типа):

| Переход                                                         | Куда                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `active`                                                        | stale, superseded, archived, conflicting, completed, resolved, obsolete, answered, deprecated |
| `open`                                                          | resolved, rejected, archived, answered                                                        |
| `resolved` / `completed` / `answered` / `rejected` / `obsolete` | archived                                                                                      |
| `stale`                                                         | active, archived                                                                              |
| `conflicting`                                                   | active, archived                                                                              |
| `paused`                                                        | active, archived                                                                              |
| `proposed`                                                      | accepted, rejected, archived                                                                  |
| `accepted`                                                      | active, obsolete, archived                                                                    |
| `candidate`                                                     | active, deprecated, archived                                                                  |
| `deprecated`                                                    | active, archived (реанимация tool)                                                            |
| `superseded` / `archived`                                       | терминальные — переходов нет                                                                  |

Команды:

```bash
wolf transition mem_002 accepted   # смена статуса (актор: --actor, дефолт user:cli)
wolf supersede mem_001 mem_002     # mem_001 заменён mem_002: status=superseded + superseded_by
wolf get mem_001 --latest          # дойти по цепочке до актуального
```

`supersede` валидирует оба id, ставит старому объекту `status: 'superseded'` + `superseded_by: <newId>`, пишет событие `memory.superseded` и переиндексирует поиск.

## Оси governance

Каждый объект несёт три оси, отделяющие рабочие заметки от канона:

| Ось            | Значения                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `memory_class` | working \| canonical                                                                                  |
| `truth_role`   | proposed_knowledge \| accepted_knowledge \| source_of_truth (для `agent:*` дефолт proposed_knowledge) |
| `lifetime`     | long_term \| short_term \| session                                                                    |

## Рабочие процессы

**Решения** — фиксируются с опорой на артефакты:

```bash
wolf decision add --title "..." --body "..." --based-on "mem_001,mem_002"
wolf decision list
```

**Блокеры** — видимы, пока не закрыты:

```bash
wolf blocker add --title "..." --impact "CI красный, релиз стоит"
wolf blocker list
wolf blocker resolve blk_001 --by mem_003
```

**Правила** — только по запросу пользователя (`user request only`), с охватом:

```bash
wolf rule add --title "..." --body "..." --scope project --applies-to "src/**"
wolf rule list
```

**Рабочие треды** — рамка задачи: goal, current_state, next_steps:

```bash
wolf thread create --title "..." --goal "..." --next-steps "шаг1,шаг2"
wolf thread list
wolf thread brief thr_001          # бриф треда
wolf session checkpoint --thread thr_001   # точка свёртки прогресса
wolf diff thr_001                  # изменения треда с чекпоинта (--since <id>)
```

## Инъекции

`wolf call` собирает контекст для начала сессии (или вызова). Механика:

1. База: все active `call-injection`.
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
