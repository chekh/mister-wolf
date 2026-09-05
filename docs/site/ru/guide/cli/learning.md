# Самообучение

## `wolf learn`

Контур самообучения: digest паттернов, здоровье сигнального лога, draft propose/validate/activate.

### `wolf learn digest`

Активные паттерны с живыми счётчиками, свежими примерами, ссылками на evidence и post-audit draft'ы.

### `wolf learn status`

Здоровье сигнального лога: объёмы, порог, метаметодики Layer 1–2, decay drift, последние события.

### `wolf learn propose`

Draft урока/правила из активного паттерна (механический генератор, без LLM). Опции: `--negative` (анти-правило: полный запрет инструмента), `--created-by <actor>` (дефолт: env WOLF_ACTOR, иначе `steward:archivist`).

```bash
wolf learn propose <pattern-key> [--negative]
```

### `wolf learn validate`

Sandbox Replay Holdout: повтор draft'а на событиях tool_error после его создания.

```bash
wolf learn validate <draft-id>
```

### `wolf learn activate`

Активировать валидированный draft (гейт: holdout pass или `--human-approved`). Опции: `--human-approved` (ручное подтверждение текстовых draft'ов), `--created-by <actor>`.

```bash
wolf learn activate <draft-id> [--human-approved]
```

### `wolf learn gate`

STOP-гейт (Ф23): pressure-сценарии доставки + read-only zone probe (отдельный запуск, вне check).

### `wolf learn decay`

Ф26: decay-прогон по пробегу (сессии) — review_required-очередь, реактивация, drift. Опции: `--dry-run` (посчитать без записи изменений).

```bash
wolf learn decay [--dry-run]
```

### `wolf learn evolve`

Ф24 GEPA: кандидат vs текущий шаблон (`.wolf/templates/<id>.md`) по детерминированной метрике; активация — только человек. Опции: `--write` (записать `<id>.candidate.md`; НЕ активация).

```bash
wolf learn evolve <template-id> [--write]
```

### `wolf learn route`

Ф25: эвристика глубины ревью по признакам задачи (рекомендация; решение за человеком). Опции: `--type <t>` (feature|bugfix|refactor|docs|experiment), `--files <n>`, `--lines <n>`, `--blast-radius <x>` (0..1), `--touches-read-only`, `--security`, `--metricless`.

```bash
wolf learn digest
wolf learn propose <pattern-key>
wolf learn validate <draft-id>
wolf learn activate <draft-id>
```

## `wolf effectiveness`

Панель эффективности памяти: rules holdout, tool economy, доставка, шум, роутинг (только агрегация, без LLM).

```bash
wolf effectiveness
```

`--snapshot` — аппендить полный отчёт в `.wolf/metrics/effectiveness-snapshots.jsonl` (история для трендов). Подробности — в разделе [Аналитика](/ru/guide/cli/analytics#wolf-effectiveness).

## `wolf complain`

Записать жалобу на правило/playbook/агента как объект памяти (тип `complaint`, статус `open`) — hot-signal для Стюарда.

| Опция                   | Описание                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `--about <about>`       | Адресат: agent id, `skill:<имя>` или существующий mem-id                                        |
| `--rule <rule>`         | Какое правило плохо (указатель + что оно требует)                                               |
| `--evidence <evidence>` | Доказательство: дословная цитата + что произошло (файл/тест/числа); `--text` — deprecated-алиас |
| `--proposal <proposal>` | Предлагаемое изменение правила                                                                  |
| `--created-by <actor>`  | Автор (дефолт: env WOLF_ACTOR, иначе user:cli)                                                  |

Жалоба ложится в store полноправным объектом с обязательными полями `about`/`rule`/`evidence`/`proposal` и triage-полями для Стюарда (`wolf update --set triage|resolution`); жизненный цикл — `open → resolved | rejected | archived`.

```bash
wolf complain --about skill:apprentice --rule "шаг 2 требует ревью плана" \
  --evidence "Прогон 2026-09-04 пропустил ревью плана (в диффе нет заметок ревью)" \
  --proposal "Сделать гейт блокирующим в CI, а не рекомендательным"
```
