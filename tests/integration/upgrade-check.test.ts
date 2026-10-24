// tests/integration/upgrade-check.test.ts
// R08.1 (test-plan, T10/REQ-08): --check на фикстурном парке — 2 проекта на
// штампах 2.16.2/2.17.1, npm view (мок) + installed CLI, инжект фикстурной
// карты/шаблонов (прецедент upgrade-park.test.ts); read-only — слепок парка
// до/после байт-в-байт (включая .opencode/wolf-sync-state.json и .wolf/**),
// exit 0, финальная строка Done (read-only).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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
    // класс обоих проектов — behind: mr-wolf/AGENTS.md/using-skills differ
    // (тело AGENTS.md и mr-wolf сменились, using-skills — штамп set=) +
    // executor-lead missing (new) + gone-skill ещё на месте (removed)
    expect(text.match(/— behind/g)).toHaveLength(2);
    expect(text).toContain('3 differ');
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
