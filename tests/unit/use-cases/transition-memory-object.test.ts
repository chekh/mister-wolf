import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { loadWolfConfigSync } from '../../../src/adapters/fs/config-file.js';
import { mergeTaxonomy } from '../../../src/domain/taxonomy.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function makeTaskBrief(id: string): MemoryObject {
  return {
    id,
    type: 'task-brief',
    title: 'Batch task',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-06-29T14:00:00Z',
    updated_at: '2026-06-29T14:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: {},
    tags: [],
    superseded_by: null,
    body: '...',
    executor: 'executor-lead',
    priority: 'high',
  };
}

// wave13-a: task-brief больше не core-тип — подаётся как project-тип (dogfood)
// через config.yaml; пишется в КАЖДОМ beforeEach, чтобы глобальный typeSchemaCache
// стора видел task-brief с первого парса файла
const TASK_BRIEF_CONFIG = `artifact_sources: []
memory_types:
  core: {}
  project:
    task-brief:
      lifecycle: [active, completed, paused]
      subdir_thread: tasks
      subdir_shared: ~
`;

describe('transitionMemoryObject', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-transition-'));
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), TASK_BRIEF_CONFIG);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies allowed transitions', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Governance test', body: '...', createdBy: 'user:test' }
    );

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'stale');
    const stale = await store.get(added.object.id);
    expect(stale?.status).toBe('stale');

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'active');
    const active = await store.get(added.object.id);
    expect(active?.status).toBe('active');
  });

  it('rejects invalid transitions', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Governance test', body: '...', createdBy: 'user:test' }
    );

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'superseded');
    await expect(transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'active')).rejects.toThrow(
      'Invalid transition'
    );
  });

  it('rejects active to accepted transition', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'lesson', title: 'Transition test', body: '...', createdBy: 'user:test' }
    );

    await expect(transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'accepted')).rejects.toThrow(
      'Invalid transition from active to accepted'
    );
  });

  it('rejects globally allowed transition outside type lifecycle (task-brief active -> open)', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const declarations = [...mergeTaxonomy(loadWolfConfigSync(dir)).types.values()];

    const id = idGen.generateMemoryId(clock.now(), 'Batch task');
    await store.save(makeTaskBrief(id));

    await expect(transitionMemoryObject({ store, log, clock, idGen, declarations }, id, 'open')).rejects.toThrow(
      /lifecycle/
    );
  });

  it('allows transition within type lifecycle (task-brief active -> completed)', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();
    const declarations = [...mergeTaxonomy(loadWolfConfigSync(dir)).types.values()];

    const id = idGen.generateMemoryId(clock.now(), 'Batch task');
    await store.save(makeTaskBrief(id));

    await transitionMemoryObject({ store, log, clock, idGen, declarations }, id, 'completed');
    const updated = await store.get(id);
    expect(updated?.status).toBe('completed');
  });

  it('allows blocker-note active -> resolved via generic transition', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    // wave13-a: blocker → note+facet pitfall; note имеет FULL lifecycle
    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'note', facet: 'pitfall', title: 'Broken build', createdBy: 'user:test' }
    );

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'resolved');
    const updated = await store.get(added.object.id);
    expect(updated?.status).toBe('resolved');
  });

  it('auto-creates session-summary (note+history) when transitioning to answered', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'note', facet: 'context', status: 'open', title: 'Which approach?', createdBy: 'user:test' }
    );

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'answered');

    // wave13-a: session-summary → note+facet history с тегом session-summary
    const summaries = (await store.list()).filter(
      (obj) =>
        obj.type === 'note' && (obj as { facet?: string }).facet === 'history' && obj.tags.includes('session-summary')
    );
    expect(summaries.length).toBeGreaterThan(0);
  });

  it('allows question-note active -> answered via generic transition', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'note', facet: 'context', title: 'Which approach?', createdBy: 'user:test', status: 'active' }
    );
    expect(added.object.status).toBe('active');

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'answered');
    const updated = await store.get(added.object.id);
    expect(updated?.status).toBe('answered');
  });

  it('allows info-request-note open -> answered', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      {
        type: 'note', // wave13-a: info-request → note+facet context
        facet: 'context',
        status: 'open',
        title: 'Need API details',
        createdBy: 'user:test',
      }
    );
    expect(added.object.status).toBe('open');

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'answered');
    const updated = await store.get(added.object.id);
    expect(updated?.status).toBe('answered');
  });

  it('allows council-question-note open -> answered', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'note', facet: 'context', status: 'open', title: 'Council Q', createdBy: 'user:test' }
    );
    expect(added.object.status).toBe('open');

    await transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'answered');
    const updated = await store.get(added.object.id);
    expect(updated?.status).toBe('answered');
  });

  it('rejects decision active -> answered outside type lifecycle', async () => {
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'decision', title: 'Use SQLite', createdBy: 'user:test' }
    );

    await expect(transitionMemoryObject({ store, log, clock, idGen }, added.object.id, 'answered')).rejects.toThrow(
      /lifecycle/
    );
  });
});
