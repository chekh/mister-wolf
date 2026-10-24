// tests/integration/upgrade-here.test.ts
// T9 (волна 2.19.0, REQ-14, design §«--here»): wolf upgrade --here на живом
// проекте — полный шаг runProjectStep с реальными адаптерами памяти/рендера и
// мини-картой через T1-загрузчик (прецедент upgrade-park.test.ts). In-process:
// никакого spawn CLI; spawn стаб-модуля child_process кидает — npm-фаза не
// выполняется (R14.1 «CLI не менялся»). Реестр — фикстурный projects.yaml в
// tmp, слепок до/после равен (реестр не читаем и не пишем). Строки test-plan:
// R14.1, R14.2.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import {
  runUpgradeHere,
  type UpgradeHereDeps,
  type UpgradeHereResult,
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

// R14.1 «npm не звался»: any spawn через стаб кидает — если --here-путь
// попытается запустить npm-фазу, шаг упадёт (execFileSync и пр. остаются реальными).
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      throw new Error('spawn must not run in upgrade --here (no npm phase, no re-exec)');
    }),
  };
});

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

/** Шаблоны релиза 2.19.0 (совпадают с upgrade-park.test.ts — proven T7). */
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

/** Мини-карта фикстурного контура (прецедент T6/T7). */
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
    { template: 'base/playbooks/executor-lead-playbook.md', owner_skill: 'executor-lead', category: 'new', seed: true },
    {
      template: 'base/playbooks/worker-implementer-playbook.md',
      owner_skill: 'worker-implementer',
      category: 'changed',
      seed: true,
    },
    { template: 'base/playbooks/legacy-steward-playbook.md', owner_skill: 'steward', category: 'new', seed: true },
    { template: 'base/playbooks/wolf-review-lenses.md', owner_skill: 'mr-wolf', category: 'deprecated', seed: false },
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

/** Legacy howto-note владельца (популяция 2.16.x — прецедент T7). */
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
  const pkgRoot = mkTmp('wolf-here-pkg-');
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: 'fixture-pkg', version: NEW_SET }));
  writeTemplates(join(pkgRoot, 'templates', 'base'), NEW_TEMPLATES);
  writeFileSync(join(pkgRoot, 'update-map.json'), JSON.stringify(MINI_MAP));
  const oldRoot = mkTmp('wolf-here-old-');
  writeTemplates(oldRoot, OLD_TEMPLATES);
  fx = { pkgRoot, templatesRoot: join(pkgRoot, 'templates', 'base'), oldRoot, map: loadUpdateMap(pkgRoot) };
});

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** Живой проект на 2.17.1 (прецедент T7 bootstrapProject): base-set отрендерен
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

/** Фикстурный реестр в tmp-configDir (никаких реальных ~/.config/wolf). */
function writeRegistry(configDir: string, projects: Array<Record<string, unknown>>): string {
  mkdirSync(configDir, { recursive: true });
  const file = join(configDir, 'projects.yaml');
  writeFileSync(file, yaml.dump({ projects }, { sortKeys: false, lineWidth: 120 }));
  return file;
}

/** deps --here: реальный шаг (T6) на адаптерах, привязанных к cwd. */
function hereDeps(cwd: string): UpgradeHereDeps {
  return {
    cwd,
    loadMap: () => fx.map,
    makeStepDeps: (root: string): ProjectStepDeps => ({
      renderer: new OpencodeBaseSetRenderer(fx.templatesRoot, { setVersion: NEW_SET }),
      files: playbookFiles(join(fx.templatesRoot, 'playbooks')),
      ...makeMemoryDeps(root),
    }),
  };
}

const plain = (res: UpgradeHereResult): string => renderReport(res.report, { tty: false, colors: 'mono', width: 400 });

async function facesOf(proj: string, ownerSkill: string): Promise<FaceObject[]> {
  const store = new MarkdownMemoryStore(proj);
  return (await store.list({ type: 'face' })).filter((o) => (o as FaceObject).owner_skill === ownerSkill);
}

describe('runUpgradeHere: полный шаг в cwd (T9, REQ-14)', () => {
  it('R14.1: cwd вне реестра, --yes — полный шаг по карте, npm не звался, реестр не изменён', async () => {
    const park = mkTmp('wolf-here-park-');
    const proj = await bootstrapProject(park, 'p-manual');
    // реестр живёт в tmp и НЕ содержит cwd (живая память вне реестра)
    const registryFile = writeRegistry(mkTmp('wolf-here-cfg-'), [
      { path: join(park, 'some-other-project'), schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z' },
    ]);
    const yamlBefore = readFileSync(registryFile, 'utf-8');

    const res = await runUpgradeHere(hereDeps(proj), { yes: true });

    expect(res.exitCode).toBe(0);
    const text = plain(res);
    expect(text.split('\n')).toContain('ok: Done');
    expect(text).toContain('plan: p-manual · '); // одиночный план
    expect(text).toContain(`composition ${OLD_SET} → ${NEW_SET}`); // справочный состав (штампы свидетеля)
    expect(text).toContain('outside the registry — manual mode'); // ручной режим заявлен
    expect(text).toContain('p-manual — updated');

    // полный шаг: base-set перерисован до 2.19.0, removed удалён, deprecated остался
    expect(parseStamp(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8'))).toEqual({
      base: 'mr-wolf.md',
      set: NEW_SET,
    });
    expect(existsSync(join(proj, '.opencode/skills/gone-skill/SKILL.md'))).toBe(false);
    expect(existsSync(join(proj, '.opencode/command/complain.md'))).toBe(true);
    // посев по map.faces: недостающее лицо executor-lead посеяно
    expect(await facesOf(proj, 'executor-lead')).toHaveLength(1);
    expect(text).toContain('executor-lead seeded');
    // сверка по карте: все пункты закрыты (0 needs decision / 0 errors уже дал exit 0)
    expect(text).toMatch(/verify: \d+\/\d+ ok/);

    // CLI не менялся: spawn-стаб не кидал (шаг дошёл до конца), реестр не читан/не писан
    expect(readFileSync(registryFile, 'utf-8')).toBe(yamlBefore);
  });

  it('R14.2: проект pinned в фикстурном реестре — --here всё равно обновляет (ручной инструмент)', async () => {
    const park = mkTmp('wolf-here-pinned-');
    const proj = await bootstrapProject(park, 'p-pinned-manual');
    const registryFile = writeRegistry(mkTmp('wolf-here-cfg-'), [
      { path: proj, schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z', pinned: true },
    ]);
    const yamlBefore = readFileSync(registryFile, 'utf-8');
    expect(yamlBefore).toContain('pinned: true');

    const res = await runUpgradeHere(hereDeps(proj), { yes: true });

    expect(res.exitCode).toBe(0);
    expect(plain(res)).toContain('p-pinned-manual — updated'); // обновлён, не «[pinned] — skipped»
    expect(parseStamp(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8'))).toEqual({
      base: 'mr-wolf.md',
      set: NEW_SET,
    });
    expect(await facesOf(proj, 'executor-lead')).toHaveLength(1);
    // реестр --here не трогает: pinned-запись не перезаписана
    const yamlAfter = readFileSync(registryFile, 'utf-8');
    expect(yamlAfter).toBe(yamlBefore);
  });
});
