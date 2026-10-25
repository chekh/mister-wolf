// tests/integration/upgrade-check.test.ts
// R08.1 (test-plan, T10/REQ-08): --check на фикстурном парке — 2 проекта на
// штампах 2.16.2/2.17.1, npm view (мок) + installed CLI, инжект фикстурной
// карты/шаблонов (прецедент upgrade-park.test.ts); read-only — слепок парка
// до/после байт-в-байт (включая .opencode/wolf-sync-state.json и .wolf/**),
// exit 0, финальная строка Done (read-only).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import yaml from 'js-yaml';
import { runUpgradeCheck } from '../../src/adapters/cli/commands/memory-upgrade.js';
import { loadUpdateMap, type UpdateMap } from '../../src/adapters/fs/update-map.js';
import { ProjectsRegistry, type RegisteredProject } from '../../src/adapters/fs/projects-registry.js';
import { OpencodeBaseSetRenderer } from '../../src/adapters/render/opencode/opencode-renderer.js';
import { renderReport } from '../../src/adapters/cli/report-renderer.js';
import { diffParkSnapshots, takeParkSnapshot } from '../helpers/park-snapshot.js';

const OLD_SET_A = '2.16.2';
const OLD_SET_B = '2.17.1';
const NEW_SET = '2.19.0';

/** Шаблоны релизов 2.16.x/2.17.x — ими парк был инициализирован. */
const OLD_TEMPLATES: Record<string, string> = {
  'agents/mr-wolf.md': '# Mr.Wolf agent\n\nOld agent body.\n',
  'skills/using-skills/SKILL.md': '# Using skills\n\nSkill body.\n',
  'skills/gone-skill/SKILL.md': '# Gone skill\n\nRemoved in 2.19.0.\n',
  'commands/complain.md': '# Complain command\n\nCommand body.\n',
  'AGENTS.md': '# Agent brief\n\nOld onboarding text.\n',
};

/** Шаблоны «установленного» релиза 2.19.0 (прецедент upgrade-park.test.ts). */
const NEW_TEMPLATES: Record<string, string> = {
  'agents/mr-wolf.md': '# Mr.Wolf agent\n\nNew agent body (2.19.0).\n',
  'agents/executor-lead.md': '# Executor lead\n\nNew lead agent (2.19.0).\n',
  'skills/using-skills/SKILL.md': OLD_TEMPLATES['skills/using-skills/SKILL.md']!,
  'commands/complain.md': OLD_TEMPLATES['commands/complain.md']!,
  'AGENTS.md': '# Agent brief\n\nNew onboarding text (2.19.0).\n',
};

/** Мини-карта фикстурного контура (test-plan §«Фикстуры»; прецедент T6/T7). */
const MINI_MAP = {
  version: NEW_SET,
  prev: OLD_SET_B,
  files: [
    { path: 'base/agents/executor-lead.md', kind: 'agent', category: 'new' },
    { path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'changed' },
    { path: 'base/skills/using-skills/SKILL.md', kind: 'skill', category: 'unchanged' },
    { path: 'base/commands/complain.md', kind: 'command', category: 'deprecated' },
    { path: 'base/skills/gone-skill/SKILL.md', kind: 'skill', category: 'removed' },
  ],
  faces: [
    { template: 'base/playbooks/executor-lead-playbook.md', owner_skill: 'executor-lead', category: 'new', seed: true },
    { template: 'base/playbooks/wolf-review-lenses.md', owner_skill: 'mr-wolf', category: 'deprecated', seed: false },
  ],
  agents_md: { category: 'changed', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: ['local/foreign artifacts'],
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

interface Fixture {
  templatesRoot: string;
  map: UpdateMap;
}

let fx: Fixture;

beforeAll(() => {
  const pkgRoot = mkTmp('wolf-check-pkg-');
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: 'fixture-pkg', version: NEW_SET }));
  writeTemplates(join(pkgRoot, 'templates', 'base'), NEW_TEMPLATES);
  writeFileSync(join(pkgRoot, 'update-map.json'), JSON.stringify(MINI_MAP));
  fx = { templatesRoot: join(pkgRoot, 'templates', 'base'), map: loadUpdateMap(pkgRoot) };
});

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** Живой проект на старом релизе: base-set отрендерен старыми шаблонами со
 * штампом set=<version>; .wolf-память — чтобы слепок фиксировал и её. */
