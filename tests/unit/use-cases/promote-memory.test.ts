import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promoteWorktreeMemory } from '../../../src/app/use-cases/promote-memory.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

// WP3 §6.2 (спека 2.16): promote — перевод worktree-scoped объектов в main;
// каркас — реальные адаптеры на tmp (прецедент transition-memory-object.test.ts).
// Объекты с scope создаём типа rule — единственный core-тип, чья декларация
// допускает поле scope (memory-types.ts, WP3 §6.2: optional string).
describe('promoteWorktreeMemory', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let clock: SystemClock;
  let idGen: HashIdGenerator;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-promote-'));
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    clock = new SystemClock();
    idGen = new HashIdGenerator();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps() {
    return { store, log, clock, idGen };
  }

  async function seedRule(title: string, scope: string): Promise<string> {
    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'rule', title, body: '...', createdBy: 'user:test', extra: { scope } }
    );
    return added.object.id;
  }

  async function scopeOf(id: string): Promise<string | undefined> {
    return ((await store.get(id)) as { scope?: string } | null)?.scope;
  }

  it("promotes 'worktree:x' objects to main and logs scope_promoted events", async () => {
    const x1 = await seedRule('Rule X1', 'worktree:x');
    const x2 = await seedRule('Rule X2', 'worktree:x');
    const y = await seedRule('Rule Y', 'worktree:y');

    const result = await promoteWorktreeMemory(deps(), 'x');
    expect(result).toEqual({ promoted: 2, scopeFrom: 'worktree:x' });

    expect(await scopeOf(x1)).toBe('main');
    expect(await scopeOf(x2)).toBe('main');
    expect(await scopeOf(y)).toBe('worktree:y'); // чужой scope не тронут

    const events = await log.readAll();
    const promotedEvents = events.filter((e) => e.type === 'memory.scope_promoted');
    expect(promotedEvents).toHaveLength(2);
    for (const e of promotedEvents) {
      expect(e.payload).toMatchObject({ memory_id: expect.any(String), from: 'worktree:x', to: 'main' });
    }
  });

  it('is idempotent: second promote of the same worktree reports zero', async () => {
    const id = await seedRule('Rule X1', 'worktree:x');
    expect((await promoteWorktreeMemory(deps(), 'x')).promoted).toBe(1);

    const again = await promoteWorktreeMemory(deps(), 'x');
    expect(again.promoted).toBe(0);
    expect(await scopeOf(id)).toBe('main');

    const events = await log.readAll();
    expect(events.filter((e) => e.type === 'memory.scope_promoted')).toHaveLength(1);
  });

  it('rejects invalid worktree names with a git worktree list hint', async () => {
    await expect(promoteWorktreeMemory(deps(), 'bad name!')).rejects.toThrow('git worktree list');
  });
});
