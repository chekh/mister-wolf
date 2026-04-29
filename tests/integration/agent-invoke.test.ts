import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

describe('agent invoke integration', () => {
  const createTempDir = () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-agent-'));
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });
    return tempDir;
  };

  const getCaseState = (tempDir: string) => {
    const casesDir = join(tempDir, '.wolf', 'state', 'cases');
    const caseDirs = readdirSync(casesDir);
    const caseId = caseDirs[0];
    const statePath = join(casesDir, caseId, 'state.json');
    return JSON.parse(readFileSync(statePath, 'utf-8'));
  };

  it('global stub mode returns AgentInvocationPlan', () => {
    const tempDir = createTempDir();

    const config = `agents:
  - id: test_agent
    name: Test Agent
    capabilities: [test]
    model_route: mock_route

models:
  execution:
    mode: stub
  routes:
    mock_route:
      provider: mock
      model: mock-chat
`;

    const workflow = `id: stub_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: test_agent
      task: 'Do something'
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const state = getCaseState(tempDir);
    const stepResult = JSON.parse(state.step_results.agent_step.output);
    expect(stepResult.type).toBe('agent_invocation_plan');
    expect(stepResult.agent_id).toBe('test_agent');
    expect(stepResult.provider).toBe('mock');
    expect(stepResult.model).toBe('mock-chat');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('global invoke mode calls MockProvider', () => {
    const tempDir = createTempDir();

    const config = `agents:
  - id: test_agent
    name: Test Agent
    capabilities: [test]
    model_route: mock_route

models:
  execution:
    mode: invoke
  routes:
    mock_route:
      provider: mock
      model: mock-chat
`;

    const workflow = `id: invoke_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: test_agent
      task: 'Hello mock provider'
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const state = getCaseState(tempDir);
    const stepResult = JSON.parse(state.step_results.agent_step.output);
    expect(stepResult.type).toBe('agent_model_result');
    expect(stepResult.provider).toBe('mock');
    expect(stepResult.model).toBe('mock-chat');
    expect(stepResult.output).toContain('[mock:mock-chat]');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('route stub overrides global invoke', () => {
    const tempDir = createTempDir();

    const config = `agents:
  - id: test_agent
    name: Test Agent
    capabilities: [test]
    model_route: mock_route

models:
  execution:
    mode: invoke
  routes:
    mock_route:
      provider: mock
      model: mock-chat
      execution_mode: stub
`;

    const workflow = `id: route_stub_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: test_agent
      task: 'Should not invoke'
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const state = getCaseState(tempDir);
    const stepResult = JSON.parse(state.step_results.agent_step.output);
    expect(stepResult.type).toBe('agent_invocation_plan');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('route invoke overrides global stub', () => {
    const tempDir = createTempDir();

    const config = `agents:
  - id: test_agent
    name: Test Agent
    capabilities: [test]
    model_route: mock_route

models:
  execution:
    mode: stub
  routes:
    mock_route:
      provider: mock
      model: mock-chat
      execution_mode: invoke
`;

    const workflow = `id: route_invoke_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: test_agent
      task: 'Should invoke'
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const state = getCaseState(tempDir);
    const stepResult = JSON.parse(state.step_results.agent_step.output);
    expect(stepResult.type).toBe('agent_model_result');
    expect(stepResult.output).toContain('[mock:mock-chat]');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('policy deny prevents provider invocation', () => {
    const tempDir = createTempDir();

    const config = `agents:
  - id: test_agent
    name: Test Agent
    capabilities: [test]
    model_route: mock_route

models:
  execution:
    mode: invoke
  routes:
    mock_route:
      provider: mock
      model: mock-chat

policy:
  rules:
    - id: deny_agent
      match:
        runner: agent
      decision: deny
      reason: Agent runner is not allowed
`;

    const workflow = `id: policy_deny_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: test_agent
      task: 'Should be denied'
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);

    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    try {
      stdout = execSync(`node ${cliPath} run workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      stdout = err.stdout || '';
      stderr = err.stderr || '';
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(1);
    const output = stdout + stderr;
    expect(output).toContain('denied by policy');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('policy ask gate prevents provider invocation until approved', () => {
    const tempDir = createTempDir();

    const config = `agents:
  - id: test_agent
    name: Test Agent
    capabilities: [test]
    model_route: mock_route

models:
  execution:
    mode: invoke
  routes:
    mock_route:
      provider: mock
      model: mock-chat

policy:
  rules:
    - id: ask_agent
      match:
        runner: agent
      decision: ask
      reason: Agent runner requires approval
`;

    const workflow = `id: policy_ask_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: test_agent
      task: 'Should wait for approval'
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);

    let runOutput: string;
    let runExitCode = 0;
    try {
      runOutput = execSync(`node ${cliPath} run workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      runOutput = err.stdout || '';
      runExitCode = err.status || 1;
    }

    expect(runExitCode).toBe(2);
    expect(runOutput).toContain('PAUSED');

    const casesDir = join(tempDir, '.wolf', 'state', 'cases');
    const caseDirs = readdirSync(casesDir);
    const caseId = caseDirs[0];
    const gateId = `gate_${caseId}_agent_step`;

    const statePath = join(casesDir, caseId, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.gates[gateId]).toBeDefined();
    expect(state.gates[gateId].type).toBe('policy_approval');

    const approveOutput = execSync(`node ${cliPath} approve ${gateId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(approveOutput).toContain('approved');

    const resumeOutput = execSync(`node ${cliPath} resume ${caseId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(resumeOutput).toContain('completed');

    const resumedState = JSON.parse(readFileSync(statePath, 'utf-8'));
    const stepResult = JSON.parse(resumedState.step_results.agent_step.output);
    expect(stepResult.type).toBe('agent_model_result');
    expect(stepResult.output).toContain('[mock:mock-chat]');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('context bundle passed to provider in invoke mode', () => {
    const tempDir = createTempDir();

    const contextContent = 'This is test context for the agent';
    writeFileSync(join(tempDir, '.wolf', 'context.md'), contextContent);

    const config = `agents:
  - id: test_agent
    name: Test Agent
    capabilities: [test]
    model_route: mock_route

models:
  execution:
    mode: invoke
  routes:
    mock_route:
      provider: mock
      model: mock-chat
`;

    const workflow = `id: context_test
version: "0.1.0"
steps:
  - id: agent_step
    type: builtin
    runner: agent
    input:
      agent: test_agent
      task: 'Process context'
      context_bundle: 'context.md'
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    const state = getCaseState(tempDir);
    const stepResult = JSON.parse(state.step_results.agent_step.output);
    expect(stepResult.type).toBe('agent_model_result');

    const taskTokens = Math.ceil('Process context'.length / 4);
    const contextTokens = Math.ceil(contextContent.length / 4);
    expect(stepResult.usage.input_tokens).toBe(taskTokens + contextTokens);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
