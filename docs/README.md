# Mr. Wolf Documentation

Индекс живой документации. Устаревшее ранее переносилось в архив; с 2026-09-01 архивы удалены из дерева и доступны только в git-истории (коммиты до `b31cbdd`, восстановление: `git checkout b31cbdd^ -- <путь>`). Канонический концепт: **v3.3.1**.

## Canonical concept

- [Concept v3.3.1](./concept/concept.md) — постоянная проектная организация из временных агентов: L0/L1/L2/консилиум, типизированная память, контур обучения, накопленные способности, опоры ценности (RU).
- [Maturity](./concept/maturity.md) — зрелость компонентов по двум осям: Implementation (I0–I3) / Evidence (E0–E5).
- [Evidence](./concept/evidence.md) — доказательная база: PoC, исследования, программа benchmark'ов E1a–E1e, claim/evidence-реестр.
- [Coverage](./concept/coverage.md) — смысловое покрытие канона (контроль анти-регрессионного принципа).
- [Roadmap v3](./superpowers/plans/roadmap-v3.md) — канонический план работ: фазы A–E (продукт из доказанного → самообучение → экосистема).
- [Roadmap v2](./superpowers/plans/roadmap-v2.md) — детальный план контура Ф20–26 (= Фаза D v3); историческое значение для остальных фаз.

## Design specs

- [Self-Learning Design](./superpowers/specs/2026-08-26-self-learning-design.md) — контур самообучения Ф20–26 (сигнальный лог, паттерны, Стюард, STOP, GEPA, AFlow, decay).
- [Superpowers adoption](./superpowers/superpowers-adoption.md) — перенос механизмов superpowers в Wolf (D1–D5).

## Guides & process

- [User guide](./guide/user-guide.md) — базовые команды и workflow (RU; полный список — `wolf --help`).
- [CLI reference](./reference/cli.md) — полный справочник команд и флагов.
- [Architecture](./guide/architecture.md) — устройство системы: четыре слоя, поток данных, каталог исходников.
- [Протокол обработки жалоб](./guide/complaint-protocol.md) — `wolf complain` → Стюард → новая версия playbook → вердикт.
- [Протокол Стюарда: bootstrap](./guide/steward-bootstrap.md) — свёртка черновиков стартовой памяти после `wolf bootstrap`.
- [Протокол обучения Стюарда](./guide/steward-learn.md) — полный цикл самообучения Ф20–26 (кто/что/когда).
- [Сигнальный лог (Ф20/Ф21)](./guide/signal-log.md) — события сигнального лога, пороги, читатели.
- [Экономика инструментов](./guide/tool-economy.md) — переиспользование tool-объектов, счётчики, run-log.
- [Панель эффективности и A/B-бенчмарки](./guide/effectiveness.md) — `wolf effectiveness`: пороги OK/WARN/BAD, действия при BAD; методика `scripts/bench/`.
- [Master plan template](./templates/master-plan-template.md) — шаблон мастер-плана фичи (5 стадий).
- [UX scenarios](./ux-scenarios/README.md) — 12 сценариев использования как requirements-материал.

### Контур самообучения: как включить

1. `wolf init` в проекте — команды контура уже в CLI, отдельных установок нет.
2. Работайте как обычно: `wolf run/complain/call` пишут сигналы в `.wolf/metrics/session-metrics.jsonl` (Ф20).
3. `wolf learn digest` — накопленные паттерны (N≥3) и draft'ы; `wolf learn propose/validate/activate` — цикл правил (Ф21–22).
4. `npm run pressure-test` — STOP-гейт: доставка знаний + read-only зоны (Ф23); `wolf learn decay` — чистка по пробегу (Ф26).
5. Тонко: `wolf learn evolve` (шаблоны, Ф24) и `wolf learn route` (глубина ревью, Ф25) — рекомендации, применение через человека. Детали: [steward-learn.md](./guide/steward-learn.md).

### Базовый набор

`wolf init` в проекте разворачивает базовый набор агентов: **6 агентов** (`.opencode/agents/`), **13 скиллов** (`.opencode/skills/`), **3 команды** (`.opencode/command/`), **2 плагина** (`.opencode/plugins/`) + посев **6 стартовых playbook'ов** в память Wolf (протокол Наставника, жалобный протокол, методики воркеров, линзы wolf-review). Все файлы набора штампуются `wolf:rendered`; существующие файлы init не перезаписывает (wx-политика).

