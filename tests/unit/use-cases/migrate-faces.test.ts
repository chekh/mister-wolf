// tests/unit/use-cases/migrate-faces.test.ts
// Волна 2.17 T-05 (test-plan §REQ-02, oracle — requirements REQ-02 AC):
// физическая миграция legacy-playbook → face: дословный перенос title/тегов/
// owner_skill, сохранность superseded-цепочки, скрытие head, идемпотентность,
// поэтапность (падение на N-м не откатывает N-1), howto без owner_skill не
// мигрируется. Legacy-тип playbook читается alias-механикой P211 как note+howto.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { migrateFaces } from '../../../src/app/use-cases/migrate-faces.js';
import { createFaceVersion, type FaceObject } from '../../../src/app/use-cases/create-face-version.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../../src/adapters/fs/project-paths.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';

const CREATED = '2026-09-20T10:00:00Z';
const STEWARD_ENV: NodeJS.ProcessEnv = { WOLF_ACTOR: 'agent:steward' };

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

describe('migrateFaces (T-05: REQ-02 миграция playbook → face)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-migrate-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps(over: Partial<Parameters<typeof migrateFaces>[0]> = {}) {
    return {
      store,
      log,
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      lock: new FsMemoryLock(memoryDir(dir)),
      ...over,
    };
  }

  function writeMemory(rel: string, fm: Record<string, unknown>, body: string): void {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}`);
  }

  async function facesOf(owner: string): Promise<FaceObject[]> {
    return (await store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === owner);
  }

  it('REQ-02 AC2: физическая миграция — дословные title/теги/owner_skill, цепочка supersede сохранена, head скрыт', async () => {
    // legacy-тип playbook (до 2.13): alias-резолв отдаёт note+facet howto
    writeMemory(
      join('.wolf', 'memory', 'shared', 'playbooks', 'steward.md'),
      legacyFm('mem_20260920_steward_ab12cd', {
        type: 'playbook',
        title: 'Наставник v1 — протокол мутации',
        tags: ['steward:nastavnik', 'playbook'],
        owner_skill: 'steward',
      }),
      'Протокол мутации Стюарда.'
    );
    // note+howto (после 2.13) с superseded-цепочкой: ancestor → head
    writeMemory(
      join('.wolf', 'memory', 'shared', 'notes', 'ancestor.md'),
      legacyFm('mem_20260920_ancestor_aa11bb', {
        type: 'note',
        facet: 'howto',
        title: 'Demo playbook v1',
        tags: ['skill:demo', 'playbook'],
        owner_skill: 'skill:demo',
        status: 'superseded',
        superseded_by: 'mem_20260925_head_cc33dd',
      }),
      'Body v1.'
    );
    writeMemory(
      join('.wolf', 'memory', 'shared', 'notes', 'head.md'),
      legacyFm('mem_20260925_head_cc33dd', {
        type: 'note',
        facet: 'howto',
        title: 'Demo playbook v2',
        tags: ['skill:demo', 'playbook'],
        owner_skill: 'skill:demo',
      }),
      'Body v2.'
    );

    const report = await migrateFaces(deps());

    expect(report.failed).toEqual([]);
    expect(report.skippedHowtoIds).toEqual([]);
    expect(report.outcomes.map((o) => `${o.ownerSkill}:${o.action}`).sort()).toEqual([
      'skill:demo:migrated',
      'steward:migrated',
    ]);

    const demoFace = (await facesOf('skill:demo'))[0]!;
    expect(demoFace.type).toBe('face');
    expect(demoFace.version).toBe('1'); // нормализация 'v1' → '1'
    expect(demoFace.initiator).toBe('migration');
    expect(demoFace.title).toBe('Demo playbook v2'); // дословно из head
    expect(demoFace.tags).toEqual(['skill:demo', 'playbook']);
    expect(demoFace.body).toBe('Body v2.');
    expect(demoFace.reason).toBe('migrated from playbook note mem_20260925_head_cc33dd (2.17)');
    expect('based_on' in demoFace).toBe(false); // первая версия — без основы

    const stewardFace = (await facesOf('steward'))[0]!;
    expect(stewardFace.title).toBe('Наставник v1 — протокол мутации');
    expect(stewardFace.tags).toEqual(['steward:nastavnik', 'playbook']);

    // head скрыт (семантика hide-superseded): superseded → face
    const head = await store.get('mem_20260925_head_cc33dd');
    expect(head?.status).toBe('superseded');
    expect(head?.superseded_by).toBe(demoFace.id);
    // цепочка предков не тронута (AC2: superseded-цепочка не теряется)
    const ancestor = await store.get('mem_20260920_ancestor_aa11bb');
    expect(ancestor?.superseded_by).toBe('mem_20260925_head_cc33dd');

    // событие версии — initiator migration (REQ-04: инициатор виден в журнале)
    const versioned = (await log.readAll()).filter((e) => e.type === 'memory.face.versioned');
    expect(versioned.some((e) => e.payload.initiator === 'migration' && e.payload.new === demoFace.id)).toBe(true);
  });

  it('REQ-02 AC4: howto без owner_skill не мигрируется — skip с отчётом', async () => {
    writeMemory(
      join('.wolf', 'memory', 'shared', 'notes', 'plain-howto.md'),
      legacyFm('mem_20260920_plain_de14ef', { type: 'note', facet: 'howto', title: 'Just a howto' }),
      'Plain steps.'
    );

    const report = await migrateFaces(deps());

    expect(report.outcomes).toEqual([]);
    expect(report.skippedHowtoIds).toEqual(['mem_20260920_plain_de14ef']);
    expect(await store.list({ type: 'face' })).toHaveLength(0);
    // запись не тронута и читается как раньше
    const rec = await store.get('mem_20260920_plain_de14ef');
    expect(rec?.type).toBe('note');
  });

  it('§Отказов: падение на N-м владельце не откатывает N-1; повторный запуск идемпотентен', async () => {
    writeMemory(
      join('.wolf', 'memory', 'shared', 'notes', 'ok.md'),
      legacyFm('mem_20260920_ok_abc123', {
        type: 'note',
        facet: 'howto',
        title: 'Ok playbook',
        owner_skill: 'skill:ok',
      }),
      'Ok body.'
    );
    writeMemory(
      join('.wolf', 'memory', 'shared', 'notes', 'boom.md'),
      legacyFm('mem_20260920_boom_def456', {
        type: 'note',
        facet: 'howto',
        title: 'Boom playbook',
        owner_skill: 'skill:boom',
      }),
      'Boom body.'
    );
    // N-я запись падает на записи face (диск сломался): list/get/update живы
    const brokenStore: MemoryStore = {
      save: async (object) => {
        if ((object as FaceObject).owner_skill === 'skill:boom') throw new Error('disk on fire');
        return store.save(object);
      },
      get: (id) => store.get(id),
      list: (filters) => store.list(filters),
      update: (id, patch) => store.update(id, patch),
    };

    const r1 = await migrateFaces(deps({ store: brokenStore }));

    expect(r1.failed).toEqual([{ ownerSkill: 'skill:boom', error: 'disk on fire' }]);
    expect(r1.outcomes.map((o) => `${o.ownerSkill}:${o.action}`)).toEqual(['skill:ok:migrated']);
    // N-1 не откатывается
    expect(await facesOf('skill:ok')).toHaveLength(1);
    const boomHead = await store.get('mem_20260920_boom_def456');
    expect(boomHead?.status).toBe('active'); // сбой до supersede — head жив

    // повторный запуск (диск починен): ok — skip, boom — мигрирован, дублей нет
    const r2 = await migrateFaces(deps());
    expect(r2.failed).toEqual([]);
    expect(r2.outcomes.find((o) => o.ownerSkill === 'skill:ok')?.action).toBe('skipped');
    expect(r2.outcomes.find((o) => o.ownerSkill === 'skill:boom')?.action).toBe('migrated');
    expect(await facesOf('skill:ok')).toHaveLength(1);
    expect(await facesOf('skill:boom')).toHaveLength(1);
  });

  it('без активного head (только superseded-цепочка) — skip с отчётом, записи остаются legacy', async () => {
    writeMemory(
      join('.wolf', 'memory', 'shared', 'notes', 'chained.md'),
      legacyFm('mem_20260920_chained_789abc', {
        type: 'note',
        facet: 'howto',
        title: 'Chained playbook',
        owner_skill: 'skill:chain',
        status: 'superseded',
        superseded_by: 'mem_20260920_other_ffffff',
      }),
      'Chained body.'
    );

    const report = await migrateFaces(deps());

    expect(report.outcomes).toHaveLength(1);
    expect(report.outcomes[0]).toMatchObject({ ownerSkill: 'skill:chain', action: 'skipped' });
    expect(report.outcomes[0]!.reason).toMatch(/no active playbook note/i);
    expect(await store.list({ type: 'face' })).toHaveLength(0);
    // цепочка предков остаётся legacy-записями и читается как раньше
    const rec = await store.get('mem_20260920_chained_789abc');
    expect(rec?.type).toBe('note');
    expect((rec as { facet?: string }).facet).toBe('howto');
  });

  it('активное лицо уже есть → skip: повторный запуск безопасен, legacy head не трогается', async () => {
    await createFaceVersion(deps({ env: STEWARD_ENV }), {
      command: 'seed',
      ownerSkill: 'skill:demo',
      reason: 'seeded earlier',
      body: 'Face body.',
    });
    writeMemory(
      join('.wolf', 'memory', 'shared', 'notes', 'head.md'),
      legacyFm('mem_20260920_head_cc33dd', {
        type: 'note',
        facet: 'howto',
        title: 'Demo playbook v2',
        owner_skill: 'skill:demo',
      }),
      'Body v2.'
    );

    const report = await migrateFaces(deps());

    expect(report.outcomes).toHaveLength(1);
    expect(report.outcomes[0]).toMatchObject({ ownerSkill: 'skill:demo', action: 'skipped' });
    expect(report.outcomes[0]!.reason).toMatch(/face already exists/i);
    expect(await facesOf('skill:demo')).toHaveLength(1); // дублей нет
    const head = await store.get('mem_20260920_head_cc33dd');
    expect(head?.status).toBe('active');
  });
});
