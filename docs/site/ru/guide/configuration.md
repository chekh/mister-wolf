# Конфигурация

## Конфиг проекта `.wolf/config.yaml`

YAML-файл, валидируется zod-схемой. Ключи и дефолты:

| Ключ                                | Тип / дефолт                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`                    | int; текущая **2** (легаси-проекты без маркера = 1)                                                                               |
| `wolf_version`                      | semver-штамп версии wolf, писавшей конфиг; маркер дрейфа таксономии — несовпадение с бинарём даёт warning `wolf migrate taxonomy` |
| `artifact_sources`                  | string[] — дефолт `[]`                                                                                                            |
| `memory_types.project`              | свои типы: lifecycle, subdir_thread, subdir_shared, fields; не могут конфликтовать с core-типами                                  |
| `error_class_taxonomy`              | [{id, match[]}] — дефолт `[]`                                                                                                     |
| `facets.character`                  | string[] из **7–10** значений; закрытый словарь «характер записи» для `--facet` типа note; дефолт — канонические 7                |
| `learning.pattern_threshold`        | int >= 1 — дефолт **3**                                                                                                           |
| `learning.decay_ttl`                | map тип → число сессий без срабатывания                                                                                           |
| `learning.effectiveness_thresholds` | {noise_ok, noise_warn, silent_ok} — проценты                                                                                      |
| `pricing`                           | map модель → `{input, output, cache_read}` в $/Mtok; без блока `$`-поля скрыты (числа не выдумываются)                            |
| `analytics.thresholds`              | классификация lifecycle памяти: `{new_days, workhorse_uses}`; дефолт `{14, 3}`                                                    |
| `delivery.context_budget_tokens`    | int > 0; бюджет контекста сессии для предупреждения об инъекциях, токены; дефолт **200000**                                       |
| `delivery.context_warning_pct`      | число ≥ 0; предупреждение, когда инъекции сессии превышают эту долю бюджета, %; дефолт **20**, `0` — выключить                    |

Пример:

```yaml
schema_version: 2
wolf_version: 2.12.0 # штамп версии wolf, писавшей конфиг
artifact_sources: []
# Закрытый словарь «характер записи» для нот (валидируется на `wolf add --facet`);
# 7–10 значений; без ключа — дефолтные 7
facets:
  character: [howto, pitfall, context, metric, history, legacy, constraint]
learning:
  pattern_threshold: 3
  decay_ttl: {} # map: тип -> число сессий без срабатывания
  effectiveness_thresholds: {} # noise_ok / noise_warn / silent_ok, проценты
# $-конверсия: модель -> $/Mtok; без блока $-поля скрыты
pricing:
  zai-coding-plan/glm-5.2:
    input: 0.6
    output: 2.2
    cache_read: 0.08
analytics:
  thresholds:
    new_days: 14 # NEW до этого возраста
    workhorse_uses: 3 # WORKHORSE от этого числа использований
# Мягкий лимит инъекций `wolf call` (аппроксимация токенов bytes/4):
# одна строка в stderr выше доли бюджета, доставка не режется; 0 — выключить
delivery:
  context_budget_tokens: 200000
  context_warning_pct: 20
```

`pricing` и `analytics.thresholds` управляют [аналитикой эффективности](/ru/guide/cli/analytics#конфигурация) (`$`-поля и lifecycle-классы); там же — примеры использования.

### Мягкий лимит доставки

`delivery.*` — мягкий лимит инъекций `wolf call`: предупреждение, но никогда не обрезка:

- `delivery.context_budget_tokens` (дефолт **200000**) — бюджет контекста сессии, по которому считается предупреждение (аппроксимация токенов bytes/4);
- `delivery.context_warning_pct` (дефолт **20**) — когда инъекции сессии превышают эту долю бюджета, `wolf call` печатает **одно** предупреждение в stderr; сама доставка не режется никогда. `0` отключает предупреждение.

## Свои типы памяти

Свои типы объявляются в `memory_types.project`: lifecycle, subdir_thread, subdir_shared, fields. Единственное ограничение — имена не должны конфликтовать с core-типами. Core-таксономия живёт в коде-каноне — её дамп в конфиге отсутствует, есть только штамп `wolf_version`; несовпадение штампа с бинарём показывает `wolf validate` предупреждением. Посмотреть эффективную таксономию и обновить конфиг:

```bash
wolf taxonomy show   # эффективная таксономия
wolf taxonomy sync   # перезаписать .wolf/config.yaml: проектные типы и настройки сохраняются, штамп wolf_version обновляется
```

## Фасеты

`facets.character` подменяет закрытый словарь «характер записи» типа `note` — значения, которые принимает `--facet` у `wolf add`:

- в списке должно быть **7–10 непустых значений**; битый блок — громкая ошибка конфига, а не молчаливый откат;
- без ключа используются канонические 7: `howto`, `pitfall`, `context`, `metric`, `history`, `legacy`, `constraint`;
- `wolf add --facet <значение>` валидируется по эффективному словарю — неизвестное значение отвергается.

Что фасеты значат для нот — см. [Модель памяти](/ru/guide/memory).

## Структура хранилища

`wolf init` создаёт скелет: `memory/`, `memory/threads/`, `memory/shared/`, `memory/briefs/`, `cache/`, `config.yaml`. Остальные пути — лениво при первом использовании:

```text
.wolf/
├── config.yaml            # конфиг проекта
├── memory/
│   ├── threads/<tid>/     # объекты тредов: <subdir>/<id>.md; WORK-THREAD.md — сам тред
│   ├── shared/<subdir>/   # общие объекты
│   ├── briefs/            # брифы
│   ├── events.jsonl       # журнал событий
│   ├── relations.jsonl    # связи между объектами
│   └── quarantine/        # карантин битых объектов (wolf validate --fix)
├── cache/index.sqlite     # FTS-индекс поиска
├── cache/sessions/        # лениво; реестры доставок по сессиям (дедупликация), GC после 7 дней
├── metrics/               # session-metrics.jsonl, patterns.jsonl, signal-counts.json (derived-счётчики) — сигнальный лог
├── thinking/              # последовательности мышления
├── tools/                 # тела скриптов tool-объектов
└── backup/<ts>/           # бэкапы (wolf init --recreate)
```

## Глобальный конфиг

Пользовательский конфиг: `$XDG_CONFIG_HOME/wolf`, иначе `~/.config/wolf`. Там `wolf doctor` ведёт реестр зарегистрированных проектов.

## Версия схемы

Текущая версия схемы хранилища — **2**. Проекты, созданные до появления маркера, считаются версией 1. Несоответствие версии бинаря и версии схемы проекта проверяет:

```bash
wolf doctor   # все зарегистрированные проекты: binary vs schema, платформенные конфиги, чистка мёртвых записей
```
