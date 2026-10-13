// tests/integration/migrate-faces-healing.test.ts
// 2.17.1 REQ-04 (R05) S-32…S-35 (design §3.4, ADR-4): миграция на общей операции
// лица; skip-логика → 4 разбора (resume / idempotent-skip / healing по
// anchored-совпадению точного reason-формата 2.17.0 / конфликт); healing и resume
// никогда не пишут body; неоднозначности — report.conflicts, записи не изменены,
// exit≠0 достигается параллельной записью в failed (CLI face.ts уже мапит).
// Конвенция: реальные адаптеры в tmp (прецедент face-operation-recovery.test.ts);
// fault-seam бросает ПОСЛЕ завершения шага (тест-план, «Общие проверки матрицы»).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { migrateFaces } from '../../src/app/use-cases/migrate-faces.js';
import { addMemoryObject } from '../../src/app/use-cases/add-memory-object.js';
import type { FaceFaultInjector } from '../../src/app/use-cases/face-operation.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../src/adapters/fs/project-paths.js';
import type { MemoryEvent } from '../../src/domain/schemas/memory-event-schema.js';

const CREATED = '2026-09-20T10:00:00Z';

function legacyFm(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Legacy ${id}`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: CREATED,
    updated_at: CREATED,
    created_by: 'wolf-init',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    ...overrides,
  };
}

interface Ctx {
  dir: string;
  store: MarkdownMemoryStore;
  log: JsonlEventLog;
}

function makeCtx(): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-migrate-heal-'));
  return { dir, store: new MarkdownMemoryStore(dir), log: new JsonlEventLog(eventsPath(dir)) };
}

function depsOf(ctx: Ctx, over: Record<string, unknown> = {}) {
  return {
    store: ctx.store,
    log: ctx.log,
    clock: new SystemClock(),
    idGen: new HashIdGenerator(),
    lock: new FsMemoryLock(memoryDir(ctx.dir)),
    ...over,
  };
}

function makeFault(failAt: string): FaceFaultInjector {
  let fired = false;
  return (point) => {
    if (point === failAt && !fired) {
      fired = true; // один сбой на запуск: первый владелец (boom, сортировка) падает, ok жив
      throw new Error(`injected fault at ${point}`);
    }
  };
}

function writeMemory(ctx: Ctx, file: string, fm: Record<string, unknown>, body: string): void {
  const abs = join(ctx.dir, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`);
}

function writeHead(ctx: Ctx, id: string, owner: string, body = 'Legacy body.'): void {
  writeMemory(
    ctx,
    join('.wolf', 'memory', 'shared', 'notes', `${id}.md`),
    legacyFm(id, { type: 'note', facet: 'howto', title: `${owner} playbook`, owner_skill: owner }),
    body
  );
}

/** Докомпьютерный partial-переход 2.17.0: face создан (active, без op_id —
 * 2.17.0 op_id не писал), legacy-head ещё активен. Реализм формата reason —
 * дословный migrate-faces.ts:95 волны 2.17: `… ${head.id} (2.17)`. */
async function seedPreComputerFace(ctx: Ctx, owner: string, reason: string, body = 'Migrated body.'): Promise<string> {
  const { object } = await addMemoryObject(
    { store: ctx.store, log: ctx.log, clock: new SystemClock(), idGen: new HashIdGenerator() },
    {
      type: 'face',
      internalFacePath: true,
      title: `${owner} playbook`,
      body,
      createdBy: 'wolf-migrate',
      status: 'active',
      extra: { owner_skill: owner, version: '1', reason, initiator: 'migration' },
    }
  );
  return object.id;
}

async function facesOf(ctx: Ctx, owner: string) {
  return (await ctx.store.list({ type: 'face' })).filter((o) => (o as { owner_skill?: string }).owner_skill === owner);
}

async function events(ctx: Ctx): Promise<MemoryEvent[]> {
  return ctx.log.readAll();
}

