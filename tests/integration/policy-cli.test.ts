import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

describe('Policy CLI integration', () => {
  it('should allow workflow with exit 0 and correct output', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-'));

    const workflow = `id: allow_test
version: "0.1.0"
steps:
  - id: greet
    type: builtin
    runner: echo
    input:
      message: hello
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} policy check workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Policy check: ALLOW');
    expect(output).toContain('Allowed: 1');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should deny workflow with exit 1 and correct output', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-'));

    const workflow = `id: deny_test
version: "0.1.0"
steps:
  - id: run_shell
    type: builtin
    runner: shell
    input:
      command: echo hello
`;

    const config = `policy:
  rules:
    - id: deny_shell
      match:
        runner: shell
      decision: deny
      reason: Shell runner is not allowed
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    let output = '';
    try {
      output = execSync(`node ${cliPath} policy check workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      output = err.stdout || '';
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(1);
    expect(output).toContain('Policy check: DENY');
    expect(output).toContain('Denied: 1');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should output valid JSON with --json', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-'));

    const workflow = `id: json_test
version: "0.1.0"
steps:
  - id: greet
    type: builtin
    runner: echo
    input:
      message: hello
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} policy check workflow.yaml --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const json = JSON.parse(output);
    expect(json).toHaveProperty('workflow_id', 'json_test');
    expect(json).toHaveProperty('overall', 'allow');
    expect(json).toHaveProperty('decisions');
    expect(json).toHaveProperty('steps_allowed');
    expect(json).toHaveProperty('steps_ask');
    expect(json).toHaveProperty('steps_denied');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should prevent wolf run when policy denies workflow', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-'));

    const workflow = `id: run_deny_test
version: "0.1.0"
steps:
  - id: run_shell
    type: builtin
    runner: shell
    input:
      command: echo hello
`;

    const config = `policy:
  rules:
    - id: deny_shell
      match:
        runner: shell
      decision: deny
      reason: Shell runner is not allowed
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

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

  it('should create policy gate on wolf run when policy asks', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-'));

    const workflow = `id: ask_test
version: "0.1.0"
execution:
  mode: graph
steps:
  - id: risky_shell
    type: builtin
    runner: shell
    input:
      command: echo hello
`;

    const config = `policy:
  rules:
    - id: ask_shell
      match:
        runner: shell
      decision: ask
      reason: Shell runner requires approval
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    let output = '';
    try {
      output = execSync(`node ${cliPath} run workflow.yaml`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      output = err.stdout || '';
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(2);
    expect(output).toContain('PAUSED');

    // Verify gate was created
    const casesDir = join(tempDir, '.wolf', 'state', 'cases');
    const caseDirs = readdirSync(casesDir);
    expect(caseDirs.length).toBe(1);

    const caseId = caseDirs[0];
    const statePath = join(casesDir, caseId, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const gateId = `gate_${caseId}_risky_shell`;
    expect(state.gates[gateId]).toBeDefined();
    expect(state.gates[gateId].type).toBe('policy_approval');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should allow step execution after approving policy gate', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-'));

    const workflow = `id: approve_test
version: "0.1.0"
execution:
  mode: graph
steps:
  - id: risky_shell
    type: builtin
    runner: shell
    input:
      command: echo approved
`;

    const config = `policy:
  rules:
    - id: ask_shell
      match:
        runner: shell
      decision: ask
      reason: Shell runner requires approval
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    // Run — should pause at policy gate
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
    const gateId = `gate_${caseId}_risky_shell`;

    // Approve gate
    const approveOutput = execSync(`node ${cliPath} approve ${gateId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(approveOutput).toContain('approved');

    // Resume — should complete
    const resumeOutput = execSync(`node ${cliPath} resume ${caseId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(resumeOutput).toContain('completed');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail step after rejecting policy gate', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-'));

    const workflow = `id: reject_test
version: "0.1.0"
execution:
  mode: graph
steps:
  - id: risky_shell
    type: builtin
    runner: shell
    input:
      command: echo rejected
`;

    const config = `policy:
  rules:
    - id: ask_shell
      match:
        runner: shell
      decision: ask
      reason: Shell runner requires approval
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    // Run — should pause at policy gate
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
    const gateId = `gate_${caseId}_risky_shell`;

    // Reject gate
    const rejectOutput = execSync(`node ${cliPath} reject ${gateId}`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(rejectOutput).toContain('rejected');

    // Resume — should fail
    let resumeExitCode = 0;
    let resumeOutput = '';
    try {
      resumeOutput = execSync(`node ${cliPath} resume ${caseId}`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      resumeOutput = err.stdout || '';
      resumeExitCode = err.status || 1;
    }

    expect(resumeExitCode).toBe(3);
    expect(resumeOutput).toContain('FAILED');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return exit 0 on ask decision', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-'));

    const config = `policy:
  rules:
    - id: ask_shell
      match:
        runner: shell
      decision: ask
      risk: medium
      reason: Shell requires approval
`;
    const workflow = `id: ask_test
version: "0.1.0"
steps:
  - id: run_shell
    type: builtin
    runner: shell
    input:
      command: echo hello
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} policy check workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Policy check: ASK');
    expect(output).toContain('Ask: 1');

    rmSync(tempDir, { recursive: true, force: true });
  });
});
