---
slug: hotfix-2-16-3-agent-modes
title: hotfix-2-16-3-agent-modes
status: done
created: 2026-10-13
---

# hotfix-2-16-3-agent-modes — требования и журнал изменений (fix-профиль)

## 1. Контекст и проблема

После переезда на OpenCode v2 (wolf 2.16.2) вся Task-цепь Wolf (mr-wolf →
executor-lead → worker-\*) мертва: спавн агента субагент-тулом падает с
«Agent X cannot run as a subagent». Root cause (аудит 2026-10-12/13, тред
mem_20261012_defekt_executor_lead_ne_spavnitsya_subag_d6b464, урок
mem_20261012_root_cause_agenty_wolf_ne_spavnyatsya_su_083903):

- шаблоны `templates/base/agents/{executor-lead,worker-implementer,worker-researcher,worker-reviewer}.md`
  никогда не задавали `mode` (с первого коммита 21673d2);
- OpenCode v1 компенсировал дефолтом `mode:"all"` и отсутствием гейта в task-туле;
- v2 сменила дефолт на `primary` (schema/src/agent.ts) и добавила гейт
  субагент-тула (core/src/tool/plugin/subagent.ts:136).

Сопутствующий дефект гигиены: `.opencode/agents/steward.md` не пересинкан
с релиза 2.16.1 (stale штамп `set=2.16.1`) — локальная правка рендера
(закомментирована строка model) навсегда включила T010 mutated-skip.

## 2. Функциональные требования

- REQ-01: шаблоны executor-lead и worker-\* объявляют `mode: all`
  (режим `all`, не `subagent` — сохранить прямой CLI-запуск `opencode run`).
- REQ-02: guard-тест в CI (`npm run check`): каждый
  `templates/base/agents/*.md` содержит `mode` с валидным значением
  (`primary | all | subagent`); участники Task-цепи — не `primary`.
- REQ-03: steward пересинкан в этом репо (штамп текущего сета), локальная
  дельта рендера погашена осознанно и зафиксирована (см. журнал).
- REQ-04: model стюарда в шаблоне параметризована `{{model.primary}}`
  вместо литерала `zai-coding-plan/glm-5.3`.

## 3. Журнал изменений (CR) — содержание фикса

- CR-2026-10-13-01: `mode: all` в 4 шаблонах (executor-lead,
  worker-implementer, worker-researcher, worker-reviewer) — решение владельца
  (mem_20261012_vladelets_khotfiks_2_16_3_dlya_defekta_m_843397); downstream:
  wolf sync в 8 затронутых проектах после релиза.
- CR-2026-10-13-02: guard-тест `tests/unit/agents-mode-guard.test.ts` (TDD
  red→green) — утвердил владелец в том же решении; downstream: нет.
- CR-2026-10-13-03: steward — `model: {{model.primary}}` в шаблоне (в omit-рендере
  строка опускается → дефолтная модель проекта, что и делала локальная правка);
  закомментированный рендер `.opencode/agents/steward.md` удалён и пересоздан
  синком (ветка `created`, opencode-renderer.ts:132-134) — дельта не «затёрта
  молча»: первопричина (литерал модели в шаблоне) устранена, поведение сохранено;
  downstream: CHANGELOG-строка.
- CR-2026-10-13-04: корректировка отчёта приёмкой сессии-продолжения — фактическое
  evidence полного check (прогоны fc2/fc3 принадлежали дублированной сессии, exit 1;
  чистый перегон — final-check5.log) и первопричина инцидента steward.md (rm
  дублированной сессии, не платформа); downstream: урок в памяти Wolf о
  дублированной диспетчеризации executor-lead на один task.
