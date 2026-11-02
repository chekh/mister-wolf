---
slug: e1-task-contract
title: E1 срез-1 — TASK-контракт ACTIVE_CONSTRAINTS и DECISIONS[]
status: draft
created: 2026-11-03
---

# E1 срез-1 — TASK-контракт ACTIVE_CONSTRAINTS и DECISIONS[] — тест-план

## Сценарии

### REQ-01

- Given канон templates/base/skills/using-skills/references/contracts.md
- When чтение списка ядра и словаря
- Then определены `ACTIVE_CONSTRAINTS` и `DECISIONS[]` с формой «D-id, что решили
  одной строкой, почему, основание/источник», инвариант условной применимости,
  словарь согласован («десяти»)
- Маппинг: текстовая сверка (grep) в ревью E1-1-T4; интеграционный прогон ниже

### REQ-02

- Given состав snapshot wolf-handoff и порядок replace executor-lead
- When продолжение/замена исполнителя
- Then оба блока перечислены явно в snapshot и передаются через handoff
- Маппинг: текстовая сверка в ревью E1-1-T4

### REQ-03

- Given wolf-execute (продолжение непринятого результата) и wolf-sdd (следующий
  вызов L2)
- When L2 продолжает задачу / L1 направляет следующий вызов
- Then предписаны соблюдение ACTIVE_CONSTRAINTS, запрет переоткрытия DECISIONS[]
  без нового основания, передача блоков в следующем вызове
- Маппинг: текстовая сверка в ревью E1-1-T4

### REQ-04

- Given docs/site/ru/guide/organization.md
- When чтение абзаца о составе брифа
- Then состав ядра описан актуально (десять элементов, оба блока), устаревшего
  «восьми» нет
- Маппинг: grep в ревью E1-1-T4

### NFR-01

- Given ветка среза e1-task-contract (baseline 5ea1b62)
- When git diff --stat main…e1-task-contract
- Then изменены только: `docs/dev/2026-11-03-e1-task-contract/**`, шесть файлов
  правок из design, без src/, update-map.json, CHANGELOG.md, .opencode/
- Маппинг: git diff --stat (L1)

### NFR-02

- Given формулировки канона
- When чтение определений блоков
- Then зафиксированы одна строка на решение и запрет пересказа всех правил проекта
- Маппинг: текстовая сверка в ревью E1-1-T4

## Прогоны

- Полный гейт: `npm run check` в корне worktree — exit 0 (включает prettier по
  `docs/**/*.md`, lint, build, unit/integration тесты).
- E2E по правилу проекта: `npm run e2e` (сборка + distribution/init поверх
  изменённого payload).
- Точечные: `git diff --stat`; grep-сверка терминов
  (`ACTIVE_CONSTRAINTS`, `DECISIONS`, «десяти элементов», отсутствие «восьми» в
  активных текстах).
