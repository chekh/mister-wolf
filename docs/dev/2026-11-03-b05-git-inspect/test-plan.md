---
slug: b05-git-inspect
title: B0.5 — read-only git inspect — тест-план
status: draft
created: 2026-11-03
---

# B0.5 — read-only git inspect — тест-план

Oracle — таблица решений design (независимо от реализации) и сам Git
(сценарии собираются реальными git-командами во временных репозиториях).

## Сценарии

### REQ-01 (факт со всеми полями; вне репозитория)
- Given временный clean-репозиторий с origin — When `wolf git-inspect --baseline <sha>`
  — Then JSON содержит все поля контракта с фактическими SHA; вне репозитория —
  verdict `UNKNOWN` + reason, JSON в stdout.
- Маппинг: unit (фейковый раннер) + e2e `tests/e2e/git-inspect.e2e.ts`.

### REQ-02 (вердикт/exit-коды)
- Given состояния таблицы решений — When прогон — Then verdict по таблице и
  exit-код 0/1/2; reasons упоминают каждую выполненную проверку.
- Маппинг: unit таблицы решений; e2e clean (PASS/0), dirty (VIOLATION/1),
  unreachable (UNKNOWN/2).

### REQ-03 (read-only, переносимость)
- Given репозиторий — When фиксация `for-each-ref` + HEAD до и после прогона —
  Then идентичны; `branch_owner` без `--owner` = null, с ним — переданное
  значение.
- Маппинг: e2e.

### REQ-04 (честность remote)
- Given: upstream есть, remote-URL недоступен (несуществующий хост, без реальной
  сети) — Then `UNKNOWN`, method `none`, reason «remote unreachable»; нет remote
  вообще — Then PASS + reason «not applicable»; позади (коммит в origin-клоне
  без pull) — Then VIOLATION, `remote-ahead-unfetched`, счёт `null` либо behind
  по обстоятельствам.
- Маппинг: e2e.

### REQ-05 (стабильность/машиночитаемость)
- Given неизменное состояние — When два прогона, нормализация `observed_at` и
  `freshness.observed_at` — Then глубокое равенство остального; `schema_version`
  присутствует.
- Маппинг: e2e (JSON.parse обоих выводов).

### REQ-06 (текст wolf-git)
- Given изменённый SKILL.md — When чтение §G0 и §«Что не поставлено» — Then
  ссылка на команду есть, «inspect не поставлен» убрано (B1-часть осталась).
- Маппинг: ревью T4 + просмотр L1.

### NFR-01/NFR-02 (секреты, таймаут)
- Given URL с `user:token@` — Then вывод без токена (unit); фейковый раннер с
  «зависанием» ls-remote — Then отсечён таймаутом, UNKNOWN (unit).
- Маппинг: unit `tests/unit/use-cases/git-inspect.test.ts`.

## Прогоны

- Точечные: `npx vitest run tests/unit/use-cases/git-inspect.test.ts`;
  `npm run build && npx vitest run --config tests/e2e/vitest.config.ts tests/e2e/git-inspect.e2e.ts`.
- Полный гейт (обязателен, правило проекта): `npm run check`; затем `npm run e2e`.
- Evidence для приёмки L0: фактические команды и резюме результатов — в отчёт
  L1, не в эту папку.
