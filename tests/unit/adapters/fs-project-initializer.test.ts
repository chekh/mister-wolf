import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-init-fix-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('FsProjectInitializer ensure-semantics (спека §8: фикс перезаписи config.yaml)', () => {
  it('creates the skeleton and config on first run', async () => {
    await new FsProjectInitializer().initialize(dir);
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toContain('memory_types');
  });

  it('does NOT overwrite an existing config.yaml on re-init', async () => {
    await new FsProjectInitializer().initialize(dir);
    const custom = '# custom project config\nartifact_sources: [docs]\n';
    writeFileSync(join(dir, '.wolf', 'config.yaml'), custom);
    await new FsProjectInitializer().initialize(dir); // повторный init
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(custom);
  });

  it('re-init keeps memory content (mkdir recursive, memory untouched)', async () => {
    await new FsProjectInitializer().initialize(dir);
    mkdirSync(join(dir, '.wolf', 'memory', 'shared', 'decisions'), { recursive: true });
    const memoryFile = join(dir, '.wolf', 'memory', 'shared', 'decisions', 'mem_1.md');
    writeFileSync(memoryFile, '---\nid: mem_1\n---\nbody');
    await new FsProjectInitializer().initialize(dir);
    expect(readFileSync(memoryFile, 'utf-8')).toContain('mem_1');
  });
});
