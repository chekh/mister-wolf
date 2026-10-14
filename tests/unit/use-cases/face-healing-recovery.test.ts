import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createFaceVersion, type FaceObject } from '../../../src/app/use-cases/create-face-version.js';
import {
  abortFaceOperation,
  activeFace,
  incompleteFaceOperations,
  resumeFaceOperation,
} from '../../../src/app/use-cases/face-operation.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../../src/adapters/fs/project-paths.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';

// Фикс-раунд 1 интегрального ревью фазы 4, F-01 (critical): healing-операция
// миграции (план ['supersede_legacy','announce'], вход без body —
// migrate-faces.ts healLegacyTransition) не распознаётся recovery-путями, и
// executeChain создаёт версию с пустым body, убивая канон. Ожидание: recover
// честно отказывает (дозавершение — повторный `wolf face migrate`), авто-resume
// её пропускает, add_face гейтен планом; abort остаётся рабочим и версий не
// создаёт.

const STEWARD = { WOLF_ACTOR: 'agent:steward' } as NodeJS.ProcessEnv;
const G17 = {
  minimalChange: 'triage wording only',
  boundaries: 'essence and frame are out',
  exampleHelps: 'faster doc sorting',
  exampleKeep: 'agent never edits rules',
  verification: 'wolf face history',
  rollback: 'wolf face restore',
};
const OWNER = 'skill:demo';
const HEAL_OP = 'faceop-heal-0001';

interface Ctx {
  dir: string;
  store: MarkdownMemoryStore;
  log: JsonlEventLog;
  lock: FsMemoryLock;
  idGen: HashIdGenerator;
  clock: SystemClock;
}

function makeCtx(): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-face-heal-'));
  return {
    dir,
    store: new MarkdownMemoryStore(dir),
    log: new JsonlEventLog(eventsPath(dir)),
    lock: new FsMemoryLock(memoryDir(dir)),
    idGen: new HashIdGenerator(),
    clock: new SystemClock(),
  };
}

function depsOf(ctx: Ctx, env: NodeJS.ProcessEnv = STEWARD) {
  return { store: ctx.store, log: ctx.log, lock: ctx.lock, clock: ctx.clock, idGen: ctx.idGen, env };
}

async function facesOf(ctx: Ctx): Promise<FaceObject[]> {
  return (await ctx.store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === OWNER);
}

async function opEvents(ctx: Ctx, opId: string): Promise<MemoryEvent[]> {
  return (await ctx.log.readAll()).filter((e) => e.payload['opId'] === opId);
}

/** Живое лицо (канон v1) + незавершённая healing-операция в журнале — окно
 * healLegacyTransition «op_started записан, шага нет» (headId в input —
 * ссылка на legacy head, recovery-путями не читается). */
async function seedHealingState(ctx: Ctx): Promise<void> {
  const v1 = await createFaceVersion(depsOf(ctx), {
    command: 'new',
    ownerSkill: OWNER,
    reason: 'initial face',
    body: 'body-v1',
    ...G17,
  });
  const now = new Date().toISOString();
  await ctx.log.append({
    id: ctx.idGen.generateEventId(new Date(now)),
    type: 'memory.face.op_started',
    timestamp: now,
    actor: 'agent:steward',
    payload: {
      opId: HEAL_OP,
      command: 'migrate',
      owner_skill: OWNER,
      plan: ['supersede_legacy', 'announce'],
      input: {
        command: 'migrate',
        ownerSkill: OWNER,
        reason: v1.face.reason,
        faceId: v1.face.id,
        headId: 'mem_legacy_head',
      },
    },
  });
}

describe('F-01 (ревью фазы 4): recovery-пути не исполняют healing-операцию миграции', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('resumeFaceOperation (wolf face recover) — честный отказ: ни версий, ни смены канона', async () => {
    await seedHealingState(ctx);

    await expect(resumeFaceOperation(depsOf(ctx), HEAL_OP, 'agent:steward')).rejects.toThrow(
      /healing.*wolf face migrate/
    );

    // версий не создано, канон прежний (body не перезаписан пустотой)
    const faces = await facesOf(ctx);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.body).toBe('body-v1');
    expect((await activeFace(ctx.store, OWNER))!.id).toBe(faces[0]!.id);
    // операция не тронута: в журнале только op_started
    expect(await opEvents(ctx, HEAL_OP)).toHaveLength(1);
  });

  it('авто-resume (runFaceMutation) пропускает healing: новая мутация не подхватывает её', async () => {
    await seedHealingState(ctx);

    const res = await createFaceVersion(depsOf(ctx), {
      command: 'new',
      ownerSkill: OWNER,
      reason: 'second mutation',
      body: 'body-v2',
      ...G17,
    });

    expect(res.face.body).toBe('body-v2');
    expect(res.face.version).toBe('2');
    expect((await activeFace(ctx.store, OWNER))!.body).toBe('body-v2');
    // healing не исполнена recovery-путём и не породила версию с пустым body
    expect((await opEvents(ctx, HEAL_OP)).some((e) => e.type === 'memory.face.op_committed')).toBe(false);
    const faces = await facesOf(ctx);
    expect(faces).toHaveLength(2);
    expect(faces.find((f) => f.op_id === HEAL_OP)).toBeUndefined();
    expect(faces.map((f) => f.body)).not.toContain('');
  });

  it('явный --op-id healing-операции — отказ (add_face гейтен планом в executeChain)', async () => {
    await seedHealingState(ctx);

    await expect(
      createFaceVersion(depsOf(ctx), {
        command: 'new',
        ownerSkill: OWNER,
        reason: 'hijack attempt',
        body: 'b',
        ...G17,
        opId: HEAL_OP,
      })
    ).rejects.toThrow(/healing.*wolf face migrate/);

    const faces = await facesOf(ctx);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.body).toBe('body-v1');
  });

  it('abort healing-операции корректен: отмена допустима, версий не создаёт, канон цел', async () => {
    await seedHealingState(ctx);

    const abort = await abortFaceOperation(depsOf(ctx), HEAL_OP, 'user:owner');

    expect(abort).toEqual({ opId: HEAL_OP, archivedFaceId: null });
    const faces = await facesOf(ctx);
    expect(faces).toHaveLength(1); // версий не создано
    expect(faces[0]!.status).toBe('active'); // канон цел
    expect((await opEvents(ctx, HEAL_OP)).some((e) => e.type === 'memory.face.op_aborted')).toBe(true);
    expect(incompleteFaceOperations(await ctx.log.readAll())).toEqual([]); // след закрыт
  });
});
