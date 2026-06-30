import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveBlocker } from '../../../src/app/use-cases/resolve-blocker.js';
import { createBlocker } from '../../../src/app/use-cases/create-blocker.js';
import { createDecision } from '../../../src/app/use-cases/create-decision.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

describe('resolveBlocker', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-resolve-blocker-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('transitions blocker status to resolved and emits event', async () => {
    const created = await createBlocker(
      { store, log, clock, idGen },
      {
        title: 'Failing test',
        impact: 'Blocks release.',
        createdBy: 'user:test',
      }
    );

    await resolveBlocker({ store, log, clock, idGen }, created.object.id);

    const loaded = await store.get(created.object.id);
    expect(loaded?.status).toBe('resolved');

    const events = await log.readAll();
    expect(events.some((e) => e.type === 'memory.resolved')).toBe(true);
  });

  it('throws if blocker is not found', async () => {
    await expect(resolveBlocker({ store, log, clock, idGen }, 'missing-blocker-id')).rejects.toThrow(
      'Memory object not found: missing-blocker-id'
    );
  });

  it('throws if object is not a blocker', async () => {
    const created = await createDecision(
      { store, log, clock, idGen },
      { title: 'Architecture choice', body: 'Use SQLite.', createdBy: 'user:test' }
    );

    await expect(resolveBlocker({ store, log, clock, idGen }, created.object.id)).rejects.toThrow(
      `Memory object is not a blocker: ${created.object.id}`
    );
  });
});
