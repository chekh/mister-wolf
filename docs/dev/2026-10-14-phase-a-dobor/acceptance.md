---
slug: phase-a-dobor
title: '2.18.0 — T-INT acceptance-сводка (шаблон)'
status: pending
created: 2026-10-14
---

# 2.18.0 — T-INT acceptance-сводка (шаблон)

> **Шаблон.** Заполняется L1 после интеграции T-A9/T-A10/T-A11/T-B0 и полного прогона.

## REQ-01 (A9) — Council-контракт v2

- **Статус:** pending / done / partial
- **Evidence:**
  - commit SHA: ___
  - test IDs: S-01, S-02, S-03, S-04, S-05, S-06, S-07, S-08, S-09 (отметить passed/failed)
  - `git diff --stat`: ___
  - manual: grep `.wolf/SKILL.md` §X; grep `templates/base/skills/wolf-brainstorm/SKILL.md`
- **NFR-01 (legacy):** verified / not verified
- **NFR-02 (docs-audit):** N/A для REQ-01
- **Риски:** ___

## REQ-02 (A10) — Полный аудит публичных документов

- **Статус:** pending / done / partial
- **Evidence:**
  - commit SHA: ___
  - test IDs: S-10, S-11, S-12, S-13, S-14, S-15, S-60, S-61
  - `git diff --stat`: ___
  - manual: README*, concept.md, docs/README.md без удалённых команд; счётчик «8 core + расширения»
- **NFR-02 (docs-audit в CI):** verified
- **Риски:** ___

## REQ-03 (A11) — Heartbeat-файл

- **Статус:** pending / done / partial
- **Evidence:**
  - commit SHA: ___
  - test IDs: S-20, S-21, S-22, S-23, S-24, S-25, S-26, S-27, S-28, S-70, S-71
  - `git diff --stat`: ___
  - manual: synth-тест «heartbeat удерживает claim» + «stale heartbeat перехватывается»
- **NFR-03 (legacy 2.17.1):** verified
- **Риски:** ___

## REQ-04 (B0) — Доводка базовых наборов

- **Статус:** pending / done / partial
- **Evidence:**
  - commit SHA: ___
  - test IDs: S-30, S-31, S-32, S-33, S-34, S-35
  - `git diff --stat`: ___
  - manual: e2e playground-lab (если выполнено)
- **NFR-04 (2.17.x → 2.18.0):** verified
- **Риски:** ___

## REQ-05 (Release) — Релизный цикл

- **Статус:** pending
- **Evidence:**
  - S-40..S-45 — manual
  - `wolf-release-docs` чек-лист
  - `npm publish` — на аппрув L0

## T-INT gate

- [ ] `npm run check` (unit + integration + e2e + docs-audit) — зелёный
- [ ] `wolf doctor` — зелёный
- [ ] `npm run build` (или tsc) — без ошибок
- [ ] wolf-review (независимый) — `VERDICT: ACCEPTED` / `CHANGES_REQUIRED`
- [ ] Все AC по REQ-01..04 — пройдены
- [ ] Все NFR-01..05 — проверены

## Замечания ревьюера

- L2 reviewer 1: ___
- L2 reviewer 2: ___
- Конфликты: ___

## Вердикт L1

- **ACCEPTED** (готов к L0 для REQ-05)
- **PARTIAL** (часть REQ не прошла)
- **REJECTED** (блокер)
- **INCONCLUSIVE** (требует ещё раунда)
