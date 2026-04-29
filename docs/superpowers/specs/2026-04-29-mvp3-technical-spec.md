# MVP3: Policy Engine — Technical Specification

**Date:** 2026-04-29  
**Status:** Draft → Ready for Implementation  
**Depends on:** MVP2 (Context Resolver)  
**Next:** MVP4 (Agent Registry)

---

## 1. Overview

MVP3 implements a deterministic, rule-based Policy Engine for Mr. Wolf. It governs workflow execution through two enforcement points: **workflow preflight** (before execution starts) and **step runtime guard** (before each step executes).

The Policy Engine is declarative: rules are defined in `wolf.yaml` and evaluated without LLM calls, external APIs, or probabilistic scoring. It reuses existing gate infrastructure for `ask` decisions.

---

## 2. Goals

- Prevent dangerous workflows from starting via preflight checks.
- Block or require approval for risky steps before runner execution.
- Provide deterministic, auditable policy decisions.
- Integrate seamlessly with existing gate system (`manual_gate` reuse).
- Support both sequential and graph execution modes.

---

## 3. Scope

### In Scope

| Feature | Description |
|---------|-------------|
| Workflow preflight | Static evaluation of all steps before execution; deny blocks workflow start |
| Step runtime guard | Dynamic evaluation of resolved step input before runner execution |
| Rule-based matching | Match by runner, command_contains, step_id, and other static attributes |
| Policy decisions | `allow`, `ask`, `deny` with deterministic precedence |
| Gate integration | `ask` creates policy approval gate using existing gate infrastructure |
| State persistence | Policy decisions stored in case state |
| Events | `policy.evaluated`, `.denied`, `.approval_required`, `.approved`, `.rejected` |
| CLI | `wolf policy check` with `--json` |
| Graph mode | Policy ask pauses workflow; running steps finish; resume after approval |

### Out of Scope

| Feature | Reason |
|---------|--------|
| LLM risk assessment | Non-deterministic; deferred |
| RBAC / identity | Out of MVP3 scope |
| External policy server | External dependency |
| OPA/Rego integration | Complex integration; future |
| Network sandboxing | Infrastructure concern |
| Model routing policy | Belongs to MVP5 |
| Per-user approvals | Requires identity layer |
| Policy learning / adaptation | Requires feedback loops |
| Runner-specific policy registry | Rules config covers this for MVP3 |
| `wolf policy explain` | Stretch goal; not required for MVP3 |

---

## 4. Architecture

### Component Diagram

```text
wolf policy check workflow.yaml
  │
  ├─► PolicyPreflight.evaluate(workflow, config)
  │     → PolicyReport { decisions, overall }
  │
  └─► CLI prints report / JSON

wolf run workflow.yaml
  │
  ├─► WorkflowEngine.execute()
  │     → PolicyPreflight.evaluate(workflow)
  │       → если deny → workflow не запускается
  │       → если ask → persist decisions, continue
  │
  └─► для каждого шага:
        PolicyStepGuard.evaluate(step, config)
          → allow → executeStep()
          → deny → StepResult.failure (PolicyViolation)
          → ask → create gate, pause
```

### Component Responsibilities

| Component | Responsibility |
|-----------|--------------|
| `PolicyConfig` | Parse and validate policy rules from `wolf.yaml` |
| `PolicyEngine` | Core rule evaluator: match step against rules, compute decision |
| `PolicyPreflight` | Static workflow evaluation before execution; persist decisions |
| `PolicyStepGuard` | Runtime step evaluation before runner; handle allow/ask/deny |
| `PolicyGateAdapter` | Create `policy_approval` gate using existing gate infrastructure |
| `PolicyEvents` | Emit policy lifecycle events |
| `PolicyCLI` | `wolf policy check` command |

---

## 5. Data Model

### PolicyDecision

