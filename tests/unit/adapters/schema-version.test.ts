import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  readSchemaVersion,
  writeSchemaVersionIfAbsent,
} from '../../../src/adapters/fs/schema-version.js';
import { loadWolfConfigSync, renderConfigYaml } from '../../../src/adapters/fs/config-file.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-schema-'));
  mkdirSync(join(dir, '.wolf'), { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const cfg = (body: string) => writeFileSync(join(dir, '.wolf', 'config.yaml'), body);

describe('readSchemaVersion', () => {
  it('null when project is not initialized (no .wolf/config.yaml)', async () => {
    expect(await readSchemaVersion(dir)).toBeNull();
  });

  it('LEGACY (1) when marker absent — dogfooder projects (спека §3 уровень 2)', async () => {
    cfg('artifact_sources: []\n');
    expect(await readSchemaVersion(dir)).toBe(LEGACY_SCHEMA_VERSION);
  });

  it('reads explicit marker', async () => {
    cfg('artifact_sources: []\nschema_version: 2\n');
    expect(await readSchemaVersion(dir)).toBe(2);
  });

  it('corrupted yaml → UserFacingError with --recreate hint (спека §6)', async () => {
    cfg('{broken');
    await expect(readSchemaVersion(dir)).rejects.toThrow(/--recreate/);
  });
});

describe('writeSchemaVersionIfAbsent', () => {
  it('appends schema_version to an existing config, keeps other keys', async () => {
    cfg('artifact_sources: [docs]\n');
    await writeSchemaVersionIfAbsent(dir);
    const raw = readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8');
    expect(raw).toContain('artifact_sources');
    expect(raw).toContain(`schema_version: ${CURRENT_SCHEMA_VERSION}`);
    expect(await readSchemaVersion(dir)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('no-op when marker is current (file content identical)', async () => {
    const body = `artifact_sources: [docs]\nschema_version: ${CURRENT_SCHEMA_VERSION}\n`;
    cfg(body);
    await writeSchemaVersionIfAbsent(dir);
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
  });

  it('no-op when config missing (init has not run yet)', async () => {
    await writeSchemaVersionIfAbsent(dir);
    expect(await readSchemaVersion(dir)).toBeNull();
  });
});

describe('marker survives taxonomy sync (load → renderConfigYaml)', () => {
  it('renderConfigYaml keeps schema_version from loaded config', async () => {
    cfg(`artifact_sources: []\nschema_version: ${CURRENT_SCHEMA_VERSION}\n`);
    const loaded = loadWolfConfigSync(dir);
    expect(loaded?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const rendered = renderConfigYaml(loaded);
    expect(rendered).toContain(`schema_version: ${CURRENT_SCHEMA_VERSION}`);
  });

  it('renderConfigYaml(null) OMITS the marker — fresh/recreated config stays LEGACY until markSchemaCurrent or migration (recovery depends on this)', () => {
    expect(renderConfigYaml(null)).not.toContain('schema_version');
  });
});
