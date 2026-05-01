# Decision Log — Scenario Lab Expert Review

**Date:** 2026-05-02
**Source:** Expert review of 20 Scenario Cards, 20 Playthroughs, 20 Extraction Reports
**Status:** Draft, pending concept owner approval

---

## Accepted

| # | Decision | Rationale | Owner | Priority |
|---|----------|-----------|-------|----------|
| A1 | **SolveResult envelope** — unified output wrapper для всех execution modes | 3 extraction reports identify as missing; core abstraction для consistency | Architect | P0 |
| A2 | **Router abstraction** — единый interface с lightweight/full implementations | Duality Router/RouterLight creates responsibility confusion | Architect | P0 |
| A3 | **Default config path:** zero_config → generated_config → explicit_config | Progressive disclosure; DX requirement; 9 scenarios use generated_config | DX | P0 |
| A4 | **Gate severity levels:** silent / notify / block | Security wants gates, UX wants friction reduction; compromise satisfies both | Security + UX | P0 |
| A5 | **PII subsystem:** detector + redactor + verifier (not just gate) | PII gate alone insufficient; compliance domains (legal, HR, finance) require verification | Security | P0 |
| A6 | **Policy hierarchy:** global → domain → scenario → user override | 33 inconsistent policies need structure; prevents policy conflicts | Security | P0 |
| A7 | **MCP lifecycle manager** — connect/discover/health/invoke/disconnect | 3 scenarios use MCP, 2 show unavailability; no lifecycle currently | Integration | P0 |
| A8 | **Circuit breaker:** max steps, max tokens, max external calls | L5 incident response shows runaway risk; SRE requirement | SRE | P0 |
| A9 | **L1 scenarios для всех доменов** | Only 2 domains have L1; Wolf perceived as dev-tool, not universal facade | Product | P0 |
| A10 | **Gate explanation** — every approval request includes "why" | 4 playthroughs show user confusion about approvals | UX | P0 |
| A11 | **Component taxonomy** — Core / Conditional / External | 25+ suggested components need categorization to prevent explosion | Architect | P1 |
| A12 | **Capability taxonomy:** native → wrapped → MCP → imported_skill → direct_api | External capabilities have different trust models; need explicit classification | Integration | P1 |
| A13 | **Observability subsystem:** MetricsCollector, ExecutionSpan для L3+ | SRE cannot operate without metrics; needed for production readiness | SRE | P1 |
| A14 | **Audit trail for emergency overrides** — immutable log с причиной | Emergency mode bypasses gates; needs accountability | Security | P1 |
| A15 | **Domain-specific artifact taxonomies** | Generic artifact catalog (57 items) lacks domain coherence | Domain Expert | P1 |

---

## Partially Accepted

| # | Decision | Accepted Part | Rejected / Deferred Part | Rationale |
|---|----------|---------------|--------------------------|-----------|
| P1 | **Artifact lifecycle state machine** | created → validated → persisted | → archived (deferred) | State machine needed, but archival is P2 |
| P2 | **Fast path for L1–L2** | Skip scenario explanation для zero-config | Skip all internal behavior logging (rejected) | TraceSystem must still log for audit |
| P3 | **Retry policy для external capabilities** | Exponential backoff для MCP | Circuit breaker as default (accepted separately) | Retry without circuit breaker = infinite loops |
| P4 | **Dry-run mode as default preview** | Dry-run для L4 actions | Dry-run для L3 (deferred) | L3 already produces plans; preview less critical |
| P5 | **Bias detection for HR/research/product** | Mandatory bias flagging | Automated bias correction (rejected) | Human review required for bias decisions |
| P6 | **wolf init --domain** | Generate starter config | Auto-enable domain pack (rejected) | Domain pack may require credentials/approvals |
| P7 | **MCP capability cache** | Cache capability discovery | Cache responses (rejected) | Responses may be stale; discovery is stable |
| P8 | **Secrets scanner** | Scan inputs before processing | Real-time secrets rotation (deferred) | Rotation is runtime ops, not concept |

---

## Deferred

| # | Decision | Rationale | Target Phase |
|---|----------|-----------|--------------|
| D1 | **All 25+ "suggested components" кроме топ-5** | Feature ideas, not runtime subsystems; avoid overengineering | MVP+2 |
| D2 | **Custom plugin framework** | 0 scenarios actually require custom code; domain packs sufficient | MVP+2 |
| D3 | **Multi-language skill adapters** | No scenarios use non-English skills | MVP+3 |
| D4 | **Distributed tracing across subagents** | Subagents not in current architecture | MVP+3 |
| D5 | **Cost allocation per scenario** | No billing integration scenarios | MVP+3 |
| D6 | **A2A protocol support** | 0 scenarios use agent-to-agent | MVP+3 |
| D7 | **Custom adapter SDK** | No third-party integration scenarios beyond MCP | MVP+2 |
| D8 | **Industry-specific compliance packs (HIPAA, SOX)** | No such scenarios in bank | Post-MVP |
| D9 | **Multi-language document processing** | Single-language scenarios only | Post-MVP |
| D10 | **Automated penetration testing scenarios** | Security testing, not concept validation | Post-MVP |
| D11 | **Voice / chat interface optimizations** | CLI/OpenCode only in current scenarios | Post-MVP |
| D12 | **Mobile-responsive output formatting** | No mobile interaction surfaces | Post-MVP |
| D13 | **Real-time sales dashboard** | Feature, not subsystem | Post-MVP |
| D14 | **Monte Carlo simulation для бюджетов** | Overkill для current artifact profile | MVP+2 |
| D15 | **Auto-reimbursement workflow** | Feature, not core concept | MVP+2 |

---

## Rejected

| # | Decision | Rationale | Alternative |
|---|----------|-----------|-------------|
| R1 | **LightweightSolvePlanner для L2** | L2 решается через routing без planner | Use standard RouterLight |
| R2 | **FullWorkflowEngine для L2–L3** | Marked as overkill in extraction reports | Conditional workflow engine (L4+) |
| R3 | **Auto-merge gate** | No scenarios request auto-merge; policy explicitly denies it | Keep hard-deny on auto-merge |
| R4 | **AnswerCache** | L1 answers should be fast without cache complexity | Lightweight model selection |
| R5 | **Automated bias correction** | Bias detection = flag; correction = human decision | Mandatory bias flag + human review |
| R6 | **Auto-enable domain pack on wolf init** | Domain packs may require credentials/approval | Explicit opt-in |
| R7 | **Cache external API responses** | Responses may be stale; cache invalidation complex | Cache capability discovery only |
| R8 | **Real-time secrets rotation** | Runtime ops, not concept design | Document in ops guide, not concept |
| R9 | **Emergency mode bypasses all gates** | Rejected in extraction report; needs audit trail | Emergency mode = fast-track with logging |
| R10 | **Generic artifact catalog для всех доменов** | Domains need specific artifacts | Domain-specific artifact taxonomies |

---

## Action Items

1. **Architect:** Update concept document with SolveResult envelope, Router abstraction, Component taxonomy.
2. **Security:** Draft policy hierarchy schema; define PII subsystem requirements.
3. **DX:** Design progressive config path (zero → generated → explicit); prototype `wolf init --domain`.
4. **Integration:** Draft MCP lifecycle manager spec; define capability taxonomy.
5. **SRE:** Design observability subsystem; define circuit breaker parameters.
6. **Product:** Create L1 scenario templates для каждого домена.
7. **Domain Expert:** Define domain-specific artifact profiles для legal, finance, HR, research.
8. **All:** Review decision log на следующем concept sync.
