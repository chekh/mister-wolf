import { describe, it, expect } from 'vitest';
import { PolicyPreflight } from '../../src/policy/preflight.js';
import { PolicyRule } from '../../src/types/policy.js';
import { PolicyConfig } from '../../src/config/project-config.js';
import { StepDefinition, WorkflowDefinition } from '../../src/types/workflow.js';

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

function makeWorkflow(steps: StepDefinition[]): WorkflowDefinition {
  return {
    id: 'test_workflow',
    version: '0.1.0',
    steps,
  };
}

describe('PolicyPreflight', () => {
  const preflight = new PolicyPreflight();

  it('should allow workflow when all steps are allowed', () => {
    const rules: PolicyRule[] = [
      { id: 'r1', match: { runner: 'echo' }, decision: 'allow', risk: 'low', reason: 'Echo is safe' },
    ];
    const workflow = makeWorkflow([makeStep({ id: 's1', runner: 'echo' }), makeStep({ id: 's2', runner: 'echo' })]);
    const config = makeConfig(rules);

    const report = preflight.evaluate(workflow, config);

    expect(report.overall).toBe('allow');
    expect(report.steps_allowed).toBe(2);
    expect(report.steps_ask).toBe(0);
    expect(report.steps_denied).toBe(0);
    expect(report.decisions).toHaveLength(2);
    expect(report.decisions.every((d) => d.decision === 'allow')).toBe(true);
  });

  it('should deny workflow when at least one step is denied', () => {
    const rules: PolicyRule[] = [
      { id: 'r1', match: { runner: 'echo' }, decision: 'allow', risk: 'low', reason: 'Echo is safe' },
      { id: 'r2', match: { runner: 'shell' }, decision: 'deny', risk: 'high', reason: 'Shell is blocked' },
    ];
    const workflow = makeWorkflow([makeStep({ id: 's1', runner: 'echo' }), makeStep({ id: 's2', runner: 'shell' })]);
    const config = makeConfig(rules);

    const report = preflight.evaluate(workflow, config);

    expect(report.overall).toBe('deny');
    expect(report.steps_allowed).toBe(1);
    expect(report.steps_ask).toBe(0);
    expect(report.steps_denied).toBe(1);
    expect(report.decisions.some((d) => d.decision === 'deny')).toBe(true);
  });

  it('should ask workflow when no deny and at least one ask', () => {
    const rules: PolicyRule[] = [
      { id: 'r1', match: { runner: 'echo' }, decision: 'allow', risk: 'low', reason: 'Echo is safe' },
      { id: 'r2', match: { runner: 'shell' }, decision: 'ask', risk: 'medium', reason: 'Shell needs approval' },
    ];
    const workflow = makeWorkflow([makeStep({ id: 's1', runner: 'echo' }), makeStep({ id: 's2', runner: 'shell' })]);
    const config = makeConfig(rules);

    const report = preflight.evaluate(workflow, config);

    expect(report.overall).toBe('ask');
    expect(report.steps_allowed).toBe(1);
    expect(report.steps_ask).toBe(1);
    expect(report.steps_denied).toBe(0);
    expect(report.decisions.some((d) => d.decision === 'ask')).toBe(true);
    expect(report.decisions.every((d) => d.decision !== 'deny')).toBe(true);
  });

  it('should handle mixed workflow with allow, ask, and deny', () => {
    const rules: PolicyRule[] = [
      { id: 'r1', match: { step_id: 's1' }, decision: 'allow', risk: 'low', reason: 'Allow s1' },
      { id: 'r2', match: { step_id: 's2' }, decision: 'ask', risk: 'medium', reason: 'Ask s2' },
      { id: 'r3', match: { step_id: 's3' }, decision: 'deny', risk: 'high', reason: 'Deny s3' },
    ];
    const workflow = makeWorkflow([
      makeStep({ id: 's1', runner: 'echo' }),
      makeStep({ id: 's2', runner: 'echo' }),
      makeStep({ id: 's3', runner: 'echo' }),
    ]);
    const config = makeConfig(rules);

    const report = preflight.evaluate(workflow, config);

    expect(report.overall).toBe('deny');
    expect(report.steps_allowed).toBe(1);
    expect(report.steps_ask).toBe(1);
    expect(report.steps_denied).toBe(1);
    expect(report.decisions).toHaveLength(3);
  });

  it('should default to allow when no rules match', () => {
    const workflow = makeWorkflow([makeStep({ id: 's1', runner: 'echo' }), makeStep({ id: 's2', runner: 'shell' })]);
    const config = makeConfig([]);

    const report = preflight.evaluate(workflow, config);

    expect(report.overall).toBe('allow');
    expect(report.steps_allowed).toBe(2);
    expect(report.steps_ask).toBe(0);
    expect(report.steps_denied).toBe(0);
    expect(report.decisions.every((d) => d.decision === 'allow')).toBe(true);
  });
});
