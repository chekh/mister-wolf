import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryRelationCommand } from '../../../src/adapters/cli/commands/memory-relation.js';
import { memoryAddCommand } from '../../../src/adapters/cli/commands/memory-add.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { relationsPath } from '../../../src/adapters/fs/project-paths.js';

// wolf relation list/remove (спека 2.13 §6.4): list --of показывает рёбра
// обеих сторон (recordRelation пишет пару), remove дописывает компенсирующую
// запись removed: true и удаляет ровно одну запись пары.
describe('wolf relation list/remove', () => {
  let dir: string;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-relation-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  async function addId(title: string): Promise<string> {
    await memoryAddCommand(dir).parseAsync(
      ['--type', 'lesson', '--title', title, '--body', 'b', '--created-by', 'test:unit'],
      { from: 'user' }
    );
    return logs
      .filter((l) => l.startsWith('Created memory object:'))
      .slice(-1)[0]!
      .split(': ')[1];
  }

  function rel(args: string[]): Promise<void> {
    return memoryRelationCommand(dir).parseAsync(args, { from: 'user' });
  }

  // строки вывода list начинаются с id ребра (evt_...), «Removed relation …» не матчится
  function listed(): string[] {
    return logs.filter((l) => /^evt_\S+\s+\S+ -[a-z_]+-> /.test(l));
  }

  it('list --of показывает рёбра обеих сторон; remove гасит ровно одну запись', async () => {
    const a = await addId('A');
    const b = await addId('B');
    await rel(['add', a, 'supports', b]); // пара: a -supports-> b, b -supported_by-> a

    await rel(['list', '--of', a]);
    expect(listed().some((l) => l.includes(`${a} -supports-> ${b}`))).toBe(true);
    expect(listed().some((l) => l.includes(`${b} -supported_by-> ${a}`))).toBe(true);

    // id ребра — первый токен строки списка
    const forwardLine = listed().find((l) => l.includes(`${a} -supports-> ${b}`))!;
    const forwardId = forwardLine.split('  ')[0]!;
    logs.length = 0;

    await rel(['remove', forwardId]);
    expect(logs).toContain(`Removed relation ${forwardId}: ${a} -supports-> ${b}`);

    // повторный list: прямое ребро погасло, обратное живо (remove — ровно одна запись)
    await rel(['list', '--of', a]);
    expect(listed().some((l) => l.includes(`${a} -supports-> ${b}`))).toBe(false);
    expect(listed().some((l) => l.includes(`${b} -supported_by-> ${a}`))).toBe(true);

    // компенсирующая запись physically в файле, но list() её не отдаёт
    const live = await new JsonlRelationLog(relationsPath(dir)).list();
    expect(live.length).toBe(1);
    expect(live.every((r) => r.removed !== true)).toBe(true);
  });

  it('повторный add после remove оживляет ребро (last-write-wins по тройке)', async () => {
    const a = await addId('A');
    const b = await addId('B');
    await rel(['add', a, 'supports', b]);
    await rel(['list', '--of', a]);

    const forwardLine = listed().find((l) => l.includes(`${a} -supports-> ${b}`))!;
    logs.length = 0;
    await rel(['remove', forwardLine.split('  ')[0]!]);

    // ребро погаслено компенсацией
    await rel(['list', '--of', a]);
    expect(listed().some((l) => l.includes(`${a} -supports-> ${b}`))).toBe(false);

    // новая запись без removed — последняя по тройке, ребро живо
    await rel(['add', a, 'supports', b]);
    await rel(['list', '--of', a]);
    expect(listed().some((l) => l.includes(`${a} -supports-> ${b}`))).toBe(true);
  });

  it('list --json отдаёт массив записей', async () => {
    const a = await addId('A');
    const b = await addId('B');
    await rel(['add', a, 'supports', b]);
    await rel(['list', '--json']);
    const rows = JSON.parse(logs[logs.length - 1]!) as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    expect(rows.every((r) => typeof r['id'] === 'string')).toBe(true);
  });

  it('пустой результат — No relations.; remove несуществующего — UserFacingError', async () => {
    await rel(['list']);
    expect(logs).toContain('No relations.');
    await expect(rel(['remove', 'rel_nope'])).rejects.toThrow(/Relation not found/);
  });
});
