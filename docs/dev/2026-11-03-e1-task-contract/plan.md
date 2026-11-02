---
slug: e1-task-contract
title: E1 срез-1 — TASK-контракт ACTIVE_CONSTRAINTS и DECISIONS[]
status: draft
created: 2026-11-03
baseline: 5ea1b62
design: design.md (status draft)
---

# E1 срез-1 — TASK-контракт ACTIVE_CONSTRAINTS и DECISIONS[] — план

## Задачи

- [x] E1-1-T1: Канон TASK-контракта — два блока ядра, инвариант условной
      применимости, словарь «десяти» — design §Контракты 1–3, базлайн
      templates/base/skills/using-skills/references/contracts.md:33-93. Исполнитель:
      worker-implementer. — сделано → коммит 37030e6; ревью E1-1-T4 APPROVED
- [x] E1-1-T2: Передача и поведение — wolf-handoff (snapshot), wolf-execute
      (продолжение), wolf-sdd (следующий вызов), executor-lead (TASK-программа,
      инвариант 8 replace) — design §Контракты 4–8, базлайн соответствующих SKILL.md /
      executor-lead.md. Исполнитель: worker-implementer (тот же мандат, что T1).
      — сделано → коммит 37030e6; ревью E1-1-T4 APPROVED
- [x] E1-1-T3: Документация контракта — docs/site/ru/guide/organization.md —
      design §Контракты 9. Исполнитель: worker-implementer (тот же мандат).
      — сделано → коммит 37030e6; ревью E1-1-T4 APPROVED
- [x] E1-1-T4: Независимое ревью соответствия и качества диффа среза — нормы:
      requirements.md (REQ-01…04, NFR-01…02), roadmap §8 срез-1; проверяет отсутствие
      не-целей (plan tree/budget/invalidation, src/, релизные артефакты). Исполнитель:
      worker-reviewer (fresh). — VERDICT: APPROVED, 0 critical/major/minor;
      evidence: git diff 5ea1b62..37030e6, grep «восьми» = 0 в активных текстах
- [x] E1-1-T5: Интеграция и полный гейт — npm run check, e2e по правилу проекта,
      фиксация plan, коммиты по завершённым частям. Исполнитель: L1.
      — npm run check exit 0 (english-surface OK, prettier OK, lint OK, build OK,
      225 файлов / 2058 тестов); npm run e2e exit 0 (61 файл / 234 теста,
      1043.83s); итоговый SHA ветки после финального коммита — в REPORT

T1–T3 выполняются одним мандатом L2 (ADR-4) с allowlist шести файлов; правки
применяются по точным формулировкам design — исполнитель не сочиняет тексты.

## Порядок интеграции

Один владелец общих файлов (L1, §13: порядок P → B0 → A1.2 → E1 соблюдён — ветка
основана на принятом main 5ea1b62). Коммиты: (1) пакет документации; (2) правки
контракта T1–T3; (3) пост-ревью корректировки/фиксация чекбоксов. Merge в main и
push — вне среза (санкция L0).
