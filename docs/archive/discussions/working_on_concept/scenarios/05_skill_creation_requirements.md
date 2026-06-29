# Skill creation requirements — Mr. Wolf Scenario Lab Orchestrator

## 1. Назначение

Этот документ содержит prompt-requirements для создания специального ChatGPT Skill через Superpowers/skill-creator. Skill должен помогать проводить Scenario Lab для Mr. Wolf: генерировать банк сценариев, запускать игровые прогоны, симулировать группу экспертов и извлекать данные для развития концепции.

Skill не должен реализовывать сам Mr. Wolf. Он должен помогать проектировать и тестировать концепцию Mr. Wolf через сценарии.

## 2. Предлагаемое имя skill

```text
mr-wolf-scenario-lab
```

Требования к имени:

- lowercase;
- words separated by hyphen;
- no `skill` suffix;
- коротко и понятно.

## 3. Skill purpose

Skill должен активироваться, когда пользователь просит:

- создать банк сценариев для Mr. Wolf;
- проанализировать сценарии Mr. Wolf;
- провести игру/симуляцию User ↔ Wolf ↔ Observer;
- сгенерировать Scenario Cards;
- создать Playthrough Records;
- создать Extraction Reports;
- провести экспертное ревью сценариев;
- извлечь artifacts/components/risks/policies из сценариев;
- обновить концепцию Mr. Wolf на основе Scenario Lab.

## 4. Frontmatter description draft

```yaml
name: mr-wolf-scenario-lab
description: create, validate, simulate, and analyze structured scenario banks for the Mr. Wolf agentic control plane project. Use this skill when the user asks to generate multi-domain scenario cards, run User/Wolf/Observer playthroughs, simulate expert reviews, extract artifacts/components/policies/risks, build coverage matrices, or refine the Mr. Wolf concept through scenario-driven and artifact-driven analysis.
```

## 5. Required skill behavior

When triggered, the skill must:

1. Identify whether the user wants to:
   - generate Scenario Cards;
   - validate Scenario Cards;
   - run playthroughs;
   - produce extraction reports;
   - aggregate findings;
   - prepare expert review;
   - update concept implications;
   - create a full Scenario Lab package.
2. Load only the needed reference files.
3. Use controlled schemas and vocabularies.
4. Keep outputs structured and compact.
5. Avoid long fictional dialogues.
6. Simulate expert roles when needed.
7. Produce machine-analyzable JSONL/YAML when requested.
8. Produce concise Markdown summaries when requested.
9. Flag missing fields and invalid tags.
10. Clearly separate Scenario Card, Playthrough Record and Extraction Report.

## 6. Required references to include in the skill

The skill should include these reference files:

```text
references/testing-approach.md
references/scenario-card-schema.md
references/playthrough-schema.md
references/agent-execution-plan.md
references/vocabularies.md
references/examples.md
```

Mapping from current docs:

```text
01_testing_approach.md       → references/testing-approach.md
02_scenario_bank_format.md   → references/scenario-card-schema.md
03_playthrough_format.md     → references/playthrough-schema.md
04_agent_execution_plan.md   → references/agent-execution-plan.md
```

Optional:

```text
scripts/validate_scenario_bank.py
scripts/build_coverage_matrix.py
scripts/extract_catalogs.py
```

Scripts are optional but recommended if the skill will process large JSONL files.

## 7. Skill workflow

### Workflow A — Generate Scenario Bank

Use when user asks to create scenarios.

Steps:

1. Ask or infer target scope:
   - number of scenarios;
   - domains;
   - scenario levels;
   - output format;
   - whether playthroughs are needed.
2. Create domain plan.
3. Generate Scenario Cards using schema.
4. Ensure controlled vocabulary.
5. Ensure variation across:
   - domain mode;
   - methodology;
   - artifact profile;
   - governance level;
   - configuration mode;
   - execution complexity.
6. Output JSONL or structured Markdown.
7. Produce coverage summary.

### Workflow B — Validate Scenario Bank

Use when user provides scenario cards or scenario-bank files.

Steps:

1. Check required fields.
2. Check unique IDs.
3. Check controlled vocabularies.
4. Check scenario level coverage.
5. Check domain coverage.
6. Check missing artifacts/failure modes/configuration mode.
7. Produce validation report.

### Workflow C — Run Playthroughs

