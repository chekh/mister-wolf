import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createFaceVersion, type FaceObject } from '../../src/app/use-cases/create-face-version.js';
import {
  abortFaceOperation,
  incompleteFaceOperations,
  resumeFaceOperation,
  type FaceFaultInjector,
} from '../../src/app/use-cases/face-operation.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../src/adapters/fs/memory-lock.js';
import { SQLiteSearchIndex } from '../../src/adapters/sqlite/sqlite-search-index.js';
import { eventsPath, memoryDir, relationsPath, indexPath } from '../../src/adapters/fs/project-paths.js';
import { repairStorage } from '../../src/app/use-cases/repair-storage.js';
import type { MemoryEvent } from '../../src/domain/schemas/memory-event-schema.js';
import { UserFacingError } from '../../src/domain/errors.js';
import type { SearchIndex } from '../../src/ports/search-index.port.js';

// 2.17.1 REQ-03 (R04): восстанавливаемый commit мутации лица — fault-матрица
// F1–F8 + S-28 (усыновление) + S-29 (авто-resume) + S-30 (doctor/abort); design
// §3.3/ADR-3. Integration-конвенция: реальные адаптеры в tmp (прецедент
// worktree-scope-isolation.test.ts). Seam (тест-план, «Общие проверки матрицы»):
// ошибка бросается ПОСЛЕ завершения указанного шага — данные шага на диске,
// следующий не начат. Ожидания — из design §3.3 (состояния/порядок), не из кода.

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

interface Ctx {
  dir: string;
  store: MarkdownMemoryStore;
  log: JsonlEventLog;
  lock: FsMemoryLock;
  idGen: HashIdGenerator;
  relations: JsonlRelationLog;
  clock: SystemClock;
}

function makeFault(failAt: string): FaceFaultInjector {
  return (point) => {
    if (point === failAt) throw new Error(`injected fault at ${point}`);
  };
}

function makeCtx(): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-face-op-'));
  return {
    dir,
    store: new MarkdownMemoryStore(dir),
    log: new JsonlEventLog(eventsPath(dir)),
    lock: new FsMemoryLock(memoryDir(dir)),
    idGen: new HashIdGenerator(),
    relations: new JsonlRelationLog(relationsPath(dir)),
    clock: new SystemClock(),
  };
}

function depsOf(ctx: Ctx, fault?: FaceFaultInjector, env: NodeJS.ProcessEnv = STEWARD) {
  return {
    store: ctx.store,
    log: ctx.log,
    lock: ctx.lock,
    clock: ctx.clock,
    idGen: ctx.idGen,
    relations: ctx.relations,
    env,
    ...(fault ? { fault } : {}),
  };
}

async function facesOf(ctx: Ctx, owner = OWNER): Promise<FaceObject[]> {
  return (await ctx.store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === owner);
}

/** Взгляд доставки (design §3.3: фильтр status==='active', детерминизм — старшая). */
async function canon(ctx: Ctx, owner = OWNER): Promise<FaceObject | null> {
  const active = (await facesOf(ctx, owner)).filter((f) => f.status === 'active');
  if (active.length === 0) return null;
  return active.sort((a, b) => Number(b.version) - Number(a.version))[0]!;
}

async function eventsOf(ctx: Ctx, type: string): Promise<MemoryEvent[]> {
  return (await ctx.log.readAll()).filter((e) => e.type === type);
}

async function opEvents(ctx: Ctx, opId: string): Promise<MemoryEvent[]> {
  return (await ctx.log.readAll()).filter((e) => e.payload['opId'] === opId);
}

/** NFR-02: полный след операции читаем — op_committed есть, шаги в журнале. */
async function expectCommittedTrail(ctx: Ctx, opId: string, expectSteps: string[]): Promise<void> {
  const ops = await opEvents(ctx, opId);
  expect(
    ops.some((e) => e.type === 'memory.face.op_committed'),
    `op ${opId} must end with op_committed`
  ).toBe(true);
  const steps = ops.filter((e) => e.type === 'memory.face.op_step').map((e) => String(e.payload['step']));
  for (const s of expectSteps) expect(steps, `op_step ${s} missing in [${steps.join(',')}]`).toContain(s);
}

