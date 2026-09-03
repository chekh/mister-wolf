# Agent Execution Plan

## 1. Purpose

This document sets the work plan for agents that must create a large Scenario Bank for Mr. Wolf, conduct scenario playthroughs, and extract data for concept refinement.

Agents must work not as fiction generators but as a research group. Goal: create a structured dataset for concept analysis.

## 2. Main Task

Create a large multi-domain scenario bank for Mr. Wolf and conduct playthroughs.

Target deliverables:
```
100–200 Scenario Cards
30–60 Playthrough Records
30–60 Extraction Reports
Coverage Matrix
Artifact Catalog
Component Demand Map
Risk Summary
Concept Implications Summary
```

## 3. Core Principles

1. Scenarios must be universal, not only software engineering.
2. Each domain must have different domain modes and artifact profiles.
3. Scenarios must be compact and formalized.
4. Games must be structured, not long dialogues.
5. Each scenario must explicitly record how Wolf configures for the task.
6. External skills/tools/MCP capabilities are untrusted until policy/wrapper.
7. Each scenario must mark artifacts, policies/gates, failure modes, and configuration effort.
8. After the game, concept implications must be extracted.

## 4. Input Documents

Agent must read and use:
```
testing-approach.md
scenario-card-schema.md
playthrough-schema.md
agent-execution-plan.md
```

## 5. Expert Group Roles

If one agent is used, it must simulate these roles. If subagent group is used, roles are distributed.

### 5.1 Lead Scenario Architect
- Scenario bank structure
- Schema compliance
- Domain and complexity balance
- No duplicates

### 5.2 Domain Experts
Responsible for domain plausibility.

Minimum domains:
```
software_engineering, architecture, office_assistant, legal_ops,
research, product_management, finance_ops, hr_recruiting,
security_compliance, data_analysis, content_marketing, personal_knowledge
```

### 5.3 Product/UX Expert
- Realism of user_input
- Clarity of expected_visible_behavior
- One-solver experience
- Time to First Useful Output

### 5.4 Architect Expert
- Components involved
- Subsystem boundaries
- Overengineering detection
- Dependency implications

### 5.5 Security/Governance Expert
- Policies, gates, hard-deny
- Trust imported capabilities
- Privacy/PII/secrets
- External side effects

### 5.6 SRE/Operations Expert
- Failure modes
- Latency/cost risks
- Observability, recoverability
- Retry/resume questions

### 5.7 Integration Expert
- OpenCode, VSCode, OpenClaw, MCP
- Adapters, wrappers
- Plugin/hook implications

### 5.8 Artifact Expert
- First-class artifacts
- Artifact lifecycle
- Output vs persisted artifacts
- Domain-specific artifact profiles

## 6. Work Plan

### Phase 0 — Preparation
1. Read all input documents.
2. Extract controlled vocabularies.
3. Confirm output file structure.
4. Prepare domain list and target counts.
5. Define initial coverage targets.

Output: `README.md`, `vocabularies/*.yaml`, `generation-plan.md`

### Phase 1 — Domain and Scenario Seed Generation
For each selected domain:
1. Identify 8–12 realistic tasks.
2. Vary domain_mode, methodology, artifact_profile, scenario_level.
3. Avoid trivial duplicates.
4. Include at least one scenario with external capability.
5. Include at least one scenario with governance/gate.
6. Include at least one scenario with artifact-heavy output.
7. Include at least one failure-prone scenario.

Target: 12 domains × 10 scenarios = 120 scenarios

Output: `scenarios/<domain>.jsonl`

### Phase 2 — Scenario Card Completion
For each scenario, fill all required fields (see scenario-card-schema.md).

Quality checks:
- No missing required fields
- Controlled tags only
- Configuration mode explicit
- At least one output artifact
- Failure modes present
- No long prose

Output: `scenarios/*.jsonl`, `generated/scenario-validation-report.md`

### Phase 3 — Scenario Coverage Review
Create coverage matrix:
```
Domain × Scenario Level
Domain × Artifact Profile
Domain × Configuration Mode
Domain × Governance Level
Domain × External Capability Use
Domain × Memory Use
```

Find gaps:
- Domains with no Level 5 scenario
- Domains with no governance scenario
- Domains with no artifact-heavy scenario
- Too many dev-only scenarios
- Too many generated_config scenarios
- Insufficient OpenCode/adapter scenarios

Output: `generated/coverage-matrix.md`, `generated/coverage-gaps.md`

### Phase 4 — Playthrough Selection
Select 30–60 scenarios for game simulation.

Selection rules:
- Include all domains
- Include all scenario levels
- Include all major configuration modes
- At least 10 Level 4–5 scenarios
- At least 10 external capability scenarios
- At least 10 policy/gate scenarios
- At least 5 memory scenarios
- At least 5 OpenCode/adapter scenarios

Output: `playthroughs/selected-for-playthrough.md`

