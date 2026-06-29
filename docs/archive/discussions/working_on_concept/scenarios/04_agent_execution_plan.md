# Mr. Wolf Scenario Lab — план и подробная задача для агентов

## 1. Назначение

Этот документ задаёт план работы для агента или группы агентов, которые должны создать большой Scenario Bank для Mr. Wolf, провести игровые прогоны сценариев и извлечь данные для уточнения концепции.

Агенты должны работать не как генератор художественных примеров, а как исследовательская группа. Цель — создать структурированный dataset для анализа концепции.

## 2. Главная задача

Создать большой много-доменный банк сценариев для Mr. Wolf и провести по нему игровые прогоны.

Итоговый результат:

```text
100–200 Scenario Cards
30–60 Playthrough Records
30–60 Extraction Reports
Coverage Matrix
Artifact Catalog
Component Demand Map
Risk Summary
Concept Implications Summary
```

## 3. Основные принципы работы

1. Сценарии должны быть универсальными, не только software engineering.
2. В каждом домене должны быть разные domain modes и artifact profiles.
3. Сценарии должны быть компактными и формализованными.
4. Игры должны быть структурированными, не длинными диалогами.
5. В каждом сценарии нужно явно фиксировать, как Wolf настраивается под задачу.
6. Внешние skills/tools/MCP capabilities должны считаться untrusted до policy/wrapper.
7. В каждом сценарии нужно отмечать артефакты, policies/gates, failure modes и configuration effort.
8. После игры нужно извлекать concept implications.

## 4. Входные документы

Агент должен прочитать и использовать:

```text
01_testing_approach.md
02_scenario_bank_format.md
03_playthrough_format.md
04_agent_execution_plan.md
```

Если создаётся специальный skill, он должен дополнительно использовать:

```text
05_skill_creation_requirements.md
```

## 5. Роли экспертной группы

Если используется один агент, он должен симулировать следующие роли. Если используется группа субагентов, роли распределяются между ними.

### 5.1 Lead Scenario Architect

Отвечает за:

- структуру банка сценариев;
- соответствие schema;
- баланс доменов и уровней сложности;
- отсутствие дублей.

### 5.2 Domain Experts

Отвечают за доменную правдоподобность.

Минимальные домены:

```text
software_engineering
architecture
office_assistant
legal_ops
research
product_management
finance_ops
hr_recruiting
security_compliance
data_analysis
content_marketing
personal_knowledge
```

### 5.3 Product/UX Expert

Отвечает за:

- реалистичность user_input;
- понятность expected_visible_behavior;
- one-solver experience;
- Time to First Useful Output.

### 5.4 Architect Expert

Отвечает за:

- components involved;
- границы subsystems;
- overengineering detection;
- dependency implications.

### 5.5 Security/Governance Expert

Отвечает за:

- policies;
- gates;
- hard-deny;
- trust imported capabilities;
- privacy/PII/secrets;
- external side effects.

### 5.6 SRE/Operations Expert

Отвечает за:

- failure modes;
- latency/cost risks;
- observability;
- recoverability;
- retry/resume questions.

### 5.7 Integration Expert

Отвечает за:

- OpenCode;
- VSCode;
- OpenClaw;
- MCP;
- adapters;
- wrappers;
- plugin/hook implications.

### 5.8 Artifact Expert

Отвечает за:

- first-class artifacts;
- artifact lifecycle;
- output vs persisted artifacts;
- domain-specific artifact profiles.

## 6. Work plan

### Phase 0 — Preparation

1. Read all input documents.
2. Extract controlled vocabularies.
3. Confirm output file structure.
4. Prepare domain list and target counts.
5. Define initial coverage targets.

Output:

```text
scenario-bank/README.md
scenario-bank/vocabularies/*.yaml
scenario-bank/generation-plan.md
```

### Phase 1 — Domain and Scenario Seed Generation

For each selected domain:

1. Identify 8–12 realistic tasks.
2. Vary domain_mode, methodology, artifact_profile and scenario_level.
3. Avoid trivial duplicates.
4. Include at least one scenario with external capability.
5. Include at least one scenario with governance/gate.
6. Include at least one scenario with artifact-heavy output.
7. Include at least one failure-prone scenario.

Target:

```text
12 domains × 10 scenarios = 120 scenarios
```

Output:

```text
scenario-bank/scenarios/<domain>.jsonl
```

### Phase 2 — Scenario Card Completion

For each scenario, fill all required fields:

```text
id
title
domain
subdomain
scenario_level
domain_mode
methodology
artifact_profile
interaction_surface
user_input
user_intent
wolf_configuration
expected_visible_behavior
internal_behavior
artifacts
capabilities
policies
gates
memory
failure_modes
configuration_effort
new_capabilities_introduced
concept_questions
analysis_tags
```

Quality checks:

- no missing required fields;
- controlled tags only;
- configuration mode explicit;
- at least one output artifact;
- failure modes present;
- no long prose.

Output:

```text
scenario-bank/scenarios/*.jsonl
scenario-bank/generated/scenario-validation-report.md
```

### Phase 3 — Scenario Coverage Review

Create coverage matrix:

```text
Domain × Scenario Level
Domain × Artifact Profile
Domain × Configuration Mode
Domain × Governance Level
Domain × External Capability Use
Domain × Memory Use
```

Find gaps:

- domains with no Level 5 scenario;
- domains with no governance scenario;
- domains with no artifact-heavy scenario;
- too many dev-only scenarios;
- too many generated_config scenarios;
- insufficient OpenCode/adapter scenarios.

Output:

```text
scenario-bank/generated/coverage-matrix.md
scenario-bank/generated/coverage-gaps.md
```

### Phase 4 — Playthrough Selection

