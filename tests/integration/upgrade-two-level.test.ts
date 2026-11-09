// tests/integration/upgrade-two-level.test.ts
// U1 (релиз 3.0.0, two-level): переход существующего проекта 2.33.0 → 3.0.0
// завершается одним согласованным набором. Файлы СТАРОГО набора (агенты
// executor-lead/steward/worker-*, плагины wolf-router.ts/wolf-session-start.js,
// старые skills) объявлены в карте removed — проход удаляет их с бэкапом,
// а `--resolve <removed>=take` = «принять удаление». Сторонние my-* файлы
// (вне карты, без штампа) не трогаются; orphan-take остаётся запрещён.
// Неразрешённый конфликт до resolve — exit 2 с точным списком (не тихий);
// после полного resolve повторный сбор пуст, повторный проход стабилен.
// Прецедент upgrade-here.test.ts: in-process, npm-фазы нет (spawn-стаб).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  runUpgradeHere,
  runUpgradeResolve,
  type UpgradeHereDeps,
  type UpgradeResolveDeps,
} from '../../src/adapters/cli/commands/memory-upgrade.js';
import { runProjectStep, type ProjectStepDeps } from '../../src/app/use-cases/project-step.js';
import { loadUpdateMap, type UpdateMap } from '../../src/adapters/fs/update-map.js';
import { OpencodeBaseSetRenderer } from '../../src/adapters/render/opencode/opencode-renderer.js';
import { seedBasePlaybooks } from '../../src/app/use-cases/seed-base-playbooks.js';
import type { FaceObject } from '../../src/app/use-cases/create-face-version.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../src/adapters/fs/memory-lock.js';
import { eventsPath, memoryDir } from '../../src/adapters/fs/project-paths.js';
import { parseStamp } from '../../src/adapters/render/stamp.js';
import { renderReport } from '../../src/adapters/cli/report-renderer.js';
import { diffParkSnapshots, takeParkSnapshot } from '../helpers/park-snapshot.js';

// npm-фазы нет: любой spawn через стаб кидает (прецедент R14.1)
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      throw new Error('spawn must not run in two-level upgrade tests (no npm phase)');
    }),
  };
});

const OLD_SET = '2.33.0';
const NEW_SET = '3.0.0';

/** Набор релиза 2.33.0: имена, удалённые в 3.0.0 (executor-lead/steward/worker-*
 *  + плагины wolf-router/wolf-session-start), сохраняющиеся skills, старые лица. */
const OLD_TEMPLATES: Record<string, string> = {
  'agents/mr-wolf.md': '---\nname: mr-wolf\n---\n# Mr.Wolf agent\n\nOld agent body (2.33.0).\n',
  'agents/executor-lead.md': '---\nname: executor-lead\n---\n# Executor lead\n\nLead body (2.33.0).\n',
  'agents/steward.md': '---\nname: steward\n---\n# Steward\n\nSteward body (2.33.0).\n',
  'agents/worker-researcher.md': '---\nname: worker-researcher\n---\n# Worker researcher\n\nWorker body (2.33.0).\n',
  'skills/using-skills/SKILL.md': '---\nname: using-skills\n---\n# Using skills\n\nSkill body.\n',
  'skills/gone-old-skill/SKILL.md': '---\nname: gone-old-skill\n---\n# Gone old skill\n\nRemoved in 3.0.0.\n',
  'AGENTS.md': '# Agent brief\n\nOld onboarding text (2.33.0).\n',
  'playbooks/executor-lead-playbook.md':
    '---\ntitle: Executor lead playbook\nowner_skill: executor-lead\n---\nLead playbook body (2.33.0).\n',
  'playbooks/worker-implementer-playbook.md':
    '---\ntitle: Worker implementer playbook\nowner_skill: worker-implementer\n---\nWorker playbook body (2.33.0).\n',
};

