# Concept v2 Change List

**Date:** 2026-05-05
**Source:** Concept Extraction Pass + Anchor Domain Deep Dive

## Must Add (P0)

1. **SolveResult envelope** — unified output wrapper for all execution modes.
2. **Router abstraction** — single interface, lightweight (L1–L2) and full (L3–L5) implementations.
3. **Artifact chain schema** — explicit links: spec→tasks→tests→impl→release, ADR→ADL→decisions.
4. **Policy hierarchy** — global → domain → scenario → user override.
5. **Gate severity model** — silent / notify / block / expert_gate.
6. **PII subsystem** — detector + redactor + verifier (not just gate).
7. **MCP lifecycle manager** — connect/discover/health/invoke/disconnect.
8. **Circuit breaker** — max steps, max tokens, max external calls per scenario.
9. **Progressive configuration path** — zero_config → generated_config → explicit_config → domain_pack.
10. **Gate explanation** — every approval request includes user-visible rationale.

## Should Add (P1)

11. **Component taxonomy** — Core / Conditional / External.
12. **Capability taxonomy** — native → wrapped → MCP → imported_skill → direct_api.
13. **Artifact lifecycle state machine** — created → validated → persisted.
14. **Observability subsystem** — MetricsCollector, ExecutionSpan for L3+.
15. **Audit trail for emergency overrides** — immutable log with reason, timestamp, approver.

## Can Defer (P2)

16. **Domain-specific helper components** — ToneAdapter, ActionItemExtractor, etc.
17. **DomainPackCoordinator** — when cross-domain scenarios exceed 15%.
18. **Custom plugin framework** — when scenarios actually require custom code.
19. **A2A protocol support** — when agent-to-agent scenarios appear.
20. **Multi-language document processing** — when non-English scenarios are added.

## Rejected / Keep Out

21. **LightweightSolvePlanner** — L2 uses routing, not planning.
22. **FullWorkflowEngine for L2–L3** — overkill; use conditional workflow engine for L4+.
23. **AnswerCache** — L1 should be fast via model selection, not caching.
24. **Auto-merge gate** — no scenarios request it; keep hard-deny.
25. **Automated bias correction** — flag only; human review required for correction.
