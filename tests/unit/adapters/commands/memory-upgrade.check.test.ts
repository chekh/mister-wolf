// tests/unit/adapters/commands/memory-upgrade.check.test.ts
// T10 (волна 2.19.0, REQ-08, design §«--check»): runUpgradeCheck — read-only
// сводка парка: классификация classifyProject на фикстурах (AC2), деградация
// без карты CLI — штампы + unknown, никогда current (AC3), битый/пустой
// реестр и финальная строка Done (read-only) при exit 0 (AC4/AC7), порядок
// CLI-версии → парк через commander с npm-шимом (AC5, прецедент e2e
// upgrade.e2e.ts E1); inspectBaseSet — read-only инспектор на фикстуре
// differs/mutated/missing/foreign (AC6). Полный парк на реальных адаптерах —
// integration/upgrade-check.test.ts (R08.1).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import {
  classifyProject,
  memoryUpgradeCommand,
  runUpgradeCheck,
  type UpgradeCheckDeps,
  type UpgradeCheckResult,
} from '../../../../src/adapters/cli/commands/memory-upgrade.js';
import type { InspectAction, InspectOutcome } from '../../../../src/ports/base-set-renderer.port.js';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';
import type { UpdateMap } from '../../../../src/adapters/fs/update-map.js';
import { renderReport } from '../../../../src/adapters/cli/report-renderer.js';
import { takeParkSnapshot, diffParkSnapshots } from '../../../helpers/park-snapshot.js';

/** Мини-карта (прецедент T7/T9 unit): new/changed/unchanged/deprecated/removed. */
const MINI_MAP: UpdateMap = {
  version: '2.19.0',
  prev: '2.18.5',
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
  outside_v1: [],
};

const NEW_REL = '.opencode/agents/executor-lead.md';
const CHANGED_REL = '.opencode/agents/mr-wolf.md';
const UNCHANGED_REL = '.opencode/skills/using-skills/SKILL.md';
const DEPRECATED_REL = '.opencode/command/complain.md';
const REMOVED_REL = '.opencode/skills/gone-skill/SKILL.md';
const AGENTS_MD = 'AGENTS.md';

const outcomes = (over: Record<string, InspectAction> = {}): InspectOutcome[] => {
  const base: Record<string, InspectAction> = {
    [NEW_REL]: 'identical',
    [CHANGED_REL]: 'identical',
    [UNCHANGED_REL]: 'identical',
    [DEPRECATED_REL]: 'identical',
    [AGENTS_MD]: 'identical',
  };
  return Object.entries({ ...base, ...over }).map(([file, action]) => ({ file, action }));
};

describe('classifyProject (AC2: чистая классификация по карте + инспекции)', () => {
  it('все цели identical, removed-файла нет → current; deprecated — report-only', () => {
    const f = classifyProject(MINI_MAP, outcomes(), []);
    expect(f.cls).toBe('current');
    expect(f.deprecated).toEqual([DEPRECATED_REL]);
  });

  it('changed-цель differs → behind; new-цель missing → behind', () => {
    expect(classifyProject(MINI_MAP, outcomes({ [CHANGED_REL]: 'differs' }), []).cls).toBe('behind');
    expect(classifyProject(MINI_MAP, outcomes({ [NEW_REL]: 'missing' }), []).cls).toBe('behind');
  });

  it('removed-цель: файл существует → behind; отсутствует → не влияет (current)', () => {
    expect(classifyProject(MINI_MAP, outcomes(), [REMOVED_REL]).cls).toBe('behind');
    expect(classifyProject(MINI_MAP, outcomes(), []).cls).toBe('current');
  });

  it('mutated (любая цель) → needs decision; foreign → unknown', () => {
    expect(classifyProject(MINI_MAP, outcomes({ [UNCHANGED_REL]: 'mutated' }), []).cls).toBe('needs-decision');
    expect(classifyProject(MINI_MAP, outcomes({ [UNCHANGED_REL]: 'foreign' }), []).cls).toBe('unknown');
  });

  it('deprecated-цель differs — класс не меняет (report-only, REQ-11)', () => {
    const f = classifyProject(MINI_MAP, outcomes({ [DEPRECATED_REL]: 'differs' }), []);
    expect(f.cls).toBe('current');
    expect(f.deprecated).toEqual([DEPRECATED_REL]);
  });

  it('protected/kept — не behind и не needs-decision (§4.6, волна 2.20.0)', () => {
    const p = classifyProject(MINI_MAP, outcomes({ [CHANGED_REL]: 'protected' }), []);
    const k = classifyProject(MINI_MAP, outcomes({ [CHANGED_REL]: 'kept' }), []);
    expect(p.cls).toBe('current');
    expect(p.protected).toEqual([CHANGED_REL]);
    expect(k.cls).toBe('current');
    expect(k.kept).toEqual([CHANGED_REL]);
  });

  it('detail наблюдения переносится полем, класс не меняет (§4.15)', () => {
    const list = [
      ...outcomes({ [AGENTS_MD]: 'foreign' }),
      { file: AGENTS_MD, action: 'foreign' as const, detail: 'onboarding markers broken' },
    ];
    const f = classifyProject(MINI_MAP, list, []);
    expect(f.details).toEqual([{ file: AGENTS_MD, detail: 'onboarding markers broken' }]);
    expect(f.cls).toBe('unknown');
  });

  it('AGENTS.md — цель карты agents_md: differs → behind; outside-map — справочно', () => {
    expect(classifyProject(MINI_MAP, outcomes({ [AGENTS_MD]: 'differs' }), []).cls).toBe('behind');
    const f = classifyProject(MINI_MAP, outcomes({ '.opencode/agents/stray.md': 'identical' }), []);
    expect(f.cls).toBe('current');
    expect(f.outsideMap).toEqual(['.opencode/agents/stray.md']);
  });
});