Select 30–60 scenarios for game simulation.

Selection rules:

- include all domains;
- include all scenario levels;
- include all major configuration modes;
- include at least 10 Level 4–5 scenarios;
- include at least 10 external capability scenarios;
- include at least 10 policy/gate scenarios;
- include at least 5 memory scenarios;
- include at least 5 OpenCode/adapter scenarios.

Output:

```text
scenario-bank/playthroughs/selected-for-playthrough.md
```

### Phase 5 — Scenario Playthroughs

For each selected scenario:

1. Run User Simulator.
2. Run Wolf Simulator.
3. Run Observer/Critic.
4. Produce Playthrough Record.
5. Produce Extraction Report.

Do not write long conversations. Keep interaction steps compact.

Output:

```text
scenario-bank/playthroughs/playthroughs.jsonl
scenario-bank/playthroughs/extraction-reports.jsonl
```

### Phase 6 — Extraction and Analysis

Aggregate findings from Scenario Cards and Extraction Reports.

Produce:

```text
Artifact Catalog
Component Demand Map
Policy Pattern Catalog
Configuration Effort Map
Adapter Demand Map
Failure Mode Catalog
Memory Use Map
MVP Candidate Scenarios
Concept Implications Summary
```

Output:

```text
scenario-bank/generated/artifact-catalog.md
scenario-bank/generated/component-demand-map.md
scenario-bank/generated/policy-pattern-catalog.md
scenario-bank/generated/configuration-effort-map.md
scenario-bank/generated/adapter-demand-map.md
scenario-bank/generated/failure-mode-catalog.md
scenario-bank/generated/memory-use-map.md
scenario-bank/generated/mvp-candidate-scenarios.md
scenario-bank/generated/concept-implications.md
```

### Phase 7 — Expert Review Pass

Run expert review on aggregated findings.

Each expert role produces:

```text
Top concerns
Must fix
Should fix
Can defer
Rejected assumptions
Suggested concept updates
Verdict
```

Output:

```text
scenario-bank/generated/expert-review-notes.md
```

### Phase 8 — Final Summary

Produce final summary:

```text
what scenarios prove
what artifacts matter
what components are required
what can be deferred
where concept is weak
what first useful product should be
```

Output:

```text
scenario-bank/generated/final-scenario-lab-summary.md
```

## 7. Domain generation targets

Recommended initial target:

| Domain               | Target scenarios |
| -------------------- | ---------------: |
| software_engineering |               12 |
| architecture         |               10 |
| office_assistant     |               10 |
| legal_ops            |               10 |
| research             |               10 |
| product_management   |               10 |
| finance_ops          |                8 |
| hr_recruiting        |                8 |
| security_compliance  |               10 |
| data_analysis        |                8 |
| content_marketing    |                8 |
| personal_knowledge   |                8 |
| concierge            |                8 |
| sales_crm            |                8 |
| education            |                8 |

Total: 136 scenarios.

The agent may expand to 150–200 if coverage gaps remain.

## 8. Required domain variation

For each domain, include variations by:

```text
domain_mode
methodology
artifact_profile
scenario_level
governance_level
configuration_effort
interaction_surface
external capability use
```

Example for software_engineering:

```text
prototype + minimal artifacts
product + lightweight review
enterprise + ADR/ADL
regulated + audit-heavy
legacy maintenance + risk review
security-sensitive + expert gate
```

Example for legal_ops:

```text
quick NDA summary
contract clause matrix
enterprise negotiation support
regulated privacy review
external counsel handoff
```

Example for office_assistant:

```text
simple follow-up draft
board meeting preparation
calendar scheduling with approval
client briefing pack
sensitive external email gate
```

## 9. Output constraints

### Scenario Cards

```text
Format: JSONL
Max length: compact object, no long prose
Required fields: all required fields from 02_scenario_bank_format.md
```

### Playthrough Records

```text
Format: JSONL
Max interaction steps: 12
No long dialogues
```

### Extraction Reports

```text
Format: JSONL
Must include complexity assessment and concept updates
```

### Generated summaries

```text
Format: Markdown
Short and analytical
Use tables where helpful
```

## 10. Quality gates

Before final delivery, check:

- at least 100 valid Scenario Cards;
- scenario IDs unique;
- no missing required fields;
- controlled vocabulary used;
- coverage matrix generated;
- at least 30 playthroughs;
- each playthrough has extraction report;
- component demand map generated;
- artifact catalog generated;
- risk summary generated;
- final scenario lab summary generated.

## 11. Agent prompt template

Use this as the short execution prompt for an agent after providing the documentation path:

```text
You are the Scenario Lab Orchestrator for Mr. Wolf.
Read the documentation in <DOCS_PATH>:
- 01_testing_approach.md
- 02_scenario_bank_format.md
- 03_playthrough_format.md
- 04_agent_execution_plan.md

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

## 12. Expected final deliverable checklist

```text
scenario-bank/README.md
scenario-bank/scenarios/*.jsonl
scenario-bank/playthroughs/playthroughs.jsonl
scenario-bank/playthroughs/extraction-reports.jsonl
scenario-bank/generated/coverage-matrix.md
scenario-bank/generated/artifact-catalog.md
scenario-bank/generated/component-demand-map.md
scenario-bank/generated/policy-pattern-catalog.md
scenario-bank/generated/configuration-effort-map.md
scenario-bank/generated/adapter-demand-map.md
scenario-bank/generated/failure-mode-catalog.md
scenario-bank/generated/memory-use-map.md
scenario-bank/generated/mvp-candidate-scenarios.md
scenario-bank/generated/concept-implications.md
scenario-bank/generated/expert-review-notes.md
scenario-bank/generated/final-scenario-lab-summary.md
```