/** Последовательность op_step одной операции (по opId её op_started). */
async function stepSeq(ctx: Ctx, opIdFilter?: string): Promise<string[]> {
  let active: string | null = null;
  const steps: string[] = [];
  for (const e of await events(ctx)) {
    if (e.type === 'memory.face.op_started') active = String(e.payload['opId']);
    if (e.type !== 'memory.face.op_step') continue;
    if (opIdFilter !== undefined ? e.payload['opId'] === opIdFilter : active === e.payload['opId']) {
      steps.push(String(e.payload['step']));
    }
  }
  return steps;
}

const REAL_REASON = (headId: string) => `migrated from playbook note ${headId} (2.17)`;

describe('S-33 (REQ-04 AC-1/AC-2): healing докомпьютерного частичного перехода', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('точный формат reason 2.17.0 (anchored, с суффиксом) → healing: supersede_legacy + announce, body не пишется', async () => {
    const headId = 'mem_20260925_head_cc33dd';
    writeHead(ctx, headId, 'skill:demo');
    const faceId = await seedPreComputerFace(ctx, 'skill:demo', REAL_REASON(headId), 'User edited body.');
    // пользователь переписал тело лица после сбоя 2.17.0 — healing не должен затереть
    await ctx.store.update(faceId, { body: 'User edited body v2.' });

    const report = await migrateFaces(depsOf(ctx));

    expect(report.failed).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect(report.outcomes).toHaveLength(1);
    expect(report.outcomes[0]).toMatchObject({ ownerSkill: 'skill:demo', action: 'healed', faceId, headId });

    const head = await ctx.store.get(headId);
    expect(head?.status).toBe('superseded');
    expect(head?.superseded_by).toBe(faceId);
    const face = await ctx.store.get(faceId);
    expect(face?.body).toBe('User edited body v2.'); // REQ-04 AC-3: старый body не переносится
    expect(face?.status).toBe('active');

    // healing — журналируемая операция: op_started(plan supersede_legacy+announce)
    // + шаги + op_committed; публичный announce (memory.face.versioned) есть
    const ops = (await events(ctx)).filter((e) => e.type === 'memory.face.op_started');
    const healOp = ops.find((e) => Array.isArray(e.payload['plan']) && e.payload['plan'][0] === 'supersede_legacy');
    expect(healOp).toBeDefined();
    const healOpId = String(healOp!.payload['opId']);
    expect(await stepSeq(ctx, healOpId)).toEqual(['supersede_legacy', 'announce']);
    const committed = (await events(ctx)).some(
      (e) => e.type === 'memory.face.op_committed' && e.payload['opId'] === healOpId
    );
    expect(committed).toBe(true);
    const versioned = (await events(ctx)).filter((e) => e.type === 'memory.face.versioned');
    expect(versioned.some((e) => e.payload['new'] === faceId)).toBe(true);
  });

  // FIX-раунд 2, m2: healing идёт под MemoryLock — единый стиль с fresh-миграцией
  // (createFaceVersion берёт lock сам); вся healing-операция — одна секция.
  it('m2: healing-операция исполняется целиком под MemoryLock', async () => {
    const headId = 'mem_20260925_head_cc33dd';
    writeHead(ctx, headId, 'skill:demo');
    const faceId = await seedPreComputerFace(ctx, 'skill:demo', REAL_REASON(headId));

    const calls: string[] = [];
    const spyLog = {
      append: async (e: MemoryEvent) => {
        calls.push(`log:${e.type}`);
        return ctx.log.append(e);
      },
      readAll: async () => ctx.log.readAll(),
    };
    const spyLock = {
      withLock: <T>(fn: () => Promise<T>): Promise<T> => {
        calls.push('lock:in');
        return Promise.resolve(fn()).finally(() => calls.push('lock:out'));
      },
    };

    const report = await migrateFaces(depsOf(ctx, { log: spyLog as never, lock: spyLock as never }));

    expect(report.outcomes[0]).toMatchObject({ action: 'healed', faceId });
    expect(calls[0]).toBe('lock:in');
    expect(calls[calls.length - 1]).toBe('lock:out');
    const inLock = calls.slice(1, -1);
    expect(inLock).toContain('log:memory.face.op_started');
    expect(inLock).toContain('log:memory.face.op_committed');
    expect(inLock).toContain('log:memory.superseded');
  });

  it('негатив: усечённый reason (без суффикса " (2.17)") НЕ матчится → конфликт, не healing', async () => {
    const headId = 'mem_20260925_head_cc33dd';
    writeHead(ctx, headId, 'skill:demo');
    const faceId = await seedPreComputerFace(ctx, 'skill:demo', `migrated from playbook note ${headId}`);

    const report = await migrateFaces(depsOf(ctx));

    expect(report.outcomes).toEqual([]); // «успех» не объявляется
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({ ownerSkill: 'skill:demo' });
    expect(report.failed).toHaveLength(1); // параллельная запись → CLI exit ≠ 0
    // записи не изменены
    expect((await ctx.store.get(headId))?.status).toBe('active');
    expect((await ctx.store.get(faceId))?.status).toBe('active');
  });

  it('негатив: изменённый формат reason (нет "note") НЕ матчится → конфликт', async () => {
    const headId = 'mem_20260925_head_cc33dd';
    writeHead(ctx, headId, 'skill:demo');
    await seedPreComputerFace(ctx, 'skill:demo', `migrated from playbook ${headId} (2.17)`);

    const report = await migrateFaces(depsOf(ctx));

    expect(report.outcomes).toEqual([]);
    expect(report.conflicts).toHaveLength(1);
    expect((await ctx.store.get(headId))?.status).toBe('active');
  });

  it('idempotent-skip: лицо есть, активного legacy head нет → честный skip без записей', async () => {
    const headId = 'mem_20260925_head_cc33dd';
    writeHead(ctx, headId, 'skill:demo');
    await seedPreComputerFace(ctx, 'skill:demo', REAL_REASON(headId));
    await ctx.store.update(headId, { status: 'superseded', superseded_by: 'mem_20260925_face_ffffff' });

    const report = await migrateFaces(depsOf(ctx));

    expect(report.conflicts).toEqual([]);
    expect(report.outcomes).toHaveLength(1);
    expect(report.outcomes[0]).toMatchObject({ ownerSkill: 'skill:demo', action: 'skipped' });
    // новых операций нет
    expect((await events(ctx)).filter((e) => e.type === 'memory.face.op_started')).toHaveLength(0);
  });
});