/* ---------- runUpgradeCheck: деградации и реестр ---------- */

const tmpDirs: string[] = [];
const mkTmp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Шаблоны «старого» релиза — ими фиксируется проект (штампы свидетеля). */
const OLD_TEMPLATES: Record<string, string> = {
  'agents/mr-wolf.md': '# Mr.Wolf agent\n\nOld agent body.\n',
  'AGENTS.md': '<!-- wolf:onboarding v2 -->\n\n# Agent brief\n\nOld onboarding text.\n<!-- /wolf:onboarding -->\n',
};

function writeTemplates(root: string, templates: Record<string, string>): void {
  for (const [rel, content] of Object.entries(templates)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** Живой проект со штампом set=<version>: рендер старых шаблонов + свидетель. */
async function bootstrapStaleProject(parent: string, name: string, setVersion: string): Promise<string> {
  const proj = join(parent, name);
  mkdirSync(proj, { recursive: true });
  const tplRoot = mkTmp('wolf-check-oldtpl-');
  writeTemplates(tplRoot, OLD_TEMPLATES);
  await new OpencodeBaseSetRenderer(tplRoot, { setVersion }).renderBaseSet(proj, { models: 'omit' });
  return proj;
}

const plain = (res: UpgradeCheckResult): string => renderReport(res.report, { tty: false, colors: 'mono', width: 400 });

function checkDeps(over: Partial<UpgradeCheckDeps> = {}): UpgradeCheckDeps {
  return {
    registry: { listStrict: async () => [] },
    loadMap: () => MINI_MAP,
    registryVersion: async () => '2.19.0',
    installedVersion: () => '2.18.5',
    inspect: vi.fn(async () => [] as InspectOutcome[]),
    ...over,
  };
}

describe('runUpgradeCheck: деградации, реестр, exit 0 (AC3/AC4/AC7)', () => {
  it('AC3: loadMap throw → пометка недостоверности + штампы + unknown, никогда current', async () => {
    const park = mkTmp('wolf-check-park-');
    const staleA = await bootstrapStaleProject(park, 'p-old', '2.16.2');
    const staleB = await bootstrapStaleProject(park, 'p-older', '2.16.1');
    const inspect = vi.fn(async () => [] as InspectOutcome[]);
    const res = await runUpgradeCheck(
      checkDeps({
        registry: {
          listStrict: async () => [
            { path: staleA, schema_version: 2, initialized_at: 't' },
            { path: staleB, schema_version: 2, initialized_at: 't' },
          ],
        },
        loadMap: () => {
          throw new Error('update-map.json not found');
        },
        inspect,
      })
    );
    const text = plain(res);
    expect(res.exitCode).toBe(0);
    expect(text).toContain('map unavailable in this CLI — stamps only, unreliable');
    expect(text).toContain('stamps 2.16.2');
    expect(text).toContain('stamps 2.16.1');
    expect(text.match(/unknown — out of coverage/g)).toHaveLength(2);
    expect(text).not.toContain('— current');
    expect(inspect).not.toHaveBeenCalled(); // без карты инспекция не нужна
    expect(text.split('\n')).toContain('ok: Done (read-only)');
  });

  it('R03-5/R01-2: differs печатаются путями, detail-причина — отдельной строкой (§4.15)', async () => {
    const park = mkTmp('wolf-check-detail-');
    const proj = join(park, 'p-detail');
    mkdirSync(proj, { recursive: true });
    const outcomes: InspectOutcome[] = [
      { file: CHANGED_REL, action: 'differs' },
      { file: NEW_REL, action: 'differs' },
      { file: UNCHANGED_REL, action: 'identical' },
      { file: DEPRECATED_REL, action: 'identical' },
      { file: AGENTS_MD, action: 'foreign', detail: 'onboarding markers broken' },
    ];
    const res = await runUpgradeCheck(
      checkDeps({
        registry: { listStrict: async () => [{ path: proj, schema_version: 2, initialized_at: 't' }] },
        inspect: async () => outcomes,
      })
    );
    const text = plain(res);
    expect(text).toContain(`2 differ: ${NEW_REL}, ${CHANGED_REL}`); // порядок карты, оба пути без усечения
    expect(text).toContain('detail: onboarding markers broken — treated as foreign (AGENTS.md)');
    expect(res.exitCode).toBe(0);
  });

  it('AC4: listStrict throw → error-строка, exit 0; пустой реестр → no projects, exit 0', async () => {
    const broken = await runUpgradeCheck(
      checkDeps({
        registry: {
          listStrict: async () => {
            throw new Error('bad yaml');
          },
        },
      })
    );
    expect(broken.exitCode).toBe(0);
    expect(plain(broken)).toContain('failed to read the projects registry: bad yaml');
    expect(plain(broken).split('\n')).toContain('ok: Done (read-only)');

    const empty = await runUpgradeCheck(checkDeps());
    expect(empty.exitCode).toBe(0);
    expect(plain(empty)).toContain('no projects in the registry');
    expect(plain(empty).split('\n')).toContain('ok: Done (read-only)');
  });

  it('CLI-строка: installed vs available; npm view throw → error-строка, exit 0', async () => {
    const ok = await runUpgradeCheck(checkDeps());
    expect(plain(ok)).toContain('cli: installed 2.18.5 · available 2.19.0');

    const res = await runUpgradeCheck(
      checkDeps({
        registryVersion: async () => {
          throw new Error('registry unreachable');
        },
      })
    );
    expect(res.exitCode).toBe(0);
    expect(plain(res)).toContain('cli: installed 2.18.5 · available unknown — registry unreachable');
    expect(plain(res).split('\n')).toContain('ok: Done (read-only)');
  });
});

/* ---------- AC5: порядок CLI-версии → парковая сводка (commander) ---------- */

describe('--check (commander): CLI-часть печатается до парковой сводки (AC5)', () => {
  it('runUpgrade checkOnly + printOutcome идут перед секцией check', async () => {
    const home = mkTmp('wolf-check-cli-');
    const shimDir = join(home, 'npm-shim');
    mkdirSync(shimDir, { recursive: true });
    const shim = join(shimDir, 'npm');
    writeFileSync(shim, "#!/bin/sh\nprintf '%s\\n' 9.9.9\n");
    chmodSync(shim, 0o755);

    const out: string[] = [];
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...a: unknown[]) => void out.push(a.map(String).join(' ')));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((c: string) => {
      out.push(String(c));
      return true;
    }) as typeof process.stdout.write);
    const prevPath = process.env.PATH;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.PATH = `${shimDir}:${prevPath ?? ''}`;
    process.env.XDG_CONFIG_HOME = join(home, '.config'); // пустой изолированный реестр
    try {
      const program = new Command();
      program.addCommand(memoryUpgradeCommand());
      await program.parseAsync(['node', 'wolf', 'upgrade', '--check'], { from: 'node' });
    } finally {
      process.env.PATH = prevPath;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
      logSpy.mockRestore();
      writeSpy.mockRestore();
    }
    const text = out.join('\n');
    expect(text).toContain('available 9.9.9'); // printOutcome (runUpgrade checkOnly)
    expect(text).toContain('wolf upgrade — check'); // парковая сводка
    expect(text).toContain('Done (read-only)');
    expect(text.indexOf('available 9.9.9')).toBeLessThan(text.indexOf('wolf upgrade — check'));
  });
});

