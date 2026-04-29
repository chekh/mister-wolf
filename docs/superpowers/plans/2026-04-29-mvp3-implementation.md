# MVP3: Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic, rule-based Policy Engine with workflow preflight and step runtime guard.

**Architecture:** PolicyConfig → PolicyEngine (rule matching + precedence) → PolicyPreflight (static workflow check) + PolicyStepGuard (runtime step check) → PolicyGateAdapter (existing gate reuse) → Events + CLI.

**Tech Stack:** TypeScript, Zod, Commander.js, Vitest

---

## File Structure

**New files:**
- `src/types/policy.ts` — PolicyDecision, PolicyRule, PolicyReport, etc.
- `src/policy/config.ts` — PolicyConfig schema and loader
- `src/policy/engine.ts` — PolicyEngine (rule matching, precedence, max_risk)
- `src/policy/preflight.ts` — PolicyPreflight
- `src/policy/step-guard.ts` — PolicyStepGuard
- `src/policy/gate-adapter.ts` — PolicyGateAdapter
- `src/policy/events.ts` — Policy event helpers
- `src/cli/commands/policy.ts` — CLI commands
- `tests/unit/policy-engine.test.ts`
- `tests/unit/policy-preflight.test.ts`
- `tests/unit/policy-step-guard.test.ts`
- `tests/integration/policy-cli.test.ts`

**Modified files:**
- `src/config/project-config.ts` — add policy config schema
- `src/workflow/engine.ts` — integrate preflight + step guard
- `src/cli/index.ts` — register policy command
- `src/types/state.ts` — add policy_decisions to ExecutionState
- `README.md`, `docs/development.md` — document policy commands

---

## PR1: Config, Schema, Types

### Task 1.1: Add Policy Types

**Files:**
- Create: `src/types/policy.ts`

- [ ] **Step 1: Write policy types**

```typescript
import { z } from 'zod';

export const PolicyRuleSchema = z.object({
  id: z.string(),
  match: z.object({
    runner: z.string().optional(),
    command_contains: z.array(z.string()).optional(),
    step_id: z.string().optional(),
  }).default({}),
  decision: z.enum(['allow', 'ask', 'deny']),
  risk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  reason: z.string(),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyDecisionSchema = z.object({
  id: z.string(),
  decision: z.enum(['allow', 'ask', 'deny']),
  risk: z.enum(['low', 'medium', 'high', 'critical']),
  rule_id: z.string().optional(),
  reason: z.string(),
  enforcement: z.enum(['workflow_preflight', 'step_runtime']),
  subject: z.object({
    workflow_id: z.string(),
    step_id: z.string().optional(),
    runner: z.string().optional(),
  }),
  matched_rules: z.array(z.string()),
});

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const PolicyReportSchema = z.object({
  workflow_id: z.string(),
  overall: z.enum(['allow', 'ask', 'deny']),
  decisions: z.array(PolicyDecisionSchema),
  steps_allowed: z.number(),
  steps_ask: z.number(),
  steps_denied: z.number(),
});

export type PolicyReport = z.infer<typeof PolicyReportSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/types/policy.ts
git commit -m "feat(policy): add PolicyDecision, PolicyRule, PolicyReport types"
```

### Task 1.2: Update Config Schema

**Files:**
- Modify: `src/config/project-config.ts`
- Modify: `src/types/state.ts`

- [ ] **Step 1: Add policy config schema**

```typescript
export const PolicyConfigSchema = z.object({
  defaults: z.object({
    enabled: z.boolean().default(true),
    autonomy: z.enum(['supervised', 'autonomous']).default('supervised'),
    max_risk: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  }).default({}),
  rules: z.array(PolicyRuleSchema).default([]),
});

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
```

Add `policy: PolicyConfigSchema.default({})` to `ProjectConfigSchema`.

- [ ] **Step 2: Add policy_decisions to ExecutionState**

```typescript
// In src/types/state.ts, add to ExecutionStateSchema:
policy_decisions: z.array(PolicyDecisionSchema).optional(),
```

- [ ] **Step 3: Commit**

```bash
git add src/config/project-config.ts src/types/state.ts
git commit -m "feat(policy): add policy config schema and state field"
```

---

## PR2: Policy Engine Core

### Task 2.1: Implement PolicyEngine

**Files:**
- Create: `src/policy/engine.ts`

- [ ] **Step 1: Write engine**

