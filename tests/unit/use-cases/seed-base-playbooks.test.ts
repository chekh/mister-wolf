// tests/unit/use-cases/seed-base-playbooks.test.ts
// Волна 2.17 T-05 (REQ-02 AC3, design §«seedBasePlaybooks»): посев base-set
// создаёт лица через face-контракт (initiator='seed', ADR-6); при живом лице
// владельца посев пропускается — дублей нет; legacy-note владельца тоже скип
// (миграция wolf face migrate подберёт его отдельно).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import { seedBasePlaybooks } from '../../../src/app/use-cases/seed-base-playbooks.js';
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

const CREATED = '2026-09-20T10:00:00Z';

describe('seedBasePlaybooks (T-05: face-контракт, initiator=seed)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-seed-'));
    store = new MarkdownMemoryStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps() {
    return {
      files: new Map([
        ['steward-nastavnik.md', FILE_A],
        ['complaint-protocol.md', FILE_B],
      ]),
      store,
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      lock: new FsMemoryLock(memoryDir(dir)),
    };
  }

  async function facesOf(owner: string): Promise<FaceObject[]> {
    return (await store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === owner);
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

  it('REQ-02 AC3: повторный посев при живом лице — skip, дублей нет', async () => {
    await seedBasePlaybooks(deps());

    const out2 = await seedBasePlaybooks(deps());

    expect(out2.every((o) => o.action === 'skipped')).toBe(true);
    expect(out2.every((o) => (o.reason ?? '').includes('already in memory'))).toBe(true);
    expect(await store.list({ type: 'face' })).toHaveLength(2); // R2-M3: не пересеяли
  });

  it('legacy-note владельца (note+howto без face) — скип посева, миграция подберёт', async () => {
    const abs = join(dir, '.wolf', 'memory', 'shared', 'notes', 'legacy.md');
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(
      abs,
      `---\n${yaml
        .dump({
          id: 'mem_20260920_legacy_ab12cd',
          title: 'Наставник v1 (legacy)',
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
          tags: ['playbook'],
          superseded_by: null,
          type: 'note',
          facet: 'howto',
          owner_skill: 'steward',
        })
        .trimEnd()}\n---\n\nLegacy body.`
    );

    const out = await seedBasePlaybooks(deps());

    expect(out.find((o) => o.file === 'steward-nastavnik.md')?.action).toBe('skipped');
    expect(out.find((o) => o.file === 'complaint-protocol.md')?.action).toBe('created');
    expect(await facesOf('steward')).toHaveLength(0); // дубль лицу не создан
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
});
