# Task Report: COST-T3 / orch-3

## Metadata
- task_brief: COST-T3 / orch-3 (coordinator/task-brief-cost-T3.md)
- executor: executor-lead
- status: completed

## Summary
Создан INI-подобный парсер конфигурационных файлов (секции, key=value,
наследование [DEFAULT], автотипизация int/float/bool/str) с API
`Config.load` / `get` / `require` и тремя типами исключений с атрибутами
section/key/line. Тесты (22, unittest, фикстуры через tempfile) все зелёные,
прогон без предупреждений. Ревью worker-reviewer — APPROVE; замечание NIT №1
(утечка TemporaryDirectory) устранено фиксером, NIT №2–3 обоснованно отклонены.

## Changes
- created: `cost/T3/orch-3/config_parser.py`
- created: `cost/T3/orch-3/test_config_parser.py`

## Workers Used
| # | Подзадача | Результат |
|---|---|---|
| 1 | worker-implementer: парсер + тесты по спецификации | Созданы оба файла; 21 тест OK (самопрогон воркера) |
| 2 | worker-reviewer: ревью против брифа | Вердикт APPROVE; 3 NIT (некритичные) |
| 3 | worker-implementer (фиксер): устранение NIT №1 — утечка TemporaryDirectory в `test_keyvalue_outside_section` | Тест разбит на два; 22 теста OK, ResourceWarning исчез |

Использовано 3 воркера из 3 (лимит сессии). Код executor'ом не писался.

## Design decisions (зафиксировано для координатора)
- Все исключения наследуются от общего `ConfigError(Exception)`.
- `ConfigUnknownSection(section, key, line=None)`: `line=None` — у несуществующей
  секции нет строки в файле (задокументировано в docstring); тест проверяет
  section/key и `line is None`. Интерпретация «с секцией/ключом/строкой» брифа.
- `ConfigMissingKey(section, key, line)`: `line` = 1-based номер строки объявления
  секции, где ключ ожидался.
- `get` при неизвестной секции/ключе возвращает `default` без исключений.
- Дубли секций объединяются, дубли ключей — последний побеждает.
- bool без учёта регистра; инлайн-комментарии не поддерживаются (всё после
  первого `=` — значение).

## Review Outcome
- Вердикт: **APPROVE** (все пункты Task и Acceptance Criteria подтверждены).
- NIT №1 (ResourceWarning из-за двойного `_write_config`) — **устранён** воркером-фиксером.
- NIT №2 (импорт `from config_parser import ...` — стандартная практика для
  запуска теста как скрипка из своего каталога) — **отклонён**: явно предусмотрено
  спецификацией, работает при запуске `python3 cost/T3/orch-3/test_config_parser.py`.
- NIT №3 (метод `sections()` вне минимального API) — **отклонён**: минимальная
  introspection допустима, помечена как служебная, вреда нет; удаление —
  косметический риск без пользы.

## Validation Results
Команда (из корня wolf-experiment):
`python3 cost/T3/orch-3/test_config_parser.py`
→ `Ran 22 tests in 0.038s` / `OK` (предупреждений нет)

Строгий контрольный прогон:
`python3 -W error::ResourceWarning cost/T3/orch-3/test_config_parser.py`
→ `Ran 22 tests in 0.014s` / `OK`

## Acceptance Criteria — вердикт по пунктам
1. **Файлы строго по путям от корня wolf-experiment (не в workers/)** — ✅
   `cost/T3/orch-3/config_parser.py`, `cost/T3/orch-3/test_config_parser.py`
   (проверено glob/bash из корня).
2. **Только stdlib; фикстуры через tempfile** — ✅ импорты: re, pathlib,
   tempfile, unittest; все конфиг-фикстуры во временных каталогах.
3. **Тестов 12+ и все зелёные; покрытие** — ✅ 22 теста, OK. Покрытие:
   валидный файл ✅; наследование DEFAULT (+ перекрытие) ✅; комментарии/
   пустые строки ✅; типы int/float/bool/str и отрицательные ✅; три вида
   ошибок с проверкой line (SyntaxError — номер строки; MissingKey — строка
   объявления секции; UnknownSection — line is None + section/key) ✅;
   `get` с default (3 случая) ✅; `require` по отсутствующему ключу и
   неизвестной секции ✅; доп.: дубли секций/ключей.
4. **Обязательное ревью worker-reviewer; замечания устранены или обоснованно
   отклонены** — ✅ APPROVE; NIT №1 устранён, NIT №2–3 отклонены обоснованно
   (см. Review Outcome).
5. **Отчёт executor'а** — ✅ настоящий файл.

## Tasklog
- ⏱ [17:40:41] START задача COST-T3 «Парсер конфигурационных файлов (orch-3)»
- ⏱ [17:47:38] END задача COST-T3 «Парсер конфигурационных файлов (orch-3)» (≈7 мин от старта)
