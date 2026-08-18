# Task Brief COST-T2 (итерация orch-3) — In-memory rate limiter

## Metadata

- ID: COST-T2
- Итерация: orch-3 (оркестрованный прогон)
- Корень проекта: `/Users/chekh/Development/RestAdviser/ZetaFlow/wolf-experiment`
- Отчёт Executor'а: `executor/report-cost-T2-orch-3.md`
- Ответственность: Wolf → Executor (executor-lead) → Workers (код + обязательное ревью worker-reviewer)

## Task

Реализовать in-memory rate limiter на Python (только stdlib):

- Класс `RateLimiter`:
  - конструктор: `RateLimiter(max_requests: int, window_seconds: float, clock: Callable[[], float] = time.monotonic)`
    — инъекция clock обязательна;
  - метод `acquire(client_id: str) -> None`;
  - при превышении лимита в текущем окне — выброс `RateLimitError` (кастомное исключение, объявить в модуле).
- Тесты без реальных `sleep`: использовать `FakeClock` с методом `advance(seconds)`.

### Обязательные тесты

1. Превышение лимита → `RateLimitError`.
2. Восстановление после окна (advance за границу окна → снова можно).
3. Независимость клиентов (разные `client_id` не влияют друг на друга).
4. Минимум 2 граничных кейса (например: точно на границе лимита — последний допустимый запрос проходит; ровно на границе окна / нулевой window и т.п. — выбор воркеров, обосновать в коде комментарием).

### Файлы (СТРОГО, пути от корня проекта wolf-experiment, НЕ от workers/)

- `cost/T2/orch-3/rate_limiter.py`
- `cost/T2/orch-3/test_rate_limiter.py`

## Acceptance Criteria

1. Оба файла существуют строго по указанным путям (`cost/T2/orch-3/...`).
2. `RateLimiter` соответствует сигнатуре; clock инъецируется; `RateLimitError` присутствует.
3. Тесты не используют реальный `time.sleep` (только FakeClock.advance).
4. Покрыты все 4 категории тестов (превышение, восстановление, независимость клиентов, ≥2 граничных).
5. Все тесты проходят (`python -m pytest cost/T2/orch-3/` или unittest — по выбору, указать в отчёте).
6. Только stdlib — никаких внешних зависимостей.
7. Проведено обязательное ревью worker-reviewer; вердикт ревью зафиксирован в отчёте.

## Constraints

- Только Python stdlib.
- Не выходить за пределы каталога `wolf-experiment/`.
- Executor не пишет код сам — только через воркеров.
- Ревью worker-reviewer обязательно. Если лимит воркеров не оставил слота на ревью — координатор диспетчернет отдельную доводочную сессию executor-lead только для ревью (executor об этом указывает в отчёте).
- Тайминг-лог: отметки `⏱ START/END задача COST-T2 «rate limiter orch-3»` через инструмент tasklog (если доступен у executor'а), продублировать в отчёте.