/* ---------- AC6: inspectBaseSet — read-only инспектор renderer ---------- */

describe('inspectBaseSet (AC6: differs/mutated/missing/foreign, 0 записей)', () => {
  it('верные actions по каждой цели; файлы и sync-state не тронуты (слепок)', async () => {
    const v1 = mkTmp('wolf-check-v1-');
    writeTemplates(v1, {
      'agents/mr-wolf.md': '# Mr.Wolf agent\n\nOld body.\n',
      'agents/executor-lead.md': '# Executor lead\n\nOld lead body.\n',
      'agents/steward.md': '# Steward\n\nSteward body.\n',
      'skills/using-skills/SKILL.md': '# Using skills\n\nSkill body.\n',
      'commands/complain.md': '# Complain\n\nCommand body.\n',
      'AGENTS.md': '<!-- wolf:onboarding v2 -->\n\n# Agent brief\n\nOnboarding text.\n<!-- /wolf:onboarding -->\n',
    });
    const v2 = mkTmp('wolf-check-v2-');
    writeTemplates(v2, {
      // mr-wolf и executor-lead изменились в новом релизе; остальное — как в v1
      'agents/mr-wolf.md': '# Mr.Wolf agent\n\nNew body.\n',
      'agents/executor-lead.md': '# Executor lead\n\nNew lead body.\n',
      'agents/steward.md': '# Steward\n\nSteward body.\n',
      'skills/using-skills/SKILL.md': '# Using skills\n\nSkill body.\n',
      'commands/complain.md': '# Complain\n\nCommand body.\n',
      'AGENTS.md': '<!-- wolf:onboarding v2 -->\n\n# Agent brief\n\nOnboarding text.\n<!-- /wolf:onboarding -->\n',
    });
    const proj = mkTmp('wolf-check-proj-');
    await new OpencodeBaseSetRenderer(v1, { setVersion: '2.18.5' }).renderBaseSet(proj, { models: 'omit' });

    // дрейф проекта: steward удалён, complain затёрт чужим unstamped-контентом,
    // executor-lead локально правлен после рендера (свидетель не совпадает)
    rmSync(join(proj, '.opencode/agents/steward.md'));
    writeFileSync(join(proj, '.opencode/command/complain.md'), '# My own command\n\nNot wolf.\n');
    const lead = join(proj, '.opencode/agents/executor-lead.md');
    writeFileSync(lead, `${readFileSync(lead, 'utf-8')}<!-- local edit -->\n`);

    const before = takeParkSnapshot(proj);
    // сверка при том же set=, что фиксация: цель «identical» — совпадение тела,
    // различия тел — от смены шаблонов v1→v2 (не от версии штампа)
    const outcomesNew = await new OpencodeBaseSetRenderer(v2, { setVersion: '2.18.5' }).inspectBaseSet(proj, {
      models: 'omit',
    });
    const after = takeParkSnapshot(proj);

    const byFile = new Map(outcomesNew.map((o) => [o.file, o.action]));
    expect(byFile.get('.opencode/agents/mr-wolf.md')).toBe('differs'); // шаблон ушёл, свидетелей правки нет
    expect(byFile.get('.opencode/agents/executor-lead.md')).toBe('mutated'); // правлен после рендера
    expect(byFile.get('.opencode/agents/steward.md')).toBe('missing');
    expect(byFile.get('.opencode/command/complain.md')).toBe('foreign'); // unstamped (wx-политика)
    expect(byFile.get('.opencode/skills/using-skills/SKILL.md')).toBe('identical');
    expect(byFile.get('AGENTS.md')).toBe('identical'); // маркер-блок равен текущему рендеру

    // 0 мутаций: слепок байт-в-байт, включая .opencode/wolf-sync-state.json
    const diff = diffParkSnapshots(before, after);
    expect(diff.addedFiles).toEqual([]);
    expect(diff.removedFiles).toEqual([]);
    expect(diff.changedFiles).toEqual([]);
  });
});

