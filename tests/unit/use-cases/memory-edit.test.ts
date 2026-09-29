import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryEditCommand } from '../../../src/adapters/cli/commands/memory-edit.js';
import { memoryAddCommand } from '../../../src/adapters/cli/commands/memory-add.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

// wolf edit (спека 2.13 §6.1): правка title/body, diff-аудит — по событию
// memory.edited на поле с before/after (обрезка 200 симв).
describe('wolf edit', () => {
  let dir: string;
  let logs: string[];
  let id: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-edit-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    await memoryAddCommand(dir).parseAsync(
      ['--type', 'lesson', '--title', 'T', '--body', 'B', '--created-by', 'test:unit'],
      { from: 'user' }
    );
    id = logs.find((l) => l.startsWith('Created memory object:'))!.split(': ')[1];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args: string[]): Promise<void> {
    return memoryEditCommand(dir).parseAsync([id, ...args], { from: 'user' });
  }

  async function editedEvents() {
    const events = await new JsonlEventLog(eventsPath(dir)).readAll();
    return events.filter((e) => e.type === 'memory.edited');
  }

  it('--title меняет title в store и пишет ровно одно событие с before/after', async () => {
    await run(['--title', 'T2']);
    const obj = await new MarkdownMemoryStore(dir).get(id);
    expect(obj!.title).toBe('T2');
    expect(obj!.body).toBe('B'); // не тронуто

    const events = await editedEvents();
    expect(events.length).toBe(1);
    expect(events[0].payload).toMatchObject({ memory_id: id, field: 'title', before: 'T', after: 'T2' });
    expect(logs).toContain(`Edited ${id}: title`);
  });

  it('--title + --body вместе → два события, по одному на поле', async () => {
    await run(['--title', 'T2', '--body', 'B2']);
    const obj = await new MarkdownMemoryStore(dir).get(id);
    expect(obj!.title).toBe('T2');
    expect(obj!.body).toBe('B2');

    const events = await editedEvents();
    expect(events.length).toBe(2);
    const fields = events.map((e) => (e.payload as Record<string, unknown>)['field']);
    expect(new Set(fields)).toEqual(new Set(['title', 'body']));
  });

  it('обрезка: before/after длиннее 200 симв пишутся обрезанными до 200', async () => {
    await run(['--body', 'x'.repeat(300)]); // before='B' (короткий), after=300
    await run(['--body', 'y'.repeat(300)]); // before=300, after=300
    const events = await editedEvents();
    expect(events.length).toBe(2);
    const second = events[1].payload as Record<string, unknown>;
    expect(String(second['before']).length).toBe(200);
    expect(String(second['after']).length).toBe(200);
    expect(String(second['before'])).toBe('x'.repeat(200));
    // store хранит полные значения, обрезка только в событии
    const obj = await new MarkdownMemoryStore(dir).get(id);
    expect(obj!.body).toBe('y'.repeat(300));
  });

  it('edit без флагов / пустой title → UserFacingError', async () => {
    await expect(run([])).rejects.toThrow(/Nothing to edit/);
    await expect(run(['--title', '   '])).rejects.toThrow(/empty/i);
  });

  it('несуществующий id → rejects', async () => {
    await expect(memoryEditCommand(dir).parseAsync(['mem_nope', '--title', 'X'], { from: 'user' })).rejects.toThrow(
      /not found/i
    );
  });
});
