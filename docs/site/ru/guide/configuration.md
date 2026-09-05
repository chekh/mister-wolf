# Конфигурация

## Конфиг проекта `.wolf/config.yaml`

YAML-файл, валидируется zod-схемой. Ключи и дефолты:

| Ключ                                | Тип / дефолт                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `schema_version`                    | int; текущая **2** (легаси-проекты без маркера = 1)                                                    |
| `artifact_sources`                  | string[] — дефолт `[]`                                                                                 |
| `memory_types.core`                 | генерируемый блок из кода-канона (`wolf taxonomy sync`); ручные правки перезаписываются                |
| `memory_types.project`              | свои типы: lifecycle, subdir_thread, subdir_shared, fields; не могут конфликтовать с core-типами       |
| `error_class_taxonomy`              | [{id, match[]}] — дефолт `[]`                                                                          |
| `learning.pattern_threshold`        | int >= 1 — дефолт **3**                                                                                |
| `learning.decay_ttl`                | map тип → число сессий без срабатывания                                                                |
| `learning.effectiveness_thresholds` | {noise_ok, noise_warn, silent_ok} — проценты                                                           |
| `pricing`                           | map модель → `{input, output, cache_read}` в $/Mtok; без блока `$`-поля скрыты (числа не выдумываются) |
| `analytics.thresholds`              | классификация lifecycle памяти: `{new_days, workhorse_uses}`; дефолт `{14, 3}`                         |

Пример:

```yaml
schema_version: 2
artifact_sources: []
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
```

`pricing` и `analytics.thresholds` управляют [аналитикой эффективности](/ru/guide/cli/analytics#конфигурация) (`$`-поля и lifecycle-классы); там же — примеры использования.

## Свои типы памяти

Свои типы объявляются в `memory_types.project`: lifecycle, subdir_thread, subdir_shared, fields. Единственное ограничение — имена не должны конфликтовать с core-типами. Посмотреть эффективную таксономию (код-канон + проектные типы) и синхронизировать канон:

```bash
wolf taxonomy show   # эффективная таксономия
wolf taxonomy sync   # регенерировать memory_types.core из кода-канона
```

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
├── metrics/               # session-metrics.jsonl, patterns.jsonl — сигнальный лог
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
