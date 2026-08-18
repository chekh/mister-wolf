# Синтез совета COUNCIL-TEST-008 — раунд 1

**Вопрос:** Какую библиотеку использовать для CSV parsing в Node.js? (A) PapaParse / B) csv-parser; контекст: импорт пользовательских CSV до 100 МБ)

**Состав (council_id=custom-csv):** council-performance, council-cost. Quorum: 2, consensus_threshold: 1.0.

## Голоса

| Роль | VOTE |
|---|---|
| council-performance | B |
| council-cost | B |

Рекомендация: B (csv-parser) (2 из 2 валидных)

## Обоснование (кратко)

- **performance:** csv-parser — нативный Node.js Transform-stream, память O(1), backpressure; PapaParse ориентирован на браузер и материализацию в память.
- **cost:** csv-parser легче (~50 KB, 0 зависимостей, стабильный API); PapaParse (~450 KB) требует кастомного управления памятью на больших файлах.

## Quorum

Достигнут (2/2). Не ответивших нет.