```typescript
interface PolicyDecision {
  id: string;              // e.g. "policy_<workflow_id>_<step_id>_<rule_id>_<enforcement>"
  decision: 'allow' | 'ask' | 'deny';
  risk: 'low' | 'medium' | 'high' | 'critical';
  rule_id?: string;        // Primary matching rule
  reason: string;
  enforcement: 'workflow_preflight' | 'step_runtime';
  subject: {
    workflow_id: string;
    step_id?: string;
    runner?: string;
  };
  matched_rules: string[]; // All matching rule IDs
}
```

### PolicyReport

```typescript
interface PolicyReport {
  workflow_id: string;
  overall: 'allow' | 'ask' | 'deny';
  decisions: PolicyDecision[];
  steps_allowed: number;
  steps_ask: number;
  steps_denied: number;
}
```

### PolicyRule

```typescript
interface PolicyRule {
  id: string;
  match: {
    runner?: string;
    command_contains?: string[];
    step_id?: string;
    // Future: file patterns, domain, etc.
  };
  decision: 'allow' | 'ask' | 'deny';
  risk?: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
}
```

### PolicyConfig

```typescript
interface PolicyConfig {
  defaults: {
    enabled: boolean;
    autonomy: 'supervised' | 'autonomous';
    max_risk: 'low' | 'medium' | 'high' | 'critical';
  };
  rules: PolicyRule[];
}
```

---

## 6. Configuration

### wolf.yaml additions

```yaml
policy:
  defaults:
    enabled: true
    autonomy: supervised
    max_risk: high

  rules:
    - id: deny-dangerous-shell
      match:
        runner: shell
        command_contains:
          - "sudo"
          - "rm -rf"
      decision: deny
      risk: critical
      reason: "Dangerous shell command"

    - id: ask-shell-write
      match:
        runner: shell
        command_contains:
          - ">"
          - "mv "
          - "cp "
      decision: ask
      risk: high
      reason: "Shell command may modify files"

    - id: allow-echo
      match:
        runner: echo
      decision: allow
      risk: low
      reason: "Echo is safe"
```

### Match Semantics

- `runner`: exact match against `step.runner`
- `command_contains`: substring match against `step.input.command` (case-sensitive). If `step.input.command` is missing or not a string, rule does not match.
- `step_id`: exact match against `step.id`
- All conditions in `match` must be true (AND logic)
- If `match` is empty `{}`, rule matches everything (use with caution)

### Default Decision

If no rules match a step:

```typescript
{
  decision: 'allow',
  risk: 'low',
  reason: 'No matching policy rule',
  matched_rules: [],
}
```

---

## 7. Enforcement Points

### 7.1 Workflow Preflight

**When:** Before `WorkflowEngine.execute()` creates a case.

**Input:** Raw workflow definition (before runtime interpolation).

**Behavior:**
1. Evaluate `PolicyEngine` for each step with raw definition.
2. Compute `PolicyReport`:
   - `overall = deny` if any step is `deny`
   - `overall = ask` if no `deny` but at least one `ask`
   - `overall = allow` if all steps are `allow`
3. If `overall = deny`:
   - Reject workflow execution **before case creation**
   - CLI: exit code 1, print rejected steps
   - No case state created; no events persisted to case
4. If `overall = ask`:
   - Persist decisions in case state (when case is created)
   - Do **not** pause workflow
   - Emit `policy.evaluated` and `workflow.policy_preflight.completed`
   - Actual pause happens at step-level before risky step
5. If `overall = allow`:
   - Normal execution
   - Persist decisions for audit

**Note:** Preflight does **not** create gates. It is audit + early visibility only. Preflight deny prevents case creation entirely.

### 7.2 Step Runtime Guard

**When:** Immediately before `runner.run()` in `executeStep()`.

**Input:** Resolved step definition (after template interpolation).

**Behavior:**
1. Evaluate `PolicyEngine` for resolved step.
2. If `decision = allow`:
   - Execute step normally
3. If `decision = deny`:
   - Return `StepResult.failure` with `error.type: 'PolicyViolation'`
   - Emit `policy.denied`
   - Step status: `failure`
   - Workflow continues according to fail-fast rules
