# Синтез совета COUNCIL-TEST-001 (council_id=architecture)

**Вопрос:** Какую библиотеку использовать для HTTP-запросов в Python-сервисе экспорта CSV? (A) requests, B) httpx, C) urllib.

**Состав совета:** council-architect, council-security, council-performance, council-ux (quorum=3, consensus_threshold=0.75).

## Голоса

| Роль | VOTE |
|---|---|
| architect | B |
| security | B |
| performance | B |
| ux | A |

Валидных голосов: 4 из 4. Победитель: B (httpx) — 3 из 4 = 0.75.

Рекомендация: B (httpx) (3 из 4 валидных)

## Разногласия

- **ux — за A (requests):** самый понятный API и минимальная когнитивная нагрузка разработчика; для простого сервиса без async requests оптимален по DX.
- **architect, security, performance — за B (httpx):** единый sync/async API и путь роста без смены библиотеки (architect); безопасные дефолты — TLS-проверка и таймаут из коробки (security); connection pooling, гранулярные таймауты и масштабируемость под нагрузкой (performance). Все трое сходятся, что urllib (C) — ложная экономия: ручная обвязка HTTP дорожает в сопровождении и провоцирует ошибки.

## Quorum

Достигнут (4/3 валидных при требуемых 3). Таймаутов нет — все члены совета ответили.

## Общие оговорки (из мнений)

- Зафиксировать версию httpx в lock-файле (транзитивные зависимости httpcore/anyio).
- Запрет `verify=False` / `trust_env` в код-ревью; при URL из внешних данных — ограничение схем и адресов (анти-SSRF) независимо от библиотеки.
