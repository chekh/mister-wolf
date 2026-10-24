// tests/integration/upgrade-park.test.ts
// T7 (волна 2.19.0): оркестратор прохода на фикстурном парке (test-plan
// §«Фикстуры»: P-clean/P-mutated/P-pinned/P-worktree/P-missing + дубликат
// realpath + битый-yaml реестр) с реальными адаптерами памяти/рендера и
// мини-картой через T1-загрузчик (прецедент project-step.test.ts). Изоляция —
// только mkdtemp (configDir реестра, lock-каталог, scan-root), без реальных
// HOME/~/.config/wolf. Строки test-plan: R01.1, R02.2, R02.5, R05.1, R06.1,
// R06.2, R13.1, R13.3, R09 (wiring), гварды прохода.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import {
  runUpgradeProjects,
  type UpgradeProjectsDeps,
  type UpgradeRunResult,
} from '../../src/app/use-cases/upgrade-projects.js';
import { runProjectStep, type ProjectReport, type ProjectStepDeps } from '../../src/app/use-cases/project-step.js';
import { loadUpdateMap, type UpdateMap } from '../../src/adapters/fs/update-map.js';
import { ProjectsRegistry, type RegisteredProject } from '../../src/adapters/fs/projects-registry.js';
import { UpgradeLock } from '../../src/adapters/fs/upgrade-lock.js';
import { scanUnregistered } from '../../src/app/use-cases/scan-unregistered.js';
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
import { diffParkSnapshots, takeParkSnapshot, type ParkSnapshotDiff } from '../helpers/park-snapshot.js';

const OLD_SET = '2.17.1';
const NEW_SET = '2.19.0';

/** Шаблоны «установленного» релиза 2.17.1 — им был инициализирован парк. */
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

/** Шаблоны релиза 2.19.0 (совпадают с project-step.test.ts — proven T6). */
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

/** Мини-карта фикстурного контура (test-plan §«Фикстуры»; прецедент T6). */
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

/** Legacy howto-note владельца (популяция 2.16.x — прецедент T6). */
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

interface Fixture {
  pkgRoot: string;
  templatesRoot: string;
  oldRoot: string;
  map: UpdateMap;
}

let fx: Fixture;

beforeAll(() => {
  const pkgRoot = mkTmp('wolf-upgrade-pkg-');
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: 'fixture-pkg', version: NEW_SET }));
  writeTemplates(join(pkgRoot, 'templates', 'base'), NEW_TEMPLATES);
  writeFileSync(join(pkgRoot, 'update-map.json'), JSON.stringify(MINI_MAP));
  const oldRoot = mkTmp('wolf-upgrade-old-');
  writeTemplates(oldRoot, OLD_TEMPLATES);
  fx = { pkgRoot, templatesRoot: join(pkgRoot, 'templates', 'base'), oldRoot, map: loadUpdateMap(pkgRoot) };
});

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** Живой проект на 2.17.1 (прецедент T6 bootstrapProject): base-set отрендерен
 * старыми шаблонами, лица worker/mr-wolf посеяны, steward — legacy howto. */
async function bootstrapProject(parent: string, name: string): Promise<string> {
  const proj = join(parent, name);
  mkdirSync(proj, { recursive: true });
  await new OpencodeBaseSetRenderer(fx.oldRoot, { setVersion: OLD_SET }).renderBaseSet(proj, { models: 'omit' });
  await seedBasePlaybooks({ files: playbookFiles(join(fx.oldRoot, 'playbooks')), ...makeMemoryDeps(proj) });
  writeLegacyHowto(proj, 'mem_20260101_legacy_steward_ab12cd', 'steward');
  mkdirSync(join(proj, '.wolf'), { recursive: true });
  writeFileSync(join(proj, '.wolf', 'config.yaml'), 'schema_version: 2\n');
  return proj;
}

