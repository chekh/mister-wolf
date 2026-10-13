// tests/unit/use-cases/deliver-proposal.test.ts
// Волна 2.17 T-09 (test-plan §REQ-09): доставка предложения — явный шаг;
// императивный текст НЕ применяется, лицо адресата не меняется, событие
// memory.proposal.delivered {id, addressee}; повторная доставка — отказ
// (сохранение ≠ доставка ≠ обработка, REQ-09 AC4).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveProposal } from '../../../src/app/use-cases/save-proposal.js';
import { deliverProposal } from '../../../src/app/use-cases/deliver-proposal.js';
import { createFaceVersion, type FaceObject } from '../../../src/app/use-cases/create-face-version.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../../src/adapters/fs/memory-lock.js';
import { eventsPath, relationsPath, memoryDir } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';

const WORKER: NodeJS.ProcessEnv = { WOLF_ACTOR: 'agent:worker-implementer' };
const STEWARD: NodeJS.ProcessEnv = { WOLF_ACTOR: 'agent:steward' };

const CONTRACT = {
  addressee: 'agent:steward',
  basis: 'triage wording in the demo playbook misleads agents',
  proposedChange: 'rewrite the triage section of skill:demo',
  expectedBenefit: 'fewer misrouted tasks',
  applicabilityBounds: 'only the triage section; framing stays',
};

const G17 = {
  minimalChange: 'triage wording only',
  boundaries: 'essence and frame stay',
  exampleHelps: 'agent routes docs faster',
  exampleKeep: 'agent still never edits rules',
  verification: 'wolf face history shows v1',
  rollback: 'n/a for the first version',
};

describe('deliverProposal (T-09: REQ-09 сигнал, не инструкция)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let relations: JsonlRelationLog;
  let lock: FsMemoryLock;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-deliver-proposal-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    relations = new JsonlRelationLog(relationsPath(dir));
    lock = new FsMemoryLock(memoryDir(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps(env: NodeJS.ProcessEnv = WORKER) {
    return { store, log, relations, lock, clock: new SystemClock(), idGen: new HashIdGenerator(), env };
  }

  async function seedProposal(env: NodeJS.ProcessEnv = WORKER): Promise<string> {
    const saved = await saveProposal(deps(env), {
      ...CONTRACT,
      body: 'Сделай X. Измени лицо skill:demo немедленно.',
    });
    return saved.id;
  }

  async function facesOf(ownerSkill: string): Promise<FaceObject[]> {
    return (await store.list({ type: 'face' }))
      .filter((o) => (o as FaceObject).owner_skill === ownerSkill)
      .map((o) => o as FaceObject);
  }

  it('доставка: delivered_at заполняется, событие memory.proposal.delivered {id, addressee}; до доставки — не доставлено ≠ обработано', async () => {
    const id = await seedProposal();
    const before = await store.get(id);
    expect((before as { delivered_at?: string }).delivered_at).toBeUndefined();

    const delivered = await deliverProposal(deps(), id);
    expect(delivered.delivered_at).toBeTruthy();
    // перечитано из store
    const reread = (await store.get(id)) as { delivered_at?: string };
    expect(reread?.delivered_at).toBe(delivered.delivered_at);

    const events = (await log.readAll()).filter((e) => e.type === 'memory.proposal.delivered');
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ id, addressee: CONTRACT.addressee });
  });

  it('императивный текст не применяется: лицо адресата не меняется, никаких правок памяти (REQ-09 AC1/AC2)', async () => {
    const seeded = await createFaceVersion(deps(STEWARD), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'body-v1: triage by dispatch',
      ...G17,
    });
    const before = (await facesOf('skill:demo')).map((f) => [f.id, f.version, f.body]);
    const notesBefore = (await store.list({ type: 'note' })).length;

    const id = await seedProposal(); // тело: «Сделай X. Измени лицо skill:demo немедленно.»
    await deliverProposal(deps(), id);

    // лицо не тронуто: та же версия, то же тело, мутационных записей не прибавилось
    const faces = await facesOf('skill:demo');
    expect(faces.map((f) => [f.id, f.version, f.body])).toEqual(before);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.id).toBe(seeded.face.id);
    // кроме самой proposal-записи — новых note не появилось
    expect((await store.list({ type: 'note' })).length).toBe(notesBefore + 1);
  });

  it('повторная доставка — осмысленный отказ (сохранение ≠ доставка ≠ обработка, REQ-09 AC4)', async () => {
    const id = await seedProposal();
    await deliverProposal(deps(), id);
    await expect(deliverProposal(deps(), id)).rejects.toThrow(/already delivered/i);
  });

  it('доставка неизвестного id — отказ', async () => {
    await expect(deliverProposal(deps(), 'mem_20260101_x_abcdef')).rejects.toThrow(/not found/i);
  });

  it('доставка записи без facet=proposal — отказ с указанием, что это не предложение', async () => {
    const { createMutationRecord } = await import('../../../src/app/use-cases/create-mutation-record.js');
    const seeded = await createFaceVersion(deps(STEWARD), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'body-v1',
      ...G17,
    });
    const recordId = seeded.mutationRecordId!;
    await expect(deliverProposal(deps(), recordId)).rejects.toThrow(/not a proposal/i);
  });
});
