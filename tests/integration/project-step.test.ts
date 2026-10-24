// tests/integration/project-step.test.ts
// T6 (волна 2.19.0): runProjectStep на реальных деревьях — фикстуры P-clean /
// P-mutated / P-diverged (test-plan §«Фикстурный парк»), мини-карта через
// T1-загрузчик (инжект packageRoot), реальные адаптеры памяти и рендера.
// Строки test-plan: R03.1-R03.4, R07.2, R11.1, R11.2, R11.4, N02.1, N04.1,
// NFR-03 (wallMs). Изоляция — только tmp (mkdtemp), без реальных HOME/реестров.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import yaml from 'js-yaml';
import { runProjectStep, type ProjectStepDeps, type ProjectReport } from '../../src/app/use-cases/project-step.js';
import { loadUpdateMap, type UpdateMap } from '../../src/adapters/fs/update-map.js';
import { projectPath } from '../../src/app/use-cases/verify-against-map.js';
import { OpencodeBaseSetRenderer } from '../../src/adapters/render/opencode/opencode-renderer.js';
import { seedBasePlaybooks } from '../../src/app/use-cases/seed-base-playbooks.js';
import { createFaceVersion, type FaceObject } from '../../src/app/use-cases/create-face-version.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../src/adapters/fs/project-paths.js';
import { parseStamp } from '../../src/adapters/render/stamp.js';
import { takeParkSnapshot, diffParkSnapshots, type ParkSnapshot } from '../helpers/park-snapshot.js';

const OLD_SET = '2.17.1';
const NEW_SET = '2.19.0';

/** Шаблоны «установленного» релиза 2.17.1 — им был инициализирован проект. */
const OLD_TEMPLATES: Record<string, string> = {
  'agents/mr-wolf.md': '# Mr.Wolf agent\n\nOld agent body (2.17.1).\n',
  'skills/using-skills/SKILL.md': '# Using skills\n\nSkill body.\n',
  'skills/gone-skill/SKILL.md': '# Gone skill\n\nRemoved in 2.19.0.\n',
  'commands/complain.md': '# Complain command\n\nCommand body.\n',
  'AGENTS.md': '# Agent brief\n\nOld onboarding text.\n',
  'playbooks/worker-implementer-playbook.md':
    '---\ntitle: Worker implementer playbook v1\nowner_skill: worker-implementer\n---\nOld worker playbook body.\n',
  'playbooks/wolf-review-lenses.md': '---\ntitle: Review lenses\nowner_skill: mr-wolf\n---\nReview lenses body.\n',
};

/** Шаблоны релиза 2.19.0: mr-wolf/AGENTS изменены, executor-lead и
 * steward-playbook новые, gone-skill удалён, using-skills/complain те же. */
const NEW_TEMPLATES: Record<string, string> = {
  'agents/mr-wolf.md': '# Mr.Wolf agent\n\nNew agent body (2.19.0).\n',
  'agents/executor-lead.md': '# Executor lead\n\nNew lead agent (2.19.0).\n',
  'skills/using-skills/SKILL.md': OLD_TEMPLATES['skills/using-skills/SKILL.md']!,
  'commands/complain.md': OLD_TEMPLATES['commands/complain.md']!,
  'AGENTS.md': '# Agent brief\n\nNew onboarding text (2.19.0).\n',
  'playbooks/worker-implementer-playbook.md':
    '---\ntitle: Worker implementer playbook v2\nowner_skill: worker-implementer\n---\nNew worker playbook body.\n',
  'playbooks/wolf-review-lenses.md': OLD_TEMPLATES['playbooks/wolf-review-lenses.md']!,
  'playbooks/executor-lead-playbook.md':
    '---\ntitle: Executor lead playbook\nowner_skill: executor-lead\n---\nLead playbook body.\n',
  'playbooks/legacy-steward-playbook.md':
    '---\ntitle: Steward playbook\nowner_skill: steward\n---\nSteward playbook body.\n',
};

/** Мини-карта фикстурного контура (test-plan §«Фикстуры»): категории
 * new/changed/unchanged/deprecated/removed + deprecated-цель с живым лицом
 * и removed-цель (R11.4/R11.2); носитель — P-clean. */