4. If `decision = ask`:
   - Create policy approval gate
   - Gate type: `policy_approval`
   - Gate payload: `{ decision, workflow_id, step_id, runner, resolved_input }`
   - Step status: `gated`
   - Workflow status: `paused`
   - Emit `policy.approval_required`
   - Running steps allowed to finish (graph mode)
   - No new steps started

---

## 8. Rule Precedence

When multiple rules match a step:

1. **Decision precedence:** `deny` > `ask` > `allow`
2. **Risk precedence:** `critical` > `high` > `medium` > `low`
3. **Tie-breaker:** First matching rule in config order wins for `rule_id` and `reason`
4. **`matched_rules`:** Contains IDs of **all** matching rules

### max_risk Enforcement

After computing the primary decision from rules:
- If evaluated risk exceeds `policy.defaults.max_risk`:
  - `allow` is upgraded to `ask`
  - `ask` remains `ask`
  - `deny` remains `deny`
- If `autonomy = autonomous` and risk <= `max_risk`, explicit rule decision is preserved
- Explicit `deny` always takes precedence over `max_risk`

Example:
```yaml
rules:
  - id: rule-a  # matches, decision: ask
  - id: rule-b  # matches, decision: deny
```

Result: `decision: deny`, `rule_id: 'rule-b'`, `matched_rules: ['rule-a', 'rule-b']`

---

## 9. Gate Integration

### Policy Approval Gate

Reuse existing gate infrastructure:

- Gate created via `GateStore.createGate(case_id, step_id, gate_type, payload)`
- Gate type: `policy_approval`
- Payload:
  ```typescript
  {
    type: 'policy_approval',
    decision: PolicyDecision,
    workflow_id: string,
    step_id: string,
    runner: string,
    resolved_input: unknown,
  }
  ```

### Approval Flow

1. User runs `wolf approve <gate_id>`
2. Gate status → `approved`
3. System emits `policy.approved` event
4. User runs `wolf resume <case_id>`
5. Step re-evaluates policy (should still be `ask`)
6. If approved, step executes with **snapshotted** `resolved_input` from gate payload
7. If rejected, step fails with `PolicyViolation`

### Rejection Flow

1. User runs `wolf reject <gate_id>`
2. Gate status → `rejected`
3. System emits `policy.rejected` event
4. Step fails with `error.type: 'PolicyViolation'`
5. Workflow continues according to fail-fast rules

---

## 10. Events

| Event | When | Payload |
|-------|------|---------|
| `policy.evaluated` | After any policy evaluation | `{ decision_id, decision, rule_id, reason }` |
| `policy.denied` | When decision = deny | `{ decision_id, decision, rule_id, reason, step_id }` |
| `policy.approval_required` | When decision = ask | `{ decision_id, gate_id, step_id }` |
| `policy.approved` | When policy gate approved | `{ decision_id, gate_id, step_id }` |
| `policy.rejected` | When policy gate rejected | `{ decision_id, gate_id, step_id }` |
| `workflow.policy_preflight.completed` | After preflight evaluation | `{ workflow_id, overall, decisions_count }` |

---

## 11. CLI Commands

### Required

```bash
# Check workflow policy before running
wolf policy check workflow.yaml

# Output as JSON
wolf policy check workflow.yaml --json
```

### Optional (Stretch)

