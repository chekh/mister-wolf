# Task Brief COST-T3 (итерация orch-3, оркестрованный прогон)

## Metadata

- ID: COST-T3 / orch-3
- Уровень: 0 → 1 (Wolf → Executor)
- Отчёт: `executor/report-cost-T3-orch-3.md`
- Корень проекта: `wolf-experiment/`

## Task

Парсер конфигурационных файлов (INI-подобный формат).

### Формат

- Секции: `[section]`
- Пары `key=value`
- Секция `[DEFAULT]` наследуется всеми остальными секциями
- Комментарии `#` и пустые строки игнорируются

### Автотипизация значений

- `int` (включая отрицательные)
- `float`
- `bool` (`true`/`false`)
- иначе `str`

### Ошибки

- `ConfigSyntaxError` — с номером строки
- `ConfigUnknownSection` — с секцией/ключом/строкой
- `ConfigMissingKey` — с секцией/ключом/строкой

### API

- `Config.load(path) -> Config`
- `cfg.get(section, key, default=None)`
- `cfg.require(section, key)`

## Acceptance Criteria

1. Файлы СТРОГО по путям от корня `wolf-experiment/` (НЕ от `workers/`):
   - `cost/T3/orch-3/config_parser.py`
   - `cost/T3/orch-3/test_config_parser.py`
2. Только stdlib; фикстуры через `tempfile`.
3. Тестов 12+ и все зелёные, покрытие:
   - валидный файл;
   - наследование DEFAULT;
   - комментарии/пустые строки;
   - типы: int / float / bool / str, отрицательные числа;
   - три вида ошибок с проверкой номеров строк;
   - `get` с default;
   - `require` по отсутствующему ключу.
4. Обязательное ревью `worker-reviewer` после зелёных тестов; замечания
   устранены или обоснованно отклонены.
5. Отчёт executor'а: статус, список файлов, результаты тестов, итог ревью.

## Constraints

- Не выходить за пределы `wolf-experiment/`.
- Обмен — только файлами; код пишут воркеры, не executor.
- Язык артефактов — русский.