/** Linked git worktree (прецедент worktree-scope-isolation.test.ts): main с
 * commit + `git worktree add` — resolveMemoryRoot видит WT-ID. */
function makeWorktreeCopy(parent: string, name: string): string {
  const main = join(parent, `${name}-main`);
  const copy = join(parent, name);
  mkdirSync(main, { recursive: true });
  const git = (cmd: string): void => {
    execSync(cmd, { cwd: main, stdio: ['ignore', 'ignore', 'pipe'] });
  };
  git('git init -b main');
  git('git -c user.email=t@t -c user.name=t commit -m init --allow-empty');
  execSync(`git worktree add "${copy}" -b ${name}`, { cwd: main, stdio: ['ignore', 'ignore', 'pipe'] });
  return copy;
}

const entryOf = (path: string, pinned = false): RegisteredProject => ({
  path,
  schema_version: 2,
  initialized_at: '2026-01-01T00:00:00.000Z',
  ...(pinned ? { pinned: true } : {}),
});

function writeRegistry(configDir: string, projects: RegisteredProject[]): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'projects.yaml'), yaml.dump({ projects }, { sortKeys: false, lineWidth: 120 }));
}

/** deps прохода: реальные шаги (T6) + пер-project адаптеры, скан с инжектом
 * root (изоляция — никакой homedir), lock в изолированном каталоге. */
function parkDeps(
  configDir: string,
  lockDir: string,
  scanRoot: string,
  stepReports: ProjectReport[]
): UpgradeProjectsDeps {
  return {
    registry: new ProjectsRegistry(configDir),
    loadMap: () => fx.map,
    makeStepDeps: (root: string): ProjectStepDeps => ({
      renderer: new OpencodeBaseSetRenderer(fx.templatesRoot, { setVersion: NEW_SET }),
      files: playbookFiles(join(fx.templatesRoot, 'playbooks')),
      ...makeMemoryDeps(root),
    }),
    upgradeLock: new UpgradeLock(Date.now, lockDir),
    scan: (d) => scanUnregistered({ ...d, root: scanRoot }),
    runStep: async (deps, root, map, opts) => {
      const report = await runProjectStep(deps, root, map, opts);
      stepReports.push(report); // NFR-03: per-project wallMs в отчёте прогона
      return report;
    },
  };
}

const plain = (res: UpgradeRunResult): string => renderReport(res.report, { tty: false, colors: 'mono', width: 400 });
const count = (res: UpgradeRunResult, label: string): number | undefined =>
  res.counters.find((c) => c.label === label)?.count;

async function facesOf(proj: string, ownerSkill: string): Promise<FaceObject[]> {
  const store = new MarkdownMemoryStore(proj);
  return (await store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === ownerSkill);
}

const expectUntouched = (diff: ParkSnapshotDiff): void => {
  expect(diff.addedFiles).toEqual([]);
  expect(diff.removedFiles).toEqual([]);
  expect(diff.changedFiles).toEqual([]);
  expect(diff.addedObjects).toEqual([]);
  expect(diff.removedObjects).toEqual([]);
  expect(diff.changedObjects).toEqual([]);
};