/** Плагины — harness-корень (NC1): отдельное дерево plugins/. */
const OLD_PLUGINS: Record<string, string> = {
  'plugins/wolf-router.ts': '// wolf:rendered base=wolf-router.ts set=2.33.0\nexport const route = "old";\n',
  'plugins/wolf-session-start.js':
    '// wolf:rendered base=wolf-session-start.js set=2.33.0\nexport const sessionStart = "old";\n',
};

/** Набор релиза 3.0.0: старые имена удалены, mr-wolf изменён, added-skill новый. */
const NEW_TEMPLATES: Record<string, string> = {
  'agents/mr-wolf.md': '---\nname: mr-wolf\n---\n# Mr.Wolf agent\n\nNew agent body (3.0.0).\n',
  'skills/using-skills/SKILL.md': OLD_TEMPLATES['skills/using-skills/SKILL.md']!,
  'skills/added-skill/SKILL.md': '---\nname: added-skill\n---\n# Added skill\n\nNew in 3.0.0.\n',
  'AGENTS.md': '# Agent brief\n\nNew onboarding text (3.0.0).\n',
  'playbooks/mr-wolf-playbook.md':
    '---\ntitle: Mr.Wolf playbook\nowner_skill: mr-wolf\n---\nMr.Wolf playbook body (3.0.0).\n',
};

/** Мини-карта 3.0.0 — структура реальной (generate-update-map --prev 2.33.0):
 *  removed-записи для старого набора, лица prev — deprecated seed:false. */
const MINI_MAP = {
  version: NEW_SET,
  prev: OLD_SET,
  files: [
    { path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'changed' },
    { path: 'base/agents/executor-lead.md', kind: 'agent', category: 'removed' },
    { path: 'base/agents/steward.md', kind: 'agent', category: 'removed' },
    { path: 'base/agents/worker-researcher.md', kind: 'agent', category: 'removed' },
    { path: 'base/skills/using-skills/SKILL.md', kind: 'skill', category: 'unchanged' },
    { path: 'base/skills/gone-old-skill/SKILL.md', kind: 'skill', category: 'removed' },
    { path: 'base/skills/added-skill/SKILL.md', kind: 'skill', category: 'new' },
    { path: 'opencode/plugins/wolf-router.ts', kind: 'plugin', category: 'removed' },
    { path: 'opencode/plugins/wolf-session-start.js', kind: 'plugin', category: 'removed' },
  ],
  faces: [
    { template: 'base/playbooks/mr-wolf-playbook.md', owner_skill: 'mr-wolf', category: 'new', seed: true },
    {
      template: 'base/playbooks/executor-lead-playbook.md',
      owner_skill: 'executor-lead',
      category: 'deprecated',
      seed: false,
    },
    {
      template: 'base/playbooks/worker-implementer-playbook.md',
      owner_skill: 'worker-implementer',
      category: 'deprecated',
      seed: false,
    },
  ],
  agents_md: { category: 'changed', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: ['taxonomy (config.yaml memory_types)', 'tool-skills', 'local/foreign artifacts'],
} satisfies UpdateMap;

const MR_WOLF = '.opencode/agents/mr-wolf.md';
const OLD_NAMES = [
  '.opencode/agents/executor-lead.md',
  '.opencode/agents/steward.md',
  '.opencode/agents/worker-researcher.md',
  '.opencode/skills/gone-old-skill/SKILL.md',
  '.opencode/plugins/wolf-router.ts',
  '.opencode/plugins/wolf-session-start.js',
];

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

interface Fixture {
  templatesRoot: string;
  oldRoot: string;
  oldHarness: string;
  newHarness: string;
  map: UpdateMap;
}

let fx: Fixture;

beforeAll(() => {
  const pkgRoot = mkTmp('wolf-two-lvl-pkg-');
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: 'fixture-pkg', version: NEW_SET }));
  writeTemplates(join(pkgRoot, 'templates', 'base'), NEW_TEMPLATES);
  writeFileSync(join(pkgRoot, 'update-map.json'), JSON.stringify(MINI_MAP));
  const oldRoot = mkTmp('wolf-two-lvl-old-');
  writeTemplates(oldRoot, OLD_TEMPLATES);
  const oldHarness = mkTmp('wolf-two-lvl-oldh-');
  writeTemplates(oldHarness, OLD_PLUGINS);
  const newHarness = mkTmp('wolf-two-lvl-newh-'); // плагинов в 3.0.0 нет
  fx = {
    templatesRoot: join(pkgRoot, 'templates', 'base'),
    oldRoot,
    oldHarness,
    newHarness,
    map: loadUpdateMap(pkgRoot),
  };
});

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** Живой проект на 2.33.0: base-set старым рендером (штампы 2.33.0), лица старых
 *  playbook'ов посеяны, схема v2. */