describe('S-34 (REQ-04 AC-2): неоднозначности → report.conflicts, записи не изменены', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('несколько активных legacy head одного владельца → конфликт', async () => {
    writeHead(ctx, 'mem_20260925_head_cc33dd', 'skill:demo');
    writeHead(ctx, 'mem_20260926_head_dd44ee', 'skill:demo');

    const report = await migrateFaces(depsOf(ctx));

    expect(report.outcomes).toEqual([]);
    expect(report.conflicts).toHaveLength(1);
    expect(report.failed).toHaveLength(1);
    expect(await facesOf(ctx, 'skill:demo')).toHaveLength(0);
    expect((await ctx.store.get('mem_20260925_head_cc33dd'))?.status).toBe('active');
    expect((await ctx.store.get('mem_20260926_head_dd44ee'))?.status).toBe('active');
  });

  it('несколько live-лиц владельца → конфликт, записи не изменены', async () => {
    writeHead(ctx, 'mem_20260925_head_cc33dd', 'skill:demo');
    await seedPreComputerFace(ctx, 'skill:demo', REAL_REASON('mem_20260925_head_cc33dd'));
    await addMemoryObject(
      { store: ctx.store, log: ctx.log, clock: new SystemClock(), idGen: new HashIdGenerator() },
      {
        type: 'face',
        internalFacePath: true,
        title: 'demo v2',
        body: 'v2',
        createdBy: 'wolf-migrate',
        status: 'active',
        extra: { owner_skill: 'skill:demo', version: '2', reason: 'manual', initiator: 'steward' },
      }
    );

    const report = await migrateFaces(depsOf(ctx));

    expect(report.outcomes).toEqual([]);
    expect(report.conflicts).toHaveLength(1);
    expect(await facesOf(ctx, 'skill:demo')).toHaveLength(2);
    expect((await ctx.store.get('mem_20260925_head_cc33dd'))?.status).toBe('active');
  });
});