### Phase 5 — Scenario Playthroughs
For each selected scenario:
1. Run User Simulator.
2. Run Wolf Simulator.
3. Run Observer/Critic.
4. Produce Playthrough Record.
5. Produce Extraction Report.

Do not write long conversations. Keep interaction steps compact.

Output: `playthroughs/playthroughs.jsonl`, `playthroughs/extraction-reports.jsonl`

### Phase 6 — Extraction and Analysis
Aggregate findings from Scenario Cards and Extraction Reports.

Produce:
- Artifact Catalog
- Component Demand Map
- Policy Pattern Catalog
- Configuration Effort Map
- Adapter Demand Map
- Failure Mode Catalog
- Memory Use Map
- MVP Candidate Scenarios
- Concept Implications Summary

Output: `generated/*.md` files for each catalog/map.

### Phase 7 — Expert Review Pass
Run expert review on aggregated findings.

Each expert role produces:
```
Top concerns, Must fix, Should fix, Can defer,
Rejected assumptions, Suggested concept updates, Verdict
```

Output: `generated/expert-review-notes.md`

### Phase 8 — Final Summary
Produce final summary:
```
what scenarios prove, what artifacts matter, what components are required,
what can be deferred, where concept is weak, what first useful product should be
```

Output: `generated/final-scenario-lab-summary.md`

## 7. Domain Generation Targets

| Domain | Target scenarios |
|---|---:|
| software_engineering | 12 |
| architecture | 10 |
| office_assistant | 10 |
| legal_ops | 10 |
| research | 10 |
| product_management | 10 |
| finance_ops | 8 |
| hr_recruiting | 8 |
| security_compliance | 10 |
| data_analysis | 8 |
| content_marketing | 8 |
| personal_knowledge | 8 |
| concierge | 8 |
| sales_crm | 8 |
| education | 8 |

Total: 136 scenarios. Agent may expand to 150–200 if coverage gaps remain.

## 8. Required Domain Variation

For each domain, include variations by:
```
domain_mode, methodology, artifact_profile, scenario_level,
governance_level, configuration_effort, interaction_surface, external_capability_use
```

Example for software_engineering:
```
prototype + minimal artifacts
product + lightweight review
enterprise + ADR/ADL
regulated + audit-heavy
legacy maintenance + risk review
security-sensitive + expert gate
```

Example for legal_ops:
```
quick NDA summary
contract clause matrix
enterprise negotiation support
regulated privacy review
external counsel handoff
```

Example for office_assistant:
```
simple follow-up draft
board meeting preparation
calendar scheduling with approval
client briefing pack
sensitive external email gate
```

## 9. Output Constraints

### Scenario Cards
```
Format: JSONL
Max length: compact object, no long prose
Required fields: all required fields from scenario-card-schema.md
```

### Playthrough Records
```
Format: JSONL
Max interaction steps: 12
No long dialogues
```

### Extraction Reports
```
Format: JSONL
Must include complexity assessment and concept updates
```

### Generated Summaries
```
Format: Markdown
Short and analytical
Use tables where helpful
```

## 10. Quality Gates

Before final delivery, check:
- At least 100 valid Scenario Cards
- Scenario IDs unique
- No missing required fields
- Controlled vocabulary used
- Coverage matrix generated
- At least 30 playthroughs
- Each playthrough has extraction report
- Component demand map generated
- Artifact catalog generated
- Risk summary generated
- Final scenario lab summary generated

## 11. Agent Prompt Template

Use this as the short execution prompt after providing the documentation path:

```
You are the Scenario Lab Orchestrator for Mr. Wolf.
Read the documentation in <DOCS_PATH>:
- testing-approach.md
- scenario-card-schema.md
- playthrough-schema.md
- agent-execution-plan.md

Your task:
1. Create a large multi-domain Scenario Bank for Mr. Wolf.
2. Use the Scenario Card schema and controlled vocabularies.
3. Generate 100–150 compact scenarios across at least 10 domains.
4. Vary domain_mode, methodology, artifact_profile, configuration mode and scenario level.
5. Select 30–60 scenarios for playthrough.
6. Simulate User, Wolf and Observer roles.
7. Produce Playthrough Records and Extraction Reports.
8. Generate coverage matrix, artifact catalog, component demand map, policy pattern catalog, failure mode catalog and concept implications summary.

Do not write long prose or fictional dialogues. Use structured JSONL and concise Markdown summaries.
```

## 12. Expected Final Deliverable Checklist

```
README.md
scenarios/*.jsonl
playthroughs/playthroughs.jsonl
playthroughs/extraction-reports.jsonl
generated/coverage-matrix.md
generated/artifact-catalog.md
generated/component-demand-map.md
generated/policy-pattern-catalog.md
generated/configuration-effort-map.md
generated/adapter-demand-map.md
generated/failure-mode-catalog.md
generated/memory-use-map.md
generated/mvp-candidate-scenarios.md
generated/concept-implications.md
generated/expert-review-notes.md
generated/final-scenario-lab-summary.md
```
