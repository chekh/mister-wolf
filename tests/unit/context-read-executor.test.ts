import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextReadToolExecutor } from '../../src/tool/executors/context-read.js';
import { ContextToolError } from '../../src/tool/errors.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ContextReadToolExecutor', () => {
  let tmpDir: string;
  let executor: ContextReadToolExecutor;
  let ctx: { project_root: string; case_id: string; workflow_id: string; step_id: string; agent_id: string };

  beforeEach(() => {
    tmpDir = join(tmpdir(), `wolf-test-${Date.now()}`);
    mkdirSync(join(tmpDir, '.wolf', 'context'), { recursive: true });
    executor = new ContextReadToolExecutor();
    ctx = {
      project_root: tmpDir,
      case_id: 'c1',
      workflow_id: 'w1',
      step_id: 's1',
      agent_id: 'a1',
    };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should read default context.md', async () => {
    writeFileSync(join(tmpDir, '.wolf', 'context', 'context.md'), '# Context\n\nHello');
    const result = await executor.execute({ tool_id: 'context.read', input: {} }, ctx);
    expect(result.output).toBe('# Context\n\nHello');
    expect(result.metadata?.path).toBe('.wolf/context/context.md');
  });

  it('should read custom relative path', async () => {
    writeFileSync(join(tmpDir, 'custom.md'), 'Custom content');
    const result = await executor.execute({ tool_id: 'context.read', input: { path: 'custom.md' } }, ctx);
    expect(result.output).toBe('Custom content');
  });

  it('should reject absolute path', async () => {
    await expect(executor.execute({ tool_id: 'context.read', input: { path: '/etc/passwd' } }, ctx)).rejects.toThrow(
      ContextToolError
    );
  });

  it('should reject path traversal', async () => {
    await expect(executor.execute({ tool_id: 'context.read', input: { path: '../secret.txt' } }, ctx)).rejects.toThrow(
      ContextToolError
    );
  });

  it('should reject path outside project root', async () => {
    await expect(
      executor.execute({ tool_id: 'context.read', input: { path: 'subdir/../../../secret.txt' } }, ctx)
    ).rejects.toThrow(ContextToolError);
  });

  it('should reject missing file', async () => {
    await expect(executor.execute({ tool_id: 'context.read', input: { path: 'missing.md' } }, ctx)).rejects.toThrow(
      ContextToolError
    );
  });

  it('should reject file exceeding 1MB', async () => {
    writeFileSync(join(tmpDir, 'huge.md'), 'x'.repeat(1048577));
    await expect(executor.execute({ tool_id: 'context.read', input: { path: 'huge.md' } }, ctx)).rejects.toThrow(
      ContextToolError
    );
  });
});