```bash
# Explain policy decision for specific step
wolf policy explain workflow.yaml --step <step_id>
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Policy check passed (allow or ask) |
| 1 | Policy check failed (deny) or error |

---

## 12. Graph Mode Behavior

### Policy Ask in Graph Mode

When a step evaluates to `ask` during graph execution:

1. Step is gated; workflow status → `paused`
2. Already running steps are allowed to finish
3. No new steps start while any policy approval is pending
4. On `wolf resume`:
   - Recompute graph readiness
   - For steps with an **approved** `policy_approval` gate for the same logical decision: bypass re-evaluation, execute using snapshotted `resolved_input` from gate payload
   - For new steps: normal policy evaluation
   - Denied steps fail; downstream dependents skipped (existing graph fail-fast)

**Resume Gate Bypass:**
When `runGraph()` or `runSteps()` encounters a step whose status is `gated`:
1. Check if a `policy_approval` gate exists for this step
2. If gate status is `approved` → execute step directly using `gate.payload.resolved_input`
3. If gate status is `rejected` → mark step as failed
4. Do **not** create a new policy gate on resume

### Policy Deny in Graph Mode

When a step evaluates to `deny`:

1. Step fails with `PolicyViolation`
2. Workflow status → `failed`
3. Running steps finish
4. No new steps start
5. Downstream dependents skipped according to existing `getTransitiveDependents` logic

---

## 13. State Persistence

Policy decisions stored in case state:

```typescript
interface ExecutionState {
  // ... existing fields ...
  policy_decisions?: PolicyDecision[];
}
```

- Preflight decisions added when case is created
- Step runtime decisions appended as they occur
- Gate payload includes snapshot of `resolved_input`
- Deduplicate by `decision.id + enforcement + step_id` to avoid duplicate entries on retries
- Keep `policy.evaluated` event payload compact (omit full step content, include only decision_id, rule_id, decision, reason)

---

## 14. Acceptance Criteria

### Functional

- [ ] `wolf policy check` evaluates workflow and prints report.
- [ ] `wolf policy check --json` outputs valid JSON.
- [ ] Preflight `deny` prevents workflow from starting; no case state created.
- [ ] Preflight `ask` persists decisions but does not pause.
- [ ] Default decision (no matching rule) is `allow` / `low` risk.
- [ ] `max_risk` enforcement upgrades `allow` → `ask` when risk exceeds threshold.
- [ ] Step guard `deny` fails step with `PolicyViolation`.
- [ ] Step guard `ask` creates policy approval gate.
- [ ] Approving policy gate allows step execution.
- [ ] Rejecting policy gate fails step.
- [ ] Gate payload includes `resolved_input` snapshot.
- [ ] Policy decisions persisted in case state.
- [ ] Resume after policy approval bypasses re-evaluation using approved gate payload.
- [ ] Resume does not create duplicate policy gates.

### Rule Matching

- [ ] Rules match by runner, command_contains, step_id.
- [ ] Multiple matching rules use correct precedence (deny > ask > allow).
- [ ] `matched_rules` contains all matching rule IDs.

### Graph Mode

- [ ] Graph mode: ask pauses workflow, running steps finish.
- [ ] Graph mode: resume recomputes readiness after approval.
- [ ] Graph mode: deny triggers existing fail-fast and transitive skip.

### Events

- [ ] All policy events emitted correctly.
- [ ] Events include decision_id, rule_id, reason.

### Tests

- [ ] Unit tests for PolicyEngine (matching, precedence).
- [ ] Unit tests for PolicyPreflight (allow, ask, deny).
- [ ] Unit tests for PolicyStepGuard (allow, ask, deny).
- [ ] Integration tests for CLI (`wolf policy check`).
- [ ] Integration tests for gate approval/rejection.
- [ ] Graph mode policy tests.
- [ ] All tests pass in Docker.

---

## 15. Implementation Plan

| PR | Focus | Components |
|----|-------|------------|
| **PR1** | Config, Schema, Types | PolicyConfig schema, PolicyDecision/PolicyRule/PolicyReport types, Zod schemas |
| **PR2** | Policy Engine Core | PolicyEngine (rule matching, precedence, evaluation), unit tests |
| **PR3** | Preflight + Step Guard | PolicyPreflight, PolicyStepGuard, integration with WorkflowEngine, events |
| **PR4** | Gate Integration | PolicyGateAdapter, gate payload, approve/reject flow, resume |
| **PR5** | CLI, Events, Tests, Docs | `wolf policy check`, event emission, integration tests, README/docs |

---

## 16. Notes

- Policy Engine is **declarative governance**, not runtime sandboxing.
- ShellRunner may still have its own safety checks; Policy Engine adds a higher declarative layer.
- Policy rules are evaluated synchronously; no async I/O.
- Future versions may add: RBAC, external policy servers, LLM risk assessment, OPA/Rego.