describe('runUpgradeProjects: фикстурный парк (T7)', () => {
  it('R01.1/R02.2/R02.5/R05.1/R06.2/R13.1 + дедуп + скан: подтверждённый проход, exit 2', async () => {
    const park = mkTmp('wolf-upgrade-park-');
    const clean = await bootstrapProject(park, 'p-clean');
    const mutated = await bootstrapProject(park, 'p-mutated');
    const mutatedTarget = join(mutated, '.opencode/agents/mr-wolf.md'); // ручная правка штампованного файла
    writeFileSync(mutatedTarget, `${readFileSync(mutatedTarget, 'utf-8')}\n<!-- local user edit -->\n`);
    const pinned = await bootstrapProject(park, 'p-pinned');
    await bootstrapProject(park, 'p-unreg'); // живая память вне реестра (REQ-09)
    const wtCopy = makeWorktreeCopy(park, 'p-wt');
    const alias = join(park, 'p-clean-alias'); // дубликат realpath (симлинк)
    symlinkSync(clean, alias);
    const missing = join(park, 'p-gone');

    const configDir = mkTmp('wolf-upgrade-cfg-');
    const lockDir = mkTmp('wolf-upgrade-lockdir-');
    writeRegistry(configDir, [
      entryOf(clean),
      entryOf(mutated),
      entryOf(pinned, true),
      entryOf(wtCopy),
      entryOf(missing),
      entryOf(alias),
    ]);

    const stepReports: ProjectReport[] = [];
    const deps = parkDeps(configDir, lockDir, park, stepReports);
    const confirm = vi.fn(async () => true);
    const pinnedBefore = takeParkSnapshot(pinned);
    const wtBefore = takeParkSnapshot(wtCopy);
    const mutatedSha = takeParkSnapshot(mutated).files['.opencode/agents/mr-wolf.md']!;

    const res = await runUpgradeProjects(deps, { yes: true, tty: true, confirm });

    expect(confirm).not.toHaveBeenCalled(); // R02.2: --yes — без вопросов
    expect(res.exitCode).toBe(2); // R06.2: 0 error + 1 «требует решения»
    const text = plain(res);
    expect(text).toContain('Done with attention');

    // R01.1: активные проекты обновлены по карте (штампы/файлы)
    expect(parseStamp(readFileSync(join(clean, '.opencode/agents/mr-wolf.md'), 'utf-8'))).toEqual({
      base: 'mr-wolf.md',
      set: NEW_SET,
    });
    expect(existsSync(join(clean, '.opencode/skills/gone-skill/SKILL.md'))).toBe(false); // removed-цель удалена
    expect(existsSync(join(clean, '.opencode/command/complain.md'))).toBe(true); // deprecated остаётся
    expect(text).toContain('p-clean — updated');
    expect(text).toContain('composition 2.17.1 → 2.19.0'); // справочный состав плана

    // P-mutated: skipped-mutated → «требует решения», файл не тронут
    expect(takeParkSnapshot(mutated).files['.opencode/agents/mr-wolf.md']!).toBe(mutatedSha);
    expect(text).toContain('p-mutated — needs decision');
    expect(text).toContain('1 mutated');

    // R13.1: pinned показан со статусом, не изменён
    expect(text).toContain('[pinned] — skipped');
    expectUntouched(diffParkSnapshots(pinnedBefore, takeParkSnapshot(pinned)));

    // R02.5: worktree-скоп — статус, не изменён
    expect(text).toContain('[worktree] — skipped');
    expect(text).toContain('shared .wolf with the main checkout');
    expectUntouched(diffParkSnapshots(wtBefore, takeParkSnapshot(wtCopy)));

    // missing показан, проход продолжается; дубликат realpath свёрнут
    expect(text).toContain('[missing] — skipped');
    expect(text).toContain('duplicate registry entry collapsed');
    expect(stepReports.map((r) => r.name).sort()).toEqual(['p-clean', 'p-mutated']);

    // счётчики парка + досеяно лиц (R05.1/R11.6)
    expect(count(res, 'updated')).toBe(1);
    expect(count(res, 'needs decision')).toBe(1);
    expect(count(res, 'errors')).toBe(0);
    expect(count(res, 'pinned')).toBe(1);
    expect(count(res, 'worktree')).toBe(1);
    expect(count(res, 'missing')).toBe(1);
    expect(count(res, 'faces seeded')).toBe(4); // executor-lead + steward по двум активным
    expect(text).toContain('faces: executor-lead seeded');
    expect(text).toContain('steward legacy-absorbed');
    expect(await facesOf(clean, 'executor-lead')).toHaveLength(1);

    // REQ-09: скан после сводного отчёта нашёл p-unreg, exit не меняет
    expect(text).toContain('found 1 project with wolf memory outside the registry');
    expect(text).toContain('p-unreg');
    expect(text.indexOf('found 1 project')).toBeGreaterThan(text.indexOf('Done with attention'));

    // NFR-03: тайминги шагов зафиксированы; lock снят
    expect(stepReports.every((r) => r.wallMs > 0)).toBe(true);
    expect(existsSync(join(lockDir, 'wolf-upgrade.lock'))).toBe(false);

    // R13.3: снятие pinned (правка реестра) → перезапуск штатно обновляет;
    // p-clean после первого прохода — up-to-date (R05.1)
    writeRegistry(configDir, [
      entryOf(clean),
      entryOf(mutated),
      entryOf(pinned),
      entryOf(wtCopy),
      entryOf(missing),
      entryOf(alias),
    ]);
    const res2 = await runUpgradeProjects(deps, { yes: true });
    expect(res2.exitCode).toBe(2); // p-mutated всё ещё требует решения
    const text2 = plain(res2);
    expect(text2).toContain('p-pinned — updated');
    expect(text2).toContain('p-clean — up-to-date');
    expect(parseStamp(readFileSync(join(pinned, '.opencode/agents/mr-wolf.md'), 'utf-8'))).toEqual({
      base: 'mr-wolf.md',
      set: NEW_SET,
    });
    expect(count(res2, 'up-to-date')).toBe(1);
    expect(count(res2, 'updated')).toBe(1);
    expect(count(res2, 'faces seeded')).toBe(2); // посев только в свежепрошедшем p-pinned
  });

  it('R06.1: P-future-schema первым — error проекта, второй обновлён, exit 1', async () => {
    const park = mkTmp('wolf-upgrade-park-');
    const future = await bootstrapProject(park, 'p-future');
    writeFileSync(join(future, '.wolf', 'config.yaml'), 'schema_version: 99\n'); // схема из будущего
    const clean = await bootstrapProject(park, 'p-clean2');

    const configDir = mkTmp('wolf-upgrade-cfg-');
    const lockDir = mkTmp('wolf-upgrade-lockdir-');
    writeRegistry(configDir, [entryOf(future), entryOf(clean)]);

    const stepReports: ProjectReport[] = [];
    const res = await runUpgradeProjects(parkDeps(configDir, lockDir, park, stepReports), { yes: true });

    expect(res.exitCode).toBe(1);
    const text = plain(res);
    expect(text).toContain('p-future — error'); // ошибка первого проекта зафиксирована…
    expect(text).toContain('schema: refused');
    expect(text).toContain('p-clean2 — updated'); // …обход продолжен
    expect(text).toContain('Failed'); // финальная строка не говорит Done при ошибке
    expect(count(res, 'errors')).toBe(1);
    expect(count(res, 'updated')).toBe(1);
    expect(stepReports.map((r) => r.name)).toEqual(['p-future', 'p-clean2']);
  });

  it('гварды: битый-yaml реестр → exit 1, error-строка, проекты не тронуты', async () => {
    const park = mkTmp('wolf-upgrade-park-');
    await bootstrapProject(park, 'p-clean');
    const configDir = mkTmp('wolf-upgrade-cfg-');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'projects.yaml'), '{uncorrectable'); // прецедент T4

    const lockDir = mkTmp('wolf-upgrade-lockdir-');
    const stepReports: ProjectReport[] = [];
    const deps = parkDeps(configDir, lockDir, park, stepReports);
    const runStep = vi.fn(deps.runStep);
    const res = await runUpgradeProjects({ ...deps, runStep }, { yes: true });

    expect(res.exitCode).toBe(1);
    const text = plain(res);
    expect(text).toContain('failed to read the projects registry');
    expect(text).toContain('Failed');
    expect(runStep).not.toHaveBeenCalled(); // проекты не тронуты
  });
});
