import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/policy/engine.js';
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

describe('PolicyEngine', () => {
  const engine = new PolicyEngine();

  it('should return allow for matching allow rule', () => {
    const rule: PolicyRule = {
      id: 'rule_allow_echo',
      match: { runner: 'echo' },
      decision: 'allow',
      risk: 'low',
      reason: 'Echo is safe',
    };
    const step = makeStep({ runner: 'echo' });
    const config = makeConfig([rule]);

    const decision = engine.evaluate(step, config, 'wf1', 'workflow_preflight');

    expect(decision.decision).toBe('allow');
    expect(decision.risk).toBe('low');
    expect(decision.rule_id).toBe('rule_allow_echo');
    expect(decision.reason).toBe('Echo is safe');
    expect(decision.matched_rules).toEqual(['rule_allow_echo']);
    expect(decision.subject.workflow_id).toBe('wf1');
    expect(decision.subject.step_id).toBe('step1');
    expect(decision.subject.runner).toBe('echo');
  });

  it('should return deny for matching deny rule', () => {
    const rule: PolicyRule = {
      id: 'rule_deny_shell',
      match: { runner: 'shell' },
      decision: 'deny',
      risk: 'high',
      reason: 'Shell is blocked',
    };
    const step = makeStep({ runner: 'shell' });
    const config = makeConfig([rule]);

    const decision = engine.evaluate(step, config, 'wf1', 'step_runtime');

    expect(decision.decision).toBe('deny');
    expect(decision.risk).toBe('high');
    expect(decision.rule_id).toBe('rule_deny_shell');
    expect(decision.matched_rules).toEqual(['rule_deny_shell']);
  });

  it('should return ask for matching ask rule', () => {
    const rule: PolicyRule = {
      id: 'rule_ask_s1',
      match: { step_id: 's1' },
      decision: 'ask',
      risk: 'medium',
      reason: 'Needs approval',
    };
    const step = makeStep({ id: 's1', runner: 'echo' });
    const config = makeConfig([rule]);

    const decision = engine.evaluate(step, config, 'wf2', 'step_runtime');

    expect(decision.decision).toBe('ask');
    expect(decision.risk).toBe('medium');
    expect(decision.rule_id).toBe('rule_ask_s1');
    expect(decision.matched_rules).toEqual(['rule_ask_s1']);
  });

  it('should let deny win over ask and allow', () => {
    const rules: PolicyRule[] = [
      { id: 'r1', match: { runner: 'echo' }, decision: 'allow', risk: 'low', reason: 'allow' },
      { id: 'r2', match: { step_id: 's1' }, decision: 'ask', risk: 'medium', reason: 'ask' },
      { id: 'r3', match: { runner: 'echo' }, decision: 'deny', risk: 'low', reason: 'deny' },
    ];
    const step = makeStep({ id: 's1', runner: 'echo' });
    const config = makeConfig(rules);

    const decision = engine.evaluate(step, config, 'wf3', 'workflow_preflight');

    expect(decision.decision).toBe('deny');
    expect(decision.rule_id).toBe('r3');
    expect(decision.matched_rules).toEqual(['r1', 'r2', 'r3']);
  });

  it('should let ask win over allow', () => {
    const rules: PolicyRule[] = [
      { id: 'r1', match: { runner: 'echo' }, decision: 'allow', risk: 'low', reason: 'allow' },
      { id: 'r2', match: { step_id: 's1' }, decision: 'ask', risk: 'medium', reason: 'ask' },
    ];
    const step = makeStep({ id: 's1', runner: 'echo' });
    const config = makeConfig(rules);

    const decision = engine.evaluate(step, config, 'wf4', 'workflow_preflight');

    expect(decision.decision).toBe('ask');
    expect(decision.rule_id).toBe('r2');
    expect(decision.matched_rules).toEqual(['r1', 'r2']);
  });

  it('should upgrade allow to ask when risk exceeds max_risk', () => {
    const rule: PolicyRule = {
      id: 'r_high',
      match: { runner: 'shell' },
      decision: 'allow',
      risk: 'high',
      reason: 'High risk shell',
    };
    const step = makeStep({ runner: 'shell' });
    const config = makeConfig([rule], 'medium');

    const decision = engine.evaluate(step, config, 'wf5', 'step_runtime');

    expect(decision.decision).toBe('ask');
    expect(decision.risk).toBe('high');
    expect(decision.rule_id).toBe('r_high');
    expect(decision.reason).toBe('High risk shell');
  });

  it('should not downgrade deny or ask when risk exceeds max_risk', () => {
    const rules: PolicyRule[] = [
      { id: 'r_deny', match: { runner: 'shell' }, decision: 'deny', risk: 'critical', reason: 'Blocked' },
      { id: 'r_ask', match: { step_id: 's2' }, decision: 'ask', risk: 'critical', reason: 'Needs approval' },
    ];
    const step = makeStep({ id: 's2', runner: 'shell' });
    const config = makeConfig(rules, 'low');

    const decision = engine.evaluate(step, config, 'wf6', 'step_runtime');

    expect(decision.decision).toBe('deny');
    expect(decision.risk).toBe('critical');
  });

  it('should return default decision when no rule matches', () => {
    const step = makeStep({ runner: 'echo' });
    const config = makeConfig([]);

    const decision = engine.evaluate(step, config, 'wf7', 'workflow_preflight');

    expect(decision.decision).toBe('allow');
    expect(decision.risk).toBe('low');
    expect(decision.rule_id).toBeUndefined();
    expect(decision.reason).toBe('No matching policy rule');
    expect(decision.matched_rules).toEqual([]);
  });

  it('should match command_contains patterns', () => {
    const rule: PolicyRule = {
      id: 'r_cmd',
      match: { command_contains: ['rm', 'sudo'] },
      decision: 'deny',
      risk: 'high',
      reason: 'Dangerous command',
    };
    const step = makeStep({ runner: 'shell', input: { command: 'rm -rf /' } });
    const config = makeConfig([rule]);

    const decision = engine.evaluate(step, config, 'wf8', 'step_runtime');

    expect(decision.decision).toBe('deny');
    expect(decision.matched_rules).toEqual(['r_cmd']);
  });

  it('should not match when command_contains is not found', () => {
    const rule: PolicyRule = {
      id: 'r_cmd',
      match: { command_contains: ['sudo'] },
      decision: 'deny',
      risk: 'high',
      reason: 'Dangerous command',
    };
    const step = makeStep({ runner: 'shell', input: { command: 'ls -la' } });
    const config = makeConfig([rule]);

    const decision = engine.evaluate(step, config, 'wf9', 'step_runtime');

    expect(decision.decision).toBe('allow');
    expect(decision.matched_rules).toEqual([]);
  });

  it('should match runner', () => {
    const rule: PolicyRule = {
      id: 'r_runner',
      match: { runner: 'shell' },
      decision: 'allow',
      risk: 'low',
      reason: 'Shell allowed',
    };
    const stepMatch = makeStep({ runner: 'shell' });
    const stepNoMatch = makeStep({ runner: 'echo' });
    const config = makeConfig([rule]);

    expect(engine.evaluate(stepMatch, config, 'wf', 'workflow_preflight').matched_rules).toEqual(['r_runner']);
    expect(engine.evaluate(stepNoMatch, config, 'wf', 'workflow_preflight').matched_rules).toEqual([]);
  });

  it('should match step_id', () => {
    const rule: PolicyRule = {
      id: 'r_step',
      match: { step_id: 'deploy' },
      decision: 'allow',
      risk: 'low',
      reason: 'Deploy step allowed',
    };
    const stepMatch = makeStep({ id: 'deploy' });
    const stepNoMatch = makeStep({ id: 'test' });
    const config = makeConfig([rule]);

    expect(engine.evaluate(stepMatch, config, 'wf', 'workflow_preflight').matched_rules).toEqual(['r_step']);
    expect(engine.evaluate(stepNoMatch, config, 'wf', 'workflow_preflight').matched_rules).toEqual([]);
  });

  it('should match everything with empty match object', () => {
    const rule: PolicyRule = {
      id: 'r_empty',
      match: {},
      decision: 'allow',
      risk: 'low',
      reason: 'Catch-all',
    };
    const step = makeStep({ runner: 'shell', id: 'anything' });
    const config = makeConfig([rule]);

    const decision = engine.evaluate(step, config, 'wf10', 'workflow_preflight');

    expect(decision.matched_rules).toEqual(['r_empty']);
    expect(decision.rule_id).toBe('r_empty');
  });

  it('should use higher risk as tie-breaker when decisions are equal', () => {
    const rules: PolicyRule[] = [
      { id: 'r_low', match: { runner: 'echo' }, decision: 'allow', risk: 'low', reason: 'low' },
      { id: 'r_high', match: { runner: 'echo' }, decision: 'allow', risk: 'high', reason: 'high' },
    ];
    const step = makeStep({ runner: 'echo' });
    const config = makeConfig(rules);

    const decision = engine.evaluate(step, config, 'wf11', 'workflow_preflight');

    expect(decision.decision).toBe('allow');
    expect(decision.rule_id).toBe('r_high');
    expect(decision.risk).toBe('high');
  });
});