async function bootstrapProject(parent: string, name: string): Promise<string> {
  const proj = join(parent, name);
  mkdirSync(proj, { recursive: true });
  await new OpencodeBaseSetRenderer(fx.oldRoot, {
    setVersion: OLD_SET,
    harnessTemplatesRoot: fx.oldHarness,
  }).renderBaseSet(proj, { models: 'omit' });
  await seedBasePlaybooks({ files: playbookFiles(join(fx.oldRoot, 'playbooks')), ...makeMemoryDeps(proj) });
  mkdirSync(join(proj, '.wolf'), { recursive: true });
  writeFileSync(join(proj, '.wolf', 'config.yaml'), 'schema_version: 2\n');
  return proj;
}

/** Сторонние файлы владельца: без штампа wolf — вне карты, вне orphan-скана. */
function addForeignFiles(proj: string): void {
  writeFileSync(
    join(proj, '.opencode/plugins/my-plugin.ts'),
    '// my own plugin — no wolf stamp\nexport const x = 1;\n'
  );
  writeFileSync(join(proj, '.opencode/agents/my-auditor.md'), '---\nname: my-auditor\n---\n# My auditor\n');
}

/** Локальная правка штампованного wolf-файла нового набора → mutated-решение. */
function mutateMrWolf(proj: string): string {
  const target = join(proj, MR_WOLF);
  writeFileSync(target, `${readFileSync(target, 'utf-8')}\n<!-- local user edit -->\n`);
  return readFileSync(target, 'utf-8');
}

function hereDeps(cwd: string): UpgradeHereDeps {
  return {
    cwd,
    loadMap: () => fx.map,
    makeStepDeps: (root: string): ProjectStepDeps => ({
      renderer: new OpencodeBaseSetRenderer(fx.templatesRoot, {
        setVersion: NEW_SET,
        harnessTemplatesRoot: fx.newHarness,
      }),
      files: playbookFiles(join(fx.templatesRoot, 'playbooks')),
      ...makeMemoryDeps(root),
    }),
  };
}

function resolveDeps(cwd: string): UpgradeResolveDeps {
  const renderer = new OpencodeBaseSetRenderer(fx.templatesRoot, {
    setVersion: NEW_SET,
    harnessTemplatesRoot: fx.newHarness,
  });
  return {
    here: cwd,
    loadMap: () => fx.map,
    inspect: (root) => renderer.inspectBaseSet(root, { models: 'omit' }),
    liveFaces: async (root) => {
      const faces = await new MarkdownMemoryStore(root).list({ type: 'face' });
      return faces.map((o) => {
        const face = o as FaceObject;
        return {
          ownerSkill: face.owner_skill,
          version: face.version,
          body: face.body,
          initiator: face.initiator,
          status: face.status,
        };
      });
    },
    faceTemplates: playbookFiles(join(fx.templatesRoot, 'playbooks')),
    renderer,
  };
}

const plain = (res: { report: Parameters<typeof renderReport>[0] }): string =>
  renderReport(res.report, { tty: false, colors: 'mono', width: 400 });
const read = (root: string, rel: string): string => readFileSync(join(root, rel), 'utf-8');

async function facesOf(proj: string, ownerSkill: string): Promise<FaceObject[]> {
  const store = new MarkdownMemoryStore(proj);
  return (await store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === ownerSkill);
}

