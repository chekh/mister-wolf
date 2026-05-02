# Concept Update Decision Draft

**Date:** 2026-05-05
**Source:** Concept Extraction Pass over 80 scenarios
**Status:** Draft for concept owner review

## Accepted

| # | Decision | Rationale | Evidence | Priority |
|---|----------|-----------|----------|----------|
| A1 | **SolveResult envelope** | Missing core abstraction; 3 extraction reports identify | `er-software-review-next-mvp-001`, decision log | P0 |
| A2 | **Router abstraction** | Duality Router/RouterLight creates confusion | 13 Router + 7 RouterLight confirmations | P0 |
| A3 | **Progressive config path** | 6 modes cause configuration hell signal | 9 scenarios use generated_config | P0 |
| A4 | **Gate severity levels** | Security wants gates, UX wants friction reduction | 12 scenarios have gates | P0 |
| A5 | **PII subsystem** | Gate alone insufficient; 5 domains have PII | legal, HR, finance scenarios | P0 |
| A6 | **Policy hierarchy** | 33 inconsistent policies need structure | Policy inconsistency in expert review | P0 |
| A7 | **MCP lifecycle manager** | 3 scenarios use MCP, 2 show unavailability | `office.schedule.calendar_conflict.010`, `software.ci.github_mcp_pr.003` | P0 |
| A8 | **Circuit breaker** | L5 incident response shows runaway risk | `security.incident.response_runbook.018` | P0 |
| A9 | **Artifact chain linking** | Anchor domain requires spec→tasks→tests→impl→release | 20 anchor domain scenarios | P0 |
| A10 | **Gate explanation** | 4 playthroughs show user confusion about approvals | `software.refactor.legacy_cleanup.002`, L4 playthroughs | P0 |

## Partially Accepted

| # | Decision | Accepted | Rejected/Deferred | Rationale |
|---|----------|----------|-------------------|-----------|
| P1 | Artifact lifecycle state machine | created → validated → persisted | → archived (deferred) | Archival is P2 |
| P2 | Fast path for L1–L2 | Skip scenario explanation for zero-config | Skip all internal logging (rejected) | TraceSystem must still log for audit |
| P3 | Retry policy for external | Exponential backoff for MCP | Circuit breaker as default (accepted separately) | Retry without circuit breaker = infinite loops |
| P4 | Dry-run as default preview | Dry-run for L4 actions | Dry-run for L3 (deferred) | L3 already produces plans |
| P5 | Bias detection for HR/research/product | Mandatory bias flagging | Automated bias correction (rejected) | Human review required for bias decisions |

## Deferred

| # | Decision | Rationale | Target |
|---|----------|-----------|--------|
| D1 | Domain-specific helper components | Feature ideas, not runtime subsystems | MVP+2 |
| D2 | DomainPackCoordinator | Cross-domain < 15% | MVP+2 |
| D3 | Custom plugin framework | 0 scenarios require custom code | MVP+2 |
| D4 | A2A protocol support | 0 scenarios use agent-to-agent | MVP+3 |
| D5 | Multi-language skill adapters | No non-English scenarios | MVP+3 |
| D6 | Distributed tracing across subagents | Subagents not in current architecture | MVP+3 |

## Rejected

| # | Decision | Rationale | Alternative |
|---|----------|-----------|-------------|
| R1 | LightweightSolvePlanner for L2 | L2 solves via routing without planner | Use standard RouterLight |
| R2 | FullWorkflowEngine for L2–L3 | Marked as overkill in extraction reports | Conditional workflow engine (L4+) |
| R3 | Auto-merge gate | No scenarios request auto-merge | Keep hard-deny on auto-merge |
| R4 | AnswerCache | L1 answers should be fast without cache | Lightweight model selection |
| R5 | Automated bias correction | Bias detection = flag; correction = human | Mandatory bias flag + human review |
