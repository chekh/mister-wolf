// tests/unit/use-cases/face-generic-guards.test.ts
// 2.17.1 REQ-04 (R05) S-36 (AC-4): generic transition/supersede/edit на face-тип
// запрещены — защита в use-case слое, не только в CLI (design §7, ADR-4).
// Негативные вызовы — напрямую в use-case, минуя CLI. Позитивные контроли —
// те же use-case на note не ломаются (состав видимых путей не расширяется).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addMemoryObject } from '../../../src/app/use-cases/add-memory-object.js';
import { transitionMemoryObject } from '../../../src/app/use-cases/transition-memory-object.js';
import { supersedeMemoryObject } from '../../../src/app/use-cases/supersede-memory-object.js';
import { editMemoryObject } from '../../../src/app/use-cases/edit-memory-object.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

// прецедент add-memory-object.ts: internalFacePath — служебный вход версионирующего
// пути; в guard-тестах сеем face напрямую (тестируется generic-путь, не посев)
async function seedFace(dir: string, owner: string): Promise<string> {
  const { object } = await addMemoryObject(
    {
      store: new MarkdownMemoryStore(dir),
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
    },
    {
      type: 'face',
      internalFacePath: true,
      title: `Face ${owner}`,
      body: 'Face body.',
      createdBy: 'test:unit',
      status: 'active',
      extra: { owner_skill: owner, version: '1', reason: 'seeded for guard test', initiator: 'seed' },
    }
  );
  return object.id;
}

async function seedNote(dir: string, title: string): Promise<string> {
  const { object } = await addMemoryObject(
    {
      store: new MarkdownMemoryStore(dir),
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
    },
    { type: 'note', facet: 'howto', title, body: 'Note body.', createdBy: 'test:unit' }
  );
  return object.id;
}

function depsOf(dir: string) {
  return {
    store: new MarkdownMemoryStore(dir),
    log: new JsonlEventLog(eventsPath(dir)),
    clock: new SystemClock(),
    idGen: new HashIdGenerator(),
  };
}

describe('REQ-04 (R05) S-36: generic-пути изменения face запрещены в use-case слое', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-face-guards-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('transitionMemoryObject на face — отказ (лицо меняется только face-командами)', async () => {
    const faceId = await seedFace(dir, 'steward');
    await expect(transitionMemoryObject(depsOf(dir), faceId, 'archived')).rejects.toThrow(/face/i);
    // запись не изменена
    const face = await depsOf(dir).store.get(faceId);
    expect(face?.status).toBe('active');
  });

  it('editMemoryObject на face — отказ (правка title/body лица вне версионирующего пути)', async () => {
    const faceId = await seedFace(dir, 'steward');
    await expect(editMemoryObject(depsOf(dir), { id: faceId, body: 'hijacked', actor: 'user:cli' })).rejects.toThrow(
      /face/i
    );
    const face = await depsOf(dir).store.get(faceId);
    expect(face?.body).toBe('Face body.');
  });

  // 2.17.1 REQ-04 (R05, решение L1): guard в use-case; внутренние гашения
  // face-операций (шаг supersede_prev face-operation.ts) помечены
  // internalFacePath — прецедент add-memory-object.ts; legacy-head миграции
  // есть note и идёт мимо guard.
  it('supersedeMemoryObject на face — отказ (generic supersede гасит лицо вне операции)', async () => {
    const faceId = await seedFace(dir, 'steward');
    const noteId = await seedNote(dir, 'Replacement note');
    await expect(supersedeMemoryObject(depsOf(dir), faceId, noteId)).rejects.toThrow(/face/i);
    // запись не изменена
    const face = await depsOf(dir).store.get(faceId);
    expect(face?.status).toBe('active');
  });

  it('позитивный контроль: те же use-case на note работают как раньше', async () => {
    const a = await seedNote(dir, 'Old note');
    const b = await seedNote(dir, 'New note');
    const deps = depsOf(dir);
    await expect(transitionMemoryObject(deps, a, 'archived')).resolves.toBeUndefined();
    await expect(supersedeMemoryObject(deps, a, b)).resolves.toBeUndefined();
    await expect(editMemoryObject(deps, { id: b, title: 'New note v2', actor: 'user:cli' })).resolves.toMatchObject({
      id: b,
    });
    const note = await deps.store.get(b);
    expect(note?.title).toBe('New note v2');
  });
});
