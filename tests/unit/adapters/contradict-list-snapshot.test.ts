// T-333-8.5 (F-4): `wolf contradict list` делает РОВНО ОДИН снимок подавлений
// (log.suppressions()) на команду — строки считаются по уже полученному
// списку; N вызовов (снимок на каждую строку) — дефект стоимости и
// консистентности (снимок должен быть одним).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryContradictCommand } from '../../../src/adapters/cli/commands/memory-contradict.js';
import { JsonlMicroNoteDeliveryLog } from '../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { MICRO_NOTE_TAG } from '../../../src/app/use-cases/micro-note-delivery.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

describe('contradict list: one suppressions() snapshot per command (T-333-8.5)', () => {
  let dir: string;
  let logs: string[];

  function microNote(id: string): MemoryObject {
    return {
      title: `Hint ${id}`,
      body: `Body of ${id}.`,
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-15T00:00:00Z',
      created_by: 'user:test',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [MICRO_NOTE_TAG],
      superseded_by: null,
      facet: 'howto',
      type: 'note',
      id,
    } as MemoryObject;
  }

  function run(args: string[]): Promise<void> {
    const cmd = memoryContradictCommand(dir).exitOverride();
    for (const sub of cmd.commands) sub.copyInheritedSettings(cmd);
    return cmd.parseAsync(args, { from: 'user' });
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-list-snap-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('list makes exactly one suppressions() call for the whole command (2 open rows)', async () => {
    const store = new MarkdownMemoryStore(dir);
    await store.save(microNote('n_a') as never);
    await store.save(microNote('n_b') as never);
    await run(['report', '--note', 'n_a', '--reason', 'r1', '--evidence', 'e1']);
    await run(['report', '--note', 'n_b', '--reason', 'r2', '--evidence', 'e2']);

    const spy = vi.spyOn(JsonlMicroNoteDeliveryLog.prototype, 'suppressions');
    await run(['list']);
    expect(spy).toHaveBeenCalledTimes(1); // ассерт ДО restore (restore сбрасывает calls)
    spy.mockRestore();
    const rows = logs.filter((l) => l.includes('block:'));
    expect(rows).toHaveLength(2);
  });
});
