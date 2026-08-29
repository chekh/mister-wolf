import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getLatestMemoryObject } from '../../../src/app/use-cases/get-latest-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';

function obj(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    type: 'decision',
    title: id,
    body: '',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-08-29T00:00:00.000Z',
    updated_at: '2026-08-29T00:00:00.000Z',
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

describe('getLatestMemoryObject (W2: get --latest)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-latest-'));
    store = new MarkdownMemoryStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('следует цепочке superseded_by до живого объекта', async () => {
    await store.save(obj('mem_20260829_aaa_000001', { superseded_by: 'mem_20260829_bbb_000002' }) as any);
    await store.save(obj('mem_20260829_bbb_000002', { superseded_by: 'mem_20260829_ccc_000003' }) as any);
    await store.save(obj('mem_20260829_ccc_000003') as any);
    const latest = await getLatestMemoryObject({ store }, 'mem_20260829_aaa_000001');
    expect(latest.id).toBe('mem_20260829_ccc_000003');
  });

  it('возвращает сам объект, если он уже latest (superseded_by=null)', async () => {
    await store.save(obj('mem_20260829_aaa_000001') as any);
    const latest = await getLatestMemoryObject({ store }, 'mem_20260829_aaa_000001');
    expect(latest.id).toBe('mem_20260829_aaa_000001');
  });

  it('останавливается с ошибкой на цикле', async () => {
    await store.save(obj('mem_20260829_aaa_000001', { superseded_by: 'mem_20260829_bbb_000002' }) as any);
    await store.save(obj('mem_20260829_bbb_000002', { superseded_by: 'mem_20260829_aaa_000001' }) as any);
    await expect(getLatestMemoryObject({ store }, 'mem_20260829_aaa_000001')).rejects.toThrow(
      /cycle detected at mem_20260829_aaa_000001/
    );
  });

  it('останавливается с ошибкой на битой ссылке (объект цепочки не найден)', async () => {
    await store.save(obj('mem_20260829_aaa_000001', { superseded_by: 'mem_20260829_missing_999999' }) as any);
    await expect(getLatestMemoryObject({ store }, 'mem_20260829_aaa_000001')).rejects.toThrow(
      /Broken supersede chain: mem_20260829_missing_999999/
    );
  });

  it('несуществующий стартовый id — ошибка not found', async () => {
    await expect(getLatestMemoryObject({ store }, 'mem_20260829_nobody_000000')).rejects.toThrow(
      /Memory object not found: mem_20260829_nobody_000000/
    );
  });
});
