# Mr. Wolf Documentation

Индекс живой документации. Устаревшее не удаляется, а переносится в `./archive/` (раздел Historical ниже).

## Canonical concept

- [Concept v2.0](./concept.md) — актуальная концепция: memory harness, таксономия объектов, write-протокол, границы scope (RU). Нумерация фаз в §6 концепта унаследована от раннего плана; канонический план фаз — [roadmap-v2](./superpowers/plans/roadmap-v2.md).

## Roadmap & design

- [Roadmap v2](./superpowers/plans/roadmap-v2.md) — фазы 6–26: статус, superpowers-интеграция, self-learning
- [Self-Learning Design](./superpowers/specs/2026-08-26-self-learning-design.md) — дизайн контура самообучения (Phases 20–26)
- [Superpowers adoption](./superpowers/superpowers-adoption.md) — перенос механизмов superpowers в Wolf (D1–D5)
- [Ideas backlog](./ideas-backlog.md) — реестр зафиксированных, но не реализованных идей с источниками

## Guides & process

- [User guide](./user-guide.md) — базовые команды и workflow (RU; покрывает ранние фазы, полный список — `wolf --help`)
- [Master plan template](./master-plan-template.md) — шаблон мастер-плана фичи (5 стадий)
- [Master plans](./master-plans/) — заполненные мастер-планы по фазам
- [UX scenarios](./ux-scenarios/README.md) — 12 сценариев использования как requirements-материал

## Phase specs & implementation plans

Спецификации и планы реализованных фаз (история решений, ADR-ценность):

- MVP-A — [spec](./superpowers/specs/2026-06-29-project-semantic-memory-core-design.md) / [plan](./superpowers/plans/2026-06-29-project-semantic-memory-mvp-a.md)
- MVP-B (scan + brief) — [spec](./superpowers/specs/2026-06-29-mvp-b-project-scan-agent-brief-design.md) / [plan](./superpowers/plans/2026-06-29-mvp-b-project-scan-agent-brief.md)
- Phase 1 (threads / info requests / articles) — [plan](./superpowers/plans/2026-06-30-phase-1-thread-info-article.md)
- Phase 2 (decisions / blockers) — [spec](./superpowers/specs/2026-06-30-phase-2-decisions-and-blockers-design.md) / [plan](./superpowers/plans/2026-06-30-phase-2-decisions-and-blockers-plan.md)
- MCP integration — [spec](./superpowers/specs/2026-07-01-mcp-server-integration-design.md) / [plan](./superpowers/plans/2026-07-01-mcp-server-integration-plan.md)
- Incremental indexing — [spec](./superpowers/specs/2026-07-02-incremental-indexing-blocker-resolution-design.md)
- Phase 6 (governance + flat namespace) — [spec](./superpowers/specs/2026-07-02-phase-6-governance-design.md) / [plan](./superpowers/plans/2026-07-02-phase-6-flat-namespace-plan.md)
- Session wrap-up habit — [spec](./superpowers/specs/2026-07-02-session-wrap-up-habit-design.md) / [plan](./superpowers/plans/2026-07-02-session-wrap-up-habit.md)
- Deterministic refinement pipeline — [spec](./superpowers/specs/2026-07-29-deterministic-refinement-pipeline-design.md) (реализован как `tools/pipeline/autorefine.sh`)
- Phase 8 (schema-driven taxonomy) — [spec/plan](./superpowers/specs/2026-08-23-phase-8-schema-taxonomy.md)
- Phase 9 (solve/call) — [spec](./superpowers/specs/2026-08-23-phase-9-solve-call.md) / [plan](./superpowers/plans/2026-08-23-phase-9-solve-call.md)
- Phase 10 (insights) — [spec](./superpowers/specs/2026-08-26-phase-10-insights.md) / [plan](./superpowers/plans/2026-08-26-phase-10-insights.md)
- Phase 11 (structured thinking) — [spec](./superpowers/specs/2026-08-26-phase-11-thinking.md) / [plan](./superpowers/plans/2026-08-26-phase-11-thinking.md)

## Research

- [Recallium ↔ Mr. Wolf synthesis](./research/2026-07-02-recallium-mr-wolf-synthesis.md) — что взять из Recallium
- [wolf solve concept](./research/2026-07-03-wolf-solve.md) — исходный концепт solve/call (реализован в Phase 9)
- [Agentic tools comparative research](./research/agentic-tools-comparative-research.md) + [project cards](./research/agentic-tools-project-cards.md) + [cross-findings](./research/agentic-tools-cross-findings.md)
- [Wolf concept implications](./research/wolf-concept-implications.md) / [FUP implications](./research/wolf-fup-implications.md)

## Historical / Archive

Архив устаревших документов (`./archive/`). Ключевое:

- [Concept v1–v3](./archive/concept-v3.md) — эволюция концепта до memory-harness-пивота (v3 ← v2 ← v1)
- [Project Memory Harness — Base Concept (June 30)](./archive/project-memory-harness-base-concept.md) — исходный базовый концепт, содержательно перекрыт Concept v2.0
- [Roadmap v1](./archive/roadmap-v1.md) — superseded by roadmap-v2
- [FUP-1 WAC requirements](./archive/fup-1-wac-requirements.md) — эпоха standalone-CLI-прототипа
- [External experts review (2026-07-03)](./archive/external-experts-review-aggregate-2026-07-03.md) — point-in-time фактчек
- [Orchestrator-era guides](./archive/getting-started.md) — getting-started, workflow-syntax, cli-reference, development
- [Discussions](./archive/discussions/index.md) — архитектурные дискуссии оркестраторской эры
- [MVP1A–MVP7 specs & plans](./superpowers/archive/) — superpowers-архив оркестраторской эры

---

_Documentation index. Canonical concept: [Concept v2.0](./concept.md). Регистр идей: [ideas-backlog](./ideas-backlog.md)._