/** Первая (pre-existing) версия владельца — прежний канон для F-сценариев. */
async function seedV1(ctx: Ctx, owner = OWNER): Promise<string> {
  const v1 = await createFaceVersion(depsOf(ctx), {
    command: 'new',
    ownerSkill: owner,
    reason: 'initial face',
    body: 'body-v1',
    ...G17,
  });
  return v1.face.id;
}

const MUTATION = { command: 'new' as const, ownerSkill: OWNER, reason: 'clarify triage', body: 'body-v2', ...G17 };

describe('REQ-03 (R04): fault-матрица F1–F8 (integration, seam после шага)', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('F1 add_face: «не применено» — candidate скрыт, прежний канон; resume → одна версия; abort → archived', async () => {
    const v1Id = await seedV1(ctx);
    const opId = 'faceop-f1-0001';

    await expect(createFaceVersion(depsOf(ctx, makeFault('add_face')), { ...MUTATION, opId })).rejects.toThrow(
      /injected fault at add_face/
    );

    // Состояние «не применено» (§3.3): candidate есть, activation нет
    const candidate = (await facesOf(ctx)).find((f) => f.status === 'candidate');
    expect(candidate).toBeTruthy();
    expect(candidate!.op_id).toBe(opId);
    expect(candidate!.version).toBe('2');
    const v1 = (await ctx.store.get(v1Id)) as FaceObject;
    expect(v1.status).toBe('active'); // прежняя версия — канон
    expect((await canon(ctx))!.id).toBe(v1Id); // доставка НЕ выдаёт candidate
    expect(await eventsOf(ctx, 'memory.face.versioned')).toHaveLength(1); // только посев v1
    expect(incompleteFaceOperations(await ctx.log.readAll())).toMatchObject([{ opId, activated: false }]);

    // Resume по --op-id: без второй версии
    const resumed = await createFaceVersion(depsOf(ctx), { ...MUTATION, opId });
    expect(resumed.opId).toBe(opId);
    expect(resumed.face.id).toBe(candidate!.id);
    expect((await facesOf(ctx)).filter((f) => (f as FaceObject).op_id === opId)).toHaveLength(1);
    expect(await facesOf(ctx)).toHaveLength(2); // ровно одна версия на операцию
    const v1After = (await ctx.store.get(v1Id)) as FaceObject;
    expect(v1After.status).toBe('superseded');
    expect(v1After.superseded_by).toBe(candidate!.id);
    expect((await canon(ctx))!.id).toBe(candidate!.id); // доставка выдаёт новую
    await expectCommittedTrail(ctx, opId, ['add_face', 'g17_record', 'activate', 'supersede_prev', 'announce']);
  });

  it('F1-abort: recover --abort до activation — candidate archived, история не уничтожается', async () => {
    const v1Id = await seedV1(ctx);
    const opId = 'faceop-f1a-0001';
    await expect(createFaceVersion(depsOf(ctx, makeFault('add_face')), { ...MUTATION, opId })).rejects.toThrow(
      /injected fault/
    );
    const candidate = (await facesOf(ctx)).find((f) => f.status === 'candidate')!;

    const abort = await abortFaceOperation(depsOf(ctx), opId, 'user:owner');
    expect(abort).toMatchObject({ opId, archivedFaceId: candidate.id });

    // NFR-02: abort = archived, не удаление; канон прежний
    const archived = (await ctx.store.get(candidate.id)) as FaceObject;
    expect(archived.status).toBe('archived');
    expect((await ctx.store.get(v1Id))!.status).toBe('active');
    expect((await canon(ctx))!.id).toBe(v1Id);
    const aborted = await opEvents(ctx, opId);
    expect(aborted.some((e) => e.type === 'memory.face.op_aborted')).toBe(true);
    expect(aborted.find((e) => e.type === 'memory.face.op_aborted')!.payload).toMatchObject({
      opId,
      by: 'user:owner',
    });
    expect(aborted.some((e) => e.type === 'memory.face.op_committed')).toBe(false);
    expect(incompleteFaceOperations(await ctx.log.readAll())).toEqual([]); // след закрыт
  });

  it('F2 g17_record: «не применено»; повтор не создаёт вторую G17/версию', async () => {
    const opId = 'faceop-f2-0001';
    await expect(createFaceVersion(depsOf(ctx, makeFault('g17_record')), { ...MUTATION, opId })).rejects.toThrow(
      /injected fault at g17_record/
    );

    expect((await facesOf(ctx)).find((f) => f.status === 'candidate')).toBeTruthy();
    expect((await eventsOf(ctx, 'memory.face.versioned')).length).toBe(0); // канона ещё нет
    expect(await canon(ctx)).toBeNull(); // общая проверка (4): доставка не выдаёт candidate

    await createFaceVersion(depsOf(ctx), { ...MUTATION, opId });

    expect(await facesOf(ctx)).toHaveLength(1); // одна версия
    const mutationNotes = (await ctx.store.list({ type: 'note', facet: 'history' })).filter((n) =>
      n.title.startsWith(`mutation: ${OWNER}`)
    );
    expect(mutationNotes).toHaveLength(1); // одна G17-запись
    // доставка выдаёт новую версию как полный канон (не candidate/неполный)
    const deliveredF2 = await canon(ctx);
    expect(deliveredF2!.status).toBe('active');
    expect(deliveredF2!.body).toBe('body-v2');
    await expectCommittedTrail(ctx, opId, ['g17_record']);
  });

  it('F3 proposal_relation: «не применено»; resume дозавершает связь без дублей', async () => {
    const v1Id = await seedV1(ctx);
    const proposal = await addMemoryObject(depsOf(ctx), {
      type: 'note',
      facet: 'proposal',
      title: 'proposal: tighten triage',
      createdBy: 'user:owner',
      extra: {
        addressee: 'agent:demo',
        basis: 'triage is slow',
        proposed_change: 'tighten wording',
        expected_benefit: 'faster sorting',
        applicability_bounds: 'face mutations only',
      },
    });
    const input = { ...MUTATION, fromProposal: proposal.object.id };
    const opId = 'faceop-f3-0001';
    await expect(createFaceVersion(depsOf(ctx, makeFault('proposal_relation')), { ...input, opId })).rejects.toThrow(
      /injected fault at proposal_relation/
    );

    // шаг proposal_relation завершён до сбоя: связь записана ровно один раз,
    // но операция ещё «не применена» (candidate, activation не было)
    expect((await facesOf(ctx)).find((f) => f.status === 'candidate')).toBeTruthy();
    expect((await ctx.relations.list({ subject: proposal.object.id, predicate: 'proposes' })).length).toBe(1);
    expect((await canon(ctx))!.id).toBe(v1Id); // общая проверка (4): доставка — прежний канон, не candidate

    await createFaceVersion(depsOf(ctx), { ...input, opId });

    // повтор не дублирует связь (идемпотентность шагов §3.3)
    const proposes = await ctx.relations.list({ subject: proposal.object.id, predicate: 'proposes' });
    expect(proposes).toHaveLength(1);
    expect(proposes[0]!.object).toBe((await canon(ctx))!.id);
    expect(await facesOf(ctx)).toHaveLength(2);
    // доставка выдаёт новую версию как полный канон (не candidate/неполный)
    const deliveredF3 = await canon(ctx);
    expect(deliveredF3!.status).toBe('active');
    expect(deliveredF3!.body).toBe('body-v2');
    await expectCommittedTrail(ctx, opId, ['proposal_relation']);
  });

  it('F4 activate: «применено, требуется след» — новая полная и active, доставка выдаёт её; resume закрывает', async () => {
    const v1Id = await seedV1(ctx);
    const opId = 'faceop-f4-0001';
    await expect(createFaceVersion(depsOf(ctx, makeFault('activate')), { ...MUTATION, opId })).rejects.toThrow(
      /injected fault at activate/
    );

    // Activation завершена: новая версия active, полная (G17 записан до activation)
    const faces = await facesOf(ctx);
    const v2 = faces.find((f) => f.version === '2')!;
    expect(v2.status).toBe('active');
    expect(v2.body).toBe('body-v2');
    const mutationNotes = (await ctx.store.list({ type: 'note', facet: 'history' })).filter(
      (n) => n.title === `mutation: ${OWNER} v2`
    );
    expect(mutationNotes).toHaveLength(1);
    // окно «два активных» (между 4 и 5): доставка детерминирована старшей версией
    expect((await canon(ctx))!.id).toBe(v2.id);
    expect((await ctx.store.get(v1Id))!.status).toBe('active'); // ещё не погашена
    expect(await eventsOf(ctx, 'memory.face.versioned')).toHaveLength(1); // announce не прошёл
    expect(incompleteFaceOperations(await ctx.log.readAll())).toMatchObject([{ opId, activated: true }]);

    await createFaceVersion(depsOf(ctx), { ...MUTATION, opId });

    expect((await ctx.store.get(v1Id))!.status).toBe('superseded');
    expect((await eventsOf(ctx, 'memory.face.versioned')).length).toBe(2);
    expect(await facesOf(ctx)).toHaveLength(2);
    await expectCommittedTrail(ctx, opId, ['activate', 'supersede_prev', 'announce']);
  });

  it('F5 supersede_prev: шаги 1–5 выполнены; resume дозавершает ТОЛЬКО announce + op_committed', async () => {
    const v1Id = await seedV1(ctx);
    const opId = 'faceop-f5-0001';
    await expect(createFaceVersion(depsOf(ctx, makeFault('supersede_prev')), { ...MUTATION, opId })).rejects.toThrow(
      /injected fault at supersede_prev/
    );

    expect((await ctx.store.get(v1Id))!.status).toBe('superseded'); // прежняя погашена
    expect((await canon(ctx))!.version).toBe('2'); // доставка выдаёт новую
    expect(await eventsOf(ctx, 'memory.face.versioned')).toHaveLength(1); // announce нет

    const logBefore = (await ctx.log.readAll()).length;
    const supersededEventsBefore = (await eventsOf(ctx, 'memory.superseded')).length;
    await createFaceVersion(depsOf(ctx), { ...MUTATION, opId });

    // resume НЕ повторяет выполненные шаги: ни нового supersede, ни новой версии
    expect((await eventsOf(ctx, 'memory.superseded')).length).toBe(supersededEventsBefore);
    expect(await facesOf(ctx)).toHaveLength(2);
    const newId = (await canon(ctx))!.id;
    const versionedForNew = (await eventsOf(ctx, 'memory.face.versioned')).filter((e) => e.payload['new'] === newId);
    expect(versionedForNew).toHaveLength(1);
    // resume дописал ровно: versioned + op_step(announce) + op_committed
    expect((await ctx.log.readAll()).length - logBefore).toBe(3);
    await expectCommittedTrail(ctx, opId, ['announce']);
  });

  it('F6 announce: шаги 1–6 записаны; resume дописывает только op_committed', async () => {
    await seedV1(ctx);
    const opId = 'faceop-f6-0001';
    await expect(createFaceVersion(depsOf(ctx, makeFault('announce')), { ...MUTATION, opId })).rejects.toThrow(
      /injected fault at announce/
    );

    expect((await eventsOf(ctx, 'memory.face.versioned')).length).toBe(2); // announce прошёл
    expect((await opEvents(ctx, opId)).some((e) => e.type === 'memory.face.op_committed')).toBe(false);

    const logBefore = (await ctx.log.readAll()).length;
    await createFaceVersion(depsOf(ctx), { ...MUTATION, opId });

    expect((await ctx.log.readAll()).length - logBefore).toBe(1); // только op_committed
    const ops = await opEvents(ctx, opId);
    expect(ops[ops.length - 1]!.type).toBe('memory.face.op_committed');
    expect(await facesOf(ctx)).toHaveLength(2);
    expect((await canon(ctx))!.version).toBe('2'); // доставка выдаёт новую
  });

  it('F7 запись op_committed: финальное событие отсутствует; resume дописывает; повтор идемпотентен', async () => {
    await seedV1(ctx);
    const opId = 'faceop-f7-0001';
    await expect(createFaceVersion(depsOf(ctx, makeFault('op_committed')), { ...MUTATION, opId })).rejects.toThrow(
      /injected fault at op_committed/
    );

    // крайний случай: шаги 1–6 записаны, финального события нет — не потеря данных
    expect(await eventsOf(ctx, 'memory.face.versioned')).toHaveLength(2);
    expect((await ctx.store.list({ type: 'face' })).length).toBe(2);
    expect(incompleteFaceOperations(await ctx.log.readAll())).toMatchObject([{ opId, activated: true }]);

    await createFaceVersion(depsOf(ctx), { ...MUTATION, opId });
    expect((await opEvents(ctx, opId)).some((e) => e.type === 'memory.face.op_committed')).toBe(true);

    // повтор полного завершения идемпотентен: ни событий, ни версий
    const logBefore = (await ctx.log.readAll()).length;
    const facesBefore = await facesOf(ctx);
    const again = await createFaceVersion(depsOf(ctx), { ...MUTATION, opId });
    expect(again.face.id).toBe(facesBefore.find((f) => f.version === '2')!.id);
    expect((await ctx.log.readAll()).length).toBe(logBefore);
    expect(await facesOf(ctx)).toHaveLength(2);
  });

  it('F8 сбой FTS-индекса: первичные данные целы, операция завершена, rebuild-index лечит', async () => {
    const throwingIndex: SearchIndex = {
      rebuild: async () => {},
      indexObject: async () => {
        throw new Error('fts is down');
      },
      removeObject: async () => {},
      search: async () => [],
    };
    // индекс — производный: его сбой не рушит операцию (design §3.3 «Индекс FTS»)
    const result = await createFaceVersion(
      { ...depsOf(ctx), index: throwingIndex },
      { ...MUTATION, opId: 'faceop-f8-0001' }
    );
    expect(result.face.status).toBe('active');
    expect(result.opId).toBe('faceop-f8-0001');
    // общая проверка (4): доставка выдаёт новую версию как полный канон, candidate не протёк
    const deliveredF8 = await canon(ctx);
    expect(deliveredF8!.id).toBe(result.face.id);
    expect(deliveredF8!.body).toBe('body-v2');
    expect((await facesOf(ctx)).filter((f) => f.status === 'candidate')).toHaveLength(0);

    // операция не считается несостоявшейся: полный след, doctor чист
    await expectCommittedTrail(ctx, 'faceop-f8-0001', ['add_face', 'announce']);
    expect(incompleteFaceOperations(await ctx.log.readAll())).toEqual([]);

    // rebuild-index лечит: индекс восстанавливается из первичных данных
    const healthy = new SQLiteSearchIndex(indexPath(ctx.dir));
    const report = await repairStorage(
      {
        store: ctx.store,
        log: ctx.log,
        clock: ctx.clock,
        idGen: ctx.idGen,
        index: healthy,
        lock: ctx.lock,
        readEventLines: async () => readFileSync(eventsPath(ctx.dir), 'utf8').split('\n').filter(Boolean),
      },
      { dryRun: false }
    );
    expect(report.reindexed).toBeGreaterThanOrEqual(2); // face + G17-запись
    const found = await healthy.search('body', { type: 'face' });
    expect(found.map((r) => r.object.id)).toContain(result.face.id);
  });
});