```typescript
import { PolicyRule, PolicyDecision, PolicyConfig } from '../types/policy.js';
import { StepDefinition } from '../types/workflow.js';

export class PolicyEngine {
  evaluate(
    step: StepDefinition,
    config: PolicyConfig,
    workflowId: string,
    enforcement: 'workflow_preflight' | 'step_runtime',
  ): PolicyDecision {
    const matchedRules: PolicyRule[] = [];

    for (const rule of config.rules) {
      if (this.matches(rule, step)) {
        matchedRules.push(rule);
      }
    }

    // Default decision
    let decision: PolicyDecision['decision'] = 'allow';
    let risk: PolicyDecision['risk'] = 'low';
    let primaryRuleId: string | undefined;
    let reason = 'No matching policy rule';

    if (matchedRules.length > 0) {
      // Determine primary decision by precedence
      const primary = this.selectPrimary(matchedRules);
      decision = primary.decision;
      risk = primary.risk || 'low';
      primaryRuleId = primary.id;
      reason = primary.reason;
    }

    // max_risk enforcement
    const maxRisk = config.defaults.max_risk;
    if (this.riskLevel(risk) > this.riskLevel(maxRisk) && decision === 'allow') {
      decision = 'ask';
    }

    const decisionId = `policy_${workflowId}_${step.id}_${primaryRuleId || 'default'}_${enforcement}`;

    return {
      id: decisionId,
      decision,
      risk,
      rule_id: primaryRuleId,
      reason,
      enforcement,
      subject: {
        workflow_id: workflowId,
        step_id: step.id,
        runner: step.runner,
      },
      matched_rules: matchedRules.map(r => r.id),
    };
  }

  private matches(rule: PolicyRule, step: StepDefinition): boolean {
    if (rule.match.runner && rule.match.runner !== step.runner) return false;
    if (rule.match.step_id && rule.match.step_id !== step.id) return false;
    if (rule.match.command_contains && rule.match.command_contains.length > 0) {
      const command = String(step.input?.command || '');
      if (!rule.match.command_contains.some(pattern => command.includes(pattern))) {
        return false;
      }
    }
    return true;
  }

  private selectPrimary(rules: PolicyRule[]): PolicyRule {
    // Precedence: deny > ask > allow
    const precedence = { deny: 3, ask: 2, allow: 1 };
    const riskPrecedence = { critical: 4, high: 3, medium: 2, low: 1 };

    return rules.reduce((best, current) => {
      const bestPrec = precedence[best.decision];
      const currPrec = precedence[current.decision];
      if (currPrec > bestPrec) return current;
      if (currPrec < bestPrec) return best;

      const bestRisk = riskPrecedence[best.risk || 'low'];
      const currRisk = riskPrecedence[current.risk || 'low'];
      if (currRisk > bestRisk) return current;
      return best;
    });
  }

  private riskLevel(risk: string): number {
    const levels = { low: 1, medium: 2, high: 3, critical: 4 };
    return levels[risk as keyof typeof levels] || 1;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/policy/engine.ts
git commit -m "feat(policy): implement PolicyEngine with rule matching, precedence, and max_risk"
```

### Task 2.2: Write Engine Tests

**Files:**
- Create: `tests/unit/policy-engine.test.ts`

- [ ] **Step 1: Write tests**

Tests for:
1. Allow rule matches
2. Deny rule matches
3. Ask rule matches
4. Multiple rules: deny wins
5. Multiple rules: ask wins over allow
6. max_risk upgrades allow to ask
7. Default decision when no rule matches
8. command_contains matching
9. Runner matching

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/policy-engine.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/policy-engine.test.ts
git commit -m "test(policy): add PolicyEngine unit tests"
```

---

## PR3: Preflight + Step Guard

### Task 3.1: Implement PolicyPreflight

**Files:**
- Create: `src/policy/preflight.ts`

- [ ] **Step 1: Write preflight**

```typescript
import { WorkflowDefinition } from '../types/workflow.js';
import { PolicyConfig, PolicyReport } from '../types/policy.js';
import { PolicyEngine } from './engine.js';

export class PolicyPreflight {
  private engine = new PolicyEngine();

