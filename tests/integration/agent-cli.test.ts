import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

describe('agents CLI', () => {
  const createTempDir = () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-cli-'));
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });
    return tempDir;
  };

  const writeConfig = (tempDir: string) => {
    const config = `agents:
  - id: coder
    name: Code Agent
    description: Writes and reviews code
    capabilities: [coding, review]
    tools: [file_read, file_write]
    model_route: gpt4
  - id: helper
    name: Helper Agent
    capabilities: [chat]
    tools: []
    model_route: claude

models:
  routes:
    gpt4:
      provider: openai
      model: gpt-4
      purpose: coding
      max_tokens: 4096
    claude:
      provider: anthropic
      model: claude-3-opus
`;
    writeFileSync(join(tempDir, 'wolf.yaml'), config);
  };

  it('should list agents', () => {
    const tempDir = createTempDir();
    writeConfig(tempDir);

    const output = execSync(`node ${cliPath} agents list`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('coder');
    expect(output).toContain('Code Agent');
    expect(output).toContain('helper');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should inspect an agent', () => {
    const tempDir = createTempDir();
    writeConfig(tempDir);

    const output = execSync(`node ${cliPath} agents inspect coder`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Agent: coder');
    expect(output).toContain('Code Agent');
    expect(output).toContain('openai');
    expect(output).toContain('gpt-4');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should exit with code 1 for unknown agent', () => {
    const tempDir = createTempDir();
    writeConfig(tempDir);

    let exitCode = 0;
    try {
      execSync(`node ${cliPath} agents inspect unknown-id`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(1);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should list agents as JSON', () => {
    const tempDir = createTempDir();
    writeConfig(tempDir);

    const output = execSync(`node ${cliPath} agents list --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toHaveProperty('id');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should inspect an agent as JSON', () => {
    const tempDir = createTempDir();
    writeConfig(tempDir);

    const output = execSync(`node ${cliPath} agents inspect coder --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const parsed = JSON.parse(output);
    expect(parsed.id).toBe('coder');
    expect(parsed.resolved_route).toBeDefined();
    expect(parsed.resolved_route.provider).toBe('openai');

    rmSync(tempDir, { recursive: true, force: true });
  });
});