async function bootstrapProject(parent: string, name: string, setVersion: string): Promise<string> {
  const proj = join(parent, name);
  mkdirSync(proj, { recursive: true });
  const oldRoot = mkTmp('wolf-check-old-');
  writeTemplates(oldRoot, OLD_TEMPLATES);
  await new OpencodeBaseSetRenderer(oldRoot, { setVersion }).renderBaseSet(proj, { models: 'omit' });
  mkdirSync(join(proj, '.wolf', 'memory'), { recursive: true });
  writeFileSync(join(proj, '.wolf', 'memory', 'note.md'), '# note\n\nuntouched\n');
  return proj;
}

function writeRegistry(configDir: string, projects: RegisteredProject[]): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'projects.yaml'), yaml.dump({ projects }, { sortKeys: false, lineWidth: 120 }));
}

describe('runUpgradeCheck: R08.1 — парк 2 проектов, npm view (мок), 0 мутаций', () => {
  it('обе версии проектов + доступная версия пакета; слепок парка байт-в-байт; exit 0', async () => {
    const park = mkTmp('wolf-check-park-');
    const projA = await bootstrapProject(park, 'p-216', OLD_SET_A);
    const projB = await bootstrapProject(park, 'p-217', OLD_SET_B);

    const configDir = mkTmp('wolf-check-cfg-');
    writeRegistry(configDir, [
      { path: projA, schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z' },
      { path: projB, schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z' },
    ]);

    const renderer = new OpencodeBaseSetRenderer(fx.templatesRoot, { setVersion: NEW_SET });
    const snapA = takeParkSnapshot(projA);
    const snapB = takeParkSnapshot(projB);
    const registrySnap = takeParkSnapshot(configDir);

    const res = await runUpgradeCheck({
      registry: new ProjectsRegistry(configDir),
      loadMap: () => fx.map,
      registryVersion: async () => '2.19.1', // мок npm view — доступная версия пакета
      installedVersion: () => '2.18.5',
      inspect: (root) => renderer.inspectBaseSet(root, { models: 'omit' }),
    });

    expect(res.exitCode).toBe(0);
    const text = renderReport(res.report, { tty: false, colors: 'mono', width: 400 });
    // R08.1: обе версии проектов (штампы) + installed/available пакета
    expect(text).toContain('cli: installed 2.18.5 · available 2.19.1');
    expect(text).toContain('stamps 2.16.2');
    expect(text).toContain('stamps 2.17.1');
    expect(text).toContain('p-216');
    expect(text).toContain('p-217');
    // класс обоих проектов — behind: mr-wolf/AGENTS.md differ (тела сменились) +
    // executor-lead missing (new) + gone-skill ещё на месте (removed).
    // using-skills отличается только штампом set= → inspect отдаёт identical
    // (design §4.4: «проходу нечего решать»), поэтому differ 2, а не 3.
    expect(text.match(/— behind/g)).toHaveLength(2);
    expect(text).toContain('2 differ: .opencode/agents/mr-wolf.md, AGENTS.md'); // R01-2: оба пути, без усечения
    expect(text).not.toContain('3 differ');
    expect(text).toContain('1 missing'); // executor-lead.md (new)
    expect(text).toContain('removed present: .opencode/skills/gone-skill/SKILL.md');
    expect(text).toContain('deprecated: .opencode/command/complain.md (report-only)');
    expect(text).toContain(`map ${NEW_SET}`);
    expect(text.split('\n')).toContain('ok: Done (read-only)');

    // read-only: ни один файл не изменён — парки и реестр байт-в-байт
    for (const [before, root] of [
      [snapA, projA],
      [snapB, projB],
      [registrySnap, configDir],
    ] as const) {
      const diff = diffParkSnapshots(before, takeParkSnapshot(root));
      expect(diff.addedFiles).toEqual([]);
      expect(diff.removedFiles).toEqual([]);
      expect(diff.changedFiles).toEqual([]);
    }
    expect(takeParkSnapshot(projA).files['.opencode/wolf-sync-state.json']).toBe(
      snapA.files['.opencode/wolf-sync-state.json']
    );
  });
});

/* ---------- REQ-09 (§4.11): секция Protections; NFR-03: mtime+sha256 ---------- */

/** NFR-03: слепок mtime+sha256 ВСЕХ файлов проекта (включая `.wolf/**` и
 *  `wolf-sync-state.json`): перезапись с тем же контентом тоже видна, а
 *  takeParkSnapshot (sha-only) её бы пропустил. */
function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel === '' ? e.name : `${rel}/${e.name}`;
      const abs = join(dir, e.name);
      if (e.isDirectory()) walk(abs, relPath);
      else out[relPath] = `${statSync(abs).mtimeMs}:${createHash('sha256').update(readFileSync(abs)).digest('hex')}`;
    }
  };
  walk(root, '');
  return out;
}

