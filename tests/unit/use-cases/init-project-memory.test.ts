import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';

describe('initProjectMemory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-init-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates .wolf directories and config', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'context'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'threads'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'info-requests'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'articles'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'memory', 'briefs'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'config.yaml'))).toBe(true);

    const yamlText = await import('fs').then((m) => m.readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8'));
    const { default: yaml } = await import('js-yaml');
    const cfg = yaml.load(yamlText) as {
      memory_types?: { core?: Record<string, unknown> };
      artifact_sources?: string[];
    };
    expect(cfg.memory_types?.core?.['task-brief']).toBeDefined();
    expect(cfg.artifact_sources).toEqual([]);
  });
});
