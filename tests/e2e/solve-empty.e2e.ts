import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('solve on empty memory degrades gracefully', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('solve on empty memory degrades gracefully', () => {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);

    const solve = runCli(['solve', 'anything at all'], dir);
    expect(solve.status).toBe(0);
    expect(solve.stdout).toContain('No relevant memory found');

    const call = runCli(['call', '--for', 'x'], dir);
    expect(call.status).toBe(0);
    expect(call.stdout).toContain('No active call injections.');
  });
});