describe('S-32 (REQ-04 AC-1): сбой на каждом шаге миграции + повтор — дозавершение', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  function seedTwoOwners(): void {
    writeHead(ctx, 'mem_20260925_ok_cc33dd', 'skill:ok', 'Ok body.');
    writeHead(ctx, 'mem_20260925_boom_dd44ee', 'skill:boom', 'Boom body.');
  }

  async function finalStateAsserts(): Promise<void> {
    // оба владельца: ровно одно активное лицо v1, head погашен лицом
    for (const [owner, headId] of [
      ['skill:ok', 'mem_20260925_ok_cc33dd'],
      ['skill:boom', 'mem_20260925_boom_dd44ee'],
    ] as const) {
      const faces = await facesOf(ctx, owner);
      expect(faces).toHaveLength(1);
      expect(faces[0]).toMatchObject({ status: 'active', version: '1', initiator: 'migration' });
      expect(faces[0]!.body).toBe(owner === 'skill:ok' ? 'Ok body.' : 'Boom body.'); // дословный перенос
      const head = await ctx.store.get(headId);
      expect(head?.status).toBe('superseded');
      expect(head?.superseded_by).toBe(faces[0]!.id);
    }
  }

  // Шаги реальной цепочки миграции v1: supersede_prev недостижим (нет прежней
  // face-версии) — его F5-покрытие для команды migrate эквивалентно механизму
  // §3.3 (T2, face-operation-recovery); шаг supersede_legacy покрывается
  // F9-кейсом ниже.
  it.each(['op_started', 'add_face', 'activate', 'announce', 'op_committed'] as const)(
    'сбой после шага %s + повтор wolf face migrate: дозавершение, завершённые владельцы не откатываются',
    async (failAt) => {
      seedTwoOwners();
      const r1 = await migrateFaces(depsOf(ctx, { fault: makeFault(failAt) }));
      // поэтапность: упавший владелец в failed, завершённый остался
      expect(r1.failed.map((f) => f.ownerSkill)).toEqual(['skill:boom']);
      expect(r1.outcomes.map((o) => o.ownerSkill)).toEqual(['skill:ok']);

      const okFacesAfterR1 = await facesOf(ctx, 'skill:ok');
      expect(okFacesAfterR1).toHaveLength(1);

      const r2 = await migrateFaces(depsOf(ctx));
      expect(r2.failed).toEqual([]);
      // boom дозавершён (resumed), ok — idempotent, не откатывается и не дублируется
      const okOutcome = r2.outcomes.find((o) => o.ownerSkill === 'skill:ok');
      expect(okOutcome?.action).toBe('skipped');
      const boomOutcome = r2.outcomes.find((o) => o.ownerSkill === 'skill:boom');
      expect(['resumed', 'healed', 'migrated']).toContain(boomOutcome?.action);

      await finalStateAsserts();
      // одна операция миграции на владельца: повтор не создаёт вторую версию вслепую
      const okFaces = await facesOf(ctx, 'skill:ok');
      const boomFaces = await facesOf(ctx, 'skill:boom');
      expect(okFaces.every((f) => f.version === '1')).toBe(true);
      expect(boomFaces.every((f) => f.version === '1')).toBe(true);
    }
  );

  it('F9: сбой после шага supersede_legacy операции → «применено, требуется след»; повтор идемпотентен', async () => {
    seedTwoOwners();
    const r1 = await migrateFaces(depsOf(ctx, { fault: makeFault('supersede_legacy') }));
    expect(r1.failed.map((f) => f.ownerSkill)).toEqual(['skill:boom']);

    // состояние: лицо активно и полно, head уже погашен (шаг выполнен до сбоя),
    // остались announce + op_committed той же операции
    const boomFace = (await facesOf(ctx, 'skill:boom'))[0]!;
    expect(boomFace.status).toBe('active');
    expect((await ctx.store.get('mem_20260925_boom_dd44ee'))?.superseded_by).toBe(boomFace.id);

    const r2 = await migrateFaces(depsOf(ctx));
    expect(r2.failed).toEqual([]);
    await finalStateAsserts();

    // повторный supersede_legacy — skip: один memory.superseded на head
    const supersededEvents = (await events(ctx)).filter(
      (e) => e.type === 'memory.superseded' && e.payload['old_id'] === 'mem_20260925_boom_dd44ee'
    );
    expect(supersededEvents).toHaveLength(1);
  });

  it('F8-контур: сбой FTS-индекса не рушит миграцию (индекс производный)', async () => {
    writeHead(ctx, 'mem_20260925_head_cc33dd', 'skill:demo');
    const throwingIndex = {
      rebuild: async () => undefined,
      indexObject: async () => {
        throw new Error('fts on fire');
      },
      removeObject: async () => undefined,
      search: async () => ({ hits: [] }),
    };
    const errSpy = console.error;
    console.error = () => undefined;
    try {
      const report = await migrateFaces(depsOf(ctx, { index: throwingIndex as never }));
      console.error = errSpy;
      expect(report.failed).toEqual([]);
      expect(report.outcomes[0]).toMatchObject({ ownerSkill: 'skill:demo', action: 'migrated' });
      const face = (await facesOf(ctx, 'skill:demo'))[0]!;
      expect(face.status).toBe('active');
      expect((await ctx.store.get('mem_20260925_head_cc33dd'))?.superseded_by).toBe(face.id);
    } finally {
      console.error = errSpy;
    }
  });

  // F9 (design §3.4, закрыто решением L1): supersede_legacy — шаг ТОЙ ЖЕ
  // операции migrate: позиция в плане — между supersede_prev и announce,
  // смежной healing-операции у fresh-миграции нет. У первой версии лица
  // supersede_prev — no-op (нет прежней face-версии): исполняется 4 шага.
  it('F9-контракт: supersede_legacy — шаг операции migrate между supersede_prev и announce (единый op)', async () => {
    writeHead(ctx, 'mem_20260925_head_cc33dd', 'skill:demo');
    await migrateFaces(depsOf(ctx));
    const ops = (await events(ctx)).filter(
      (e) => e.type === 'memory.face.op_started' && e.payload['command'] === 'migrate'
    );
    expect(ops).toHaveLength(1); // одна операция миграции — без смежной healing-op
    const opId = String(ops[0]!.payload['opId']);
    expect(ops[0]!.payload['plan']).toEqual(['add_face', 'activate', 'supersede_prev', 'supersede_legacy', 'announce']);
    expect(await stepSeq(ctx, opId)).toEqual(['add_face', 'activate', 'supersede_legacy', 'announce']);
    // head погашен этой же операцией
    const face = (await facesOf(ctx, 'skill:demo'))[0]!;
    expect((await ctx.store.get('mem_20260925_head_cc33dd'))?.superseded_by).toBe(face.id);
  });
});

describe('S-35 (REQ-04 AC-3): healing/resume никогда не пишут body', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });
  afterEach(() => {
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('resume усыновляет candidate без перезаписи: пользовательское тело сохранено', async () => {
    writeHead(ctx, 'mem_20260925_head_cc33dd', 'skill:demo', 'Legacy body.');
    // сбой после add_face: candidate записан, операция не завершена
    await migrateFaces(depsOf(ctx, { fault: makeFault('add_face') }));
    const candidate = (await facesOf(ctx, 'skill:demo')).find((f) => f.status === 'candidate');
    expect(candidate).toBeDefined();
    // пользователь переписал тело недостроенной версии
    await ctx.store.update(candidate!.id, { body: 'User rewrote the candidate.' });

    const report = await migrateFaces(depsOf(ctx));

    expect(report.failed).toEqual([]);
    expect(report.outcomes[0]).toMatchObject({ ownerSkill: 'skill:demo', action: 'resumed' });
    const face = (await facesOf(ctx, 'skill:demo'))[0]!;
    expect(face.status).toBe('active');
    expect(face.body).toBe('User rewrote the candidate.'); // не legacy body
    expect((await ctx.store.get('mem_20260925_head_cc33dd'))?.superseded_by).toBe(face.id);
  });
});
