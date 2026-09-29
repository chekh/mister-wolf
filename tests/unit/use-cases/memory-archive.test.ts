import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryArchiveCommand } from '../../../src/adapters/cli/commands/memory-archive.js';
import { memoryAddCommand } from '../../../src/adapters/cli/commands/memory-add.js';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import { createCliContainer } from '../../../src/bootstrap/container.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

// wolf archive (спека 2.13 §6.1 E1): сахар transition → archived.
// Инвариант: archive ≡ transitionMemoryObject(..., 'archived') —
// одинаковый статус и идентичная по форме запись memory.transitioned.
describe('wolf archive ≡ transition archived', () => {
  let dir: string;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-archive-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  async function addLesson(title: string): Promise<string> {
    await memoryAddCommand(dir).parseAsync(
      ['--type', 'lesson', '--title', title, '--body', 'b', '--created-by', 'test:unit'],
      { from: 'user' }
    );
    return logs
      .filter((l) => l.startsWith('Created memory object:'))
      .slice(-1)[0]!
      .split(': ')[1];
  }

  it('archive-команда и transitionMemoryObject дают одинаковый результат', async () => {
    const viaArchive = await addLesson('A');
    const viaTransition = await addLesson('B');

    await memoryArchiveCommand(dir).parseAsync([viaArchive], { from: 'user' });
    await transitionMemoryObject(createCliContainer(dir), viaTransition, 'archived', 'user:cli');

    const store = new MarkdownMemoryStore(dir);
    expect((await store.get(viaArchive))!.status).toBe('archived');
    expect((await store.get(viaTransition))!.status).toBe('archived');
    expect(logs).toContain(`Archived ${viaArchive}.`);

    const events = (await new JsonlEventLog(eventsPath(dir)).readAll()).filter((e) => e.type === 'memory.transitioned');
    expect(events.length).toBe(2);
    const payloads = events.map((e) => e.payload as Record<string, unknown>);
    for (const p of payloads) {
      expect(Object.keys(p).sort()).toEqual(['from', 'memory_id', 'to']);
      expect(p['to']).toBe('archived');
    }
    expect(payloads[0]!['from']).toBe(payloads[1]!['from']); // одинаковый исходный статус
    expect(payloads.map((p) => p['memory_id']).sort()).toEqual([viaArchive, viaTransition].sort());
  });
});
