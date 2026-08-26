import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { loadWolfConfigSync } from '../../../src/adapters/fs/config-file.js';
import { mergeTaxonomy } from '../../../src/domain/taxonomy.js';

const CONFIG_YAML = `artifact_sources: []
memory_types:
  core: {}
  project:
    incident:
      lifecycle: [open, archived]
      subdir_thread: ~
      subdir_shared: incidents
`;

describe('project type placement (config.yaml → FS)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-projtype-'));
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), CONFIG_YAML);
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('addMemoryObject creates project-typed object under shared/<subdir>/', async () => {
    const { types } = mergeTaxonomy(loadWolfConfigSync(dir));
    const { object } = await addMemoryObject(
      { store, log, clock: new SystemClock(), idGen: new HashIdGenerator(), declarations: [...types.values()] },
      { type: 'incident' as never, title: 'Prod incident', body: 'API 5xx spike.', createdBy: 'user:test' }
    );

    const path = join(dir, '.wolf', 'memory', 'shared', 'incidents', `${object.id}.md`);
    expect(existsSync(path)).toBe(true);

    // Read-back через store.get() вне scope (z.enum в MemoryObjectSchema) — парсим frontmatter напрямую.
    const content = readFileSync(path, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---\n/);
    expect(match).not.toBeNull();
    const frontmatter = yaml.load(match![1]) as Record<string, unknown>;
    expect(frontmatter.type).toBe('incident');
    expect(frontmatter.status).toBe('open');
  });
});