const MINI_MAP = {
  version: NEW_SET,
  prev: OLD_SET,
  files: [
    { path: 'base/agents/executor-lead.md', kind: 'agent', category: 'new' },
    { path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'changed' },
    { path: 'base/skills/using-skills/SKILL.md', kind: 'skill', category: 'unchanged' },
    { path: 'base/commands/complain.md', kind: 'command', category: 'deprecated' },
    { path: 'base/skills/gone-skill/SKILL.md', kind: 'skill', category: 'removed' },
  ],
  faces: [
    {
      template: 'base/playbooks/executor-lead-playbook.md',
      owner_skill: 'executor-lead',
      category: 'new',
      seed: true,
    },
    {
      template: 'base/playbooks/worker-implementer-playbook.md',
      owner_skill: 'worker-implementer',
      category: 'changed',
      seed: true,
    },
    {
      template: 'base/playbooks/legacy-steward-playbook.md',
      owner_skill: 'steward',
      category: 'new',
      seed: true,
    },
    {
      template: 'base/playbooks/wolf-review-lenses.md',
      owner_skill: 'mr-wolf',
      category: 'deprecated',
      seed: false,
    },
  ],
  agents_md: { category: 'changed', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: ['taxonomy (config.yaml memory_types)', 'tool-skills', 'local/foreign artifacts'],
};

const tmpDirs: string[] = [];

function mkTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeTemplates(root: string, templates: Record<string, string>): void {
  for (const [rel, content] of Object.entries(templates)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** Playbook-шаблоны каталога: базовое имя → контент (прецедент memory-init). */
function playbookFiles(playbooksDir: string): Map<string, string> {
  const files = new Map<string, string>();
  if (existsSync(playbooksDir)) {
    for (const f of readdirSync(playbooksDir)) {
      if (f.endsWith('.md')) files.set(f, readFileSync(join(playbooksDir, f), 'utf-8'));
    }
  }
  return files;
}

function makeMemoryDeps(proj: string) {
  return {
    store: new MarkdownMemoryStore(proj),
    log: new JsonlEventLog(eventsPath(proj)),
    clock: new SystemClock(),
    idGen: new HashIdGenerator(),
    lock: new FsMemoryLock(memoryDir(proj)),
  };
}

/** Legacy howto-note владельца (популяция 2.16.x — прецедент seed-base-playbooks.test.ts). */
function writeLegacyHowto(proj: string, id: string, owner: string): void {
  const abs = join(proj, '.wolf', 'memory', 'shared', 'notes', `${id}.md`);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(
    abs,
    `---\n${yaml
      .dump({
        id,
        title: `Legacy howto (${owner})`,
        status: 'active',
        review_state: 'accepted',
        confidence: 'medium',
        importance: 0.5,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
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
      .trimEnd()}\n---\n\nLegacy body ${owner}.\n`
  );
}

/** Живой проект на 2.17.1: base-set отрендерен старыми шаблонами (sync-state
 * зафиксирован), лица worker/mr-wolf посеяны старыми playbook'ами, steward —
 * активный legacy howto (лица нет), схема актуальна (layout v2). */
async function bootstrapProject(): Promise<string> {
  const proj = mkTmp('wolf-upgrade-proj-');
  const oldRoot = mkTmp('wolf-upgrade-tpl-');
  writeTemplates(oldRoot, OLD_TEMPLATES);
  await new OpencodeBaseSetRenderer(oldRoot, { setVersion: OLD_SET }).renderBaseSet(proj, { models: 'omit' });
  await seedBasePlaybooks({ files: playbookFiles(join(oldRoot, 'playbooks')), ...makeMemoryDeps(proj) });
  writeLegacyHowto(proj, 'mem_20260101_legacy_steward_ab12cd', 'steward');
  mkdirSync(join(proj, '.wolf'), { recursive: true });
  writeFileSync(join(proj, '.wolf', 'config.yaml'), 'schema_version: 2\n');
  return proj;
}

interface Fixture {
  pkgRoot: string;
  templatesRoot: string;
  map: UpdateMap;
}

let fx: Fixture;

beforeAll(() => {
  const pkgRoot = mkTmp('wolf-upgrade-pkg-');
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: 'fixture-pkg', version: NEW_SET }));
  writeTemplates(join(pkgRoot, 'templates', 'base'), NEW_TEMPLATES);
  writeFileSync(join(pkgRoot, 'update-map.json'), JSON.stringify(MINI_MAP));
  fx = { pkgRoot, templatesRoot: join(pkgRoot, 'templates', 'base'), map: loadUpdateMap(pkgRoot) };
});

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** Проектный шаг с реальными адаптерами: рендерер нового релиза, посев всех
 * playbook-шаблонов (фильтр по карте — внутри шага), подтверждение удалений —
 * removed-цели карты (как их передаст T7 после подтверждения списка REQ-02). */
