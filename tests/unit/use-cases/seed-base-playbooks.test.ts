// tests/unit/use-cases/seed-base-playbooks.test.ts
// Волна 2.17 T-05 (REQ-02 AC3): посев base-set создаёт лица через face-контракт
// (initiator='seed', ADR-6).
// 2.17.1 T4 (REQ-01 (R01), design §3.6/ADR-6): re-init обновляет live-лица —
// body совпал → skip; дрейф при initiator seed/migration → template update
// (журналируемая операция §3.3, reason "template update: … (2.17.1)");
// steward/owner/breakglass-мутации → diverged (лицо не трогаем, зона Стюарда D4);
// нет лица + активный legacy howto (популяция 2.16.3) → посев телом ШАБЛОНА +
// поглощение legacy-head. Сценарии S-05/S-06/S-07 test-plan.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { seedBasePlaybooks, type SeedOutcome } from '../../../src/app/use-cases/seed-base-playbooks.js';
import { createFaceVersion, type FaceObject } from '../../../src/app/use-cases/create-face-version.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../../src/adapters/fs/project-paths.js';

const FILE_A =
  '---\ntitle: Наставник v1\nowner_skill: steward\nversion: 1\nsteps: читай жалобу | мутируй playbook | supersede\ntags: steward:наставник,playbook\n---\nПротокол мутации.';
const FILE_B =
  '---\ntitle: Жалобный протокол\nowner_skill: mr-wolf\nversion: 1\nsteps: зафиксируй трение | вызови Стюарда\ntags: complaint,playbook\n---\nПравило жалобы.';
const TEMPLATE_A_V2 =
  '---\ntitle: Наставник v2\nowner_skill: steward\nsteps: wolf face show | wolf face new + G17\ntags: steward:наставник,playbook\n---\nПротокол мутации v2: wolf face new с 7 полями G17.';

const CREATED = '2026-09-20T10:00:00Z';

