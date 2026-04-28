import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

describe('CLI integration', () => {
  const cliPath = resolve(process.cwd(), 'dist/cli/index.js');

  it('should run a workflow and complete', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-cli-'));

    const workflow = `id: test_workflow
version: "0.1.0"
steps:
  - id: step1
    type: builtin
    runner: echo
    input:
      message: hello
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} run workflow.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Workflow completed');

    // Verify case was created
    const casesDir = join(tempDir, '.wolf', 'state', 'cases');
    expect(existsSync(casesDir)).toBe(true);
    const caseDirs = readdirSync(casesDir);
    expect(caseDirs.length).toBe(1);

    // Clean up
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should pause on manual gate and allow approve + resume', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-cli-'));

    const workflow = `id: gate_test
version: "0.1.0"
steps:
  - id: setup
    type: builtin
    runner: echo
    input:
      message: setup
  - id: approval
    type: builtin
    runner: manual_gate
    input:
      message: approve?
  - id: finalize
    type: builtin
    runner: echo
    input:
      message: done
`;

    writeFileSync(join(tempDir, 'workflow.yaml'), workflow);
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    // Run — should pause at gate
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
    const gateId = `gate_${caseId}_approval`;

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

    // Clean up
    rmSync(tempDir, { recursive: true, force: true });
  });
});