async function runStep(proj: string): Promise<ProjectReport> {
  const deps: ProjectStepDeps = {
    renderer: new OpencodeBaseSetRenderer(fx.templatesRoot, { setVersion: NEW_SET }),
    files: playbookFiles(join(fx.templatesRoot, 'playbooks')),
    ...makeMemoryDeps(proj),
  };
  const confirmedRemovals = fx.map.files.filter((f) => f.category === 'removed').map((f) => projectPath(f));
  return runProjectStep(deps, proj, fx.map, { confirmedRemovals });
}

async function facesOf(proj: string, ownerSkill: string): Promise<FaceObject[]> {
  const store = new MarkdownMemoryStore(proj);
  return (await store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === ownerSkill);
}

function verifyItem(report: ProjectReport, target: string) {
  return report.verify.items.find((i) => i.target === target);
}

describe('runProjectStep: P-clean (R03.1-R03.3, R07.2, R11.1/R11.2/R11.4, N04.1, N02.1)', () => {
  it('R03.1: base-set set=2.19.0, лицо executor-lead посеяно (owner_skill, initiator seed), exit done', async () => {
    const proj = await bootstrapProject();
    const report = await runStep(proj);

    expect(parseStamp(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8'))).toEqual({
      base: 'mr-wolf.md',
      set: NEW_SET,
    });
    expect(existsSync(join(proj, '.opencode/agents/executor-lead.md'))).toBe(true);
    const lead = await facesOf(proj, 'executor-lead');
    expect(lead).toHaveLength(1);
    expect(lead[0]).toMatchObject({ owner_skill: 'executor-lead', initiator: 'seed', status: 'active', version: '1' });
    expect(report.seed.find((o) => o.file === 'executor-lead-playbook.md')?.kind).toBe('seeded');
    expect(report.verify.summary).toMatchObject({ needsDecision: 0, errors: 0 });
    expect(report.exitKind).toBe('done');
    expect(report.name).toBe(basename(proj));
  });

  it('R03.2: живое лицо воркера не изменено и не переверсионировано (слепок SHA)', async () => {
    const proj = await bootstrapProject();
    const workerBefore = (await facesOf(proj, 'worker-implementer'))[0]!;
    const before = takeParkSnapshot(proj);
    const report = await runStep(proj);
    const after = takeParkSnapshot(proj);

    expect(report.seed.find((o) => o.file === 'worker-implementer-playbook.md')?.kind).toBe('skipped-live');
    // объект не переписан и не переверсионирован (тело шаблона изменилось!)
    expect(after.objects[workerBefore.id]).toBe(before.objects[workerBefore.id]);
    const workerFaces = await facesOf(proj, 'worker-implementer');
    expect(workerFaces.map((f) => f.version)).toEqual(['1']);
    expect(verifyItem(report, 'base/playbooks/worker-implementer-playbook.md')?.code).toBe('skipped-live');
  });

  it('R03.3: P-legacy — steward: seeded v1 + legacy-absorbed, supersede атомарно, дублей кандидатов нет', async () => {
    const proj = await bootstrapProject();
    const report = await runStep(proj);

    expect(report.seed.find((o) => o.file === 'legacy-steward-playbook.md')?.kind).toBe('legacy-absorbed');
    const stewardFaces = await facesOf(proj, 'steward');
    expect(stewardFaces).toHaveLength(1); // дублей кандидатов нет
    expect(stewardFaces[0]).toMatchObject({ version: '1', initiator: 'seed', status: 'active' });
    // legacy howto поглощён той же операцией посева: superseded + ссылка на лицо
    const note = (await new MarkdownMemoryStore(proj).get('mem_20260101_legacy_steward_ab12cd')) as {
      status: string;
      superseded_by: string | null;
    };
    expect(note.status).toBe('superseded');
    expect(note.superseded_by).toBe(stewardFaces[0]!.id);
    expect(verifyItem(report, 'base/playbooks/legacy-steward-playbook.md')?.code).toBe('legacy-absorbed');
  });

  it('R07.2/R11.1: изменения памяти исчерпываются посевом; файлы вне карты не изменены; все пункты карты со статусом', async () => {
    const proj = await bootstrapProject();
    const before = takeParkSnapshot(proj);
    const report = await runStep(proj);
    const after = takeParkSnapshot(proj);
    const diff = diffParkSnapshots(before, after);

    // память: добавлены только посеянные лица (+ штатный session-summary от
    // supersede-шага посева — стандартная механика wrap-up 2.13 P210(е), тот же
    // путь у любого wolf face), изменён — только поглощаемый legacy-note
    expect(diff.removedObjects).toEqual([]);
    expect(diff.changedObjects).toEqual(['mem_20260101_legacy_steward_ab12cd']);
    const store = new MarkdownMemoryStore(proj);
    const addedTypes: string[] = [];
    for (const id of diff.addedObjects) {
      const obj = (await store.get(id)) as { type: string; tags?: string[] };
      addedTypes.push(obj.type);
      expect(
        obj.type === 'face' || (obj.type === 'note' && (obj.tags ?? []).includes('session-summary')),
        `memory mutation beyond seed: ${id} (${obj.type})`
      ).toBe(true);
    }
    expect(addedTypes.filter((t) => t === 'face')).toHaveLength(2);

    // файлы: вне карты меняются только свидетель рендера и память (посев)
    const mapTargets = new Set([...fx.map.files.map((f) => projectPath(f)), 'AGENTS.md']);
    const outsideMap = [...diff.changedFiles, ...diff.addedFiles, ...diff.removedFiles].filter(
      (p) => !mapTargets.has(p) && !p.startsWith('.wolf/') && p !== '.opencode/wolf-sync-state.json'
    );
    expect(outsideMap).toEqual([]);
    expect(diff.removedFiles).toEqual(['.opencode/skills/gone-skill/SKILL.md']); // R11.2: удалена ровно карта-декларированная цель

    // каждый пункт карты получил статус, ошибок нет
    expect(report.verify.items).toHaveLength(fx.map.files.length + 1 + fx.map.faces.length);
    expect(report.verify.items.every((i) => i.code !== 'error')).toBe(true);
    expect(report.verify.summary.errors).toBe(0);
  });

  it('R11.4: deprecated-шаблон лица с живым лицом — deprecated-noted; объект памяти и файл не тронуты', async () => {
    const proj = await bootstrapProject();
    const mrWolfFace = (await facesOf(proj, 'mr-wolf'))[0]!;
    const before = takeParkSnapshot(proj);
    const report = await runStep(proj);
    const after = takeParkSnapshot(proj);

    expect(report.seed.find((o) => o.file === 'wolf-review-lenses.md')).toBeUndefined(); // не сеялся
    expect(verifyItem(report, 'base/playbooks/wolf-review-lenses.md')?.code).toBe('deprecated-noted');
    expect(after.objects[mrWolfFace.id]).toBe(before.objects[mrWolfFace.id]); // объект не изменён
    const face = (await new MarkdownMemoryStore(proj).get(mrWolfFace.id)) as FaceObject;
    expect(face.status).toBe('active'); // ни supersede, ни смена статуса
    // файл deprecated-артефакта не удалён (LAYOUT: commands → .opencode/command)
    expect(existsSync(join(proj, '.opencode/command/complain.md'))).toBe(true);
    expect(verifyItem(report, 'base/commands/complain.md')?.code).toBe('deprecated-noted');
  });

  it('N04.1: посев виден в events.jsonl стандартными face-событиями; новых лог-файлов нет', async () => {
    const proj = await bootstrapProject();
    const eventsBefore = readFileSync(eventsPath(proj), 'utf-8').trim().split('\n').length;
    const before = takeParkSnapshot(proj);
    await runStep(proj);
    const diff = diffParkSnapshots(before, takeParkSnapshot(proj));

    const lines = readFileSync(eventsPath(proj), 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(eventsBefore);
    const fresh = lines.slice(eventsBefore).map((l) => JSON.parse(l) as { type: string });
    expect(fresh.length).toBeGreaterThan(0);
    // стандартные face-события посева присутствуют…
    expect(fresh.some((e) => e.type.startsWith('memory.face.'))).toBe(true);
    expect(fresh.some((e) => e.type === 'memory.face.op_committed')).toBe(true);
    // …и формат не расширяется: только стандартные memory-события (supersede
    // legacy-head и wrap-up — тот же журнал, новых файлов нет)
    expect(fresh.every((e) => e.type.startsWith('memory.'))).toBe(true);
    expect(diff.addedFiles.filter((p) => /\.(log|jsonl)$/.test(p))).toEqual([]); // новых лог-файлов нет
  });

  it('N02.1: повторный прогон — все identical/skip, 0 новых объектов, 0 перезаписей, exit done, wallMs > 0', async () => {
    const proj = await bootstrapProject();
    const r1 = await runStep(proj);
    expect(r1.exitKind).toBe('done');
    const afterFirst: ParkSnapshot = takeParkSnapshot(proj);

    const r2 = await runStep(proj);
    expect(r2.exitKind).toBe('done');
    expect(r2.wallMs).toBeGreaterThanOrEqual(1); // NFR-03
    expect(r2.verify.summary).toMatchObject({ needsDecision: 0, errors: 0 });
    expect(r2.seed.every((o) => o.kind === 'skipped-live')).toBe(true);
    expect(r2.sync.outcomes.every((o) => o.action === 'skipped')).toBe(true);

    const diff = diffParkSnapshots(afterFirst, takeParkSnapshot(proj));
    expect(diff.addedFiles).toEqual([]);
    expect(diff.removedFiles).toEqual([]);
    expect(diff.changedFiles).toEqual([]); // 0 перезаписей
    expect(diff.addedObjects).toEqual([]); // 0 новых объектов
    expect(diff.changedObjects).toEqual([]);
    expect(diff.removedObjects).toEqual([]);
    // «требует решения» стабильно: в P-clean его нет ни в первом, ни во втором
    expect(r1.verify.summary.needsDecision).toBe(0);
    expect(r2.verify.summary.needsDecision).toBe(0);
  });
});

describe('runProjectStep: P-mutated (R03.4) и дрейф orphaned (R11.2)', () => {
  it('R03.4: ручная правка не перезаписана — skipped-mutated → needs-decision (не error)', async () => {
    const proj = await bootstrapProject();
    const target = join(proj, '.opencode/agents/mr-wolf.md');
    writeFileSync(target, `${readFileSync(target, 'utf-8')}\n<!-- local user edit -->\n`);
    const mutatedSha = takeParkSnapshot(proj).files['.opencode/agents/mr-wolf.md']!;

    const report = await runStep(proj);

    const item = verifyItem(report, 'base/agents/mr-wolf.md');
    expect(item?.code).toBe('skipped-mutated');
    expect(item?.needsDecision).toBe(true);
    expect(report.verify.summary.errors).toBe(0); // «требует решения», не error
    expect(report.exitKind).toBe('needs-decision'); // exit ≠ 0 (CLI-слой: 2)
    expect(takeParkSnapshot(proj).files['.opencode/agents/mr-wolf.md']!).toBe(mutatedSha); // файл не тронут
  });

  it('R11.2: недекларированный orphaned не удалён — дрейф без объявления → conflict/needs-decision', async () => {
    const proj = await bootstrapProject();
    const ghost = join(proj, '.opencode/agents/ghost-agent.md');
    writeFileSync(ghost, '<!-- wolf:rendered base=ghost-agent.md set=2.13.0 -->\nghost body\n');

    const report = await runStep(proj);

    expect(existsSync(ghost)).toBe(true); // не удалён
    expect(report.sync.removed).toEqual(['.opencode/skills/gone-skill/SKILL.md']); // удалена только removed-цель карты
    const item = verifyItem(report, '.opencode/agents/ghost-agent.md');
    expect(item?.code).toBe('conflict');
    expect(item?.needsDecision).toBe(true);
    expect(report.exitKind).toBe('needs-decision');
  });
});

describe('runProjectStep: P-diverged', () => {
  it('лицо с initiator ≠ seed/migration и телом ≠ шаблону — diverged → «требует решения»', async () => {
    const proj = await bootstrapProject();
    // Стюард затюнил лицо воркера: v2, initiator steward, тело ≠ шаблону
    await createFaceVersion(
      { ...makeMemoryDeps(proj), env: { WOLF_ACTOR: 'agent:steward' } },
      {
        command: 'new',
        ownerSkill: 'worker-implementer',
        reason: 'steward tuning for the diverged fixture',
        body: 'Custom steward body — deliberately not the template.',
        title: 'Worker implementer v2',
        minimalChange: 'tuned body',
        boundaries: 'none',
        exampleHelps: 'n/a',
        exampleKeep: 'n/a',
        verification: 'manual',
        rollback: 'wolf face restore',
      }
    );

    const report = await runStep(proj);

    const item = verifyItem(report, 'base/playbooks/worker-implementer-playbook.md');
    expect(item?.code).toBe('diverged');
    expect(item?.needsDecision).toBe(true);
    expect(report.exitKind).toBe('needs-decision');
  });
});
