import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { summarizeSession } from '../../../src/app/use-cases/summarize-session.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';
import { initProjectMemory } from '../../../src/app/use-cases/init-project-memory.js';
import { FsProjectInitializer } from '../../../src/adapters/fs/fs-project-initializer.js';

describe('summarizeSession', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-wrap-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a session-summary from recent events', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    await log.append({
      id: 'evt_1',
      type: 'memory.added',
      timestamp: new Date().toISOString(),
      actor: 'user:demo',
      payload: { memory_id: 'mem_a', type: 'decision' },
    });

    const result = await summarizeSession({ store, log, clock, idGen }, { createdBy: 'user:demo' });

    expect(result).not.toBeNull();
    expect(result!.object.type).toBe('session-summary');
    expect(result!.object.body).toContain('mem_a');
    expect(result!.object.tags).toContain('session-summary');
  });

  it('creates a summary with default body when event log is empty', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const result = await summarizeSession({ store, log, clock, idGen }, { createdBy: 'user:demo' });

    expect(result).not.toBeNull();
    expect(result!.object.body).toBe('No recent events.');
  });

  it('returns null when a summary was created within the cooldown window', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    await summarizeSession({ store, log, clock, idGen }, { createdBy: 'user:demo' });
    const second = await summarizeSession({ store, log, clock, idGen }, { createdBy: 'user:demo' });

    expect(second).toBeNull();
  });

  it('uses custom title and tags when provided', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const result = await summarizeSession(
      { store, log, clock, idGen },
      { createdBy: 'user:demo', title: 'Custom title', tags: ['custom'] }
    );

    expect(result).not.toBeNull();
    expect(result!.object.title).toBe('Custom title');
    expect(result!.object.tags).toContain('session-summary');
    expect(result!.object.tags).toContain('custom');
  });

  it('only includes events after the previous session-summary', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const first = await summarizeSession({ store, log, clock, idGen }, { createdBy: 'user:demo' });
    expect(first).not.toBeNull();

    // Cooldown prevents a second summary immediately, so rewind the clock by 6 minutes.
    const olderClock = {
      now: () => new Date(Date.now() + 6 * 60 * 1000),
    };

    await log.append({
      id: 'evt_after',
      type: 'memory.added',
      timestamp: olderClock.now().toISOString(),
      actor: 'user:demo',
      payload: { memory_id: 'mem_after', type: 'decision' },
    });

    const second = await summarizeSession({ store, log, clock: olderClock, idGen }, { createdBy: 'user:demo' });
    expect(second).not.toBeNull();
    expect(second!.object.body).toContain('mem_after');
    expect(second!.object.body).not.toContain(first!.object.id);
  });
});
