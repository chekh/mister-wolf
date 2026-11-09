---
name: wolf-agent-language
description: "Внутренние TASK/RESULT/QUESTION/BLOCKED/UPDATE/FINDING и передача между агентами."
---


# Внутренний язык агентов

Словарь стабилен; расширяется только решением владельца методики. Человеку отвечай обычным языком. Слоты компактны;
объяснение внутри них — точный обычный текст. Используй task ID и revision вместо «как выше».
Полные контракты и профили поручений — using-skills/references/contracts.md.

## TASK

`TASK <id>@<version> kind=<implement|research|design|review|test|expert|writing|release>`
- GOAL: результат и вклад в цель пользователя.
- INPUT: адресные документы/память с версиями, baseline, применимые нормы.
- SCOPE: область записи, запрещённое, соседние владельцы и общий контракт.
- CHECK: критерии готовности и проверки.
- EXECUTION: доступный agent/model/variant, конечный бюджет, stop/return, рабочий каталог.
- STATE: где mini-plan/result, если нужны; полномочия Git; только существенное.
Не выдумывай технические настройки и ID. При повторе добавь `REUSE: конкретное основание`
и номер корректирующего возврата. Поля не обязаны быть длинными; нет специальных данных — «нет».
Форма RESULT определяется профилем поручения по contracts.md (implement/review/research/expert).

## RESULT и состояние

`RESULT <id> DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED`
`OUT: результат; REV: SHA либо digest/dirty-state; CHECK: evidence; OPEN: остаток/вопрос`
При подробном отчёте — ссылка на рабочую память, не копия отчёта в сообщении.
DONE означает готовность к проверке, ACCEPTED выносит назначенный принимающий.

`QUESTION <id>: NEED / WHY / BLOCKS` — спросить до дорогой реконструкции намерения.
`BLOCKED <id>: CAUSE / OUT / UNBLOCK` — сохранить достигнутое.
`UPDATE <id>@vN: CHANGE / AFFECTS / EFFECTIVE_REV` — изменение для зависимых задач;
не означает разрешение менять принятые требования.

## Доказательства и замечания

`EVIDENCE E-id: CLAIM / REV / METHOD(команда, cwd или источник) / OUTCOME / LIMITS`
`FINDING F-id: KIND(defect|risk|question|suggestion) / CRITERION / CONDITIONS /
EVIDENCE / IMPACT / BLOCKING(основание)`.
Ревью: VERDICT APPROVED|CHANGES_REQUIRED|INCONCLUSIVE; COVERAGE и LIMITS.
Приёмка: ACCEPTANCE ACCEPTED|PARTIAL|REJECTED|INCONCLUSIVE по AC/evidence.
Эксперт: POSITION / CLAIMS+EVIDENCE / ASSUMPTIONS / ALTERNATIVES / LIMITS / RECONSIDER_IF.
Синтез: AGREEMENT / DISAGREEMENT / RECOMMENDATION / LIMITS / DECISION_OWNER.
Для ситуации вне формата — «вне контракта» и короткое объяснение; формализм не блокирует смысл.
