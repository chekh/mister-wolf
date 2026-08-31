import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureCurrentSchema } from '../../../src/adapters/fs/schema-guard.js';
import { CURRENT_SCHEMA_VERSION } from '../../../src/adapters/fs/schema-version.js';
import { UserFacingError } from '../../../src/domain/errors.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wolf-guard-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Легаси-проект догфудера: .wolf/config.yaml без маркера + layout v1 (objects/). */
function initLegacyProject(): void {
  mkdirSync(join(dir, '.wolf', 'memory', 'objects', 'decision'), { recursive: true });
  writeFileSync(join(dir, '.wolf', 'config.yaml'), 'artifact_sources: []\n');
  writeFileSync(
    join(dir, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'),
    '---\nid: mem_legacy\ntype: decision\ntitle: Legacy decision\nstatus: active\nreview_state: accepted\nconfidence: medium\nimportance: 0.5\ncreated_at: 2026-06-29T14:00:00Z\nupdated_at: 2026-06-29T14:00:00Z\ncreated_by: user:test\nschema_version: 1\nsource:\n  kind: manual\nrelated:\n  files: []\n  docs: []\n  decisions: []\ntags: []\nsuperseded_by: null\n---\n\nBody text.\n'
  );
}

function backupStamps(): string[] {
  const backupRoot = join(dir, '.wolf', 'backup');
  return existsSync(backupRoot) ? readdirSync(backupRoot) : [];
}

describe('ensureCurrentSchema (спека §3 уровень 2)', () => {
  it('uninitialized project (no .wolf) → ok, no side effects', async () => {
    expect(await ensureCurrentSchema(dir)).toBe('ok');
    expect(existsSync(join(dir, '.wolf'))).toBe(false);
  });

  it('current project → ok, config untouched', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    const body = `artifact_sources: [docs]\nschema_version: ${CURRENT_SCHEMA_VERSION}\n`;
    writeFileSync(join(dir, '.wolf', 'config.yaml'), body);
    expect(await ensureCurrentSchema(dir)).toBe('ok');
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
  });

  it('legacy project → migrated: layout v2 applied, marker set, backup created', async () => {
    initLegacyProject();
    const result = await ensureCurrentSchema(dir);
    expect(result).toBe('migrated');
    // маркер проставлен
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toContain(
      `schema_version: ${CURRENT_SCHEMA_VERSION}`
    );
    // layout-миграция выполнена: объект переехал из objects/
    expect(existsSync(join(dir, '.wolf', 'memory', 'objects', 'decision', 'mem_legacy.md'))).toBe(false);
    expect(existsSync(join(dir, '.wolf', 'memory', 'shared', 'decisions', 'mem_legacy.md'))).toBe(true);
    // бэкап носителя схемы: config.yaml + легаси-objects (SQLite-кэш не бэкапим — спека §3)
    const stamps = backupStamps();
    expect(stamps).toHaveLength(1);
    expect(existsSync(join(dir, '.wolf', 'backup', stamps[0], 'config.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.wolf', 'backup', stamps[0], 'objects', 'decision', 'mem_legacy.md'))).toBe(true);
  });

  it('schema from the future → honest error, no writes (спека §3/§6)', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    const body = 'artifact_sources: []\nschema_version: 99\n';
    writeFileSync(join(dir, '.wolf', 'config.yaml'), body);
    await expect(ensureCurrentSchema(dir)).rejects.toThrow(UserFacingError);
    await expect(ensureCurrentSchema(dir)).rejects.toThrow(/npm install -g mister-wolf/);
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
    expect(backupStamps()).toEqual([]);
  });

  it('corrupted config.yaml → honest error with --recreate hint, no writes (спека §6)', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    const body = '{broken';
    writeFileSync(join(dir, '.wolf', 'config.yaml'), body);
    await expect(ensureCurrentSchema(dir)).rejects.toThrow(UserFacingError);
    await expect(ensureCurrentSchema(dir)).rejects.toThrow(/wolf init --recreate/);
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toBe(body);
    expect(backupStamps()).toEqual([]);
  });

  it('concurrent migration: second caller under the same lock sees the finished state', async () => {
    initLegacyProject();
    const [a, b] = await Promise.all([ensureCurrentSchema(dir), ensureCurrentSchema(dir)]);
    expect([a, b]).toContain('migrated');
    expect(readFileSync(join(dir, '.wolf', 'config.yaml'), 'utf-8')).toContain(
      `schema_version: ${CURRENT_SCHEMA_VERSION}`
    );
    // ровно один бэкап: двойная миграция не прошла
    expect(backupStamps()).toHaveLength(1);
  });

  it('lock file is removed after migration (.wolf/migrate.lock)', async () => {
    initLegacyProject();
    await ensureCurrentSchema(dir);
    expect(existsSync(join(dir, '.wolf', 'migrate.lock'))).toBe(false);
  });
});
