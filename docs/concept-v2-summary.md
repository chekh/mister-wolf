# Concept v2 Summary

**Date:** 2026-05-05
**Status:** Final Candidate

---

## What is Mr. Wolf

Mr. Wolf — это **agentic control plane** с единым пользовательским фасадом. Пользователь обращается к одному агенту, а runtime динамически собирает нужные capabilities из конфигурации: агентов, навыков, инструментов, workflow и политик. Wolf сам решает, какой сценарий применить, какие инструменты задействовать и какие артефакты произвести.

Wolf — это не замена IDE или LLM. Это control plane, который оркестрирует существующие инструменты с соблюдением политик и артефактной прослеживаемостью.

Wolf покрывает задачи от открытой беседы (L0) до простого ответа (L1), контекстно-зависимого анализа (L2), планирования (L3), управляемых действий (L4) и многошаговых оркестраций с внешними системами (L5).

---

## Key Decisions

1. **Single facade, hidden internals.** Пользователь видит только Wolf. Внутренние агенты, routing и skills скрыты.
2. **Policy stronger than prompts.** Политика — это declarative rule. Prompt не может обойти hard-deny.
3. **Artifact-first execution.** Результат — не только текст, но и структурированные артефакты: specs, code, execution reports, receipts.
4. **Progressive configuration.** `zero_config` → `generated_config` → `explicit_config` → `domain_pack`. Modes не mutually exclusive.
5. **MVP Core = 8 компонентов.** WolfFacade, ContextResolver, AgentRunner, TraceSystem, Router, ModelRouter, PolicyCore, ArtifactStore.
6. **Conversation — валидный mode.** L0/conversation не создаёт Case/SolveResult по умолчанию. Promotion в case — по explicit signal.
7. **SolveResult — canonical envelope.** References на артефакты, не embedded copies. Trace reference обязателен.
8. **Hard-deny for `file_write_without_approval`/`external_send_without_approval`.** С approval gate = governed action; без gate = Refusal.
9. **External capabilities untrusted by default.** 6-step overlay: discovery → trust → policy → gate → fallback → audit.
10. **Execution classified:** `read_only` → notify; `mutating` → block; `external` → block; `deploy` → expert_gate.

---

## Documents

- **[`docs/concept-v2.md`](./concept-v2.md)** — Полная версия Concept v2. Архитектура, behavioral model, artifact model, policy model, capability model, scope boundaries, glossary.
- **[`docs/concept-v2-open-questions.md`](./concept-v2-open-questions.md)** — 5 открытых вопросов, отложенных на implementation planning.
- **[`scenario-lab/generated/concept-v2-artifact-conversation-patch-report.md`](../../scenario-lab/generated/concept-v2-artifact-conversation-patch-report.md)** — Отчёт о Artifact & Conversation Patch: что добавлено, почему, и как это изменило модель.

---

*Summary generated for Concept v2 Publication Pass.*
