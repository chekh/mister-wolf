import { describe, it, expect } from 'vitest';
import { PolicyStepGuard } from '../../src/policy/step-guard.js';
import { PolicyRule } from '../../src/types/policy.js';
import { PolicyConfig } from '../../src/config/project-config.js';
import { StepDefinition } from '../../src/types/workflow.js';

function makeStep(partial: Partial<StepDefinition> = {}): StepDefinition {
  return {
    id: partial.id ?? 'step1',
    type: 'builtin',
    runner: partial.runner ?? 'echo',
    input: partial.input,
    output: partial.output,
    depends_on: partial.depends_on,
    timeout: partial.timeout,
    retry: partial.retry,
    when: partial.when,
    artifact: partial.artifact,
  };
}

function makeConfig(rules: PolicyRule[], maxRisk: PolicyConfig['defaults']['max_risk'] = 'high'): PolicyConfig {
  return {
    defaults: {
      enabled: true,
      autonomy: 'supervised',
      max_risk: maxRisk,
    },
    rules,
  };
}

describe('PolicyStepGuard', () => {
  const guard = new PolicyStepGuard();

  it('should allow step when rule allows', () => {
    const rule: PolicyRule = {
      id: 'r_allow',
      match: { runner: 'echo' },
      decision: 'allow',
      risk: 'low',
      reason: 'Echo is safe',
    };
    const step = makeStep({ runner: 'echo' });
    const config = makeConfig([rule]);

    const decision = guard.evaluate(step, config, 'wf1');

    expect(decision.decision).toBe('allow');
    expect(decision.risk).toBe('low');
    expect(decision.enforcement).toBe('step_runtime');
    expect(decision.subject.workflow_id).toBe('wf1');
    expect(decision.subject.step_id).toBe('step1');
    expect(decision.subject.runner).toBe('echo');
  });

  it('should deny step when rule denies', () => {
    const rule: PolicyRule = {
      id: 'r_deny',
      match: { runner: 'shell' },
      decision: 'deny',
      risk: 'high',
      reason: 'Shell is blocked',
    };
    const step = makeStep({ runner: 'shell' });
    const config = makeConfig([rule]);

    const decision = guard.evaluate(step, config, 'wf1');

    expect(decision.decision).toBe('deny');
    expect(decision.risk).toBe('high');
    expect(decision.reason).toBe('Shell is blocked');
    expect(decision.enforcement).toBe('step_runtime');
  });

  it('should ask step when rule asks', () => {
    const rule: PolicyRule = {
      id: 'r_ask',
      match: { step_id: 's1' },
      decision: 'ask',
      risk: 'medium',
      reason: 'Needs approval',
    };
    const step = makeStep({ id: 's1', runner: 'echo' });
    const config = makeConfig([rule]);

    const decision = guard.evaluate(step, config, 'wf2');

    expect(decision.decision).toBe('ask');
    expect(decision.risk).toBe('medium');
    expect(decision.reason).toBe('Needs approval');
    expect(decision.enforcement).toBe('step_runtime');
  });

  it('should default to allow when no rules match', () => {
    const step = makeStep({ runner: 'echo' });
    const config = makeConfig([]);

    const decision = guard.evaluate(step, config, 'wf3');

    expect(decision.decision).toBe('allow');
    expect(decision.risk).toBe('low');
    expect(decision.reason).toBe('No matching policy rule');
    expect(decision.matched_rules).toEqual([]);
    expect(decision.enforcement).toBe('step_runtime');
  });
});
