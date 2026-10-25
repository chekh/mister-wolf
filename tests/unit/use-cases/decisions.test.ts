// tests/unit/use-cases/decisions.test.ts
// T7 (волна 2.20.0, REQ-06, design §4.7/§4.8/§4.12/§4.17): реестр решений
// (нумерация, детерминизм, skippedProjects, diverged), разбор `--resolve`
// (грамматика, область целей, дубли, матрица «глагол × класс», двухфазность),
// применение (take/keep/protect/pin, бэкап NFR-05, свидетель, атомарность).
// Реальные адаптеры на mkdtemp-фикстурах; домашний реестр не участвует.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyResolutions,
  collectDecisions,
  parseResolveValues,
  planResolutions,
  resolveShowTarget,
  type DecisionDeps,
  type DecisionRegistry,
} from '../../../src/app/use-cases/decisions.js';
import { runUpgradeProjects, type UpgradeProjectsDeps } from '../../../src/app/use-cases/upgrade-projects.js';
import { statusOf } from '../../../src/app/use-cases/upgrade-projects.js';
import { projectPath } from '../../../src/app/use-cases/verify-against-map.js';
import { OpencodeBaseSetRenderer } from '../../../src/adapters/render/opencode/opencode-renderer.js';
import { loadSyncState, saveSyncState, sha256 } from '../../../src/adapters/render/sync-state.js';
import { syncBaseSet } from '../../../src/app/use-cases/sync-base-set.js';
import { insertProtect, normalizeManaged, parseProtect } from '../../../src/domain/protect-key.js';
import { parseStamp } from '../../../src/adapters/render/stamp.js';
import { renderReport } from '../../../src/adapters/cli/report-renderer.js';
import { diffParkSnapshots, takeParkSnapshot } from '../../helpers/park-snapshot.js';
import type { ProjectReport } from '../../../src/app/use-cases/project-step.js';
import type { UpdateMap } from '../../../src/adapters/fs/update-map.js';

const OLD_SET = '2.17.1';
const NEW_SET = '2.19.0';
const DAY = new Date(2026, 9, 25, 12, 0, 0).getTime(); // локальная дата бэкапа 2026-10-25

const OLD_TEMPLATES: Record<string, string> = {
  'agents/mr-wolf.md': '---\nname: mr-wolf\n---\n# Mr.Wolf agent\n\nOld agent body.\n',
  'agents/lead.md': '---\nname: executor-lead\n---\n# Executor lead\n\nLead body.\n',
  'skills/using-skills/SKILL.md': '---\nname: using-skills\n---\n# Using skills\n\nSkill body.\n',
  'commands/complain.md': '---\nname: complain\n---\n# Complain\n\nCommand body.\n',
  'skills/gone-skill/SKILL.md': '---\nname: gone-skill\n---\n# Gone skill\n\nRemoved in the new release.\n',
  'AGENTS.md': '# Agent brief\n\nOld onboarding text.\n',
};

const NEW_TEMPLATES: Record<string, string> = {
  ...OLD_TEMPLATES,
  'agents/mr-wolf.md': '---\nname: mr-wolf\n---\n# Mr.Wolf agent\n\nNew agent body.\n',
  'AGENTS.md': '# Agent brief\n\nNew onboarding text.\n',
};

