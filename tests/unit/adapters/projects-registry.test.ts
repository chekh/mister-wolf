import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { ProjectsRegistry } from '../../../src/adapters/fs/projects-registry.js';

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'wolf-registry-'));
});
afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

interface RegistryRow {
  path: string;
  schema_version: number;
  initialized_at: string;
}

function readYaml(): { projects?: RegistryRow[] } {
  return yaml.load(readFileSync(join(configDir, 'projects.yaml'), 'utf-8')) as { projects?: RegistryRow[] };
}

describe('ProjectsRegistry', () => {
  it('register creates projects.yaml with the project', async () => {
    await new ProjectsRegistry(configDir).register('/projects/foo', 2);
    expect(readYaml().projects).toEqual([
      { path: '/projects/foo', schema_version: 2, initialized_at: expect.any(String) },
    ]);
  });

  it('register is an upsert by path (re-init updates schema_version, keeps initialized_at)', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/projects/foo', 1);
    const first = readYaml().projects![0];
    await registry.register('/projects/foo', 2);
    const second = readYaml().projects!;
    expect(second).toHaveLength(1);
    expect(second[0].schema_version).toBe(2);
    expect(second[0].initialized_at).toBe(first.initialized_at);
  });

  it('list returns registered projects', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/projects/foo', 2);
    await registry.register('/projects/bar', 2);
    expect((await registry.list()).map((p) => p.path).sort()).toEqual(['/projects/bar', '/projects/foo']);
  });

  it('remove deletes entry and reports whether it existed', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/projects/foo', 2);
    expect(await registry.remove('/projects/foo')).toBe(true);
    expect(await registry.remove('/projects/foo')).toBe(false);
    expect(readYaml().projects ?? []).toEqual([]);
  });

  it('prune removes entries whose paths do not exist and returns them', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/definitely/missing', 2);
    expect(await registry.prune()).toEqual(['/definitely/missing']);
    expect(readYaml().projects ?? []).toEqual([]);
  });

  it('works when config dir does not exist yet (creates it)', async () => {
    const nested = join(configDir, 'deep', 'wolf');
    await new ProjectsRegistry(nested).register('/projects/foo', 2);
    expect(existsSync(join(nested, 'projects.yaml'))).toBe(true);
  });

  it('corrupted yaml → registry treated as empty (resilient, not fatal)', async () => {
    writeFileSync(join(configDir, 'projects.yaml'), '{uncorrectable');
    const registry = new ProjectsRegistry(configDir);
    expect(await registry.list()).toEqual([]);
    await registry.register('/projects/foo', 2); // перезапишет битый файл
    expect((await registry.list()).map((p) => p.path)).toEqual(['/projects/foo']);
  });
});
