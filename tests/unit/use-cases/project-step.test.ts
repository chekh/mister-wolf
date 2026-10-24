// tests/unit/use-cases/project-step.test.ts
// T6 (волна 2.19.0, REQ-03/07/11, ADR-3/4): runProjectStep — тонкая композиция
// sync → removals → seed-missing-only → миграция → сверка. Юнит-уровень —
// механика композиции: подтверждение удалений (fail-safe), дрейф без
// объявления, фильтр посева по карте, seed-missing-only, фиксация фаз при
// сбое (NFR-02), отказ схемы (P-future-schema), wallMs (NFR-03), exit-kind.
// Полные сценарии парка на реальных деревьях — integration/project-step.test.ts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runProjectStep, type ProjectStepDeps, type ProjectReport } from '../../../src/app/use-cases/project-step.js';
import { seedBasePlaybooks } from '../../../src/app/use-cases/seed-base-playbooks.js';
import type { BaseSetRenderer, ModelContext, RenderOutcome } from '../../../src/ports/base-set-renderer.port.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { UpdateMap } from '../../../src/adapters/fs/update-map.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../../src/adapters/fs/project-paths.js';

const AGENT = (name: string): string => `.opencode/agents/${name}`;
const GONE = AGENT('gone.md');
const GHOST = AGENT('ghost.md');
const KEEP = AGENT('keep.md');
const STAMPED = (name: string): string => `<!-- wolf:rendered base=${name} set=2.17.1 -->\nold body\n`;
const PLAYBOOK_W = '---\ntitle: Worker face\nowner_skill: worker-implementer\n---\nWorker playbook body.\n';
const PLAYBOOK_W_OLD = '---\ntitle: Worker face\nowner_skill: worker-implementer\n---\nOld worker body.\n';
const PLAYBOOK_DEP = '---\ntitle: Review lenses\nowner_skill: mr-wolf\n---\nReview lenses body.\n';

/** Мини-карта юнит-контура: new/removed-файлы, seed/deprecated-лица, AGENTS.md. */
function mapOf(partial: Partial<UpdateMap> = {}): UpdateMap {
  return {
    version: '2.19.0',
    prev: '2.18.5',
    files: [
      { path: 'base/agents/keep.md', kind: 'agent', category: 'new' },
      { path: 'base/agents/gone.md', kind: 'agent', category: 'removed' },
    ],
    faces: [
      {
        template: 'base/playbooks/worker-implementer-playbook.md',
        owner_skill: 'worker-implementer',
        category: 'new',
        seed: true,
      },
      { template: 'base/playbooks/wolf-review-lenses.md', owner_skill: 'mr-wolf', category: 'deprecated', seed: false },
    ],
    agents_md: { category: 'unchanged', mode: 'append-block' },
    schema_migrations: [],
    outside_v1: [],
    ...partial,
  };
}

/** Фейковый рендерер: sync возвращает заданные исходы (фаза 1 без I/O шаблонов). */
function fakeRenderer(
  outcomes: RenderOutcome[],
  orphaned: string[],
  seen: { dir?: string; models?: (ModelContext | 'omit' | undefined)[] } = {}
): BaseSetRenderer {
  return {
    id: 'fake',
    renderBaseSet: () => {
      throw new Error('renderBaseSet is not part of the project step');
    },
    async syncBaseSet(dir: string, models?: ModelContext | 'omit') {
      seen.dir = dir;
      seen.models = [...(seen.models ?? []), models];
      return { outcomes, orphaned };
    },
  } as unknown as BaseSetRenderer;
}

