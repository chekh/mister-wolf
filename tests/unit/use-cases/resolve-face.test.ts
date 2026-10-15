// tests/unit/use-cases/resolve-face.test.ts
// 2.18.4: канонический резолвер лица — строгий запрос (type=face, status=active,
// owner_skill === agentId | skill:<agentId>), детерминированный отказ при
// нуле/конфликте (без выбора «первого попавшегося»), hash содержимого тела.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { resolveFace } from '../../../src/app/use-cases/resolve-face.js';
import { checksumBlock } from '../../../src/adapters/fs/session-delivery-registry.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';

const T1 = '2026-10-15T10:00:00Z';
const T2 = '2026-10-16T10:00:00Z';

function faceFm(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Face ${id}`,
    type: 'face',
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: T1,
    updated_at: T1,
    created_by: 'wolf-init',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    owner_skill: 'executor-lead',
    version: '1',
    reason: 'seed',
    initiator: 'seed',
    ...overrides,
  };
}

describe('resolveFace (2.18.4: канонический резолвер лица)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-resolve-face-'));
    store = new MarkdownMemoryStore(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeFace(id: string, fm: Record<string, unknown>, body: string): void {
    const abs = join(dir, '.wolf', 'memory', 'shared', 'faces', `${id}.md`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`);
  }

  it('ровно одно активное лицо → ok: тело, версия, hash содержимого', async () => {
    writeFace('mem_face_a', faceFm('mem_face_a'), '# Канон executor-lead\nдействуй лениво.');
    const res = await resolveFace(store, 'executor-lead');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.face.version).toBe('1');
    expect(res.face.id).toBe('mem_face_a');
    expect(res.face.body).toContain('действуй лениво');
    expect(res.face.hash).toBe(checksumBlock(res.face.body));
  });

  it('0 активных лиц → детерминированный отказ none', async () => {
    const res = await resolveFace(store, 'executor-lead');
    expect(res).toEqual({ ok: false, error: { kind: 'none', owner: 'executor-lead' } });
  });

  it('2 активных лица → конфликт с диагностикой (оба кандидата, свежий первым)', async () => {
    writeFace('mem_face_old', faceFm('mem_face_old', { updated_at: T1, version: '1' }), 'old');
    writeFace('mem_face_new', faceFm('mem_face_new', { updated_at: T2, version: '2' }), 'new');
    const res = await resolveFace(store, 'executor-lead');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('multiple');
    if (res.error.kind !== 'multiple') return;
    expect(res.error.candidates.map((c) => c.id)).toEqual(['mem_face_new', 'mem_face_old']);
  });

  it('активное + superseded → ok (status-фильтр)', async () => {
    writeFace('mem_face_v1', faceFm('mem_face_v1', { status: 'superseded' }), 'v1 body');
    writeFace('mem_face_v2', faceFm('mem_face_v2', { version: '2', updated_at: T2 }), 'v2 body');
    const res = await resolveFace(store, 'executor-lead');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.face.id).toBe('mem_face_v2');
  });

  it('legacy-префикс skill:<agentId> принимается (тот же гвард, что в wolf-router)', async () => {
    writeFace('mem_face_skill', faceFm('mem_face_skill', { owner_skill: 'skill:executor-lead' }), 'skill body');
    const res = await resolveFace(store, 'executor-lead');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.face.body).toBe('skill body');
  });

  it('лицо другого владельца не попадает в выборку', async () => {
    writeFace('mem_face_other', faceFm('mem_face_other', { owner_skill: 'worker-implementer' }), 'чужое');
    const res = await resolveFace(store, 'executor-lead');
    expect(res.ok).toBe(false);
  });
});
