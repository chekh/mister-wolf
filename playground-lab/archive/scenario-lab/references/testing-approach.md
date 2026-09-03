# Mr. Wolf Scenario Lab — Testing Approach

## 1. Purpose

Formalized methodology for testing and evolving the Mr. Wolf concept through scenario banks and playthroughs. Goal: validate the concept before implementation by discovering system behavior, required artifacts, subsystem boundaries, risks, dependencies, configuration complexity, and practical value.

Two foundations:
1. **Behavior modeling** — how users interact with Mr. Wolf, what they see, where they clarify, confirm, or get denied.
2. **Artifact modeling** — what input, intermediate, and output objects the system or its parts create.

Formula:
```
Scenario → behavior play → artifacts → subsystems → risks → concept refinements
```

## 2. What is Tested

- Can users work with a single Mr. Wolf facade without manually choosing agents, models, skills, and tools?
- What behavior modes are needed: simple answer, plan, clarification, refusal, gate, workflow, external capability?
- What artifacts actually arise across domains?
- Where is explicit configuration needed vs. dynamic persona, memory, or LLM-assisted selection?
- What subsystems only appear in complex scenarios and are unnecessary in simple ones?
- What risks, gates, policies, and trust boundaries are mandatory?
- Where does overengineering appear?
- What does the first useful product look like?

## 3. Testing Model

### Phase A. Scenario Authoring

Expert group creates compact Scenario Cards:
```
domain
domain mode
methodology
artifact profile
user input
expected Wolf behavior
Wolf configuration
artifacts
capabilities
policies/gates
failure modes
analysis tags
```

### Phase B. Scenario Playthrough

Scenario is played as a role simulation:
```
User Simulator → Wolf Simulator → Observer/Critic
```

After the game, a structured Extraction Report is created:
```
what the scenario showed
what subsystems are needed
what artifacts appeared
where UX breaks
where policy/safety is weak
what needs clarification in the concept
```

## 4. Progressive Complexity Principle

Scenarios must vary in complexity. The bank is built as a ladder.

### Level 1 — Simple answer
Wolf answers without workflow/tools.
- explain a project
- brief answer from known context
- high-level recommendation

### Level 2 — Context-aware answer
Wolf reads context but makes no side effects.
- repository overview
- document analysis
- meeting notes summary

### Level 3 — Plan / dry-run
Wolf builds a plan and artifacts but does not act.
- branch stabilization plan
- legal review plan
- release preparation plan

### Level 4 — Governed action
Wolf uses tools and gates.
- run checks
- modify files after approval
- create draft email
- prepare PR

### Level 5 — Multi-capability / external
Wolf uses MCP, imported skill, wrapper, memory, A2A, domain pack conflict.
- GitHub MCP + policy + PR creation
- imported OpenClaw skill
- external legal A2A expert
- memory conflict with old ADR

## 5. Scenario Dimensions

Each domain can have different execution modes. Scenario Cards must capture not just domain but additional dimensions.

### Primary Axes
```
Domain
  software_engineering, legal_ops, office, finance, research, etc.

Domain Mode
  prototype, production, enterprise, regulated, personal, emergency, legacy_maintenance.

Methodology
  rapid_prototyping, spec_driven, adr_first, tdd, checklist_based, expert_review.

Artifact Profile
  minimal, spec_based, adr_adl, audit_heavy, compliance_heavy, visual_diagram_heavy.

Execution Complexity
  Level 1–5.

Governance Level
  autonomous, supervised, gated, expert_reviewed.

Configuration Mode
  zero_config, generated_config, explicit_config, domain_pack, dynamic_persona, memory_adapted, llm_assisted_selection.
```

## 6. Roles in Scenario Lab

### Product/UX Expert
- Realism of user request
- Clarity of Wolf behavior
- Time to First Useful Output
- Absence of unnecessary complexity

### Domain Expert
- Domain plausibility
- Correctness of artifacts
- Required gates and constraints

### Architect
- What subsystems are really needed
- Boundaries between Facade, Router, Assembler, Capability Registry, Policy, Memory
- No responsibility mixing

### Security/Governance Expert
- Hard-deny
- Policy bypass
- Trust imported capabilities
- External action approvals
- PII/secrets

### SRE/Operations Expert
- Latency
- Failure modes
- Observability
- Recoverability
- Runaway workflows

### Integration Expert
- OpenCode/VSCode/OpenClaw/MCP integration
- Adapter boundaries
- Wrappers
- External skill/tool import

### Artifact Expert
- What is a first-class artifact
- Which artifacts to save
- Which artifacts to show the user
- Which artifacts to use as memory/source

## 7. Extracted Catalogs

### Artifact Catalog
Recurring artifacts by domain:
```
ExecutionPlan, ReviewReport, ADR, ADL, RiskRegister,
MeetingBrief, EmailDraft, PRDescription, MemoryBundle, PolicyDecision
```

### Component Demand Map
Subsystems actually required often:
```
Wolf Facade, Scenario Router, Runtime Assembler, Policy Core,
Capability Registry, Tool Registry, MemoryBundle, Artifact Store, Adapter Layer
```

### Policy Pattern Catalog
Typical rules:
```
read-only allowed, draft allowed, external send asks,
file write asks, dangerous shell denied,
legal advice requires expert gate, financial action requires approval
```

### Configuration Effort Map
Scenarios requiring:
```
zero_config, generated_config, light_project_config,
domain_pack, custom_workflow, custom_plugin
```

### Failure Mode Catalog
Typical failures:
```
wrong scenario, missing context, missing tool permission,
policy conflict, memory conflict, external tool unavailable,
ambiguous user intent, stale domain pack
```

### First Useful Product Candidates
Scenarios delivering maximum value with minimum implementation.

## 8. Anti-Overengineering Checks

For each scenario and each new subsystem, ask:
```
Can the scenario be solved without this subsystem?
Can this be replaced with one workflow?
Can this be deferred to plugin/domain pack?
Is this needed for first useful product?
Does this create a new DSL?
Does this increase configuration burden?
Can this be explained to the user in 2 sentences?
```
If the answer indicates unnecessary complexity — mark subsystem as deferred or optional.

## 9. Failure-Mode Checks

For each scenario, record:
```
What if Router is wrong?
What if Assembler picks too heavy a plan?
What if policy conflict?
What if tool unavailable?
What if external skill is malicious/untrusted?
What if memory is stale?
What if user doesn't understand gate?
What if LLM suggests unsafe action?
```

For each failure mode, specify:
```
detection, mitigation, visible explanation, trace entry, concept implication
```

## 10. Scenario Bank Quality Criteria

A bank is useful if it:
- Contains ≥100 Scenario Cards
- Covers ≥10 domains
- Has Levels 1–4 in every domain
- ≥20% use external capabilities
- ≥20% have explicit policy/gate
- ≥20% create domain-specific artifacts
- ≥10% include memory-related behavior
- Every scenario has controlled tags
- Every scenario has configuration mode
- Every scenario has artifact list
- Every scenario has failure modes
- Every playthrough has an Extraction Report

## 11. Scenario Lab Outputs

```
scenario-bank/scenarios.jsonl
scenario-bank/scenario-schema.json
scenario-bank/tags.yaml
scenario-bank/domain-taxonomy.yaml
scenario-bank/playthroughs.jsonl
scenario-bank/extraction-reports.jsonl
scenario-bank/coverage-matrix.md
scenario-bank/artifact-catalog.md
scenario-bank/component-demand-map.md
scenario-bank/risk-summary.md
scenario-bank/concept-implications.md
```