const MAP: UpdateMap = {
  version: NEW_SET,
  prev: OLD_SET,
  files: [
    { path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'changed' },
    { path: 'base/agents/lead.md', kind: 'agent', category: 'unchanged' },
    { path: 'base/skills/using-skills/SKILL.md', kind: 'skill', category: 'unchanged' },
    { path: 'base/commands/complain.md', kind: 'command', category: 'deprecated' },
    { path: 'base/skills/gone-skill/SKILL.md', kind: 'skill', category: 'removed' },
  ],
  faces: [
    { template: 'base/playbooks/executor-lead-playbook.md', owner_skill: 'executor-lead', category: 'new', seed: true },
  ],
  agents_md: { category: 'changed', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: [],
};

const MR_WOLF = '.opencode/agents/mr-wolf.md';
const LEAD = '.opencode/agents/lead.md';
const COMPLAIN = '.opencode/command/complain.md';
const AGENTS = 'AGENTS.md';

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

let oldRoot: string;
let newRoot: string;

beforeAll(async () => {
  oldRoot = mkTmp('wolf-dec-old-');
  newRoot = mkTmp('wolf-dec-new-');
  writeTemplates(oldRoot, OLD_TEMPLATES);
  writeTemplates(newRoot, NEW_TEMPLATES);
});

afterAll(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Проект, зафиксированный старым релизом (штампы 2.17.1 + свидетель). */
async function boot(name: string): Promise<string> {
  const proj = join(mkTmp('wolf-dec-'), name);
  mkdirSync(proj, { recursive: true });
  await new OpencodeBaseSetRenderer(oldRoot, { setVersion: OLD_SET }).renderBaseSet(proj, { models: 'omit' });
  return proj;
}

const newRenderer = (): OpencodeBaseSetRenderer => new OpencodeBaseSetRenderer(newRoot, { setVersion: NEW_SET });

/** Мутация после рендера: правило 6 §4.3 → mutated. */
function touch(proj: string, rel: string, suffix = '\n<!-- local user edit -->\n'): void {
  const abs = join(proj, rel);
  writeFileSync(abs, `${readFileSync(abs, 'utf-8')}${suffix}`);
}

function read(proj: string, rel: string): string {
  return readFileSync(join(proj, rel), 'utf-8');
}

function tmpFiles(proj: string): string[] {
  return (readdirSync(proj, { recursive: true, encoding: 'utf-8' }) as string[]).filter((p) => p.endsWith('.tmp'));
}

function hereDeps(proj: string, over: Partial<DecisionDeps> = {}): DecisionDeps {
  return {
    here: proj,
    loadMap: () => MAP,
    inspect: (root) => newRenderer().inspectBaseSet(root, { models: 'omit' }),
    ...over,
  };
}

async function registryFor(proj: string): Promise<DecisionRegistry> {
  return collectDecisions(hereDeps(proj));
}

const applyDeps = () => ({ map: MAP, renderer: newRenderer(), now: () => DAY });

describe('collectDecisions (design §4.7): нумерация, порядок, детерминизм', () => {
  it('R06-1/N06-2: порядок карта → AGENTS.md, сквозная 1-based нумерация, два прогона идентичны', async () => {
    const proj = await boot('p-order');
    touch(proj, MR_WOLF); // mutated
    writeFileSync(join(proj, COMPLAIN), '---\nname: my-own\n---\n# My own command\n'); // без штампа → conflict
    touch(proj, AGENTS); // mutated (штампованный whole-file)

    const reg = await registryFor(proj);
    expect(reg.targets.map((t) => [t.n, t.file, t.kind, t.code])).toEqual([
      [1, MR_WOLF, 'agent', 'mutated'],
      [2, COMPLAIN, 'command', 'conflict'],
      [3, AGENTS, 'agents-md', 'mutated'],
    ]);
    expect(reg.targets.every((t) => t.project === 'p-order' && t.root === proj)).toBe(true);
    expect(reg.skippedProjects).toEqual([]);

    const again = await registryFor(proj);
    expect(again).toEqual(reg); // NFR-06: детерминизм нумерации
  });

  it('реестр задаёт порядок проектов; protected/kept/differs/missing/removed не нумеруются', async () => {
    const p1 = await boot('p-first');
    const p2 = await boot('p-second');
    touch(p2, MR_WOLF);
    // p1: защищённый мутант → protected, в реестр не попадает
    writeFileSync(join(p1, MR_WOLF), insertProtect(read(p1, MR_WOLF), 'true').content);
    // removed-цель существует, но категорией removed не нумеруется
    expect(existsSync(join(p1, '.opencode/skills/gone-skill/SKILL.md'))).toBe(true);

    const reg = await collectDecisions({
      registry: {
        listStrict: async () => [
          { path: p2, schema_version: 2, initialized_at: 't' },
          { path: p1, schema_version: 2, initialized_at: 't' },
        ],
      },
      loadMap: () => MAP,
      inspect: (root) => newRenderer().inspectBaseSet(root, { models: 'omit' }),
    });

    expect(reg.targets.map((t) => [t.n, t.project, t.file])).toEqual([[1, 'p-second', MR_WOLF]]);
    // p1: AGENTS.md штампован и совпадает с эталоном → identical; differ/missing не решения
    expect(reg.targets.some((t) => t.project === 'p-first')).toBe(false);
  });

  it('skippedProjects: pinned и missing пропускаются с причиной', async () => {
    const pinned = await boot('p-pinned');
    const gone = join(mkTmp('wolf-dec-gone-'), 'p-gone'); // пути нет
    const reg = await collectDecisions({
      registry: {
        listStrict: async () => [
          { path: pinned, schema_version: 2, initialized_at: 't', pinned: true },
          { path: gone, schema_version: 2, initialized_at: 't' },
        ],
      },
      loadMap: () => MAP,
      inspect: (root) => newRenderer().inspectBaseSet(root, { models: 'omit' }),
    });
    expect(reg.skippedProjects).toEqual([
      { name: 'p-pinned', reason: 'pinned' },
      { name: 'p-gone', reason: 'missing' },
    ]);
    expect(reg.targets).toEqual([]);
  });

  it('--here нумерует только cwd и не читает реестр', async () => {
    const proj = await boot('p-here');
    touch(proj, MR_WOLF);
    const reg = await collectDecisions({
      here: proj,
      loadMap: () => MAP,
      inspect: (root) => newRenderer().inspectBaseSet(root, { models: 'omit' }),
      registry: {
        listStrict: async () => {
          throw new Error('registry must not be read in --here');
        },
      },
    });
    expect(reg.targets.map((t) => t.file)).toEqual([MR_WOLF]);
    expect(reg.projects).toEqual([{ name: 'p-here', root: proj }]);
  });

  it('diverged: read-only лица по owner_skill (не seed/migration), не адресуются номером', async () => {
    const proj = await boot('p-faces');
    const templates = new Map([
      ['executor-lead-playbook.md', '---\ntitle: lead\nowner_skill: executor-lead\n---\nTemplate body.\n'],
    ]);
    const base = { here: proj, loadMap: () => MAP, inspect: async () => [] };
    const equal = await collectDecisions({
      ...base,
      faceTemplates: templates,
      liveFaces: async () => [
        { ownerSkill: 'executor-lead', version: '2', body: 'Template body.\n', initiator: 'steward' },
      ],
    });
    expect(equal.diverged).toEqual([]);

    const diverged = await collectDecisions({
      ...base,
      faceTemplates: templates,
      liveFaces: async () => [
        { ownerSkill: 'executor-lead', version: '2', body: 'Local body.\n', initiator: 'steward' },
      ],
    });
    expect(diverged.diverged).toEqual([
      { project: 'p-faces', file: 'faces/executor-lead.md', ownerSkill: 'executor-lead', version: '2' },
    ]);
    expect(diverged.targets).toEqual([]);

    const seeded = await collectDecisions({
      ...base,
      faceTemplates: templates,
      liveFaces: async () => [{ ownerSkill: 'executor-lead', version: '1', body: 'Local body.\n', initiator: 'seed' }],
    });
    expect(seeded.diverged).toEqual([]); // штатное отставание seed-лица — зона прохода
  });
});

describe('parseResolveValues / planResolutions (§4.8): грамматика и двухфазная валидация', () => {
  it('пустое значение, пустой target, пустой verb, неизвестный глагол — ошибки', () => {
    expect(parseResolveValues(['']).errors.length).toBe(1);
    expect(parseResolveValues(['=take']).errors.join(' ')).toMatch(/expected <file\|N>/);
    expect(parseResolveValues(['a.md=']).errors.join(' ')).toMatch(/expected <file\|N>/);
    expect(parseResolveValues(['a.md=drop']).errors.join(' ')).toMatch(/unknown verb "drop"/);
    expect(parseResolveValues(['1=keep,2=take']).requests).toEqual([
      { target: '1', verb: 'keep' },
      { target: '2', verb: 'take' },
    ]);
  });

  it('R06-3: неизвестный номер + неизвестный путь — обе ошибки, ни одной записи', async () => {
    const proj = await boot('p-unknown');
    touch(proj, MR_WOLF);
    const reg = await registryFor(proj);
    const before = takeParkSnapshot(proj);
    const plan = planResolutions(
      reg,
      MAP,
      [
        { target: '99', verb: 'take' },
        { target: 'nope.md', verb: 'keep' },
      ],
      { here: true, cwd: proj }
    );
    expect(plan.errors).toHaveLength(2);
    expect(plan.errors.join('\n')).toMatch(/unknown target 99/);
    expect(plan.errors.join('\n')).toMatch(/unknown target nope.md/);
    expect(plan.ops).toEqual([]);
    expect(diffParkSnapshots(before, takeParkSnapshot(proj))).toMatchObject({
      addedFiles: [],
      removedFiles: [],
      changedFiles: [],
    });
  });

  it('R06-7: дубль цели по номеру и по пути — target listed twice, записей нет', async () => {
    const proj = await boot('p-dup');
    touch(proj, MR_WOLF);
    const reg = await registryFor(proj);
    const byN = planResolutions(
      reg,
      MAP,
      [
        { target: '1', verb: 'take' },
        { target: '1', verb: 'keep' },
      ],
      { here: true, cwd: proj }
    );
    expect(byN.errors.join('\n')).toMatch(/target listed twice: 1/);

    const byPath = planResolutions(
      reg,
      MAP,
      [
        { target: MR_WOLF, verb: 'take' },
        { target: `./${MR_WOLF}`, verb: 'keep' },
      ],
      { here: true, cwd: proj }
    );
    expect(byPath.errors.join('\n')).toMatch(/target listed twice/);
  });

  it('R06-6: матрица §4.8 — отказы с подсказкой, файл не меняется', async () => {
    const proj = await boot('p-matrix');
    writeFileSync(join(proj, COMPLAIN), '---\nname: my-own\n---\n# Mine\n'); // conflict
    touch(proj, AGENTS); // stamped → agents-stamped
    const stray = join(proj, '.opencode/agents/stray.md');
    writeFileSync(stray, '# stray without frontmatter\n'); // orphan без frontmatter
    const reg = await registryFor(proj);

    const errors = (target: string, verb: 'take' | 'keep' | 'protect' | 'pin'): string =>
      planResolutions(reg, MAP, [{ target, verb }], { here: true, cwd: proj }).errors.join('\n');

    expect(errors(COMPLAIN, 'keep')).toMatch(/conflict comes from the map, not the witness — use protect/);
    expect(errors('.opencode/agents/stray.md', 'keep')).toMatch(/conflict comes from the map/);
    expect(errors('.opencode/agents/stray.md', 'take')).toMatch(/no base for a file outside the update map/);
    expect(errors(AGENTS, 'protect')).toMatch(/AGENTS\.md has no YAML frontmatter/);
    expect(errors(AGENTS, 'pin')).toMatch(/AGENTS\.md has no YAML frontmatter/);
    expect(errors('.opencode/agents/stray.md', 'protect')).toMatch(/no YAML frontmatter — add one or use keep/);

    // ручной frontmatter защищаемым AGENTS.md не делает (решение L0)
    writeFileSync(join(proj, AGENTS), `---\nprotect: true\n---\n${read(proj, AGENTS)}`);
    const manual = await registryFor(proj);
    expect(
      planResolutions(manual, MAP, [{ target: AGENTS, verb: 'protect' }], { here: true, cwd: proj }).errors.join('\n')
    ).toMatch(/AGENTS\.md has no YAML frontmatter/);

    expect(readFileSync(stray, 'utf-8')).toBe('# stray without frontmatter\n');
  });

  it('адресация: N, rel-путь, ./путь, <project>/<rel>; неоднозначный путь — ошибка с кандидатами', async () => {
    const p1 = await boot('p-addr1');
    const p2 = await boot('p-addr2');
    touch(p1, MR_WOLF);
    touch(p2, MR_WOLF);
    const reg = await collectDecisions({
      registry: {
        listStrict: async () => [
          { path: p1, schema_version: 2, initialized_at: 't' },
          { path: p2, schema_version: 2, initialized_at: 't' },
        ],
      },
      loadMap: () => MAP,
      inspect: (root) => newRenderer().inspectBaseSet(root, { models: 'omit' }),
    });

    const explicit = planResolutions(reg, MAP, [{ target: `p-addr2/${MR_WOLF}`, verb: 'keep' }], {
      here: false,
      cwd: process.cwd(),
    });
    expect(explicit.errors).toEqual([]);
    expect(explicit.ops.map((o) => o.root)).toEqual([realpathSync(p2)]);

    const ambiguous = planResolutions(reg, MAP, [{ target: MR_WOLF, verb: 'keep' }], {
      here: false,
      cwd: process.cwd(),
    });
    expect(ambiguous.errors.join('\n')).toMatch(/ambiguous target/);
    expect(ambiguous.errors.join('\n')).toContain(`p-addr1/${MR_WOLF}`);
    expect(ambiguous.errors.join('\n')).toContain(`p-addr2/${MR_WOLF}`);

    const byNumber = planResolutions(reg, MAP, [{ target: '2', verb: 'keep' }], {
      here: false,
      cwd: process.cwd(),
    });
    expect(byNumber.ops.map((o) => o.root)).toEqual([realpathSync(p2)]);
    expect(byNumber.ops[0].cls).toBe('mutated');
  });

  it('R06-7: применение идёт в порядке реестра, не ввода', async () => {
    const proj = await boot('p-order-apply');
    touch(proj, MR_WOLF);
    writeFileSync(join(proj, COMPLAIN), '---\nname: my-own\n---\n# Mine\n');
    const reg = await registryFor(proj);
    const plan = planResolutions(
      reg,
      MAP,
      [
        { target: COMPLAIN, verb: 'protect' },
        { target: MR_WOLF, verb: 'protect' },
      ],
      { here: true, cwd: proj }
    );
    expect(plan.errors).toEqual([]);
    expect(plan.ops.map((o) => o.file)).toEqual([MR_WOLF, COMPLAIN]);
  });
});

describe('applyResolutions: глаголы, свидетель, бэкапы (§4.8/§4.12, NFR-05)', () => {
  it('R06-2/N05-1/N04-1: take — бэкап байт-в-байт, эталон, свидетель render, без *.tmp', async () => {
    const proj = await boot('p-take');
    const local = read(proj, MR_WOLF);
    touch(proj, MR_WOLF);
    const edited = read(proj, MR_WOLF);
    const reg = await registryFor(proj);

    const plan = planResolutions(reg, MAP, [{ target: '1', verb: 'take' }], { here: true, cwd: proj });
    const res = await applyResolutions(plan.ops, applyDeps());

    expect(res.errors).toEqual([]);
    const fresh = newRenderer().renderFreshFile(proj, MR_WOLF);
    expect(read(proj, MR_WOLF)).toBe(fresh);
    expect(res.backups).toHaveLength(1);
    expect(read(proj, res.backups[0]!.backup)).toBe(edited); // локальная копия до перезаписи
    expect(res.backups[0]!.backup).toBe(`.wolf/backup/upgrade/2026-10-25/${MR_WOLF}`);
    const entry = loadSyncState(proj).files[MR_WOLF] as { hash: string; origin: string; base: string };
    expect(entry).toEqual({ hash: sha256(normalizeManaged(fresh!)), origin: 'render', base: NEW_SET });
    expect(tmpFiles(proj)).toEqual([]);
    expect(local.length).toBeGreaterThan(0);
  });

  it('R06-4: take на защищённом — ключ снят, эталон взят, свидетель render', async () => {
    const proj = await boot('p-take-protected');
    touch(proj, MR_WOLF);
    const protectedContent = insertProtect(read(proj, MR_WOLF), 'true').content;
    writeFileSync(join(proj, MR_WOLF), protectedContent);

    const reg = await registryFor(proj);
    expect(reg.targets).toEqual([]); // protected не решение
    const plan = planResolutions(reg, MAP, [{ target: MR_WOLF, verb: 'take' }], { here: true, cwd: proj });
    expect(plan.errors).toEqual([]);
    expect(plan.ops[0]!.cls).toBe('protected');
    const res = await applyResolutions(plan.ops, applyDeps());

    expect(res.errors).toEqual([]);
    const after = read(proj, MR_WOLF);
    expect(parseProtect(after).held).toBe(false);
    expect(after).toBe(newRenderer().renderFreshFile(proj, MR_WOLF));
    expect(res.backups[0]!.backup).toBe(`.wolf/backup/upgrade/2026-10-25/${MR_WOLF}`);
  });

  it('R06-5/N02-2: keep — файл байт-в-байт, свидетель keep, следующий проход не отменяет keep; правка → mutated', async () => {
    const proj = await boot('p-keep');
    touch(proj, MR_WOLF);
    const accepted = read(proj, MR_WOLF);
    const reg = await registryFor(proj);

    const plan = planResolutions(reg, MAP, [{ target: '1', verb: 'keep' }], { here: true, cwd: proj });
    const res = await applyResolutions(plan.ops, applyDeps());
    expect(res.errors).toEqual([]);
    expect(res.backups).toEqual([]); // keep контент не теряет
    expect(read(proj, MR_WOLF)).toBe(accepted);
    expect(loadSyncState(proj).files[MR_WOLF]).toEqual({
      hash: sha256(normalizeManaged(accepted)),
      origin: 'keep',
      base: NEW_SET,
    });

    // обычный проход (sync-фаза полного upgrade): keep держится (правило 6.5)
    const pass = await syncBaseSet(newRenderer(), proj, 'omit');
    const outcome = pass.outcomes.find((o) => o.file === MR_WOLF)!;
    expect(outcome).toMatchObject({ action: 'skipped', kept: true });
    expect(read(proj, MR_WOLF)).toBe(accepted);

    // правка после keep → снова решение
    touch(proj, MR_WOLF);
    const after = await syncBaseSet(newRenderer(), proj, 'omit');
    expect(after.outcomes.find((o) => o.file === MR_WOLF)).toMatchObject({ action: 'skipped', mutated: true });
  });

  it('R06-1: protect — ключ true, свидетель по нормализованному; повтор идемпотентен (ни байта)', async () => {
    const proj = await boot('p-protect');
    touch(proj, MR_WOLF);
    const reg = await registryFor(proj);
    const plan = planResolutions(reg, MAP, [{ target: '1', verb: 'protect' }], { here: true, cwd: proj });
    await applyResolutions(plan.ops, applyDeps());

    const protectedContent = read(proj, MR_WOLF);
    expect(parseProtect(protectedContent)).toMatchObject({ held: true, value: 'true' });
    expect(loadSyncState(proj).files[MR_WOLF]).toEqual({
      hash: sha256(normalizeManaged(protectedContent)),
      origin: 'keep',
      base: NEW_SET,
    });

    // повтор того же решения: реестр пуст, адресация по пути, ни файл, ни свидетель не меняются
    const before = takeParkSnapshot(proj);
    const reg2 = await registryFor(proj);
    expect(reg2.targets).toEqual([]);
    const plan2 = planResolutions(reg2, MAP, [{ target: MR_WOLF, verb: 'protect' }], { here: true, cwd: proj });
    const res2 = await applyResolutions(plan2.ops, applyDeps());
    expect(res2.errors).toEqual([]);
    expect(res2.applied[0]!.noop).toBe(true);
    expect(diffParkSnapshots(before, takeParkSnapshot(proj))).toMatchObject({ changedFiles: [] });

    // защищённый файл проход не трогает (правило 2)
    const pass = await syncBaseSet(newRenderer(), proj, 'omit');
    expect(pass.outcomes.find((o) => o.file === MR_WOLF)).toMatchObject({ action: 'skipped', protected: true });
  });

  it('pin пишет версию базы; keep на защищённом снимает ключ (unprotect)', async () => {
    const proj = await boot('p-pin');
    touch(proj, MR_WOLF);
    const reg = await registryFor(proj);
    const pin = planResolutions(reg, MAP, [{ target: '1', verb: 'pin' }], { here: true, cwd: proj });
    await applyResolutions(pin.ops, applyDeps());
    expect(parseProtect(read(proj, MR_WOLF))).toMatchObject({ held: true, value: NEW_SET });

    const reg2 = await registryFor(proj);
    const keep = planResolutions(reg2, MAP, [{ target: MR_WOLF, verb: 'keep' }], { here: true, cwd: proj });
    expect(keep.ops[0]!.cls).toBe('protected');
    await applyResolutions(keep.ops, applyDeps());
    // keep на protected — unprotect + свидетель keep (REQ-05 AC3, матрица §4.8)
    expect(parseProtect(read(proj, MR_WOLF)).held).toBe(false);
    expect((loadSyncState(proj).files[MR_WOLF] as { origin: string }).origin).toBe('keep');
  });

  it('R10-5: два take одного файла в один день — второй бэкап с суффиксом -2', async () => {
    const proj = await boot('p-collision');
    touch(proj, MR_WOLF);
    const reg = await registryFor(proj);
    const first = await applyResolutions(
      planResolutions(reg, MAP, [{ target: '1', verb: 'take' }], { here: true, cwd: proj }).ops,
      applyDeps()
    );
    touch(proj, MR_WOLF);
    const reg2 = await registryFor(proj);
    const second = await applyResolutions(
      planResolutions(reg2, MAP, [{ target: '1', verb: 'take' }], { here: true, cwd: proj }).ops,
      applyDeps()
    );
    expect(first.backups[0]!.backup).toBe(`.wolf/backup/upgrade/2026-10-25/${MR_WOLF}`);
    expect(second.backups[0]!.backup).toBe(`.wolf/backup/upgrade/2026-10-25/.opencode/agents/mr-wolf-2.md`);
    expect(existsSync(join(proj, first.backups[0]!.backup))).toBe(true);
  });

  it('R10-4/N05-2: сбой бэкапа — файл и свидетель не меняются, ошибка, записи нет', async () => {
    const proj = await boot('p-backup-fail');
    touch(proj, MR_WOLF);
    const local = read(proj, MR_WOLF);
    const witness = readFileSync(join(proj, '.opencode/wolf-sync-state.json'), 'utf-8');
    // коллизия на пути каталога бэкапа → mkdir падает
    const guard = join(proj, '.wolf/backup/upgrade/2026-10-25');
    mkdirSync(join(guard, '..'), { recursive: true });
    writeFileSync(guard, 'not a directory\n');

    const reg = await registryFor(proj);
    const res = await applyResolutions(
      planResolutions(reg, MAP, [{ target: '1', verb: 'take' }], { here: true, cwd: proj }).ops,
      applyDeps()
    );

    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatch(/backup/i);
    expect(res.applied).toEqual([]);
    expect(read(proj, MR_WOLF)).toBe(local);
    expect(readFileSync(join(proj, '.opencode/wolf-sync-state.json'), 'utf-8')).toBe(witness);
  });

  it('take на цели без эталона и на removed — отказ на валидации (⛔), записей нет', async () => {
    const proj = await boot('p-no-base');
    touch(proj, MR_WOLF);
    const orphan = join(proj, '.opencode/agents/orphan.md');
    writeFileSync(orphan, '---\nname: orphan\n---\n# Orphan\n\n<!-- wolf:rendered base=orphan.md set=2.17.1 -->\n');
    const reg = await registryFor(proj);
    const gone = '.opencode/skills/gone-skill/SKILL.md';

    const orphanPlan = planResolutions(reg, MAP, [{ target: '.opencode/agents/orphan.md', verb: 'take' }], {
      here: true,
      cwd: proj,
    });
    expect(orphanPlan.errors.join('\n')).toMatch(/no base for a file outside the update map/);
    const removedPlan = planResolutions(reg, MAP, [{ target: gone, verb: 'take' }], { here: true, cwd: proj });
    expect(removedPlan.errors.join('\n')).toMatch(/no base for a file outside the update map/);
    expect(readFileSync(orphan, 'utf-8')).toContain('Orphan');
  });

  it('orphan: protect гасит конфликт (следующий проход → protected), pin пишет версию базы', async () => {
    const proj = await boot('p-orphan');
    const orphan = '.opencode/agents/orphan.md';
    writeFileSync(
      join(proj, orphan),
      '---\nname: orphan\n---\n# Orphan\n\n<!-- wolf:rendered base=orphan.md set=2.17.1 -->\n'
    );
    const reg = await registryFor(proj);
    const plan = planResolutions(reg, MAP, [{ target: orphan, verb: 'pin' }], { here: true, cwd: proj });
    expect(plan.errors).toEqual([]);
    expect(plan.ops[0]!.cls).toBe('orphan');
    const res = await applyResolutions(plan.ops, applyDeps());
    expect(res.errors).toEqual([]);
    expect(parseProtect(read(proj, orphan))).toMatchObject({ held: true, value: NEW_SET });

    // следующий проход файл не трогает (правило 2 §4.3) и не выдаёт по нему конфликт
    const before = read(proj, orphan);
    const pass = await syncBaseSet(newRenderer(), proj, 'omit');
    expect(pass.outcomes.some((o) => o.file === orphan && o.action === 'conflict')).toBe(false);
    expect(read(proj, orphan)).toBe(before);
    // вне карты — не цель инспекции: orphan виден только реестром защит (§4.11)
    expect((await newRenderer().inspectBaseSet(proj, { models: 'omit' })).some((o) => o.file === orphan)).toBe(false);
  });

  it('m-1: одна строка faces: на одном diverged-лице (проход + --here)', async () => {
    const proj = await boot('p-faces-line');
    const seed = [{ file: 'executor-lead-playbook.md', action: 'diverged' as const, kind: 'diverged' as const }];
    const report = (): ProjectReport => ({
      name: 'p-faces-line',
      root: proj,
      sync: { outcomes: [], orphaned: [], removed: [] },
      seed,
      schema: { status: 'ok' },
      verify: { items: [], summary: { byCode: {}, needsDecision: 0, errors: 0 } },
      wallMs: 1,
      exitKind: 'done',
    });
    const deps: UpgradeProjectsDeps = {
      registry: {
        listStrict: async () => [{ path: proj, schema_version: 2, initialized_at: 't' }],
      },
      loadMap: () => MAP,
      makeStepDeps: () => ({}) as never,
      runStep: async () => report(),
    };
    const res = await runUpgradeProjects(deps, { yes: true });
    expect(statusOf(report())).toBe('up-to-date');
    const text = renderReport(res.report, { tty: false, colors: 'mono', width: 400 });
    expect(text.match(/faces:/g)).toHaveLength(1);
    expect(text).toContain('faces: executor-lead diverged');
  });
});

describe('resolveShowTarget (§4.10): номер, путь, цель вне карты', () => {
  it('N — только запись реестра; путь разрешён и для не-решений; unknown → ошибка', async () => {
    const proj = await boot('p-show');
    touch(proj, MR_WOLF);
    writeFileSync(join(proj, LEAD), insertProtect(read(proj, LEAD), '2.17.1').content); // protected
    const orphan = '.opencode/agents/variant.md';
    writeFileSync(join(proj, orphan), '---\nname: variant\n---\n# Variant\n');
    const reg = await registryFor(proj);
    const opts = { here: true, cwd: proj };

    expect(resolveShowTarget(reg, MAP, '1', opts).target).toMatchObject({ file: MR_WOLF, cls: 'mutated' });
    expect(resolveShowTarget(reg, MAP, LEAD, opts).target).toMatchObject({ file: LEAD, cls: 'protected' });
    expect(resolveShowTarget(reg, MAP, AGENTS, opts).target).toMatchObject({ file: AGENTS, cls: 'agents-stamped' });
    expect(resolveShowTarget(reg, MAP, orphan, opts).target).toMatchObject({ file: orphan, cls: 'orphan' });
    // N для защищённого файла нет: нумерация — только у решений
    expect(resolveShowTarget(reg, MAP, '2', opts).error).toMatch(/unknown target 2/);
    expect(resolveShowTarget(reg, MAP, 'missing.md', opts).error).toMatch(/unknown target/);
  });
});
