import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryUpdateCommand } from '../../../src/adapters/cli/commands/memory-update.js';
import { memoryComplainCommand } from '../../../src/adapters/cli/commands/memory-complain.js';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import { createCliContainer } from '../../../src/bootstrap/container.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

// wolf update (complaint-v2 §7.2, Q5): whitelist-режим — диспетчер меняет
// только поля триажа (set: triage/resolution; inc: dispatch_ages/corroborations),
// жалоба автора (rule/evidence/proposal/about) неприкосновенна; tags — append.
describe('wolf update (complaint-v2 whitelist)', () => {
  let dir: string;
  let logs: string[];
  let complaintId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-update-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    await memoryComplainCommand(dir).parseAsync(
      [
        '--about',
        'worker-implementer',
        '--rule',
        'п.2 МЕТОДИКИ требует читать файлы до правки',
        '--evidence',
        'дословная цитата трения',
        '--proposal',
        'уточнить до Y',
      ],
      { from: 'user' }
    );
    const line = logs.find((l) => l.startsWith('Complaint recorded:'));
    complaintId = line!.split(': ')[1];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args: string[]): Promise<void> {
    return memoryUpdateCommand(dir).parseAsync(args, { from: 'user' });
  }

  async function get(): Promise<Record<string, unknown>> {
    const obj = await new MarkdownMemoryStore(dir).get(complaintId);
    expect(obj).not.toBeNull();
    return obj as Record<string, unknown>;
  }

  it('--set triage/resolution обновляет поля + событие memory.updated с актёром', async () => {
    await run([complaintId, '--set', 'triage=fix-instruction', '--actor', 'executor:lead-1']);
    let obj = await get();
    expect(obj['triage']).toBe('fix-instruction');

    await run([complaintId, '--set', 'resolution=инструкция: уточнил бриф', '--actor', 'executor:lead-1']);
    obj = await get();
    expect(obj['resolution']).toBe('инструкция: уточнил бриф');

    const events = await new JsonlEventLog(eventsPath(dir)).readAll();
    const updates = events.filter((e) => e.type === 'memory.updated');
    expect(updates.length).toBe(2);
    expect(updates.every((e) => e.actor === 'executor:lead-1')).toBe(true);
    expect(updates.every((e) => (e.payload as Record<string, unknown>)['memory_id'] === complaintId)).toBe(true);
  });

  it('whitelist: --set rule/evidence/proposal/about отклоняется', async () => {
    for (const field of ['rule', 'evidence', 'proposal', 'about']) {
      await expect(run([complaintId, '--set', `${field}=подделка`])).rejects.toThrow(/not settable/);
    }
    const obj = await get();
    expect(obj['rule']).toBe('п.2 МЕТОДИКИ требует читать файлы до правки');
  });

  it('--inc только монотонные счётчики dispatch_ages/corroborations; накапливается', async () => {
    await run([complaintId, '--inc', 'dispatch_ages=1']);
    await run([complaintId, '--inc', 'dispatch_ages=1']);
    await run([complaintId, '--inc', 'corroborations=2']);
    const obj = await get();
    expect(obj['dispatch_ages']).toBe(2);
    expect(obj['corroborations']).toBe(3);
  });

  it('--inc валидирует: >0, только int-поля whitelist, --set счётчиков запрещён', async () => {
    await expect(run([complaintId, '--inc', 'dispatch_ages=0'])).rejects.toThrow(/> 0/);
    await expect(run([complaintId, '--inc', 'dispatch_ages=-1'])).rejects.toThrow(/> 0/);
    await expect(run([complaintId, '--inc', 'dispatch_ages=abc'])).rejects.toThrow();
    await expect(run([complaintId, '--inc', 'triage=1'])).rejects.toThrow(/--inc/);
    await expect(run([complaintId, '--set', 'dispatch_ages=5'])).rejects.toThrow(/--inc/);
    await expect(run([complaintId, '--set', 'corroborations=99'])).rejects.toThrow(/--inc/);
  });

  it('--tags добавляет теги (append, не замена)', async () => {
    await run([complaintId, '--tags', 'stalled,complaint']);
    const obj = await get();
    expect(obj['tags']).toContain('complaint'); // исходный тег не потерян
    expect(obj['tags']).toContain('stalled');
  });

  it('поле вне декларации типа — ошибка (не-complaint объект)', async () => {
    // lesson не имеет triage — set обязан упасть до записи
    const { addMemoryObject } = await import('../../../src/app/use-cases/add-memory-object.js');
    const store = new MarkdownMemoryStore(dir);
    // lesson создаём напрямую через addMemoryObject с минимальными deps из контейнера CLI нельзя —
    // используем отдельный tmp: проще через add CLI не нужно; кладём lesson напрямую
    const { createCliContainer } = await import('../../../src/bootstrap/container.js');
    const deps = createCliContainer(dir);
    const res = await addMemoryObject(deps, {
      type: 'lesson',
      title: 'L',
      body: 'b',
      createdBy: 'user:test',
    });
    await expect(run([res.object.id, '--set', 'triage=x'])).rejects.toThrow(/has no field/);
    // объект не тронут
    expect((await store.get(res.object.id))?.updated_at).toBe(res.object.updated_at);
  });

  it('неизвестный id — ошибка', async () => {
    await expect(run(['mem_nope', '--set', 'triage=x'])).rejects.toThrow(/not found/i);
  });
});