/* ---------- --json (T11, REQ-11, design §4.13): wolf.upgrade.check/1 ---------- */

describe('--json --check: единственный документ, паритет с текстом', () => {
  it('R11-5: runUpgradeCheck отдаёт wolf.upgrade.check/1 с теми же классами, details и protections', async () => {
    const park = mkTmp('wolf-check-json-');
    const proj = join(park, 'p-json');
    mkdirSync(proj, { recursive: true });
    const res = await runUpgradeCheck(
      checkDeps({
        registry: { listStrict: async () => [{ path: proj, schema_version: 2, initialized_at: 't' }] },
        inspect: async () => [
          { file: CHANGED_REL, action: 'mutated' },
          { file: NEW_REL, action: 'differs' },
          { file: UNCHANGED_REL, action: 'identical' },
          { file: DEPRECATED_REL, action: 'identical' },
          { file: AGENTS_MD, action: 'foreign', detail: 'onboarding markers broken' },
        ],
        protections: async () => [
          {
            project: proj,
            file: CHANGED_REL,
            value: '2.18.5',
            recognized: true,
            stamp: '2.18.5',
            base: '2.19.0',
            behind: true,
          },
        ],
        diverged: [{ project: 'p-json', face: 'faces/executor-lead.md', version: '2', ownerSkill: 'executor-lead' }],
      })
    );
    expect(res.exitCode).toBe(0);
    expect(res.json.schema).toBe('wolf.upgrade.check/1');
    expect(res.json.exit).toBe(0);
    expect(res.json.cli).toEqual({ installed: '2.18.5', available: '2.19.0' });
    expect(res.json.projects).toHaveLength(1);
    expect(res.json.projects[0]).toMatchObject({
      name: 'p-json',
      class: 'needs-decision',
      differ: [NEW_REL],
      mutated: [CHANGED_REL],
      foreign: [AGENTS_MD],
      details: ['onboarding markers broken'],
    });
    expect(res.json.protections).toEqual([
      { project: 'p-json', path: CHANGED_REL, value: '2.18.5', recognized: true, behind: true },
    ]);
    expect(res.json.diverged).toEqual([
      { project: 'p-json', face: 'faces/executor-lead.md', version: '2', ownerSkill: 'executor-lead' },
    ]);
    // текст и JSON из одного прохода: differ/mutated — те же пути
    const text = plain(res);
    expect(text).toContain(`1 differ: ${NEW_REL}`);
    expect(text).toContain(`mutated: ${CHANGED_REL}`);
  });

  it('R11-5: commander --json --check — в stdout ровно один JSON-документ, без человеческих строк', async () => {
    const home = mkTmp('wolf-check-json-cli-');
    const shimDir = join(home, 'npm-shim');
    mkdirSync(shimDir, { recursive: true });
    const shim = join(shimDir, 'npm');
    writeFileSync(shim, "#!/bin/sh\nprintf '%s\\n' 9.9.9\n");
    chmodSync(shim, 0o755);

    const out: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((c: string) => {
      out.push(String(c));
      return true;
    }) as typeof process.stdout.write);
    const prevPath = process.env.PATH;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    process.env.PATH = `${shimDir}:${prevPath ?? ''}`;
    process.env.XDG_CONFIG_HOME = join(home, '.config');
    try {
      const program = new Command();
      program.addCommand(memoryUpgradeCommand());
      await program.parseAsync(['node', 'wolf', 'upgrade', '--check', '--json'], { from: 'node' });
    } finally {
      process.env.PATH = prevPath;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
      writeSpy.mockRestore();
    }
    const stdout = out.join('');
    expect(stdout.trim().split('\n')).toHaveLength(1);
    const doc = JSON.parse(stdout) as Record<string, unknown>;
    expect(doc).toMatchObject({ schema: 'wolf.upgrade.check/1', exit: 0 });
    expect(doc['cli']).toEqual({ installed: expect.any(String), available: '9.9.9' });
    expect(doc['projects']).toEqual([]);
    expect(stdout).not.toContain('wolf upgrade — check');
  });
});

describe('--json: несовместимая пара с --review (design §4.18)', () => {
  it('R11-5: --review --json → error и exit 1, второй документ не печатается', async () => {
    const program = new Command();
    program.addCommand(memoryUpgradeCommand());
    await expect(
      program.parseAsync(['node', 'wolf', 'upgrade', '--review', '--json'], { from: 'node' })
    ).rejects.toThrow(/--review is interactive; --json is not supported/);
  });
});
