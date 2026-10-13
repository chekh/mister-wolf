import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createFaceVersion, type FaceObject } from '../../../src/app/use-cases/create-face-version.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

// REQ-06 (test-plan §REQ-06): G17-запись мутации Стюарда — атомарна с версией,
// шаблон неопционален, поле boundaries фиксирует, что НЕ меняется.
const STEWARD_CLI = { WOLF_ACTOR: 'agent:steward', WOLF_SESSION: 'cli-unit' } as NodeJS.ProcessEnv;
const OWNER_CLI = { WOLF_ACTOR: 'user:owner', WOLF_SESSION: 'cli-unit' } as NodeJS.ProcessEnv;

/** Полный набор G17 (design §«Запись мутации Стюарда»): 7 полей, reason отдельно. */
const G17 = {
  minimalChange: 'only triage wording',
  boundaries: 'essence, frame and T18 statuses are out of the mutation',
  exampleHelps: 'agent sorts docs faster',
  exampleKeep: 'agent still never edits rules',
  verification: 'wolf face history shows v2 with reason',
  rollback: 'wolf face restore skill:demo --from v1',
};

interface MutationNote extends MemoryObject {
  facet: string;
  reason: string;
  minimal_change: string;
  boundaries: string;
  example_helps: string;
  example_keep: string;
  verification: string;
  rollback: string;
}

describe('createMutationRecord через createFaceVersion (T-03: REQ-06 G17)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let relations: JsonlRelationLog;
  let lock: FsMemoryLock;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-face-g17-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    relations = new JsonlRelationLog(relationsPath(dir));
    lock = new FsMemoryLock(memoryDir(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps(env: NodeJS.ProcessEnv) {
    return { store, log, relations, lock, clock: new SystemClock(), idGen: new HashIdGenerator(), env };
  }

  async function mutationNotes(): Promise<MutationNote[]> {
    // supersede триггерит summarizeSession → в store есть и «Session wrap-up»
    // note(history); G17-запись отличается контрактным title (design).
    return (await store.list({ type: 'note' })).filter((o) =>
      o.title.startsWith('mutation: ')
    ) as MutationNote[];
  }

  it('мутация Стюарда: note(history) со всеми полями G17 + relation mutates → версия', async () => {
    const result = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'clarify triage',
      body: 'body-v1',
      ...G17,
    });

    expect(result.face.type).toBe('face');
    expect(result.mutationRecordId).toBeTruthy();

    const notes = await mutationNotes();
    expect(notes).toHaveLength(1);
    const note = notes[0]!;
    expect(note.id).toBe(result.mutationRecordId);
    expect(note.type).toBe('note');
    expect(note.facet).toBe('history');
    expect(note.title).toBe('mutation: skill:demo v1');
    expect(note.reason).toBe('clarify triage');
    expect(note.minimal_change).toBe(G17.minimalChange);
    expect(note.boundaries).toBe(G17.boundaries);
    expect(note.example_helps).toBe(G17.exampleHelps);
    expect(note.example_keep).toBe(G17.exampleKeep);
    expect(note.verification).toBe(G17.verification);
    expect(note.rollback).toBe(G17.rollback);

    // relation ('mutates', запись, версия) + инверсия
    const edges = await relations.list();
    expect(edges).toContainEqual(
      expect.objectContaining({ subject: note.id, predicate: 'mutates', object: result.face.id })
    );
    expect(edges).toContainEqual(
      expect.objectContaining({ subject: result.face.id, predicate: 'mutated_by', object: note.id })
    );

    // версия журналируется как обычно
    const versioned = (await log.readAll()).filter((e) => e.type === 'memory.face.versioned');
    expect(versioned).toHaveLength(1);
    expect(versioned[0]!.payload).toMatchObject({ owner_skill: 'skill:demo', new: result.face.id, initiator: 'steward' });
  });

  it('отсутствует обязательное поле G17: операция целиком не выполняется (REQ-06 AC2)', async () => {
    await expect(
      createFaceVersion(deps(STEWARD_CLI), {
        command: 'new',
        ownerSkill: 'skill:demo',
        reason: 'clarify triage',
        body: 'b',
        ...G17,
        rollback: '   ',
      })
    ).rejects.toThrow(UserFacingError);

    expect(await store.list({ type: 'face' })).toHaveLength(0);
    expect(await mutationNotes()).toHaveLength(0);
    expect(await relations.list()).toHaveLength(0);
    expect((await log.readAll()).filter((e) => e.type === 'memory.face.versioned')).toHaveLength(0);
  });

  it('поле boundaries фиксирует, что НЕ меняется; вторая мутация — своя запись v2', async () => {
    const v1 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'body-v1',
      ...G17,
    });
    const boundaries2 = 'essence and frame of the agent stay untouched';
    const v2 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'clarify triage',
      body: 'body-v2',
      ...G17,
      boundaries: boundaries2,
    });

    const notes = await mutationNotes();
    expect(notes).toHaveLength(2);
    const note2 = notes.find((n) => n.title === 'mutation: skill:demo v2')!;
    expect(note2.boundaries).toBe(boundaries2);
    expect(note2.id).toBe(v2.mutationRecordId);
    expect(v2.mutationRecordId).not.toBe(v1.mutationRecordId);

    const edges = await relations.list({ predicate: 'mutates', object: v2.face.id });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.subject).toBe(note2.id);
  });

  it('restore владельцем: G17 не требуется, запись мутации не создаётся (ADR-2: шаблон только для Стюарда)', async () => {
    const v1 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'body-v1',
      ...G17,
    });
    const v2 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'clarify',
      body: 'body-v2',
      ...G17,
    });

    const restored = await createFaceVersion(deps(OWNER_CLI), {
      command: 'restore',
      ownerSkill: 'skill:demo',
      from: v1.face.id,
      reason: 'rollback bad v2',
    });

    expect(restored.face.version).toBe('3');
    expect(restored.mutationRecordId).toBeNull();
    // записи мутации — только про версии Стюарда
    const notes = await mutationNotes();
    expect(notes.map((n) => n.title).sort()).toEqual(['mutation: skill:demo v1', 'mutation: skill:demo v2']);
    expect((await relations.list({ predicate: 'mutates' })).map((e) => e.object).sort()).toEqual(
      [v1.face.id, v2.face.id].sort()
    );
  });

  it('parallel-вызовы T-02 без G17-полей не ломают сборку типов: лицо читается как FaceObject', async () => {
    // smoke на тип: результат содержит FaceObject (owner_skill/version/initiator)
    const r = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'b',
      ...G17,
    });
    const face: FaceObject = r.face;
    expect(face.owner_skill).toBe('skill:demo');
    expect(face.initiator).toBe('steward');
  });
});
