import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadProjectConfig } from '../../src/config/project-config.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('loadProjectConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-config-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load defaults when no config exists', () => {
    const config = loadProjectConfig(join(tempDir, 'nonexistent.yaml'));
    expect(config.state_dir).toBe('.wolf/state');
    expect(config.defaults.timeout).toBe('30s');
  });

  it('should load custom config', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
state_dir: ".wolf/custom"
defaults:
  timeout: "60s"
  shell:
    max_output_size: "2MB"
    blocked_commands:
      - sudo
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.state_dir).toBe('.wolf/custom');
    expect(config.defaults.timeout).toBe('60s');
    expect(config.defaults.shell?.max_output_size).toBe('2MB');
  });

  it('should load policy defaults when no policy config exists', () => {
    const config = loadProjectConfig(join(tempDir, 'nonexistent.yaml'));
    expect(config.policy.defaults.enabled).toBe(true);
    expect(config.policy.defaults.autonomy).toBe('supervised');
    expect(config.policy.defaults.max_risk).toBe('high');
    expect(config.policy.rules).toEqual([]);
  });

  it('should load custom policy config', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
policy:
  defaults:
    enabled: false
    autonomy: autonomous
    max_risk: critical
  rules:
    - id: block-shell
      match:
        runner: shell
      decision: deny
      risk: high
      reason: Shell execution blocked
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.policy.defaults.enabled).toBe(false);
    expect(config.policy.defaults.autonomy).toBe('autonomous');
    expect(config.policy.defaults.max_risk).toBe('critical');
    expect(config.policy.rules).toHaveLength(1);
    expect(config.policy.rules[0].id).toBe('block-shell');
    expect(config.policy.rules[0].decision).toBe('deny');
  });

  it('should load config with agents and model routes', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
agents:
  - id: planner
    name: Planner Agent
    description: Plans tasks
    capabilities:
      - planning
    model_route: openai-gpt4
    tools:
      - search
models:
  routes:
    openai-gpt4:
      provider: openai
      model: gpt-4
      purpose: Planning
      max_tokens: 4096
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].id).toBe('planner');
    expect(config.agents[0].model_route).toBe('openai-gpt4');
    expect(config.models.routes['openai-gpt4']).toBeDefined();
    expect(config.models.routes['openai-gpt4'].provider).toBe('openai');
    expect(config.models.routes['openai-gpt4'].model).toBe('gpt-4');
  });

  it('should reject config with duplicate agent ids', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
agents:
  - id: planner
    model_route: openai-gpt4
  - id: planner
    model_route: openai-gpt4
models:
  routes:
    openai-gpt4:
      provider: openai
      model: gpt-4
`
    );
    expect(() => loadProjectConfig(join(tempDir, 'wolf.yaml'))).toThrow('Duplicate agent id: planner');
  });

  it('should reject config with missing model route reference', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
agents:
  - id: planner
    model_route: unknown-route
models:
  routes:
    openai-gpt4:
      provider: openai
      model: gpt-4
`
    );
    expect(() => loadProjectConfig(join(tempDir, 'wolf.yaml'))).toThrow(
      "Agent 'planner' references unknown model route 'unknown-route'"
    );
  });

  it('should load config with models.execution.mode and route fields', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
agents:
  - id: planner
    model_route: openai-gpt4
models:
  execution:
    mode: invoke
  routes:
    openai-gpt4:
      provider: openai
      model: gpt-4
      purpose: Planning
      max_tokens: 4096
      temperature: 0.7
      execution_mode: invoke
      system_prompt: You are a helpful planner
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.models.execution.mode).toBe('invoke');
    expect(config.models.routes['openai-gpt4'].temperature).toBe(0.7);
    expect(config.models.routes['openai-gpt4'].execution_mode).toBe('invoke');
    expect(config.models.routes['openai-gpt4'].system_prompt).toBe('You are a helpful planner');
  });

  it('should load config with agent.system_prompt', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
agents:
  - id: planner
    model_route: openai-gpt4
    system_prompt: You are a planner agent
models:
  routes:
    openai-gpt4:
      provider: openai
      model: gpt-4
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.agents[0].system_prompt).toBe('You are a planner agent');
  });

  it('should default models.execution.streaming to false', () => {
    const config = loadProjectConfig(join(tempDir, 'nonexistent.yaml'));
    expect(config.models.execution.streaming).toBe(false);
  });

  it('should load custom models.execution.streaming', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
models:
  execution:
    mode: invoke
    streaming: true
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.models.execution.streaming).toBe(true);
  });

  it('should load route with streaming override', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
models:
  routes:
    openai-gpt4:
      provider: openai
      model: gpt-4
      streaming: true
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.models.routes['openai-gpt4'].streaming).toBe(true);
  });
});