describe('runProjectStep (T6: композиция sync → removals → seed → миграция → сверка)', () => {
  let proj: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'wolf-project-step-'));
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
  });

  /** deps с реальными адаптерами памяти в tmp (прецедент seed-base-playbooks.test.ts). */
  function deps(
    renderer: BaseSetRenderer,
    files: Map<string, string>,
    over: Partial<ProjectStepDeps> = {}
  ): ProjectStepDeps {
    return {
      renderer,
      files,
      store: new MarkdownMemoryStore(proj),
      log: new JsonlEventLog(eventsPath(proj)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      lock: new FsMemoryLock(memoryDir(proj)),
      ...over,
    };
  }

  function itemOf(report: ProjectReport, target: string) {
    return report.verify.items.find((i) => i.target === target);
  }

  function writeOrphan(name: string): void {
    mkdirSync(join(proj, '.opencode', 'agents'), { recursive: true });
    writeFileSync(join(proj, AGENT(name)), STAMPED(name));
  }

  it('шаги 1-5: sync-исходы идут в сверку; orphaned ∩ removed ∩ confirmed → unlink; дрейф → conflict', async () => {
    writeOrphan('gone.md');
    writeOrphan('ghost.md');
    const seen: { dir?: string; models?: (ModelContext | 'omit' | undefined)[] } = {};
    const renderer = fakeRenderer(
      [
        { file: KEEP, action: 'created' },
        { file: 'AGENTS.md', action: 'skipped', reason: 'content identical (M2)' },
      ],
      [GONE, GHOST],
      seen
    );
    const report = await runProjectStep(
      deps(renderer, new Map([['worker-implementer-playbook.md', PLAYBOOK_W]])),
      proj,
      mapOf(),
      { confirmedRemovals: [GONE] }
    );

    expect(seen.dir).toBe(proj); // фаза 1 — по root проекта
    expect(seen.models).toEqual(['omit']); // дефолт контекста моделей — omit (прецедент sync)
    expect(existsSync(join(proj, GONE))).toBe(false); // подтверждённая removed-цель удалена
    expect(existsSync(join(proj, GHOST))).toBe(true); // недекларированный orphaned не тронут
    expect(report.sync.removed).toEqual([GONE]);
    expect(report.sync.orphaned).toEqual([GHOST]); // оставшийся дрейф
    expect(itemOf(report, 'base/agents/gone.md')?.code).toBe('removed');
    expect(itemOf(report, GHOST)?.code).toBe('conflict');
    expect(itemOf(report, GHOST)?.needsDecision).toBe(true);
    expect(itemOf(report, 'base/agents/keep.md')?.code).toBe('created');
    expect(itemOf(report, 'base/playbooks/worker-implementer-playbook.md')?.code).toBe('seeded');
    expect(itemOf(report, 'base/playbooks/wolf-review-lenses.md')?.code).toBe('deprecated-noted');
    expect(report.schema.status).toBe('ok');
    expect(report.wallMs).toBeGreaterThan(0);
    expect(report.exitKind).toBe('needs-decision'); // дрейф GHOST — единственное «требует решения»
  });

  it('fail-safe: без confirmedRemovals удалений нет — removed-цель остаётся → error сверки', async () => {
    writeOrphan('gone.md');
    const renderer = fakeRenderer(
      [
        { file: KEEP, action: 'created' },
        { file: 'AGENTS.md', action: 'skipped' },
      ],
      [GONE]
    );
    const report = await runProjectStep(
      deps(renderer, new Map([['worker-implementer-playbook.md', PLAYBOOK_W]])),
      proj,
      mapOf()
    );

    expect(existsSync(join(proj, GONE))).toBe(true); // ничего не удалено
    expect(report.sync.removed).toEqual([]);
    expect(itemOf(report, 'base/agents/gone.md')?.code).toBe('error'); // план не доведён
    expect(report.verify.summary.errors).toBe(1);
    expect(report.exitKind).toBe('error');
  });

  it('removed-цель, отсутствовавшая до прохода, — подтверждённо отсутствует → removed (без мутаций)', async () => {
    const renderer = fakeRenderer(
      [
        { file: KEEP, action: 'created' },
        { file: 'AGENTS.md', action: 'skipped' },
      ],
      []
    );
    const report = await runProjectStep(
      deps(renderer, new Map([['worker-implementer-playbook.md', PLAYBOOK_W]])),
      proj,
      mapOf(),
      { confirmedRemovals: [GONE] }
    );

    expect(itemOf(report, 'base/agents/gone.md')?.code).toBe('removed');
    expect(report.exitKind).toBe('done');
  });

  it('фаза посева: только шаблоны карты с seed:true; deprecated-шаблон отфильтрован', async () => {
    const renderer = fakeRenderer(
      [
        { file: KEEP, action: 'created' },
        { file: 'AGENTS.md', action: 'skipped' },
      ],
      []
    );
    const files = new Map([
      ['worker-implementer-playbook.md', PLAYBOOK_W],
      ['wolf-review-lenses.md', PLAYBOOK_DEP], // deprecated по карте — сеять нельзя
    ]);
    const report = await runProjectStep(deps(renderer, files), proj, mapOf(), { confirmedRemovals: [GONE] });

    expect(report.seed.map((o) => o.file)).toEqual(['worker-implementer-playbook.md']);
    const store = new MarkdownMemoryStore(proj);
    const faces = await store.list({ type: 'face' });
    expect(faces).toHaveLength(1); // деприкейтнутый владелец не посеян
    expect((faces[0] as { owner_skill: string }).owner_skill).toBe('worker-implementer');
    expect(itemOf(report, 'base/playbooks/wolf-review-lenses.md')?.code).toBe('deprecated-noted');
  });

  it('seed-missing-only: живое лицо с иным телом (initiator seed) — skipped-live, без новой версии', async () => {
    // init-подобный посев старым телом шаблона (прецедент memory-init)
    const base = {
      store: new MarkdownMemoryStore(proj),
      log: new JsonlEventLog(eventsPath(proj)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      lock: new FsMemoryLock(memoryDir(proj)),
    };
    await seedBasePlaybooks({ files: new Map([['worker-implementer-playbook.md', PLAYBOOK_W_OLD]]), ...base });
    const renderer = fakeRenderer(
      [
        { file: KEEP, action: 'created' },
        { file: 'AGENTS.md', action: 'skipped' },
      ],
      []
    );
    const report = await runProjectStep(
      { renderer, files: new Map([['worker-implementer-playbook.md', PLAYBOOK_W]]), ...base },
      proj,
      mapOf(),
      { confirmedRemovals: [GONE] }
    );

    expect(report.seed[0]?.kind).toBe('skipped-live'); // отставание живого лица — штатно
    const faces = await base.store.list({ type: 'face' });
    expect(faces).toHaveLength(1); // не переверсионировано
    expect((faces[0] as { version: string }).version).toBe('1');
    expect(itemOf(report, 'base/playbooks/worker-implementer-playbook.md')?.code).toBe('skipped-live');
    expect(report.exitKind).toBe('done'); // skipped-live — не «требует решения» (NFR-02 AC1)
  });

  it('NFR-02: сбой фазы посева не откатывает фазы sync/removals — эффекты стабильны, шаг падает', async () => {
    writeOrphan('gone.md');
    const renderer = fakeRenderer(
      [
        { file: KEEP, action: 'created' },
        { file: 'AGENTS.md', action: 'skipped' },
      ],
      [GONE]
    );
    const boom = {
      list: async () => {
        throw new Error('seed store failure');
      },
    } as unknown as MemoryStore;
    await expect(
      runProjectStep(
        deps(renderer, new Map([['worker-implementer-playbook.md', PLAYBOOK_W]]), { store: boom }),
        proj,
        mapOf(),
        {
          confirmedRemovals: [GONE],
        }
      )
    ).rejects.toThrow('seed store failure');

    expect(existsSync(join(proj, GONE))).toBe(false); // фаза удалений не откачена
  });

  it('P-future-schema: отказ guard схемы — в отчёт как есть, exitKind error, шаг не падает', async () => {
    mkdirSync(join(proj, '.wolf'), { recursive: true });
    writeFileSync(join(proj, '.wolf', 'config.yaml'), 'schema_version: 99\n');
    const renderer = fakeRenderer(
      [
        { file: KEEP, action: 'created' },
        { file: 'AGENTS.md', action: 'skipped' },
      ],
      []
    );
    const report = await runProjectStep(
      deps(renderer, new Map([['worker-implementer-playbook.md', PLAYBOOK_W]])),
      proj,
      mapOf(),
      { confirmedRemovals: [GONE] }
    );

    expect(report.schema.status).toBe('refused');
    expect(report.schema.error).toMatch(/newer than this wolf/);
    expect(report.verify.summary.errors).toBe(0); // сверка прошла без ошибок…
    expect(report.verify.items).toHaveLength(5); // …каждый пункт карты получил статус
    expect(report.exitKind).toBe('error'); // …но отказ схемы — error проекта
  });

  it('exit-kind (таблица design): mutant → needs-decision; пункт без факта → error; чистый проход → done', async () => {
    // mutant: skip с структурным признаком → skipped-mutated → «требует решения», не error
    const mutated = fakeRenderer(
      [
        { file: KEEP, action: 'skipped', mutated: true },
        { file: 'AGENTS.md', action: 'skipped' },
      ],
      []
    );
    const rMutated = await runProjectStep(
      deps(mutated, new Map([['worker-implementer-playbook.md', PLAYBOOK_W]])),
      proj,
      mapOf(),
      { confirmedRemovals: [GONE] }
    );
    expect(itemOf(rMutated, 'base/agents/keep.md')?.code).toBe('skipped-mutated');
    expect(rMutated.verify.summary.errors).toBe(0);
    expect(rMutated.exitKind).toBe('needs-decision');
  });

  it('exit-kind: пункт карты без sync-исхода → error проекта', async () => {
    const noFact = fakeRenderer([{ file: 'AGENTS.md', action: 'skipped' }], []);
    const report = await runProjectStep(
      deps(noFact, new Map([['worker-implementer-playbook.md', PLAYBOOK_W]])),
      proj,
      mapOf(),
      { confirmedRemovals: [GONE] }
    );

    expect(itemOf(report, 'base/agents/keep.md')?.code).toBe('error');
    expect(report.verify.summary.errors).toBe(1);
    expect(report.exitKind).toBe('error');
  });

  it('NFR-03: wallMs — замер Date.now-обёрткой; минимум 1 мс при мгновенном шаге', async () => {
    let t = 1_000;
    const renderer = fakeRenderer(
      [
        { file: KEEP, action: 'created' },
        { file: 'AGENTS.md', action: 'skipped' },
      ],
      []
    );
    const report = await runProjectStep(
      deps(renderer, new Map([['worker-implementer-playbook.md', PLAYBOOK_W]]), { now: () => (t += 7) }),
      proj,
      mapOf(),
      { confirmedRemovals: [GONE] }
    );
    expect(report.wallMs).toBe(7); // разница двух замеров обёртки
  });
});
