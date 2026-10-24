import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { ProjectsRegistry, dedupeByRealpath } from '../../../src/adapters/fs/projects-registry.js';

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
  pinned?: boolean;
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

  it('pinned roundtrips through yaml: present stays true, absent stays undefined', async () => {
    writeFileSync(
      join(configDir, 'projects.yaml'),
      yaml.dump({
        projects: [
          { path: '/projects/pin', schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z', pinned: true },
          { path: '/projects/plain', schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z' },
        ],
      })
    );
    const projects = await new ProjectsRegistry(configDir).list();
    expect(projects[0].pinned).toBe(true);
    expect(projects[1].pinned).toBeUndefined();
  });

  it('register upsert keeps the pinned flag of an existing entry', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/projects/pin', 1);
    // pinned ставится только ручной правкой projects.yaml (REQ-13)
    writeFileSync(
      join(configDir, 'projects.yaml'),
      yaml.dump({ projects: [{ ...readYaml().projects![0], pinned: true }] })
    );
    await registry.register('/projects/pin', 2);
    expect(readYaml().projects).toEqual([
      { path: '/projects/pin', schema_version: 2, initialized_at: expect.any(String), pinned: true },
    ]);
  });

  it('registerIfAbsentSync does not overwrite or duplicate a pinned entry (P331 guard, R13.2)', () => {
    const entry = {
      path: '/projects/pin',
      schema_version: 2,
      initialized_at: '2026-01-01T00:00:00.000Z',
      pinned: true,
    };
    writeFileSync(join(configDir, 'projects.yaml'), yaml.dump({ projects: [entry] }));
    expect(new ProjectsRegistry(configDir).registerIfAbsentSync('/projects/pin', 2)).toBe(false);
    expect(readYaml().projects).toEqual([entry]); // запись не изменена, дублей нет
  });

  it('listStrict: ENOENT → []; corrupted yaml → throw (unreadable ≠ empty)', async () => {
    const registry = new ProjectsRegistry(configDir);
    expect(await registry.listStrict()).toEqual([]);
    writeFileSync(join(configDir, 'projects.yaml'), '{uncorrectable');
    await expect(registry.listStrict()).rejects.toThrow(/failed to read projects registry/);
  });

  it('listStrict returns entries from a valid registry', async () => {
    const registry = new ProjectsRegistry(configDir);
    await registry.register('/projects/foo', 2);
    expect((await registry.listStrict()).map((p) => p.path)).toEqual(['/projects/foo']);
  });
});

describe('dedupeByRealpath', () => {
  it('collapses entries sharing a realpath (symlink): first wins, duplicate reported', () => {
    const target = mkdtempSync(join(tmpdir(), 'wolf-dedup-target-'));
    try {
      const link = join(configDir, 'link-to-target');
      symlinkSync(target, link);
      const first = { path: target, schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z' };
      const alias = { path: link, schema_version: 2, initialized_at: '2026-01-02T00:00:00.000Z' };
      const { unique, duplicates } = dedupeByRealpath([first, alias]);
      expect(unique).toEqual([first]);
      expect(duplicates).toEqual([alias]);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('keeps a missing path as-is (not deduped, not thrown)', () => {
    const missing = {
      path: join(configDir, 'no-such-project'),
      schema_version: 2,
      initialized_at: '2026-01-01T00:00:00.000Z',
    };
    const other = { path: configDir, schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z' };
    const { unique, duplicates } = dedupeByRealpath([missing, other]);
    expect(unique).toEqual([missing, other]);
    expect(duplicates).toEqual([]);
  });
});
