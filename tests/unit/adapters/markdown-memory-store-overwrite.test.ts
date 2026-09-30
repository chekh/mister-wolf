import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import { MemoryEventSchema, type MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';

function makeObject(overrides: Partial<MemoryObject> = {}): MemoryObject {
  return {
    id: 'mem_20260930_collision-guard_ab12cd',
    type: 'lesson',
    title: 'Original title',
    body: 'original body',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-09-30T12:00:00.000Z',
    updated_at: '2026-09-30T12:00:00.000Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
    ...overrides,
  };
}

/** Первый .md под .wolf/memory (walk). */
function findMemoryFile(dir: string): string | null {
  const walk = (d: string): string | null => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (entry.name.endsWith('.md')) return full;
    }
    return null;
  };
  try {
    return walk(join(dir, '.wolf', 'memory'));
  } catch {
    return null;
  }
}

// P300/2.14 §5.2: spy-лог фиксирует состояние файла в момент append —
// доказательство «событие ДО записи»
describe('MarkdownMemoryStore overwrite trail (P300/2.14 §5.2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-store-overwrite-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeSpyLog() {
    const appended: { event: MemoryEvent; fileAtAppend: string | null }[] = [];
    const overwriteLog = {
      append: async (event: MemoryEvent) => {
        const f = findMemoryFile(dir);
        appended.push({ event, fileAtAppend: f ? readFileSync(f, 'utf-8') : null });
      },
    };
    return { appended, overwriteLog };
  }

  it('save поверх существующего → memory.overwritten ДО записи', async () => {
    const A = makeObject();
    await new MarkdownMemoryStore(dir).save(A); // первый store — без лога

    const { appended, overwriteLog } = makeSpyLog();
    await new MarkdownMemoryStore(dir, undefined, overwriteLog).save({ ...A, title: 'New title' });

    expect(appended).toHaveLength(1);
    const { event, fileAtAppend } = appended[0];
    expect(MemoryEventSchema.parse(event)).toBeTruthy();
    expect(event.type).toBe('memory.overwritten');
    expect(event.actor).toBe('system');
    expect(event.payload.memory_id).toBe(A.id);
    expect(event.payload.prev_title).toBe('Original title');
    expect(event.payload.prev_status).toBe('active');
    // событие зафиксировано ДО мутации файла
    expect(fileAtAppend).toContain('Original title');
    expect(fileAtAppend).not.toContain('New title');
    // файл после save содержит новую версию
    const file = findMemoryFile(dir);
    expect(file).not.toBeNull();
    expect(readFileSync(file!, 'utf-8')).toContain('New title');
  });

  it('prev_title обрезается до 120', async () => {
    const longTitle = 'T'.repeat(200);
    await new MarkdownMemoryStore(dir).save(makeObject({ title: longTitle }));

    const { appended, overwriteLog } = makeSpyLog();
    await new MarkdownMemoryStore(dir, undefined, overwriteLog).save(makeObject({ title: 'Short' }));

    expect(appended).toHaveLength(1);
    expect((appended[0].event.payload.prev_title as string).length).toBe(120);
  });

  it('новый файл → события нет', async () => {
    const { appended, overwriteLog } = makeSpyLog();
    await new MarkdownMemoryStore(dir, undefined, overwriteLog).save(makeObject());
    expect(appended).toHaveLength(0);
  });
});
