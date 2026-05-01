---
name: mr-wolf-scenario-lab
description: Use when generating multi-domain scenario cards, running User/Wolf/Observer playthroughs, simulating expert reviews, extracting artifacts and risks, or refining the Mr. Wolf concept through scenario-driven and artifact-driven analysis.
---

# Mr. Wolf Scenario Lab

## Overview

Structured scenario-driven methodology for designing and evaluating the Mr. Wolf agentic control plane concept. Generates compact Scenario Cards, runs lightweight playthroughs, simulates expert reviews, and extracts artifacts, components, policies, and risks into machine-analyzable reports.

**REQUIRED REFERENCES:** Load files from `references/` before executing any workflow.

## When to Use

- User asks to create a scenario bank or generate Scenario Cards.
- User asks to validate, review, or analyze existing scenarios.
- User asks to run a playthrough, simulation, or "прогнать сценарий".
- User asks to extract artifacts, components, policies, risks, or configuration effort.
- User asks for expert critique of scenarios or concept implications.
- User asks to build coverage matrices, artifact catalogs, or component demand maps.

**When NOT to use:**
- The task is about implementing Mr. Wolf runtime code.
- The task is general chat unrelated to Mr. Wolf concept development.

## Core Workflows

Load the appropriate reference file for detailed schema and vocabulary before executing.

| Workflow | Trigger | Key Reference |
|----------|---------|---------------|
| **A. Generate** | "Create scenarios" | `scenario-card-schema.md` + `vocabularies.md` |
| **B. Validate** | "Check / validate bank" | `scenario-card-schema.md` |
| **C. Playthrough** | "Run / play / simulate scenario" | `playthrough-schema.md` |
| **D. Aggregate** | "Analyze / extract / catalog" | `agent-execution-plan.md` |
| **E. Expert Review** | "Review / critique as expert" | `testing-approach.md` |

### Workflow A — Generate Scenario Bank
1. Ask or infer: scenario count, domains, levels, output format, playthroughs needed.
2. Create domain plan with variation across domain_mode, methodology, artifact_profile, governance, configuration mode, execution complexity.
3. Generate Scenario Cards per schema. Use controlled vocabulary.
4. Output JSONL or structured Markdown. Produce coverage summary.

### Workflow B — Validate Scenario Bank
1. Check required fields, unique IDs, controlled vocabularies.
2. Check coverage: levels, domains, artifacts, governance, external capabilities, memory.
3. Produce validation report.

### Workflow C — Run Playthroughs
1. Select scenario(s).
2. Simulate User, Wolf, and Observer/Critic roles.
3. Produce compact Playthrough Record (≤12 steps, ≤2 sentences per step).
4. Produce Extraction Report with verdict, findings, complexity assessment, concept updates.

### Workflow D — Aggregate Findings
1. Extract artifact catalog, component demand map, policy pattern catalog.
2. Extract configuration effort map, adapter demand map, failure mode catalog.
3. Extract MVP candidate scenarios. Produce concept implications summary.

### Workflow E — Expert Review
Simulate roles: Architect, Developer/DX, Security/Governance, SRE/Ops, Product/UX, Integration, Domain Expert, Artifact Expert.

Each role outputs: Top concerns, Must fix, Should fix, Can defer, Rejected assumptions, Suggested tests/examples, Verdict.

## Quick Reference

### Scenario Card (Required Fields)
`id`, `title`, `domain`, `subdomain`, `scenario_level` (1–5), `domain_mode`, `methodology`, `artifact_profile`, `interaction_surface`, `user_input`, `user_intent`, `wolf_configuration`, `expected_visible_behavior`, `internal_behavior`, `artifacts`, `capabilities`, `policies`, `gates`, `memory`, `failure_modes`, `analysis_tags`, `configuration_effort`, `new_capabilities_introduced`, `concept_questions`

### Scenario Levels
| Level | Name | Behavior |
|-------|------|----------|
| 1 | simple_answer | No workflow/tools |
| 2 | context_aware_answer | Reads context, no side effects |
| 3 | plan_dry_run | Builds plan/artifacts, does not act |
| 4 | governed_action | Uses tools and gates |
| 5 | multi_capability_external | MCP/imported skill/memory/A2A/conflict |

### Playthrough Limits
- Max 12 interaction steps
- Max 2 sentences per step
- No long fictional dialogues
- Must reference existing Scenario Card
- Must produce matching Extraction Report

## Subagent Orchestration

If subagents are available, delegate by role:
- **Scenario Architect** — generate cards, maintain schema, balance coverage
- **Domain Expert** — validate domain realism, suggest artifacts, identify gates/risks
- **UX/Product** — ensure realistic user inputs, evaluate visible behavior
- **Security/Governance** — identify hard-deny, approval gates, external risks
- **SRE/Ops** — identify latency/cost risks, failure modes, observability
- **Integration** — identify OpenCode/MCP/VSCode/OpenClaw adapter implications
- **Artifact** — identify first-class artifacts, normalize names, lifecycle questions
- **Critic** — search for overengineering, unrealistic assumptions, config hell
- **Aggregator** — merge findings, build coverage matrix, produce summaries

If subagents are not available, simulate roles sequentially in one response.

## Guardrails

- **Do not** write long fictional dialogues.
- **Do not** invent uncontrolled tags when controlled vocabulary exists.
- **Do not** merge Scenario Cards with Playthrough Records.
- **Do not** treat external capabilities as trusted by default.
- **Do not** assume all scenarios are software engineering.
- **Do not** use only high-complexity scenarios.
- **Do not** ignore configuration effort, artifacts, or failure modes.
- **Do not** produce a roadmap unless user explicitly asks.
- **Do not** imply Mr. Wolf is already implemented beyond current concept.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Writing 20+ step playthroughs | Enforce ≤12 steps, ≤2 sentences each |
| Inventing random tags | Use controlled vocabulary from `vocabularies.md` |
| Mixing scenario description with simulation trace | Keep Scenario Card static; put dynamic observations in Playthrough Record |
| Treating imported skills as trusted | Mark as untrusted until policy/wrapper applied |
| Forgetting configuration mode | Every Scenario Card must specify `configuration_effort.level` |
| Skipping failure modes | Every Scenario Card must list `failure_modes` |
| Assuming only dev scenarios | Ensure ≥10 domains, not just software_engineering |

## Clarifying Questions

When request is underspecified, ask at most these 5:
1. How many scenarios?
2. Which domains?
3. Playthroughs now or only Scenario Cards?
4. Output format: JSONL, YAML, Markdown, or all?
5. Target interaction surfaces: CLI, OpenCode, or all?

**Defaults if unanswered:**
- Scenarios: 100
- Domains: 10–12 mixed
- Levels: 1–5
- Output: JSONL + Markdown summaries
- Playthroughs: 30 selected scenarios
- Surfaces: CLI + OpenCode + MCP/API optional

## References

- `references/testing-approach.md` — methodology, roles, quality criteria
- `references/scenario-card-schema.md` — full schema, template, JSONL example
- `references/playthrough-schema.md` — playthrough and extraction report formats
- `references/agent-execution-plan.md` — 8-phase work plan, domain targets
- `references/vocabularies.md` — controlled vocabularies for all enums and tags
- `references/examples.md` — example requests, outputs, cards, reports