describe('переход 2.33.0 → 3.0.0 одним согласованным набором (U1, two-level)', () => {
  it('до resolve: неразрешённый конфликт — exit 2 с точным списком (не тихий смешанный набор)', async () => {
    const proj = await bootstrapProject(mkTmp('wolf-two-lvl-'), 'p-attention');
    addForeignFiles(proj);
    mutateMrWolf(proj);

    const res = await runUpgradeHere(hereDeps(proj), { tty: true, confirm: async () => true });

    expect(res.exitCode).toBe(2);
    const text = plain(res);
    expect(text).toContain('Done with attention');
    // точный список целей с кодом: mutated назван проектным путём
    expect(text).toContain('needs decision (skipped-mutated): .opencode/agents/mr-wolf.md');
    // способ разрешить каждую — подсказка review
    expect(text).toContain('wolf upgrade --review');
    // старые имена удалены проходом (removed подтверждён списком карты), mutated не тронут
    for (const rel of OLD_NAMES) expect(existsSync(join(proj, rel))).toBe(false);
    expect(read(proj, MR_WOLF)).toContain('local user edit');
  });

  it('resolve завершает переход: ровно новый набор, my-* целы, mutated-take с бэкапом, exit 0 Done', async () => {
    const proj = await bootstrapProject(mkTmp('wolf-two-lvl-'), 'p-complete');
    addForeignFiles(proj);
    const localEdit = mutateMrWolf(proj);

    await runUpgradeHere(hereDeps(proj), { tty: true, confirm: async () => true });
    const res = await runUpgradeResolve(resolveDeps(proj), {
      here: true,
      cwd: proj,
      values: [`${MR_WOLF}=take`],
    });

    expect(res.exitCode).toBe(0);
    const text = plain(res);
    expect(text).toContain('resolved: 1 (take: 1)');
    expect(text).toContain('Done'); // финальный ok, не «Done with attention»
    expect(text).toContain('no decisions — nothing needs a decision'); // повторный сбор пуст
    expect(res.registry.targets).toEqual([]);
    expect(res.registry.diverged).toEqual([]);

    // mutated-правка сохранена в бэкапе, путь в отчёте
    expect(res.backups).toHaveLength(1);
    expect(res.backups[0]!.file).toBe(MR_WOLF);
    expect(res.backups[0]!.backup).toContain('.wolf/backup/upgrade/');
    expect(read(proj, res.backups[0]!.backup)).toBe(localEdit);
    expect(text).toContain(`local saved: ${res.backups[0]!.backup}`);

    // ровно новый набор: 0 старых имён, эталон 3.0.0 на месте, штамп обновлён
    for (const rel of OLD_NAMES) expect(existsSync(join(proj, rel))).toBe(false);
    const fresh = resolveDeps(proj).renderer.renderFreshFile(proj, MR_WOLF);
    expect(read(proj, MR_WOLF)).toBe(fresh);
    expect(parseStamp(read(proj, MR_WOLF))).toEqual({ base: 'mr-wolf.md', set: NEW_SET });
    expect(read(proj, MR_WOLF)).toContain('New agent body (3.0.0)');
    expect(existsSync(join(proj, '.opencode/skills/added-skill/SKILL.md'))).toBe(true);
    expect(read(proj, 'AGENTS.md')).toContain('New onboarding text (3.0.0)');

    // сторонние my-* файлы целы (orphan-канал их не трогает)
    expect(read(proj, '.opencode/plugins/my-plugin.ts')).toContain('my own plugin');
    expect(read(proj, '.opencode/agents/my-auditor.md')).toContain('My auditor');

    // лицо mr-wolf посеяно (один согласованный набор включает лица)
    expect(await facesOf(proj, 'mr-wolf')).toHaveLength(1);
  });

  it('повторный проход стабилен: diff пуст, старое не возвращается; повторный resolve — no-op', async () => {
    const proj = await bootstrapProject(mkTmp('wolf-two-lvl-'), 'p-stable');
    addForeignFiles(proj);
    mutateMrWolf(proj);

    await runUpgradeHere(hereDeps(proj), { tty: true, confirm: async () => true });
    const first = await runUpgradeResolve(resolveDeps(proj), { here: true, cwd: proj, values: [`${MR_WOLF}=take`] });
    expect(first.exitCode).toBe(0);

    const before = takeParkSnapshot(proj);
    const second = await runUpgradeHere(hereDeps(proj), { yes: true });
    expect(second.exitCode).toBe(0);
    expect(plain(second)).toContain('Done');
    for (const rel of OLD_NAMES) expect(existsSync(join(proj, rel))).toBe(false); // старое не возвращается
    expect(diffParkSnapshots(before, takeParkSnapshot(proj))).toMatchObject({
      addedFiles: [],
      removedFiles: [],
      changedFiles: [],
    });

    // повторный resolve той же цели — идемпотентный no-op без ошибок
    const again = await runUpgradeResolve(resolveDeps(proj), { here: true, cwd: proj, values: [`${MR_WOLF}=take`] });
    expect(again.exitCode).toBe(0);
    expect(plain(again)).toContain('take p-stable/.opencode/agents/mr-wolf.md — no-op');
  });

  it('take на removed-цель до прохода: бэкап, файл удалён, повтор no-op, проход затем exit 0', async () => {
    const proj = await bootstrapProject(mkTmp('wolf-two-lvl-'), 'p-removed');
    addForeignFiles(proj);
    const oldBody = read(proj, '.opencode/agents/executor-lead.md');

    const res = await runUpgradeResolve(resolveDeps(proj), {
      here: true,
      cwd: proj,
      values: ['.opencode/agents/executor-lead.md=take'],
    });

    expect(res.exitCode).toBe(0);
    expect(existsSync(join(proj, '.opencode/agents/executor-lead.md'))).toBe(false);
    expect(res.backups).toHaveLength(1);
    expect(read(proj, res.backups[0]!.backup)).toBe(oldBody); // локальный контент в бэкапе
    expect(res.registry.targets).toEqual([]);

    // повтор той же цели: файла уже нет — no-op
    const again = await runUpgradeResolve(resolveDeps(proj), {
      here: true,
      cwd: proj,
      values: ['.opencode/agents/executor-lead.md=take'],
    });
    expect(again.exitCode).toBe(0);
    expect(plain(again)).toContain('take p-removed/.opencode/agents/executor-lead.md — no-op');

    // затем полный проход доводит набор до конца — без errors по removed-целям
    const pass = await runUpgradeHere(hereDeps(proj), { yes: true });
    expect(pass.exitCode).toBe(0);
    expect(plain(pass)).toContain('Done');
    expect(existsSync(join(proj, '.opencode/agents/executor-lead.md'))).toBe(false);
  });

  it('orphan-take остаётся запрещён: штампованный файл вне карты — exit 1, снапшот не изменён', async () => {
    const proj = await bootstrapProject(mkTmp('wolf-two-lvl-'), 'p-orphan');
    addForeignFiles(proj);
    writeFileSync(
      join(proj, '.opencode/agents/variant.md'),
      '---\nname: variant\n---\n# Variant\n\n<!-- wolf:rendered base=variant.md set=2.33.0 -->\n'
    );
    const before = takeParkSnapshot(proj);

    const res = await runUpgradeResolve(resolveDeps(proj), {
      here: true,
      cwd: proj,
      values: ['.opencode/agents/variant.md=take'],
    });

    expect(res.exitCode).toBe(1);
    const text = plain(res);
    expect(text).toContain('cannot take .opencode/agents/variant.md: no base for a file outside the update map');
    expect(text).toContain('Failed');
    expect(diffParkSnapshots(before, takeParkSnapshot(proj))).toMatchObject({
      addedFiles: [],
      removedFiles: [],
      changedFiles: [],
    });
  });
});