describe('REQ-03 (R04) S-28: усыновление candidate по op_id (design §3.3)', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  /** Ручной посев состояния «объект сохранён, op_step не дописан». */
  async function seedWindow(candidateExtra: { op_id?: string }): Promise<string> {
    const opId = 'faceop-s28-0001';
    const now = new Date().toISOString();
    await ctx.log.append({
      id: ctx.idGen.generateEventId(new Date(now)),
      type: 'memory.face.op_started',
      timestamp: now,
      actor: 'agent:steward',
      payload: {
        opId,
        command: 'new',
        owner_skill: OWNER,
        plan: ['add_face', 'g17_record', 'activate', 'supersede_prev', 'announce'],
        input: { command: 'new', ownerSkill: OWNER, reason: MUTATION.reason, body: MUTATION.body, ...G17 },
      },
    });
    const extra: Record<string, unknown> = {
      owner_skill: OWNER,
      version: '1',
      reason: MUTATION.reason,
      initiator: 'steward',
      ...candidateExtra,
    };
    await ctx.store.save({
      id: ctx.idGen.generateMemoryId(new Date(now), 'adopted candidate'),
      type: 'face',
      title: `Face: ${OWNER}`,
      body: MUTATION.body,
      status: 'candidate',
      review_state: 'proposed',
      confidence: 'medium',
      importance: 0.5,
      created_at: now,
      updated_at: now,
      created_by: 'agent:steward',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [],
      superseded_by: null,
      memory_class: 'working',
      truth_role: 'accepted_knowledge',
      lifetime: 'long_term',
      ...extra,
    } as never);
    return opId;
  }

  it('совпадающий op_id — усыновляется: вторая версия не создаётся, операция дозавершается', async () => {
    const opId = await seedWindow({ op_id: opIdPlaceholder() });
    const candidate = (await facesOf(ctx)).find((f) => f.status === 'candidate')!;

    const result = await createFaceVersion(depsOf(ctx), { ...MUTATION, opId });
    expect(result.face.id).toBe(candidate.id); // усыновлён, не создан заново
    expect(await facesOf(ctx)).toHaveLength(1);
    expect(result.face.status).toBe('active');
    await expectCommittedTrail(ctx, opId, ['activate', 'announce']);
  });

  it('чужой op_id — конфликт в отчёт, вслепую не усыновляется', async () => {
    const opId = await seedWindow({ op_id: 'faceop-someone-else' });
    const candidate = (await facesOf(ctx)).find((f) => f.status === 'candidate')!;

    await expect(createFaceVersion(depsOf(ctx), { ...MUTATION, opId })).rejects.toThrow(UserFacingError);
    // candidate не тронут, операция не завершена вслепую
    const after = (await ctx.store.get(candidate.id)) as FaceObject;
    expect(after.status).toBe('candidate');
    expect((await opEvents(ctx, opId)).some((e) => e.type === 'memory.face.op_committed')).toBe(false);
  });

  it('пустой op_id у candidate при незавершённой операции — конфликт', async () => {
    const opId = await seedWindow({});
    await expect(createFaceVersion(depsOf(ctx), { ...MUTATION, opId })).rejects.toThrow(/conflict/i);
  });

  function opIdPlaceholder(): string {
    return 'faceop-s28-0001';
  }
});

