import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createFaceVersion, type FaceObject } from '../../../src/app/use-cases/create-face-version.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';

// REQ-03/REQ-04 (test-plan §REQ-03, §REQ-04): атрибуция — только env (WOLF_ACTOR),
// контур вызова — WOLF_SESSION (cli-* терминал владельца, opc-* агент-сессия).
const STEWARD_CLI = { WOLF_ACTOR: 'agent:steward', WOLF_SESSION: 'cli-unit' } as NodeJS.ProcessEnv;
const OWNER_CLI = { WOLF_ACTOR: 'user:owner', WOLF_SESSION: 'cli-unit' } as NodeJS.ProcessEnv;
const OWNER_IN_AGENT_SESSION = { WOLF_ACTOR: 'user:owner', WOLF_SESSION: 'opc-1234' } as NodeJS.ProcessEnv;
const AGENT_WORKER = { WOLF_ACTOR: 'agent:worker', WOLF_SESSION: 'opc-1234' } as NodeJS.ProcessEnv;

describe('createFaceVersion (T-02: REQ-03 guard, REQ-04 версии)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let lock: FsMemoryLock;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-face-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    lock = new FsMemoryLock(memoryDir(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps(env: NodeJS.ProcessEnv) {
    return { store, log, lock, clock: new SystemClock(), idGen: new HashIdGenerator(), env };
  }

  async function facesOf(ownerSkill: string): Promise<FaceObject[]> {
    return (await store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === ownerSkill);
  }

  async function eventsOf(type: string): Promise<MemoryEvent[]> {
    return (await log.readAll()).filter((e) => e.type === type);
  }

  it('стюард (env WOLF_ACTOR) создаёт первую версию: поля полны, событие versioned', async () => {
    const result = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: '# Demo playbook',
      title: 'Demo face',
    });

    expect(result.face.type).toBe('face');
    expect(result.face.status).toBe('active');
    expect(result.face.owner_skill).toBe('skill:demo');
    expect(result.face.version).toBe('1');
    expect(result.face.reason).toBe('initial face');
    expect(result.face.initiator).toBe('steward');
    expect(result.face.body).toBe('# Demo playbook');
    // первая версия: based_on отсутствует (optional), не null
    expect('based_on' in result.face).toBe(false);
    expect(result.supersededId).toBeNull();
    expect(result.face.created_at).toBeTruthy();

    const versioned = await eventsOf('memory.face.versioned');
    expect(versioned).toHaveLength(1);
    expect(versioned[0]!.payload).toMatchObject({
      owner_skill: 'skill:demo',
      from: null,
      new: result.face.id,
      initiator: 'steward',
      reason: 'initial face',
    });
  });

  it('вторая версия: номер +1, based_on прежней head, supersede, событие from→new', async () => {
    const v1 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'body-v1',
    });
    const v2 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'clarify triage',
      body: 'body-v2',
    });

    expect(v2.face.version).toBe('2');
    expect(v2.face.based_on).toBe(v1.face.id);
    expect(v2.supersededId).toBe(v1.face.id);

    const v1After = await store.get(v1.face.id);
    expect(v1After?.status).toBe('superseded');
    expect(v1After?.superseded_by).toBe(v2.face.id);

    // ровно одна активная версия владельца
    expect(await facesOf('skill:demo').then((f) => f.filter((x) => x.status === 'active'))).toHaveLength(1);

    const versioned = await eventsOf('memory.face.versioned');
    expect(versioned).toHaveLength(2);
    expect(versioned[1]!.payload).toMatchObject({
      owner_skill: 'skill:demo',
      from: v1.face.id,
      new: v2.face.id,
      initiator: 'steward',
      reason: 'clarify triage',
    });
  });

  it('без reason операция падает (REQ-04 AC2), denied-события и объектов нет', async () => {
    await expect(
      createFaceVersion(deps(STEWARD_CLI), {
        command: 'new',
        ownerSkill: 'skill:demo',
        reason: '   ',
        body: 'b',
      })
    ).rejects.toThrow(UserFacingError);
    expect(await store.list({ type: 'face' })).toHaveLength(0);
    expect(await eventsOf('memory.face.denied')).toHaveLength(0);
  });

  it('не-стюард: отказ guard + событие memory.face.denied {owner_skill, actor, command}', async () => {
    await expect(
      createFaceVersion(deps(AGENT_WORKER), {
        command: 'new',
        ownerSkill: 'skill:demo',
        reason: 'sneaky mutation',
        body: 'b',
      })
    ).rejects.toThrow(/steward/i);
    expect(await store.list({ type: 'face' })).toHaveLength(0);

    const denied = await eventsOf('memory.face.denied');
    expect(denied).toHaveLength(1);
    expect(denied[0]!.payload).toMatchObject({
      owner_skill: 'skill:demo',
      actor: 'agent:worker',
      command: 'new',
    });
  });

  it('restore владельцем: новая версия на основе старой, обратной supersede-ссылки нет', async () => {
    const v1 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'body-v1',
      title: 'Demo face',
    });
    const v2 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'clarify',
      body: 'body-v2',
    });

    const restored = await createFaceVersion(deps(OWNER_CLI), {
      command: 'restore',
      ownerSkill: 'skill:demo',
      from: v1.face.id,
      reason: 'rollback bad v2',
    });

    expect(restored.face.version).toBe('3');
    expect(restored.face.based_on).toBe(v1.face.id);
    expect(restored.face.initiator).toBe('owner');
    // содержание восстановлено дословно (body/title из версии-основы)
    expect(restored.face.body).toBe('body-v1');
    expect(restored.face.title).toBe('Demo face');
    // обратная supersede-ссылка на основу не создаётся: история v1→v2 не переписана
    const v1After = await store.get(v1.face.id);
    expect(v1After?.superseded_by).toBe(v2.face.id);
    // superseded только прежняя head
    expect(restored.supersededId).toBe(v2.face.id);
    const v2After = await store.get(v2.face.id);
    expect(v2After?.superseded_by).toBe(restored.face.id);
  });

  it('restore не-владельцем (агент): отказ + denied', async () => {
    const v1 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'b',
    });
    await expect(
      createFaceVersion(deps(STEWARD_CLI), {
        command: 'restore',
        ownerSkill: 'skill:demo',
        from: v1.face.id,
        reason: 'agent rollback',
      })
    ).rejects.toThrow(/owner/i);
    const denied = await eventsOf('memory.face.denied');
    expect(denied).toHaveLength(1);
    expect(denied[0]!.payload).toMatchObject({ owner_skill: 'skill:demo', actor: 'agent:steward', command: 'restore' });
  });

  it('breakglass из агент-сессии (opc-*): отказ + denied', async () => {
    const v1 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'b',
    });
    await expect(
      createFaceVersion(deps(OWNER_IN_AGENT_SESSION), {
        command: 'breakglass',
        ownerSkill: 'skill:demo',
        from: v1.face.id,
        reason: 'emergency',
      })
    ).rejects.toThrow(/agent session/i);
    const denied = await eventsOf('memory.face.denied');
    expect(denied).toHaveLength(1);
    expect(denied[0]!.payload).toMatchObject({
      owner_skill: 'skill:demo',
      actor: 'user:owner',
      command: 'breakglass',
    });
  });

  it('breakglass из терминала владельца: успех, журнал memory.face.breakglass в составе операции', async () => {
    const v1 = await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'initial face',
      body: 'body-v1',
    });
    await createFaceVersion(deps(STEWARD_CLI), {
      command: 'new',
      ownerSkill: 'skill:demo',
      reason: 'clarify',
      body: 'body-v2',
    });

    // ссылка на основу номером версии (CLI-форма vN)
    const bg = await createFaceVersion(deps(OWNER_CLI), {
      command: 'breakglass',
      ownerSkill: 'skill:demo',
      from: 'v1',
      reason: 'steward face is broken',
    });

    expect(bg.face.version).toBe('3');
    expect(bg.face.based_on).toBe(v1.face.id);
    expect(bg.face.body).toBe('body-v1');
    expect(bg.face.initiator).toBe('breakglass');

    // versioned — на каждую версию (включая breakglass), затем breakglass-журнал
    const forBg = (await log.readAll()).filter((e) => e.payload['new'] === bg.face.id);
    expect(forBg.map((e) => e.type)).toEqual(['memory.face.versioned', 'memory.face.breakglass']);
    for (const e of forBg) {
      expect(e.payload).toMatchObject({
        owner_skill: 'skill:demo',
        from: bg.supersededId,
        new: bg.face.id,
        initiator: 'breakglass',
        reason: 'steward face is broken',
      });
    }
  });

  it('параллельные вызовы сериализуются: версии без дыр и дублей, одна активная', async () => {
    const d = deps(STEWARD_CLI);
    const results = await Promise.all([
      createFaceVersion(d, { command: 'new', ownerSkill: 'skill:demo', reason: 'r1', body: 'b1' }),
      createFaceVersion(d, { command: 'new', ownerSkill: 'skill:demo', reason: 'r2', body: 'b2' }),
    ]);
    const versions = results.map((r) => r.face.version).sort();
    expect(versions).toEqual(['1', '2']);
    expect(await facesOf('skill:demo')).toHaveLength(2);
    expect(await facesOf('skill:demo').then((f) => f.filter((x) => x.status === 'active'))).toHaveLength(1);
  });
});