  evaluate(workflow: WorkflowDefinition, config: PolicyConfig): PolicyReport {
    const decisions = workflow.steps.map(step =>
      this.engine.evaluate(step, config, workflow.id, 'workflow_preflight')
    );

    const hasDeny = decisions.some(d => d.decision === 'deny');
    const hasAsk = decisions.some(d => d.decision === 'ask');

    const overall: PolicyReport['overall'] = hasDeny ? 'deny' : hasAsk ? 'ask' : 'allow';

    return {
      workflow_id: workflow.id,
      overall,
      decisions,
      steps_allowed: decisions.filter(d => d.decision === 'allow').length,
      steps_ask: decisions.filter(d => d.decision === 'ask').length,
      steps_denied: decisions.filter(d => d.decision === 'deny').length,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/policy/preflight.ts
git commit -m "feat(policy): implement PolicyPreflight"
```

### Task 3.2: Implement PolicyStepGuard

**Files:**
- Create: `src/policy/step-guard.ts`

- [ ] **Step 1: Write step guard**

```typescript
import { StepDefinition } from '../types/workflow.js';
import { PolicyConfig, PolicyDecision } from '../types/policy.js';
import { PolicyEngine } from './engine.js';

export class PolicyStepGuard {
  private engine = new PolicyEngine();

  evaluate(step: StepDefinition, config: PolicyConfig, workflowId: string): PolicyDecision {
    return this.engine.evaluate(step, config, workflowId, 'step_runtime');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/policy/step-guard.ts
git commit -m "feat(policy): implement PolicyStepGuard"
```

### Task 3.3: Integrate with WorkflowEngine

**Files:**
- Modify: `src/workflow/engine.ts`

- [ ] **Step 1: Add preflight to execute()**

Before creating case, check policy:

```typescript
import { PolicyPreflight } from '../policy/preflight.js';
import { PolicyStepGuard } from '../policy/step-guard.js';

// In execute():
const preflight = new PolicyPreflight();
const policyReport = preflight.evaluate(workflow, this.config.policy);

if (policyReport.overall === 'deny') {
  // Emit event and reject
  await this.emitEvent({
    type: 'policy.denied',
    case_id: '',
    workflow_id: workflow.id,
    payload: { reason: 'Workflow denied by policy', decisions: policyReport.decisions.filter(d => d.decision === 'deny') },
  });
  throw new Error(`Workflow denied by policy: ${workflow.id}`);
}
```

- [ ] **Step 2: Add step guard to executeStep()**

Before runner execution:

```typescript
const guard = new PolicyStepGuard();
const decision = guard.evaluate(step, this.config.policy, state.workflow_id);

if (decision.decision === 'deny') {
  state.policy_decisions = [...(state.policy_decisions || []), decision];
  return {
    status: 'failure',
    error: {
      type: 'PolicyViolation',
      message: decision.reason,
      retryable: false,
    },
  };
}

if (decision.decision === 'ask') {
  // Create policy gate
  state.policy_decisions = [...(state.policy_decisions || []), decision];
  // ... gate creation logic (see PR4)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/workflow/engine.ts
git commit -m "feat(policy): integrate PolicyPreflight and PolicyStepGuard into WorkflowEngine"
```

### Task 3.4: Write Preflight + Guard Tests

**Files:**
- Create: `tests/unit/policy-preflight.test.ts`
- Create: `tests/unit/policy-step-guard.test.ts`

- [ ] **Step 1: Write tests**

Tests for preflight:
1. Allow workflow
2. Deny workflow
3. Ask workflow

Tests for step guard:
1. Allow step
2. Deny step
3. Ask step

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/policy-preflight.test.ts tests/unit/policy-step-guard.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/unit/policy-preflight.test.ts tests/unit/policy-step-guard.test.ts
git commit -m "test(policy): add preflight and step guard tests"
```

---

## PR4: Gate Integration

### Task 4.1: Implement PolicyGateAdapter

**Files:**
- Create: `src/policy/gate-adapter.ts`
- Modify: `src/workflow/engine.ts`

- [ ] **Step 1: Write gate adapter**

```typescript
import { PolicyDecision } from '../types/policy.js';
import { GateStore } from '../state/gate-store.js';

export class PolicyGateAdapter {
  constructor(private gateStore: GateStore) {}

  createPolicyGate(caseId: string, stepId: string, decision: PolicyDecision, resolvedInput: unknown): string {
    const gateId = this.gateStore.createGate(caseId, stepId, 'policy_approval', {
      decision,
      workflow_id: decision.subject.workflow_id,
      step_id: stepId,
      runner: decision.subject.runner,
      resolved_input: resolvedInput,
    });
    return gateId;
  }

  isPolicyGateApproved(caseId: string, stepId: string): boolean {
    const gate = this.gateStore.getGate(caseId, stepId);
    return gate?.status === 'approved' && gate?.type === 'policy_approval';
  }
}
```

- [ ] **Step 2: Modify GateStore to support gate type and payload**

If not already supported, extend `GateStore.createGate()` to accept optional `type` and `payload`.

- [ ] **Step 3: Update engine.ts for gate creation and resume bypass**

In `executeStep()`:
- If `ask` → create policy gate and return gated result
- On resume → check if policy gate exists and is approved; if so, bypass re-evaluation

- [ ] **Step 4: Commit**

```bash
git add src/policy/gate-adapter.ts src/state/gate-store.ts src/workflow/engine.ts
git commit -m "feat(policy): implement PolicyGateAdapter with resume bypass"
```

### Task 4.2: Write Gate Integration Tests

**Files:**
- Create: `tests/unit/policy-gate.test.ts`

- [ ] **Step 1: Write tests**

Tests for:
1. Create policy gate
2. Approve policy gate allows execution
3. Reject policy gate fails step
4. Resume bypasses re-evaluation

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/policy-gate.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/unit/policy-gate.test.ts
git commit -m "test(policy): add gate integration tests"
```

---

## PR5: CLI, Events, Tests, Docs

### Task 5.1: Create CLI Commands

**Files:**
- Create: `src/cli/commands/policy.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Write CLI**

```typescript
import { Command, Option } from 'commander';
import { PolicyPreflight } from '../../policy/preflight.js';
import { loadProjectConfig } from '../../config/loader.js';

export function createPolicyCommand(): Command {
  const policy = new Command('policy')
    .description('Manage workflow policies');

  policy
    .command('check')
    .description('Check workflow policy before running')
    .argument('<workflow.yaml>', 'Workflow file to check')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (workflowPath: string, options: { json?: boolean }) => {
      const cwd = process.cwd();
      const config = loadProjectConfig(cwd);
      const preflight = new PolicyPreflight();

      // Load workflow
      const workflow = loadWorkflow(workflowPath);
      const report = preflight.evaluate(workflow, config.policy);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`Policy check: ${report.overall.toUpperCase()}`);
        console.log(`  Allowed: ${report.steps_allowed}`);
        console.log(`  Ask: ${report.steps_ask}`);
        console.log(`  Denied: ${report.steps_denied}`);
        for (const d of report.decisions) {
          console.log(`  [${d.decision.toUpperCase()}] ${d.subject.step_id}: ${d.reason}`);
        }
      }

      if (report.overall === 'deny') {
        process.exit(1);
      }
    });

  return policy;
}
```

- [ ] **Step 2: Register in CLI**

```typescript
import { createPolicyCommand } from './commands/policy.js';
program.addCommand(createPolicyCommand());
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/policy.ts src/cli/index.ts
git commit -m "feat(policy): add wolf policy check CLI command"
```

### Task 5.2: Write Integration Tests

**Files:**
- Create: `tests/integration/policy-cli.test.ts`

- [ ] **Step 1: Write tests**

Tests for:
1. `wolf policy check` allows workflow
2. `wolf policy check` denies workflow
3. `wolf policy check --json` outputs JSON
4. Policy deny prevents `wolf run`
5. Policy ask creates gate on `wolf run`
6. Approve policy gate allows step execution
7. Reject policy gate fails step

- [ ] **Step 2: Run tests**

```bash
npm run build
npx vitest run tests/integration/policy-cli.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/policy-cli.test.ts
git commit -m "test(policy): add CLI integration tests"
```

### Task 5.3: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/development.md`

- [ ] **Step 1: Update README**

Add `wolf policy check` to CLI Reference. Update MVP3 status to "In Progress" or keep as planned depending on final state.

- [ ] **Step 2: Update docs/development.md**

Add Policy Engine section with commands, configuration example, and behavior.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/development.md
git commit -m "docs: document wolf policy check commands"
```

### Task 5.4: Final Acceptance

- [ ] **Step 1: Run full test suite**

```bash
npm run check
```

- [ ] **Step 2: Run Docker tests**

```bash
docker build --target test -t mister-wolf:test .
docker run --rm mister-wolf:test
```

- [ ] **Step 3: Commit acceptance**

```bash
git commit --allow-empty -m "acceptance: MVP3 Policy Engine complete"
```

---

## Plan Self-Review

### Spec Coverage

| Spec Section | Plan Task | Status |
|-------------|-----------|--------|
| Policy types | PR1 | ✅ |
| Policy config | PR1 | ✅ |
| PolicyEngine (matching, precedence, max_risk) | PR2 | ✅ |
| PolicyPreflight | PR3a | ✅ |
| PolicyStepGuard | PR3b | ✅ |
| Gate integration (create, approve, reject, resume bypass) | PR4 | ✅ |
| Events | PR3-4 | ✅ |
| CLI (`wolf policy check`) | PR5 | ✅ |
| Tests (unit + integration) | PR2-5 | ✅ |
| Documentation | PR5 | ✅ |

### Placeholder Scan

No TBD/TODO placeholders. All steps contain code or explicit instructions.

### Key Implementation Notes

1. **Preflight deny before case creation:** implemented in `execute()` before `createCase()`
2. **Default decision:** `allow` / `low` when no rule matches
3. **max_risk:** upgrades `allow` → `ask` when risk exceeds threshold
4. **Resume bypass:** check approved gate before re-evaluation
5. **Deduplication:** dedup policy_decisions by `id + enforcement + step_id`

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-mvp3-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per PR/task, review between tasks

**2. Inline Execution** — Execute tasks in this session using executing-plans

**Which approach?**
