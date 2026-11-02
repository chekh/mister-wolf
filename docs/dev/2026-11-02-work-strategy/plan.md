---
slug: work-strategy
title: Организация работы и ранние вопросы
status: review
created: 2026-11-02
---

# Организация работы — план

## Задачи

- [x] WS-01: Сопоставить действующие нормы и источники — design §ADR-1/ADR-2; baseline `141ec577:templates/base/skills/using-skills/SKILL.md:19` и `templates/base/playbooks/worker-researcher-playbook.md:20`. Изменения подготовлены; scope — REQ-01…REQ-06.
- [x] WS-02: Подготовить общий скилл и согласовать рамки/методики/команды/seeds — design §Компоненты и ответственность. Результат — diff, принимается как единый набор, без самостоятельного live rollout.
- [x] WS-03: Проверить renderer, сохранение protected и действующие guards — design §Контракты; `tests/unit/adapters/render/work-strategy-delivery.test.ts`. Evidence — test-plan §Прогоны.
- [x] WS-04: Выполнить ограниченный парный пилот — test-plan §Сценарии/Прогоны. Результат не доказывает экономию или превосходство над baseline.
- [x] WS-05: Независимое ревью согласованности — полный diff, роль/доставка/ранние вопросы/качество проверок; подтверждённые findings исправлены, итог APPROVED; затронутые проверки пройдены.
- [x] WS-06: Выполнить применимый project gate, проверить patch apply на точную базу и подготовить handoff — design §ADR-3; check/e2e/docs и проверка применения отражены в test-plan.
- [ ] WS-07: Принимающий агент интегрирует с текущим main, назначает версию и выпускает — release-agent.md. Автор патча не объявляет релиз опубликованным.

Дополнительный документ `release-agent.md` обоснован: его читатель — агент
минирелиза; назначение — база, применение, миграция active playbook, проверки и
откат. Владелец документа — автор патча, затем принимающий агент. Частные outputs,
логи, scripts и checkpoint в эту папку не входят; fixtures — штатные tests.