describe('REQ-03 (R04) S-29/S-30: авто-resume, doctor, abort-границы', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('S-29: следующая мутация того же owner_skill дозавершает незавершённую операцию до старта новой', async () => {
    // op1 обрывается после activate: «применено, требуется след»
    const first = createFaceVersion(depsOf(ctx, makeFault('activate')), {
      command: 'new',
      ownerSkill: OWNER,
      reason: 'first mutation',
      body: 'body-v1',
      ...G17,
    });
    const op1 = await first.then(
      () => {
        throw new Error('fault expected');
      },
      (err: Error) => {
        expect(err.message).toMatch(/injected fault/);
      }
    );
    void op1;

    // следующая мутация того же владельца: авто-resume op1, затем новая операция
    const second = await createFaceVersion(depsOf(ctx), {
      command: 'new',
      ownerSkill: OWNER,
      reason: 'second mutation',
      body: 'body-v2',
      ...G17,
    });

    const events = await ctx.log.readAll();
    // обе операции завершены, и op1 закрыт ДО op2 op_started (под тем же lock)
    const committed1 = events.findIndex(
      (e) => e.type === 'memory.face.op_committed' && e.payload['opId'] !== second.opId
    );
    const started2 = events.findIndex((e) => e.type === 'memory.face.op_started' && e.payload['opId'] === second.opId);
    expect(committed1).toBeGreaterThanOrEqual(0);
    expect(started2).toBeGreaterThan(committed1);
    expect(incompleteFaceOperations(events)).toEqual([]);

    // одна операция = одна версия: две версии, ровно одна active, candidates нет
    const faces = await facesOf(ctx);
    expect(faces).toHaveLength(2);
    expect(faces.filter((f) => f.status === 'active')).toHaveLength(1);
    expect(faces.filter((f) => f.status === 'candidate')).toHaveLength(0);
    expect((await canon(ctx))!.body).toBe('body-v2');
    // полный след обеих операций читаем (NFR-02)
    for (const opId of new Set(
      events.filter((e) => e.type === 'memory.face.op_started').map((e) => e.payload['opId'])
    )) {
      expect(events.some((e) => e.type === 'memory.face.op_committed' && e.payload['opId'] === opId)).toBe(true);
    }
  });

  it('S-29 (same-input): повтор ТОЙ ЖЕ команды без --op-id — авто-resume той же операции, новая не стартует', async () => {
    // реальный сценарий восстановления: сбой → opId не сохранён → повтор той же
    // команды. Тот же input = этот вызов и есть повтор незавершённой операции
    // (REQ-03 AC-2: одна логическая мутация = одна версия), НЕ «дозавершить + новая».
    await expect(createFaceVersion(depsOf(ctx, makeFault('g17_record')), MUTATION)).rejects.toThrow(
      /injected fault at g17_record/
    );
    const started = await eventsOf(ctx, 'memory.face.op_started');
    expect(started).toHaveLength(1);
    const opId = String(started[0]!.payload['opId']); // сгенерирован автоматически
    expect((await facesOf(ctx)).find((f) => f.status === 'candidate')).toBeTruthy();

    const resumed = await createFaceVersion(depsOf(ctx), MUTATION);
    expect(resumed.opId).toBe(opId); // резюмирована та же операция

    // НОВАЯ op_started не писалась; старая доведена до op_committed
    expect(await eventsOf(ctx, 'memory.face.op_started')).toHaveLength(1);
    await expectCommittedTrail(ctx, opId, ['g17_record', 'activate', 'announce']);
    expect(incompleteFaceOperations(await ctx.log.readAll())).toEqual([]);

    // ровно одна версия лица (без дубля); доставка выдаёт её — полный канон
    const faces = await facesOf(ctx);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.status).toBe('active');
    expect(faces[0]!.op_id).toBe(opId);
    const delivered = await canon(ctx);
    expect(delivered!.id).toBe(faces[0]!.id);
    expect(delivered!.body).toBe('body-v2');
  });

  it('S-30: abort после activation отклоняется (только вперёд, restore штатный)', async () => {
    const v1 = await createFaceVersion(depsOf(ctx), {
      command: 'new',
      ownerSkill: OWNER,
      reason: 'first',
      body: 'body-v1',
      ...G17,
    });
    // незавершённая операция в состоянии «применено» (после activate)
    await expect(
      createFaceVersion(depsOf(ctx, makeFault('activate')), { ...MUTATION, opId: 'faceop-s30-0001' })
    ).rejects.toThrow(/injected fault/);

    await expect(abortFaceOperation(depsOf(ctx), 'faceop-s30-0001', 'user:owner')).rejects.toThrow(
      /activat|forward|restore/i
    );
    // история не переписана: новая версия осталась active (канон полон),
    // прежняя не погашена — обрыв был до supersede_prev (окно §3.3)
    const faces = await facesOf(ctx);
    expect(faces.find((f) => f.version === '2')!.status).toBe('active');
    expect((await ctx.store.get(v1.face.id))!.status).toBe('active');
  });

  it('S-30: recover <opId> резюмирует; неизвестный opId — честная ошибка', async () => {
    await seedV1(ctx);
    const opId = 'faceop-s30r-0001';
    await expect(createFaceVersion(depsOf(ctx, makeFault('g17_record')), { ...MUTATION, opId })).rejects.toThrow(
      /injected fault/
    );

    const resumed = await resumeFaceOperation(depsOf(ctx), opId, 'agent:steward');
    expect(resumed.opId).toBe(opId);
    expect(resumed.face.status).toBe('active');
    await expectCommittedTrail(ctx, opId, ['g17_record', 'announce']);

    await expect(resumeFaceOperation(depsOf(ctx), 'faceop-nope-9999', 'agent:steward')).rejects.toThrow(/not found/i);
    await expect(abortFaceOperation(depsOf(ctx), 'faceop-nope-9999', 'user:owner')).rejects.toThrow(/not found/i);
  });
});
