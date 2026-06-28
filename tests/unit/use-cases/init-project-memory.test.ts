import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';

describe('initProjectMemory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-init-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates .wolf directories and config', async () => {
    await initProjectMemory(dir);
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'config.yaml'))).toBe(true);
  });
});
