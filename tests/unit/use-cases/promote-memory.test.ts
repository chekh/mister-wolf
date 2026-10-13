import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promoteWorktreeMemory } from '../../../src/app/use-cases/promote-memory.js';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import type { WorktreeIdentity } from '../../../src/adapters/fs/memory-root.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

// WP3 §6.2 (2.16): promote — перевод worktree-scoped объектов в main;
// каркас — реальные адаптеры на tmp (прецедент transition-memory-object.test.ts).
// 2.17.1 REQ-02 (R02), design §3.2: владелец — идентичность ТЕКУЩЕЙ копии
// (резолвер инжектится тестом; прод-дефолт — resolveWorktreeIdentity(cwd));
// переводятся объекты ОБОИХ токенов владельца — WT-ID и однозначное legacy-имя.
const OWN_WT_ID = 'worktree:w-0123456789ab';

const ident = (legacyName: string, legacyUnique: boolean): WorktreeIdentity => ({
  id: OWN_WT_ID,
  legacyName,
  legacyUnique,
});

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

  function deps(identity: WorktreeIdentity | null) {
    return { store, log, clock, idGen, resolveIdentity: () => identity };
  }

  async function seedRule(title: string, scope: string, body = 'important body'): Promise<string> {
    const added = await addMemoryObject(
      { store, log, clock, idGen },
      { type: 'rule', title, body, createdBy: 'user:test', extra: { scope } }
    );
    return added.object.id;
  }

  async function scopeOf(id: string): Promise<string | undefined> {
    return ((await store.get(id)) as { scope?: string } | null)?.scope;
  }

  it('S-15: переводит ОБА токена владельца (WT-ID + однозначное legacy) в main, содержание не меняется', async () => {
    const byWtId = await seedRule('Rule by WT-ID', OWN_WT_ID, 'body A');
    const byLegacy = await seedRule('Rule by legacy name', 'worktree:x', 'body B');
    const foreign = await seedRule('Foreign rule', 'worktree:y');

    const result = await promoteWorktreeMemory(deps(ident('x', true)), 'x');
    expect(result.promoted).toBe(2);
    expect(result.scopeFrom).toBe(`${OWN_WT_ID}, worktree:x`);
    expect(result.conflicts).toEqual([]);

    expect(await scopeOf(byWtId)).toBe('main');
    expect(await scopeOf(byLegacy)).toBe('main');
    expect((await store.get(byLegacy))?.body).toBe('body B'); // содержание не тронуто
    expect(await scopeOf(foreign)).toBe('worktree:y'); // чужой scope не тронут

    const events = (await log.readAll()).filter((e) => e.type === 'memory.scope_promoted');
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.payload.from).sort()).toEqual([OWN_WT_ID, 'worktree:x'].sort());
  });

  it('S-16: неоднозначное legacy-имя — конфликт, legacy-объекты НЕ переписаны; WT-ID всё равно переводится', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const byWtId = await seedRule('Rule by WT-ID', OWN_WT_ID);
      const byLegacy = await seedRule('Ambiguous legacy rule', 'worktree:x');

      const result = await promoteWorktreeMemory(deps(ident('x', false)), 'x');
      expect(result.promoted).toBe(1);
      expect(result.conflicts).toEqual(['worktree:x']);
      expect(err).toHaveBeenCalledWith(expect.stringContaining('worktree:x'));

      expect(await scopeOf(byWtId)).toBe('main');
      expect(await scopeOf(byLegacy)).toBe('worktree:x'); // не переписан
    } finally {
      err.mockRestore();
    }
  });

  it('S-17: идентичность null (main/битое) — честный 0, объекты не изменены, не падает', async () => {
    const keep = await seedRule('Keep me', 'worktree:x');

    const result = await promoteWorktreeMemory(deps(null), 'x');
    expect(result).toEqual({ promoted: 0, scopeFrom: 'worktree:x', conflicts: [] });
    expect(await scopeOf(keep)).toBe('worktree:x');

    const events = (await log.readAll()).filter((e) => e.type === 'memory.scope_promoted');
    expect(events).toHaveLength(0);
  });

  it('идемпотентность: повторный promote — 0', async () => {
    await seedRule('Rule X1', OWN_WT_ID);
    expect((await promoteWorktreeMemory(deps(ident('x', true)), 'x')).promoted).toBe(1);

    const again = await promoteWorktreeMemory(deps(ident('x', true)), 'x');
    expect(again.promoted).toBe(0);
    expect((await log.readAll()).filter((e) => e.type === 'memory.scope_promoted')).toHaveLength(1);
  });

  it('rejects invalid worktree names with a git worktree list hint', async () => {
    await expect(promoteWorktreeMemory(deps(ident('x', true)), 'bad name!')).rejects.toThrow('git worktree list');
  });
});