`wolf sync` — регенерация набора из шаблонов установленного пакета: обновляет только штампованные файлы; файлы без штампа не трогает (конфликт «unstamped на месте шаблонного» — в отчёт, решает владелец); orphaned-файлы (шаблон исчез из пакета) — только в отчёт, авто-удаления нет.

Мутации playbook'ов — зона Стюарда: `init`/`sync` память не трогают (посев идёт один раз; скип по `owner_skill`). Документированный сценарий Стюарда D4: после смены версии набора Стюард инициирует `wolf sync`. Детали: [спека базового набора](./superpowers/specs/2026-08-31-base-sets-design.md).

## Аудит и планирование

- [Аудит использования памяти (2026-08-29)](./planning/memory-audit-2026-08-29.md) — распределение объектов по типам/статусам, пустующие типы (A8a).
- [Ideas backlog](./planning/ideas-backlog.md) — реестр зафиксированных, но не реализованных идей.

## Phase specs & implementation plans

Спецификации реализованных фаз (история решений, ADR-ценность). Планы реализации удалены 2026-09-01 — git-история до `b31cbdd` (каталог plans той эпохи); живы спеки:

- MVP-A — [spec](./superpowers/specs/2026-06-29-project-semantic-memory-core-design.md)
- MVP-B (scan + brief) — [spec](./superpowers/specs/2026-06-29-mvp-b-project-scan-agent-brief-design.md)
- Phase 1 (threads / info requests / articles) — план в git-истории до `b31cbdd`
- Phase 2 (decisions / blockers) — [spec](./superpowers/specs/2026-06-30-phase-2-decisions-and-blockers-design.md)
- MCP integration — [spec](./superpowers/specs/2026-07-01-mcp-server-integration-design.md)
- Incremental indexing — [spec](./superpowers/specs/2026-07-02-incremental-indexing-blocker-resolution-design.md)
- Phase 6 (governance + flat namespace) — [spec](./superpowers/specs/2026-07-02-phase-6-governance-design.md)
- Session wrap-up habit — [spec](./superpowers/specs/2026-07-02-session-wrap-up-habit-design.md)
- Deterministic refinement pipeline — [spec](./superpowers/specs/2026-07-29-deterministic-refinement-pipeline-design.md) (реализован как `tools/pipeline/autorefine.sh`)
- Phase 8 (schema-driven taxonomy) — [spec/plan](./superpowers/specs/2026-08-23-phase-8-schema-taxonomy.md)
- Phase 9 (solve/call) — [spec](./superpowers/specs/2026-08-23-phase-9-solve-call.md)
- Phase 10 (insights) — [spec](./superpowers/specs/2026-08-26-phase-10-insights.md)
- Phase 11 (structured thinking) — [spec](./superpowers/specs/2026-08-26-phase-11-thinking.md)
- Master plans по фазам — [./master-plans/](./master-plans/)

## Research

- [Recallium ↔ Mr. Wolf synthesis](./research/2026-07-02-recallium-mr-wolf-synthesis.md) — что взять из Recallium
- [wolf solve concept](./research/2026-07-03-wolf-solve.md) — исходный концепт solve/call (реализован в Phase 9)
- [Agentic tools comparative research](./research/agentic-tools-comparative-research.md) + [project cards](./research/agentic-tools-project-cards.md) + [cross-findings](./research/agentic-tools-cross-findings.md)
- [Wolf concept implications](./research/wolf-concept-implications.md) / [FUP implications](./research/wolf-fup-implications.md)

## Historical / Archive

Архив устаревших документов — эволюция концепта v1–v3, roadmap v1, FUP-требования эпохи standalone-CLI, orchestrator-era guides, архитектурные дискуссии, MVP1A–MVP7 specs — удалён из дерева 2026-09-01: git-история до коммита `b31cbdd`.

---

_Documentation index. Canonical concept: [Concept v3.3.1](./concept/concept.md). План: [roadmap-v3](./superpowers/plans/roadmap-v3.md). Регистр идей: [ideas-backlog](./planning/ideas-backlog.md)._