Use when user asks to “play”, “simulate”, “run scenario”, “прогнать сценарий”.

Steps:

1. Select scenario(s).
2. Simulate User role.
3. Simulate Wolf role according to current concept.
4. Simulate Observer/Critic.
5. Produce compact Playthrough Record.
6. Produce Extraction Report.
7. Flag concept implications.

### Workflow D — Aggregate Findings

Use when user asks to analyze a scenario bank.

Steps:

1. Extract artifact catalog.
2. Extract component demand map.
3. Extract policy pattern catalog.
4. Extract configuration effort map.
5. Extract adapter demand map.
6. Extract failure mode catalog.
7. Extract MVP candidate scenarios.
8. Produce concept implications summary.

### Workflow E — Expert Review

Use when user asks for expert critique.

Simulate these roles:

```text
Architect
Developer/DX
Security/Governance
SRE/Operations
Product/UX
Integration
Domain Expert
Artifact Expert
```

Each role should output:

```text
Top concerns
Must fix
Should fix
Can defer
Rejected assumptions
Suggested tests/examples
Verdict
```

## 8. Subagent orchestration requirement

If the environment supports subagents, the skill should delegate work by role:

```text
Scenario Architect Agent
Domain Expert Agent
UX/Product Agent
Security/Governance Agent
SRE/Ops Agent
Integration Agent
Artifact Agent
Critic Agent
Aggregator Agent
```

If subagents are not available, the skill should simulate these roles sequentially in one response.

### Suggested subagent responsibilities

#### Scenario Architect Agent

- Generate Scenario Cards.
- Maintain schema consistency.
- Avoid duplicates.
- Balance coverage.

#### Domain Expert Agent

- Validate domain realism.
- Suggest domain-specific artifacts.
- Identify domain-specific gates and risks.

#### UX/Product Agent

- Ensure realistic user inputs.
- Evaluate visible behavior.
- Minimize user confusion.

#### Security/Governance Agent

- Identify hard-deny needs.
- Identify approval gates.
- Identify external capability risks.

#### SRE/Ops Agent

- Identify latency/cost risks.
- Identify failure modes.
- Suggest observability requirements.

#### Integration Agent

- Identify OpenCode/MCP/VSCode/OpenClaw adapter implications.
- Identify wrapper needs.
- Identify imported skill/tool boundaries.

#### Artifact Agent

- Identify first-class artifacts.
- Normalize artifact names.
- Determine artifact lifecycle questions.

#### Critic Agent

- Search for overengineering.
- Search for unrealistic assumptions.
- Search for configuration hell.

#### Aggregator Agent

- Merge findings.
- Build coverage matrix.
- Produce final summaries.

## 9. Output standards

### Scenario Cards

Must follow Scenario Card schema.

Prefer JSONL for large batches.

### Playthrough Records

Must follow playthrough schema.

Limit:

```text
max 12 interaction steps
max 2 sentences per step
```

### Extraction Reports

Must include:

```text
behavior_findings
artifact_findings
component_findings
configuration_findings
policy_findings
capability_findings
memory_findings
failure_modes
complexity_assessment
concept_updates
```

### Summaries

Must be concise, analytical and grouped by theme.

## 10. Guardrails for the skill

The skill must not:

- write long fictional dialogues;
- invent uncontrolled tags when controlled vocabulary exists;
- merge Scenario Cards with Playthrough Records;
- treat external capabilities as trusted by default;
- assume all scenarios are software engineering;
- use only high-complexity scenarios;
- ignore configuration effort;
- ignore artifacts;
- ignore failure modes;
- produce roadmap unless the user explicitly asks;
- imply that Mr. Wolf is already implemented beyond current concept.

## 11. Concrete examples the skill should support

### Example 1 — Generate scenarios

User:

```text
Create 50 Scenario Cards for Mr. Wolf across software, legal, office, research and finance. Use levels 1–5 and include configuration mode.
```

Expected output:

```text
JSONL Scenario Cards + coverage summary.
```

### Example 2 — Run playthrough

User:

```text
Run a playthrough for scenario software.review.next_mvp.001.
```

Expected output:

```text
Playthrough Record + Extraction Report.
```

### Example 3 — Expert review

User:

```text
Review this Scenario Bank as architect, security, SRE and UX experts.
```

Expected output:

```text
Role-based expert review with must-fix / should-fix / can-defer.
```

### Example 4 — Aggregate findings

User:

```text
Analyze these 120 scenarios and extract artifact catalog, component demand map and MVP candidates.
```

Expected output:

```text
Markdown summaries + structured catalogs.
```

## 12. Clarifying questions the skill should ask when needed

When the user request is underspecified, ask only the most important questions:

1. How many scenarios should be generated?
2. Which domains should be included?
3. Should playthroughs be generated now or only Scenario Cards?
4. What output format is preferred: JSONL, YAML, Markdown, or all?
5. Should the scenario bank target CLI, OpenCode, or all interaction surfaces?

Do not ask excessive questions if reasonable defaults are available.

Default assumptions:

```text
number of scenarios: 100
domains: 10–12 mixed domains
levels: 1–5
output: JSONL + Markdown summaries
playthroughs: 30 selected scenarios
interaction surfaces: CLI + OpenCode + MCP/API optional
```

## 13. Skill package structure recommendation

```text
mr-wolf-scenario-lab/
  SKILL.md
  agents/
    openai.yaml
  references/
    testing-approach.md
    scenario-card-schema.md
    playthrough-schema.md
    agent-execution-plan.md
    vocabularies.md
    examples.md
  scripts/
    validate_scenario_bank.py
    build_coverage_matrix.py
    extract_catalogs.py
```

Scripts are optional. If created, they should validate JSONL and generate coverage summaries.

## 14. Prompt to create the skill with skill-creator

Use the following prompt when asking ChatGPT/Superpowers to create the skill:

```text
Create a ChatGPT Skill named `mr-wolf-scenario-lab`.

Purpose:
The skill helps design and evaluate the Mr. Wolf agentic control plane concept through scenario-driven and artifact-driven analysis. It generates structured multi-domain Scenario Cards, runs compact User/Wolf/Observer playthroughs, simulates expert reviews, and extracts artifacts, components, policies, risks, configuration effort and concept implications.

Core workflows:
1. Generate Scenario Bank.
2. Validate Scenario Bank.
3. Run Scenario Playthroughs.
4. Produce Extraction Reports.
5. Aggregate findings into artifact catalog, component demand map, policy pattern catalog, configuration effort map, adapter demand map, failure mode catalog and concept implications.
6. Simulate expert roles: Architect, Developer/DX, Security/Governance, SRE/Ops, Product/UX, Integration, Domain Expert and Artifact Expert.

Inputs:
- User request specifying number of scenarios, domains, output format or target interaction surfaces.
- Optional existing Scenario Cards / JSONL files.
- Optional Mr. Wolf concept notes.

Outputs:
- Scenario Cards in JSONL/YAML/Markdown.
- Playthrough Records.
- Extraction Reports.
- Coverage matrices.
- Artifact catalogs.
- Component demand maps.
- Risk summaries.
- Expert review notes.

Important constraints:
- Keep Scenario Cards compact and schema-driven.
- Do not write long fictional dialogues.
- Use controlled vocabularies for domains, tags, scenario levels, configuration modes and artifact profiles.
- Always include `wolf_configuration`, artifacts, policies/gates, failure modes and analysis tags in Scenario Cards.
- Treat external skills, prompts, MCP tools and imported capabilities as untrusted by default.
- Clearly separate Scenario Card, Playthrough Record and Extraction Report.
- If subagents are available, delegate to role-based subagents; otherwise simulate roles sequentially.
- Do not create a roadmap unless explicitly asked.

Include reference files for:
- testing approach;
- Scenario Card schema;
- Playthrough schema;
- execution plan for agents;
- vocabularies;
- examples.

Add optional scripts if useful:
- validate_scenario_bank.py
- build_coverage_matrix.py
- extract_catalogs.py

Package the final skill as `skill.zip` after validation.
```

## 15. Expected first version of the skill

The first version should focus on instructions and reference files. Scripts can be added later if needed.

Minimum viable skill:

```text
SKILL.md
references/testing-approach.md
references/scenario-card-schema.md
references/playthrough-schema.md
references/agent-execution-plan.md
references/vocabularies.md
references/examples.md
```

Good first test:

```text
Generate 20 Scenario Cards across software_engineering, office_assistant, legal_ops and research. Then select 5 for playthrough and produce extraction reports.
```