// Lifecycle жалобы (спека §3.3): штатные переходы open→resolved|rejected,
// resolved/rejected→archived; рецидив resolved→open запрещён governance.
describe('complaint lifecycle transitions', () => {
  let dir: string;
  let logs: string[];
  let complaintId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-complaint-lc-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    await memoryComplainCommand(dir).parseAsync(
      ['--about', 'worker-reviewer', '--rule', 'r', '--evidence', 'e', '--proposal', 'p'],
      { from: 'user' }
    );
    complaintId = logs.find((l) => l.startsWith('Complaint recorded:'))!.split(': ')[1];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  // CLI transition хардкодит process.cwd(); в тестах — прямой use-case с tmp-контейнером
  function transition(status: string): Promise<void> {
    return transitionMemoryObject(createCliContainer(dir), complaintId, status as never, 'executor:lead-1');
  }

  function run0(baseDir: string, id: string, ...args: string[]): Promise<void> {
    return memoryUpdateCommand(baseDir).parseAsync([id, ...args], { from: 'user' });
  }

  it('open → resolved (после update resolution — контракт триажа)', async () => {
    await run0(dir, complaintId, '--set', 'resolution=мутация: пара id');
    await transition('resolved');
    const obj = await new MarkdownMemoryStore(dir).get(complaintId);
    expect(obj!.status).toBe('resolved');
  });

  it('open → rejected; rejected → archived (гигиена); resolved → open запрещён', async () => {
    await run0(dir, complaintId, '--set', 'resolution=duplicate: mem_x');
    await transition('rejected');
    expect((await new MarkdownMemoryStore(dir).get(complaintId))!.status).toBe('rejected');
    await transition('archived');
    expect((await new MarkdownMemoryStore(dir).get(complaintId))!.status).toBe('archived');

    await memoryComplainCommand(dir).parseAsync(
      ['--about', 'worker-reviewer', '--rule', 'r2', '--evidence', 'e2', '--proposal', 'p2'],
      { from: 'user' }
    );
    const secondId = logs
      .filter((l) => l.startsWith('Complaint recorded:'))
      .slice(-1)[0]
      .split(': ')[1];
    const deps = createCliContainer(dir);
    await transitionMemoryObject(deps, secondId, 'resolved', 'executor:lead-1');
    await expect(transitionMemoryObject(deps, secondId, 'open', 'executor:lead-1')).rejects.toThrow(
      /Invalid transition/
    );
  });
});
