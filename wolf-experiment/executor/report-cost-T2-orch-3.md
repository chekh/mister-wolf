# Task Report: COST-T2 (орch-3)

## Metadata

- task_brief: COST-T2 (итерация orch-3) — In-memory rate limiter
- executor: executor-lead
- status: completed (ревью worker-reviewer проведено в доводочной сессии — вердикт APPROVE, см. секцию «Ревью (доводочная сессия)» и AC 7)
- тайминг: ⏱ [17:01:53] START задача COST-T2 «rate limiter orch-3» / ⏱ [17:14:01] END задача COST-T2 «rate limiter orch-3» (≈12 мин от старта)

## Summary

Реализованы `RateLimiter` (sliding window, инъекция clock) и `RateLimitError` в
`cost/T2/orch-3/rate_limiter.py`; тесты на unittest с `FakeClock.advance` (без
реального sleep) в `cost/T2/orch-3/test_rate_limiter.py`. Один тест был с дефектом
самого теста (не исчерпан лимит до проверки блокировки) — исправлен
воркером-фиксером. Все 14 тестов проходят. Слоты воркеров (3/3) исчерпаны на
реализацию/тесты/фикс — слота на обязательное ревью не осталось.

## Changes

- created: `cost/T2/orch-3/rate_limiter.py` — `RateLimitError`, `RateLimiter`
  (конструктор `RateLimiter(max_requests: int, window_seconds: float, clock: Callable[[], float] = time.monotonic)`,
  метод `acquire(client_id: str) -> None`; sliding window: метка активна при
  `now - t < window_seconds`; валидация аргументов через `ValueError`)
- created: `cost/T2/orch-3/test_rate_limiter.py` — unittest, `FakeClock` с
  `advance(seconds)`, 14 тестов в 4 категориях (превышение ×4, восстановление
  после окна ×3, независимость клиентов ×3, граничные ×4)
- fixed: `test_rate_limiter.py::TestClientIndependence::test_client_not_affected_by_another_overflow`
  — добавлены два успешных `acquire("spammer")` до цикла `assertRaises`
  (дефект теста: при `max_requests=2` первые запросы легально проходили)

## Workers Used

| # | Подзадача | Результат |
|---|---|---|
| 1 | worker-implementer: реализация `rate_limiter.py` | OK — модуль создан по контракту брифа |
| 2 | worker-implementer: тесты `test_rate_limiter.py` | OK с дефектом: 1 из 14 тестов падал (ошибка в самом тесте) |
| 3 | worker-implementer (фиксер): исправление упавшего теста | OK — тест исправлен, 14/14 зелёные |

Лимит воркеров сессии: 3/3 — исчерпан.

## Validation Results

Команда прогона (из корня wolf-experiment; pytest в окружении отсутствует —
использован unittest, что разрешено брифом):

```
python3 -m unittest discover -s cost/T2/orch-3 -p "test_*.py" -v
```

Результат: `Ran 14 tests ... OK` (0 failures, 0 errors).

Проверка запрета реального sleep (AC3): grep по `sleep` в `cost/T2/orch-3/` —
единственное вхождение в docstring («никаких real sleep»); вызовов
`time.sleep` нет.

## Acceptance Criteria — вердикты по пунктам

1. **Оба файла существуют строго по указанным путям** — ✅ выполнено:
   `cost/T2/orch-3/rate_limiter.py`, `cost/T2/orch-3/test_rate_limiter.py`.
2. **Сигнатура `RateLimiter`; clock инъецируется; `RateLimitError` есть** — ✅
   выполнено: конструктор
   `(max_requests: int, window_seconds: float, clock: Callable[[], float] = time.monotonic)`,
   `acquire(client_id: str) -> None`, `RateLimitError(Exception)` в модуле.
3. **Тесты без реального `time.sleep`, только `FakeClock.advance`** — ✅
   выполнено (см. Validation Results).