describe('seedBasePlaybooks (T-05: face-контракт, initiator=seed)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-seed-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps(files?: Map<string, string>) {
    return {
      files:
        files ??
        new Map([
          ['steward-nastavnik.md', FILE_A],
          ['complaint-protocol.md', FILE_B],
        ]),
      store,
      log,
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      lock: new FsMemoryLock(memoryDir(dir)),
    };
  }

  async function facesOf(owner: string): Promise<FaceObject[]> {
    return (await store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === owner);
  }

  function writeLegacyHowto(id: string, owner: string, status = 'active'): void {
    const abs = join(dir, '.wolf', 'memory', 'shared', 'notes', `${id}.md`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(
      abs,
      `---\n${yaml
        .dump({
          id,
          title: `Наставник v1 (legacy ${owner})`,
          status,
          review_state: 'accepted',
          confidence: 'medium',
          importance: 0.5,
          created_at: CREATED,
          updated_at: CREATED,
          created_by: 'wolf-init',
          schema_version: 1,
          source: { kind: 'manual' },
          related: { files: [], docs: [], decisions: [] },
          tags: ['playbook'],
          superseded_by: null,
          type: 'note',
          facet: 'howto',
          owner_skill: owner,
        })
        .trimEnd()}\n---\n\nLegacy body ${owner}.`
    );
  }

  it('сеет лица через face-контракт (initiator=seed): owner_skill/title/теги/тело из шаблона', async () => {
    const out = await seedBasePlaybooks(deps());

    expect(out.map((o) => o.action)).toEqual(['created', 'created']);
    const steward = (await facesOf('steward'))[0]!;
    expect(steward.type).toBe('face');
    expect(steward.initiator).toBe('seed');
    expect(steward.version).toBe('1'); // номер назначает команда, не шаблон
    expect(steward.title).toBe('Наставник v1');
    expect(steward.tags).toEqual(['steward:наставник', 'playbook']);
    expect(steward.body).toContain('Протокол мутации.');
    expect(steward.reason).toMatch(/base-set seed: steward-nastavnik\.md/);
    expect(await facesOf('mr-wolf')).toHaveLength(1);
  });

  it('re-init: body совпал → skip без записи (идемпотентность ADR-6)', async () => {
    await seedBasePlaybooks(deps());

    const out2 = await seedBasePlaybooks(deps());

    expect(out2.every((o) => o.action === 'skipped')).toBe(true);
    expect(out2.every((o) => (o.reason ?? '').includes('matches template'))).toBe(true);
    expect(await store.list({ type: 'face' })).toHaveLength(2); // не пересеяли
    expect((await facesOf('steward')).every((f) => f.version === '1')).toBe(true); // новых версий нет
  });

  it('S-06: дрейф при initiator seed → template update: новая версия, полный след §3.3', async () => {
    await seedBasePlaybooks(deps()); // v1 (initiator seed, старое тело)
    const v1 = (await facesOf('steward')).find((f) => f.version === '1')!;

    const out = await seedBasePlaybooks(deps(new Map([['steward-nastavnik.md', TEMPLATE_A_V2]])));

    expect(out.find((o) => o.file === 'steward-nastavnik.md')?.action).toBe('updated');
    const versions = await facesOf('steward');
    expect(versions).toHaveLength(2);
    const v2 = versions.find((f) => f.version === '2')!;
    expect(v2.body).toBe('Протокол мутации v2: wolf face new с 7 полями G17.'); // тело = шаблон
    expect(v2.initiator).toBe('seed');
    expect(v2.reason).toBe('template update: steward-nastavnik.md (2.17.1)');
    expect(v2.based_on).toBe(v1.id);
    const v1After = (await store.get(v1.id)) as FaceObject; // перечитано: ссылка v1 — снапшот до update
    expect(v1After.status).toBe('superseded');
    expect(v1After.superseded_by).toBe(v2.id);
    // полный журнал операции §3.3 (общий механизма face-operation)
    const started = (await log.readAll()).find(
      (e) => e.type === 'memory.face.op_started' && (e.payload['input'] as { reason?: string })?.reason === v2.reason
    );
    expect(started?.payload['command']).toBe('seed');
    expect((await log.readAll()).some((e) => e.type === 'memory.face.op_committed')).toBe(true);
  });

  it('S-06: initiator migration → template update (популяция 2.17.0 через wolf face migrate)', async () => {
    await createFaceVersion(
      { store, log, clock: new SystemClock(), idGen: new HashIdGenerator() },
      {
        command: 'migrate',
        ownerSkill: 'steward',
        reason: 'migrated from playbook note mem_20260920_x (2.17)',
        body: 'мигрированное тело (старый шаблон 2.17.0)',
        title: 'Наставник (migrated)',
        tags: ['steward:наставник'],
      }
    );

    const out = await seedBasePlaybooks(deps(new Map([['steward-nastavnik.md', TEMPLATE_A_V2]])));

    expect(out.find((o) => o.file === 'steward-nastavnik.md')?.action).toBe('updated');
    const active = (await facesOf('steward')).filter((f) => f.status === 'active')[0]!;
    expect(active.body).toContain('wolf face new');
    expect(active.reason).toBe('template update: steward-nastavnik.md (2.17.1)');
  });

  it.each(['steward', 'owner', 'breakglass'] as const)(
    'S-07: initiator %s + дрейф → diverged, лицо не тронуто (D4)',
    async (initiator) => {
      await seedBasePlaybooks(
        deps(
          new Map([
            ['steward-nastavnik.md', FILE_A],
            ['complaint-protocol.md', FILE_B],
          ])
        )
      );
      if (initiator === 'steward') {
        await createFaceVersion(
          { store, log, clock: new SystemClock(), idGen: new HashIdGenerator(), env: { WOLF_ACTOR: 'agent:steward' } },
          {
            command: 'new',
            ownerSkill: 'steward',
            reason: 'стюардская правка',
            body: 'тело, изменённое Стюардом',
            title: 'Наставник (steward)',
            tags: ['steward:наставник'],
            minimalChange: 'm',
            boundaries: 'b',
            exampleHelps: 'h',
            exampleKeep: 'k',
            verification: 'v',
            rollback: 'r',
          }
        );
      } else {
        await createFaceVersion(
          { store, log, clock: new SystemClock(), idGen: new HashIdGenerator(), env: { WOLF_ACTOR: 'user:owner' } },
          {
            command: initiator === 'owner' ? 'restore' : 'breakglass',
            ownerSkill: 'steward',
            reason: 'возврат',
            from: 'v1',
          }
        );
      }
      const before = await facesOf('steward');
      const activeBefore = before.find((f) => f.status === 'active')!;
      const eventsBefore = (await log.readAll()).length;

      const out: SeedOutcome[] = await seedBasePlaybooks(
        deps(
          new Map([
            ['steward-nastavnik.md', TEMPLATE_A_V2],
            ['complaint-protocol.md', FILE_B],
          ])
        )
      );

      const outcome = out.find((o) => o.file === 'steward-nastavnik.md')!;
      expect(outcome.action).toBe('diverged');
      expect(outcome.reason).toContain('diverged');
      const after = await facesOf('steward');
      expect(after).toHaveLength(before.length); // новых версий нет
      expect(after.find((f) => f.status === 'active')!.body).toBe(activeBefore.body); // тело не изменено
      expect((await log.readAll()).length).toBe(eventsBefore); // записей нет
    }
  );

  it('S-05: нет лица + активный legacy howto → посев телом ШАБЛОНА + поглощение head', async () => {
    writeLegacyHowto('mem_20260920_legacy_ab12cd', 'steward');

    const out = await seedBasePlaybooks(deps());

    const outcome = out.find((o) => o.file === 'steward-nastavnik.md')!;
    expect(outcome.action).toBe('created');
    expect(outcome.reason ?? '').toContain('superseded legacy howto mem_20260920_legacy_ab12cd');
    const faces = await facesOf('steward');
    expect(faces).toHaveLength(1); // дублей канона нет
    expect(faces[0]!.body).toContain('Протокол мутации.'); // тело = ШАБЛОН, не legacy-body
    expect(faces[0]!.initiator).toBe('seed');
    const head = await store.get('mem_20260920_legacy_ab12cd');
    expect(head?.status).toBe('superseded'); // legacy-howto поглощён
    expect((head as { superseded_by?: string } | null)?.superseded_by).toBe(faces[0]!.id);
  });

  it('S-05: поглощение legacy — ОДНА журналируемая операция (след op_started→supersede_legacy→op_committed)', async () => {
    writeLegacyHowto('mem_20260920_legacy_ab12cd', 'steward');

    await seedBasePlaybooks(deps()); // steward → seed+поглощение, mr-wolf → обычный посев

    const events = await log.readAll();
    const started = events.find(
      (e) =>
        e.type === 'memory.face.op_started' &&
        (e.payload['input'] as { reason?: string })?.reason === 'base-set seed: steward-nastavnik.md'
    )!;
    expect(started.payload['command']).toBe('seed');
    expect((started.payload['input'] as { legacyHeadId?: string }).legacyHeadId).toBe('mem_20260920_legacy_ab12cd');
    expect(started.payload['plan']).toEqual(['add_face', 'activate', 'supersede_prev', 'supersede_legacy', 'announce']);
    // head погашен ТОЙ ЖЕ операцией: шаг supersede_legacy — её opId
    const steps = events.filter(
      (e) => e.type === 'memory.face.op_step' && e.payload['opId'] === started.payload['opId']
    );
    expect(steps.map((e) => e.payload['step'])).toContain('supersede_legacy');
    const legacyStep = steps.find((e) => e.payload['step'] === 'supersede_legacy')!;
    expect((legacyStep.payload['detail'] as { head_id?: string }).head_id).toBe('mem_20260920_legacy_ab12cd');
    // атомарность журналом: операция закрыта commit'ом — окна «лицо есть, head жив» нет
    expect(
      events.some((e) => e.type === 'memory.face.op_committed' && e.payload['opId'] === started.payload['opId'])
    ).toBe(true);
    // посев WITHOUT legacy идёт без шага (план §3.3 базовый)
    const plainStarted = events.find(
      (e) =>
        e.type === 'memory.face.op_started' &&
        (e.payload['input'] as { reason?: string })?.reason === 'base-set seed: complaint-protocol.md'
    )!;
    expect(plainStarted.payload['plan']).toEqual(['add_face', 'activate', 'supersede_prev', 'announce']);
  });

  it('§3.6: legacy-цепочка без активного head — обычный посев, superseded-запись не трогается', async () => {
    writeLegacyHowto('mem_20260920_legacy_ab12cd', 'steward', 'superseded');

    const out = await seedBasePlaybooks(deps());

    expect(out.find((o) => o.file === 'steward-nastavnik.md')?.action).toBe('created');
    expect(out.find((o) => o.file === 'steward-nastavnik.md')?.reason ?? '').not.toContain('superseded legacy');
    const head = await store.get('mem_20260920_legacy_ab12cd');
    expect(head?.superseded_by).toBeNull(); // не переприписан
  });

  it('два шаблона одного владельца в одном прогоне — второй skip (дубль)', async () => {
    const files = new Map([
      ['a.md', FILE_A],
      ['b.md', TEMPLATE_A_V2],
    ]);

    const out = await seedBasePlaybooks(deps(files));

    expect(out.map((o) => o.action)).toEqual(['created', 'skipped']);
    expect(out[1]!.reason).toContain('already seeded');
    expect(await facesOf('steward')).toHaveLength(1);
  });

  it('жизненный цикл: посеянное лицо — законная первая версия для createFaceVersion', async () => {
    await seedBasePlaybooks(deps());

    const v2 = await createFaceVersion(
      {
        store,
        log: new JsonlEventLog(eventsPath(dir)),
        clock: new SystemClock(),
        idGen: new HashIdGenerator(),
        env: { WOLF_ACTOR: 'agent:steward' },
      },
      {
        command: 'new',
        ownerSkill: 'steward',
        reason: 'clarify triage',
        body: 'Протокол мутации v2.',
        minimalChange: 'w',
        boundaries: 'b',
        exampleHelps: 'h',
        exampleKeep: 'k',
        verification: 'v',
        rollback: 'r',
      }
    );

    const all = await facesOf('steward');
    expect(v2.face.version).toBe('2');
    expect(v2.supersededId).toBe(all.find((f) => f.version === '1')!.id);
    expect(all.filter((f) => f.status === 'active')).toHaveLength(1);
  });

  // 2.19.0 T2 (ADR-3, design §«Проектный шаг» шаг 3): seed-missing-only —
  // посев ТОЛЬКО недостающих лиц; живые не трогаются; структурные коды kind
  // (seeded | skipped-live | legacy-absorbed | diverged) для сверки T5.
  describe('mode: seed-missing-only', () => {
    const run = (files?: Map<string, string>) => seedBasePlaybooks({ ...deps(files), mode: 'seed-missing-only' });

    it('пустой стор → kind=seeded; повторный проход → kind=skipped-live, мутаций нет (NFR-02)', async () => {
      const out = await run();
      expect(out.map((o) => o.kind)).toEqual(['seeded', 'seeded']);
      expect(out.map((o) => o.action)).toEqual(['created', 'created']); // legacy action-коды совместимы
      expect((await facesOf('steward'))[0]!.initiator).toBe('seed');
      expect((await facesOf('mr-wolf'))[0]!.body).toBe('Правило жалобы.'); // тело из шаблона

      const before = await store.list();
      const eventsBefore = (await log.readAll()).length;
      const out2 = await run();
      expect(out2.every((o) => o.kind === 'skipped-live')).toBe(true);
      expect(await store.list()).toEqual(before); // повтор ничего не мутировал
      expect((await log.readAll()).length).toBe(eventsBefore);
    });

    it.each(['seed', 'migration'] as const)(
      'живое лицо (initiator %s) отстало от шаблона → kind=skipped-live, createFaceVersion НЕ вызван',
      async (initiator) => {
        if (initiator === 'seed') {
          await seedBasePlaybooks(deps()); // v1 телом FILE_A
        } else {
          await createFaceVersion(
            { store, log, clock: new SystemClock(), idGen: new HashIdGenerator() },
            {
              command: 'migrate',
              ownerSkill: 'steward',
              reason: 'migrated (2.17)',
              body: 'мигрированное тело',
              title: 'Наставник (migrated)',
              tags: ['steward:наставник'],
            }
          );
        }
        const before = await facesOf('steward');
        const activeBefore = before.find((f) => f.status === 'active')!;
        const eventsBefore = (await log.readAll()).length;

        const out = await run(new Map([['steward-nastavnik.md', TEMPLATE_A_V2]]));

        const o = out.find((x) => x.file === 'steward-nastavnik.md')!;
        expect(o.kind).toBe('skipped-live');
        expect(o.action).toBe('skipped');
        const after = await facesOf('steward');
        expect(after).toHaveLength(before.length); // переверсионирования нет
        expect(after.find((f) => f.status === 'active')!.body).toBe(activeBefore.body); // тело не тронуто
        expect((await log.readAll()).length).toBe(eventsBefore); // записей нет — face-оп не запускался
      }
    );

    it.each(['steward', 'owner', 'breakglass'] as const)(
      'живое лицо (initiator %s) отстало → kind=diverged, лицо не тронуто (D4)',
      async (initiator) => {
        await seedBasePlaybooks(deps());
        if (initiator === 'steward') {
          await createFaceVersion(
            {
              store,
              log,
              clock: new SystemClock(),
              idGen: new HashIdGenerator(),
              env: { WOLF_ACTOR: 'agent:steward' },
            },
            {
              command: 'new',
              ownerSkill: 'steward',
              reason: 'стюардская правка',
              body: 'тело, изменённое Стюардом',
              title: 'Наставник (steward)',
              tags: ['steward:наставник'],
              minimalChange: 'm',
              boundaries: 'b',
              exampleHelps: 'h',
              exampleKeep: 'k',
              verification: 'v',
              rollback: 'r',
            }
          );
        } else {
          await createFaceVersion(
            { store, log, clock: new SystemClock(), idGen: new HashIdGenerator(), env: { WOLF_ACTOR: 'user:owner' } },
            {
              command: initiator === 'owner' ? 'restore' : 'breakglass',
              ownerSkill: 'steward',
              reason: 'возврат',
              from: 'v1',
            }
          );
        }
        const before = await facesOf('steward');
        const eventsBefore = (await log.readAll()).length;

        const out = await run(new Map([['steward-nastavnik.md', TEMPLATE_A_V2]]));

        const o = out.find((x) => x.file === 'steward-nastavnik.md')!;
        expect(o.kind).toBe('diverged');
        expect(o.action).toBe('diverged');
        expect(await facesOf('steward')).toHaveLength(before.length);
        expect((await log.readAll()).length).toBe(eventsBefore);
      }
    );

    it('нет лица + активный legacy howto → kind=legacy-absorbed (структурно), посев телом шаблона', async () => {
      writeLegacyHowto('mem_20260920_legacy_ab12cd', 'steward');

      const out = await run();

      const o = out.find((x) => x.file === 'steward-nastavnik.md')!;
      expect(o.kind).toBe('legacy-absorbed');
      expect(o.action).toBe('created');
      const faces = await facesOf('steward');
      expect(faces).toHaveLength(1);
      expect(faces[0]!.body).toContain('Протокол мутации.'); // тело = ШАБЛОН
      expect((await store.get('mem_20260920_legacy_ab12cd'))?.status).toBe('superseded'); // head поглощён
    });

    it('REQ-07: изменения памяти исчерпываются посевом недостающих лиц (слепок id+объектов)', async () => {
      await seedBasePlaybooks(deps(new Map([['steward-nastavnik.md', FILE_A]]))); // steward жив, mr-wolf нет
      const before = await store.list();
      const eventsBefore = (await log.readAll()).length;

      const out = await run(); // оба шаблона: steward жив, mr-wolf недостающий

      expect(out.find((o) => o.file === 'steward-nastavnik.md')!.kind).toBe('skipped-live');
      expect(out.find((o) => o.file === 'complaint-protocol.md')!.kind).toBe('seeded');
      const after = await store.list();
      const beforeIds = new Set(before.map((o) => o.id));
      const added = after.filter((o) => !beforeIds.has(o.id));
      expect(added).toHaveLength(1); // ровно один новый объект — посев mr-wolf
      expect(added[0]!.type).toBe('face');
      const afterById = new Map(after.map((o) => [o.id, o]));
      for (const b of before) expect(afterById.get(b.id)).toEqual(b); // существующие не изменены
      const newEvents = (await log.readAll()).slice(eventsBefore);
      const started = newEvents.filter((e) => e.type === 'memory.face.op_started');
      expect(started).toHaveLength(1); // единственная face-операция — посев
      expect((started[0]!.payload['input'] as { reason?: string }).reason).toContain('complaint-protocol.md');
    });

    it('дефолтный режим не задаёт kind (структурный код только в seed-missing-only)', async () => {
      const out = await seedBasePlaybooks(deps());
      expect(out.every((o) => o.kind === undefined)).toBe(true);
    });
  });
});