/** Защищённый файл вне карты: frontmatter + protect (§4.1), в needs-decision не попадает. */
function writeProtectedFile(proj: string, rel: string, protect: string): void {
  const abs = join(proj, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, `---\nname: ${basename(rel, '.md')}\nprotect: ${protect}\n---\n\n# local note\n`);
}

describe('runUpgradeCheck: REQ-09 — секция Protections (R09-1…R09-4)', () => {
  it('R09-1: защищённые файлы двух проектов — путь, значение, дрейф; секция последняя', async () => {
    const park = mkTmp('wolf-check-prot-park-');
    const projA = await bootstrapProject(park, 'p-prot', OLD_SET_A);
    const projB = await bootstrapProject(park, 'p-behind', OLD_SET_B);
    writeProtectedFile(projA, '.opencode/agents/local-keep.md', 'true'); // вне карты → drift: n/a
    // защита на цели карты с устаревшим телом → behind (эталон релиза отличается)
    const skill = join(projB, '.opencode/skills/using-skills/SKILL.md');
    writeFileSync(
      skill,
      readFileSync(skill, 'utf-8').replace(/^(---\r?\n)?/, `---\nname: using-skills\nprotect: ${OLD_SET_B}\n---\n`)
    );

    const renderer = new OpencodeBaseSetRenderer(fx.templatesRoot, { setVersion: NEW_SET });
    const res = await runUpgradeCheck({
      registry: new ProjectsRegistry(mkRegistry([projA, projB])),
      loadMap: () => fx.map,
      registryVersion: async () => '2.19.1',
      installedVersion: () => '2.18.5',
      inspect: (root) => renderer.inspectBaseSet(root, { models: 'omit' }),
      protections: (root) => renderer.listProtections(root, NEW_SET),
    });
    const text = renderReport(res.report, { tty: false, colors: 'mono', width: 400 });
    expect(text).toContain('Protections');
    expect(text).toContain('p-prot · .opencode/agents/local-keep.md · protect: true · drift: n/a');
    expect(text).toContain(
      `p-behind · .opencode/skills/using-skills/SKILL.md · protect: ${OLD_SET_B} · behind (base ${NEW_SET})`
    );
    expect(text).toContain('2 protected files · release: wolf upgrade --resolve <file>=take');
    // последняя секция документа: после проектов, перед финальной строкой
    expect(text.indexOf('Protections')).toBeGreaterThan(text.lastIndexOf('p-behind · ' + projB));
    expect(text.indexOf('Protections')).toBeLessThan(text.indexOf('Done (read-only)'));
    expect(res.exitCode).toBe(0);
  });

  it('R09-2: чистый парк без защит → Protections: none', async () => {
    const park = mkTmp('wolf-check-clean-');
    const proj = await bootstrapProject(park, 'p-clean', NEW_SET);
    const renderer = new OpencodeBaseSetRenderer(fx.templatesRoot, { setVersion: NEW_SET });
    const res = await runUpgradeCheck({
      registry: new ProjectsRegistry(mkRegistry([proj])),
      loadMap: () => fx.map,
      registryVersion: async () => NEW_SET,
      installedVersion: () => NEW_SET,
      inspect: (root) => renderer.inspectBaseSet(root, { models: 'omit' }),
      protections: (root) => renderer.listProtections(root, NEW_SET),
    });
    const text = renderReport(res.report, { tty: false, colors: 'mono', width: 400 });
    expect(text.split('\n')).toContain('- Protections: none');
  });

  it('R09-3/N03-1: два прогона дают идентичный вывод, mtime+sha256 всех файлов парка не изменён', async () => {
    const park = mkTmp('wolf-check-ro-park-');
    const proj = await bootstrapProject(park, 'p-ro', OLD_SET_A);
    writeProtectedFile(proj, '.opencode/agents/local-keep.md', 'true');
    const configDir = mkRegistry([proj]);
    const renderer = new OpencodeBaseSetRenderer(fx.templatesRoot, { setVersion: NEW_SET });
    const deps = {
      registry: new ProjectsRegistry(configDir),
      loadMap: () => fx.map,
      registryVersion: async () => '2.19.1',
      installedVersion: () => '2.18.5',
      inspect: (root: string) => renderer.inspectBaseSet(root, { models: 'omit' }),
      protections: (root: string) => renderer.listProtections(root, NEW_SET),
    };

    const beforeProj = snapshotTree(proj);
    const beforeCfg = snapshotTree(configDir);
    const first = renderReport((await runUpgradeCheck(deps)).report, { tty: false, colors: 'mono', width: 400 });
    const second = renderReport((await runUpgradeCheck(deps)).report, { tty: false, colors: 'mono', width: 400 });

    expect(second).toBe(first);
    expect(snapshotTree(proj)).toEqual(beforeProj); // mtime+sha256, включая wolf-sync-state.json и .wolf/**
    expect(snapshotTree(configDir)).toEqual(beforeCfg);
    expect(beforeProj['.opencode/wolf-sync-state.json']).toBeDefined(); // свидетель реально в слепке
  });

  it('R09-4: значение вне грамматики → unrecognized — treated as protected, exit 0', async () => {
    const park = mkTmp('wolf-check-raw-');
    const proj = await bootstrapProject(park, 'p-raw', OLD_SET_A);
    writeProtectedFile(proj, '.opencode/agents/local-typo.md', 'yes');
    const renderer = new OpencodeBaseSetRenderer(fx.templatesRoot, { setVersion: NEW_SET });
    const res = await runUpgradeCheck({
      registry: new ProjectsRegistry(mkRegistry([proj])),
      loadMap: () => fx.map,
      registryVersion: async () => '2.19.1',
      installedVersion: () => '2.18.5',
      inspect: (root) => renderer.inspectBaseSet(root, { models: 'omit' }),
      protections: (root) => renderer.listProtections(root, NEW_SET),
    });
    expect(res.exitCode).toBe(0);
    expect(renderReport(res.report, { tty: false, colors: 'mono', width: 400 })).toContain(
      'protect: yes (unrecognized — treated as protected)'
    );
  });
});

/** Реестр в tmp-configDir (R09-*): проекты без реального ~/.config/wolf. */
function mkRegistry(projects: string[]): string {
  const configDir = mkTmp('wolf-check-cfg-');
  writeRegistry(
    configDir,
    projects.map((path) => ({ path, schema_version: 2, initialized_at: '2026-01-01T00:00:00.000Z' }))
  );
  return configDir;
}