4. **Покрыты все 4 категории** — ✅ выполнено: превышение (4 теста),
   восстановление после окна (3), независимость клиентов (3), граничные (4 ≥ 2,
   с комментариями-обоснованиями: «ровно на границе окна — метка выпадает,
   т.к. активна только при `now - t < window`»; «последний допустимый запрос на
   границе лимита»; доп.: `window − ε` держит метку активной; минимальные
   валидные параметры).
5. **Все тесты проходят** — ✅ выполнено: unittest, 14/14 OK.
6. **Только stdlib** — ✅ выполнено: `time`, `collections`, `typing`,
   `unittest`; внешних зависимостей нет.
7. **Обязательное ревью worker-reviewer; вердикт зафиксирован** — ✅
   выполнено (доведено доводочной сессией executor-lead 2026-08-17):
   ревью проведено worker-reviewer по критериям брифа, вердикт
   **APPROVE** (см. секцию «Ревью (доводочная сессия)»). В основной
   сессии пункт был ❌ из-за исчерпания лимита воркеров (3/3).

## Ревью (доводочная сессия)

- Сессия: доводочная, только ревью (AC 7); дата 2026-08-17; executor-lead.
- Ревьюер: worker-reviewer (слот 1/3 доводочной сессии).
- Объект: `cost/T2/orch-3/rate_limiter.py`, `cost/T2/orch-3/test_rate_limiter.py`
  по критериям брифа `coordinator/task-brief-cost-T2.md`.

Найденные замечания:

- Единственное замечание (серьёзность **nit**, не дефект): неиспользуемый
  импорт `from typing import List` в `test_rate_limiter.py` (строка 8).
- Дефектов (blocker/minor) не найдено. Ревьюер подтвердил по всем критериям
  1–5: сигнатура конструктора и `acquire` точно совпадают с брифом; clock
  инъецируется; `RateLimitError` объявлен в модуле; `FakeClock.advance` без
  реального sleep; все 4 категории тестов покрыты (4+3+3+4, граничные — с
  комментариями-обоснованиями); только stdlib; sliding window корректен
  (`_prune` удаляет метки при `now - t >= window_seconds`; отклонённый
  `acquire` не добавляет метку — raise до `append`; раздельные счётчики
  по `client_id`).

Выполненные фиксы:

- Точечный фикс воркером (слот 2/3): удалён неиспользуемый импорт
  `from typing import List` из `test_rate_limiter.py`. Других правок нет.

Повторный прогон тестов после фикса:

```
python3 -m unittest discover -s cost/T2/orch-3 -p "test_*.py" -v
```

Результат: `Ran 14 tests ... OK` (0 failures, 0 errors).
Проверка запрета sleep: grep по `sleep` в `cost/T2/orch-3/` — единственное
вхождение в docstring; вызовов `time.sleep` нет.

Итоговый вердикт ревью: **APPROVE** (после устранения nit и перепрогона —
замечаний не осталось).

Обновлённый вердикт по AC 7: ✅ выполнено.

Тайминг доводочной сессии: ⏱ [17:15:06] START задача COST-T2-review
«Ревью COST-T2 orch-3 (доводочная сессия)» / ⏱ [17:17:54] END задача
COST-T2-review «Ревью COST-T2 orch-3 (доводочная сессия)» (≈3 мин от старта).

## Notes для доводочной сессии (если будет диспетчернута)

> Выполнено: доводочная сессия ревью проведена 2026-08-17 — см. секцию
> «Ревью (доводочная сессия)». Оба note учтены (ревью по AC 1–6, семантика
> «строго меньше» подтверждена ревьюером и граничными тестами).

- Ревьюировать оба файла по брифу `coordinator/task-brief-cost-T2.md` (Task + Acceptance Criteria 1–6).
- Обратить внимание ревьюера на семантику «строго меньше» (`now - t < window_seconds`) — она зафиксирована в брифе и реализации и должна совпадать в тестах.
