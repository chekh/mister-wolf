# Task Report: COST-T2 (orch-1)

## Metadata
- task_brief: COST-T2 / orch-1 (`coordinator/task-brief-cost-T2.md`)
- executor: executor-lead
- status: completed (за исключением AC-6 — заблокирован лимитом воркеров сессии, см. Blockers)

## Summary
Реализован in-memory rate limiter (скользящее окно, инъекция clock) и pytest-тесты
с FakeClock. Первая итерация дала 4 падающих теста на граничной семантике окна
(elapsed == window_seconds не освобождал слот); воркер-фиксер исправил условие
отбрасывания устаревших записей (`<` → `<=`). Итог: 9 passed / 0 failed.
Ревью worker-reviewer НЕ выполнено — сессионный лимит воркеров (3) исчерпан.

## Changes
- created: `cost/T2/orch-1/rate_limiter.py` — классы `RateLimiter` (sliding window,
  deque меток времени на клиента) и `RateLimitError`; только stdlib.
- created: `cost/T2/orch-1/test_rate_limiter.py` — 9 тестов, `FakeClock.advance(seconds)`,
  без реальных sleep.
- fixed (воркером): `rate_limiter.py` — граница окна: `timestamps[0] < cutoff` → `<= cutoff`
  (строки 5, 89, 96 — код и docstring).

## Workers Used
| # | Подзадача | Результат |
|---|---|---|
| 1 | worker-implementer: `rate_limiter.py` | OK, sliding window, создан |
| 2 | worker-implementer: `test_rate_limiter.py` | OK, 9 тестов, создан |
| 3 | worker-implementer (фиксер): граница окна `<` → `<=` | OK, 9 passed после фикса |

Примечание: лимит воркеров на сессию — 3 — исчерпан; спавн worker-reviewer и
резюм существующей сессии через task_id оба отклонены инфраструктурой
(«session already spawned 3 workers (limit 3)»).

## Validation Results

Запуск (из корня wolf-experiment; pytest из conda-env `trading`, т.к. в системных
python pytest отсутствует, pip install невозможен — сеть/прокси заблокированы):

```
$ /Users/chekh/miniforge3/envs/trading/bin/python -m pytest cost/T2/orch-1/test_rate_limiter.py -v
platform darwin -- Python 3.11.15, pytest-8.2.1
cost/T2/orch-1/test_rate_limiter.py::TestRateLimitExceeded::test_raises_after_max_requests PASSED
cost/T2/orch-1/test_rate_limiter.py::TestWindowRecovery::test_acquire_passes_after_window_expires PASSED
cost/T2/orch-1/test_rate_limiter.py::TestWindowRecovery::test_window_does_not_reset_early PASSED
cost/T2/orch-1/test_rate_limiter.py::TestClientIsolation::test_separate_clients_have_separate_counters PASSED
cost/T2/orch-1/test_rate_limiter.py::TestClientIsolation::test_recovery_is_per_client PASSED
cost/T2/orch-1/test_rate_limiter.py::TestEdgeCases::test_exactly_max_requests_pass_without_error PASSED
cost/T2/orch-1/test_rate_limiter.py::TestEdgeCases::test_max_requests_of_one PASSED
cost/T2/orch-1/test_rate_limiter.py::TestEdgeCases::test_request_exactly_on_window_boundary PASSED
cost/T2/orch-1/test_rate_limiter.py::TestEdgeCases::test_multiple_clients_simultaneously PASSED
============================== 9 passed in 0.25s ===============================
```

Компенсирующие проверки executor'а (машино-проверяемая часть ревью-чеклиста,
НЕ замена worker-reviewer):
- `time.sleep` / `asyncio.sleep` в тестах: не найдены (grep).
- Импорты `rate_limiter.py`: только stdlib (`time`, `collections`, `typing`).
- Импорты тестов: stdlib + `pytest` (единственная допустимая внешняя зависимость).
  Замечание (не блокер): `import time` в тест-файле не используется.
- Сигнатуры: `RateLimiter(max_requests: int, window_seconds: float, clock: Callable[[], float] = time.monotonic)` (строки 58–63), `acquire(client_id: str) -> None` — соответствуют брифу.

## Acceptance Criteria
| # | Критерий | Вердикт | Комментарий |
|---|---|---|---|
| 1 | Оба файла созданы ровно по указанным путям | OK | `cost/T2/orch-1/rate_limiter.py`, `cost/T2/orch-1/test_rate_limiter.py` (проверено ls) |
| 2 | Сигнатура, инъекция clock, RateLimitError | OK | clock — параметр конструктора, default `time.monotonic`; `RateLimitError` определён (строка 19) |
| 3 | Только stdlib | OK | реализация — чистый stdlib; тесты — stdlib + pytest |
| 4 | FakeClock без sleep, 4 пункта покрытия | OK | 4/4: превышение (`test_raises_after_max_requests`), восстановление (`test_acquire_passes_after_window_expires`), изоляция клиентов (3 теста), граничные случаи — 4 шт. (ровно max_requests; лимит=1; ровно граница окна; «не сбрасывается раньше окна») |
| 5 | Тесты проходят (pytest) | OK | 9 passed / 0 failed |
| 6 | Ревью worker-reviewer: APPROVE | BLOCKED | лимит 3 воркеров/сессию исчерпан (2 имплементера + фиксер); спавн и резюм reviewer'а отклонены инфраструктурой |

## Blockers
- **AC-6**: ревью worker-reviewer не выполнено — сессионный лимит воркеров (3)
  исчерпан, инфраструктура отклоняет и новый спавн, и переиспользование сессии
  через task_id. Для закрытия AC-6 нужно перезапустить ревью отдельной сессией:
  один worker-reviewer на два файла `cost/T2/orch-1/{rate_limiter,test_rate_limiter}.py`
  с чеклистом брифа.

⏱ [16:21:40] START задача cost-T2 «RateLimiter: реализация + тесты + ревью»
⏱ [16:35:17] END задача cost-T2 «RateLimiter: реализация + тесты + ревью» (≈14 мин от старта)
