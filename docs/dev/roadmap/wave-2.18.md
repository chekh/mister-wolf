---
slug: wave-2.18
title: 'Волна 2.18.0 — Phase A добор: Council opinions v2, Claim heartbeat, Base sets, Docs audit'
status: completed
created: 2026-10-14
---

# Волна 2.18.0 — Phase A добор: Council opinions v2, Claim heartbeat, Base sets, Docs audit

Источник: закрытие обязательств и доборов волны A («Продуктовый роадмап 2.15+» и фаза A-добор `docs/dev/2026-10-14-phase-a-dobor/`).
Слот 2.18.0 закреплён решением владельца. Релиз выпущен: 2026-10-14 (v2.18.0).
Кандидатная волна Async learning сдвинута на слот 2.19.0.

## Состав (фактически реализованные пакеты)

- **Council opinions & syntheses v2 (REQ-01, A9)**: схема `council-opinion` и `synthesis` расширена структурированными полями: проверяемые утверждения (`claims`), доказательства (`evidence`), предположения (`assumptions`), риски (`risks`), условия отказа (`failure_conditions`), контрпримеры (`counterexamples`) и уровень уверенности (`confidence`: low | medium | high). Обратная совместимость: старые записи читаются с пустыми `claims: []` и `confidence: 'medium'`. Аналитика (`build-analytics`) вычисляет `audited_count` и `unresolved_dissent_total`. Правило изоляции формирования мнений зафиксировано в `.wolf/SKILL.md` §7 и шаблоне `wolf-brainstorm`.
- **Claim heartbeats (REQ-03, A11)**: механизм поддержания single-writer claims живыми при длительных операциях сверх стандартного TTL. Файл `<slug>.heartbeat` рядом с файлом claim; окно обновления 10 минут, абсолютный TTL 24 часа; `isStale` проверяет PID, окно записи (10 мин) и TTL. Команда `wolf claim heartbeat <artifact>`, атомарная замена через уникальный временный файл и rename. Обратная совместимость с claim 2.17.1 (без heartbeat).
- **Base sets polish & publication hygiene (REQ-04, B0)**: синхронизация `templates/base/agents/*.md` и `.opencode/agent/*.md`; инвариант `face_owner_skill === agent_id` в `init-project` и `scaffold-agent`; защита локальных мутаций в `sync-base-set`; повторный `wolf init` на 2.17.x проектах не затирает локальные изменения стюарда.
- **Docs audit & historical surfaces cleanup (REQ-02, A10)**: e2e-тест `tests/e2e/docs-audit.test.ts` проверяет отсутствие упоминаний устаревших и удалённых команд в актуальных документах. Устаревшие спеки помечены `historical: true`. В документах скорректировано число типов ядра: «8 core memory types + extensions».

## Результаты и приёмка

- Артефакты волны: папка `docs/dev/2026-10-14-phase-a-dobor/` (requirements, design, plan, test-plan, review, acceptance, release-acceptance).
- Приёмка: 194 тестовых файла, 1505 тестов зелены, `npm run check` и `npm run docs:build` успешно пройдены.
- Тред: `mem_20261014_faza_a_dobor_b0_reliz_2_17_2_2_18_0_34c39f`.
- Релиз: тег `v2.18.0`, GitHub Release опубликован.
