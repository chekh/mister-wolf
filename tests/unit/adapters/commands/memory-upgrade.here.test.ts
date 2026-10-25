// tests/unit/adapters/commands/memory-upgrade.here.test.ts
// T9 (волна 2.19.0, REQ-14, design §«--here», §«Exit-модель», §«Список
// подтверждения»): runUpgradeHere — guard R14.3 (.wolf/memory), одиночное
// подтверждение по правилам REQ-02 (--yes / не-TTY / TTY-decline), exit-модель
// одного проекта (0 Done / 2 Done with attention / 1 Failed), confirmedRemovals
// = все removed-цели карты, статус-словарь T7 (statusOf). Моки runStep/
// makeStepDeps; полный шаг на реальных адаптерах — integration/upgrade-here.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { Command } from 'commander';
import {
  memoryUpgradeCommand,
  runUpgradeHere,
  runUpgradeReview,
  upgradeRoute,
  type ReviewIo,
  type UpgradeHereDeps,
  type UpgradeHereResult,
  type UpgradeResolveDeps,
} from '../../../../src/adapters/cli/commands/memory-upgrade.js';
import { UserFacingError } from '../../../../src/domain/errors.js';
import {
  runProjectStep,
  type ProjectReport,
  type ProjectStepDeps,
} from '../../../../src/app/use-cases/project-step.js';
import { projectPath } from '../../../../src/app/use-cases/verify-against-map.js';
import { parseProtect } from '../../../../src/domain/protect-key.js';
import { takeParkSnapshot } from '../../../helpers/park-snapshot.js';
import { statusOf, STATUS_TEXT } from '../../../../src/app/use-cases/upgrade-projects.js';
import { renderReport } from '../../../../src/adapters/cli/report-renderer.js';
import type { UpdateMap } from '../../../../src/adapters/fs/update-map.js';

/** Мини-карта (прецедент T7 unit): 2 removed — проверка confirmedRemovals. */
const MINI_MAP: UpdateMap = {
  version: '2.19.0',
  prev: '2.18.5',
  files: [
    { path: 'base/agents/executor-lead.md', kind: 'agent', category: 'new' },
    { path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'changed' },
    { path: 'base/skills/using-skills/SKILL.md', kind: 'skill', category: 'unchanged' },
    { path: 'base/commands/complain.md', kind: 'command', category: 'deprecated' },
    { path: 'base/skills/gone-one/SKILL.md', kind: 'skill', category: 'removed' },
    { path: 'base/skills/gone-two/SKILL.md', kind: 'skill', category: 'removed' },
  ],
  faces: [
    { template: 'base/playbooks/executor-lead-playbook.md', owner_skill: 'executor-lead', category: 'new', seed: true },
    { template: 'base/playbooks/wolf-review-lenses.md', owner_skill: 'mr-wolf', category: 'deprecated', seed: false },
  ],
  agents_md: { category: 'changed', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: [],
};

/** Отчёт шага-заглушки: только поля, по которым строятся статус и детали. */
function stepReport(root: string, over: Partial<ProjectReport> = {}): ProjectReport {
  return {
    name: basename(root),
    root,
    sync: { outcomes: [], orphaned: [], removed: [] },
    seed: [],
    schema: { status: 'ok' },
    verify: { items: [], summary: { byCode: {}, needsDecision: 0, errors: 0 } },
    wallMs: 1,
    exitKind: 'done',
    ...over,
  };
}

/** Признак статуса updated: фактическое действие фазы sync (словарь T7). */
const CHANGED_SYNC = {
  outcomes: [{ file: '.opencode/agents/mr-wolf.md', action: 'updated' as const }],
  orphaned: [],
  removed: [],
};

/** Мок шага: возвращает отчёт-заглушку и фиксирует аргументы вызова. */
function fakeRunStep(over: Partial<ProjectReport> = { sync: CHANGED_SYNC }): ReturnType<typeof vi.fn> {
  return vi.fn(async (_deps: ProjectStepDeps, root: string): Promise<ProjectReport> => stepReport(root, over));
}

function hereDeps(cwd: string, over: Partial<UpgradeHereDeps> = {}): UpgradeHereDeps {
  return {
    cwd,
    loadMap: () => MINI_MAP,
    makeStepDeps: vi.fn(() => ({}) as ProjectStepDeps),
    ...over,
  };
}

/** Plain-рендер — оракул строк (прецедент T7). */
const plain = (res: UpgradeHereResult): string => renderReport(res.report, { tty: false, colors: 'mono', width: 400 });

describe('runUpgradeHere (T9: --here, REQ-14)', () => {
  let proj: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'wolf-here-'));
    mkdirSync(join(proj, '.wolf', 'memory'), { recursive: true }); // живая память в cwd
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
  });

  it('R14.3: cwd без .wolf/memory — UserFacingError с подсказкой init, шаг не собирается', async () => {
    const runStep = fakeRunStep();
    const empty = mkdtempSync(join(tmpdir(), 'wolf-here-empty-'));
    try {
      // даже .wolf без memory — не проект (guard именно на .wolf/memory)
      mkdirSync(join(empty, '.wolf'), { recursive: true });
      await expect(
        runUpgradeHere(hereDeps(empty, { runStep: runStep as unknown as typeof runProjectStep }))
      ).rejects.toThrow(UserFacingError);
      await expect(
        runUpgradeHere(hereDeps(empty, { runStep: runStep as unknown as typeof runProjectStep }))
      ).rejects.toThrow(/run wolf init first/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    expect(runStep).not.toHaveBeenCalled();
  });

  it('подтверждение (REQ-02): --yes — без вопросов, шаг выполнен, exit 0 Done', async () => {
    const runStep = fakeRunStep();
    const confirm = vi.fn(async () => true);
    const res = await runUpgradeHere(hereDeps(proj, { runStep: runStep as unknown as typeof runProjectStep }), {
      yes: true,
      tty: true,
      confirm,
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(runStep).toHaveBeenCalledOnce();
    expect(res.exitCode).toBe(0);
    const lines = plain(res).split('\n');
    expect(lines).toContain('ok: Done'); // финальная строка exit-таблицы (не attention/failed)
  });

  it('подтверждение (REQ-02): не-TTY без --yes — «Cancelled: --yes is required», exit 0, шаг не выполнен', async () => {
    const runStep = fakeRunStep();
    const makeStepDeps = vi.fn(() => ({}) as ProjectStepDeps);
    const res = await runUpgradeHere(
      hereDeps(proj, { runStep: runStep as unknown as typeof runProjectStep, makeStepDeps }),
      {
        yes: false,
        tty: false,
      }
    );

    expect(res.exitCode).toBe(0);
    expect(plain(res)).toContain('Cancelled: --yes is required');
    expect(plain(res)).toContain('plan: '); // одиночный план показан
    expect(runStep).not.toHaveBeenCalled();
    expect(makeStepDeps).not.toHaveBeenCalled();
  });

  it('подтверждение (REQ-02): TTY confirm(план-узел) отклонён — «Cancelled — no changes», exit 0', async () => {
    const runStep = fakeRunStep();
    const confirm = vi.fn(async () => false);
    const res = await runUpgradeHere(hereDeps(proj, { runStep: runStep as unknown as typeof runProjectStep }), {
      yes: false,
      tty: true,
      confirm,
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'section' })); // plans-узел (прецедент T7)
    expect(res.exitCode).toBe(0);
    expect(plain(res)).toContain('Cancelled — no changes');
    expect(runStep).not.toHaveBeenCalled();
  });

  it('exit-модель: needs-decision → 2 «Done with attention»; шаг throw → 1 «Failed»; без banner', async () => {
    const decision = await runUpgradeHere(
      hereDeps(proj, {
        runStep: fakeRunStep({
          verify: { items: [], summary: { byCode: {}, needsDecision: 1, errors: 0 } },
          exitKind: 'needs-decision',
        }) as unknown as typeof runProjectStep,
      }),
      { yes: true }
    );
    expect(decision.exitCode).toBe(2);
    expect(plain(decision).split('\n')).toContain('warn: Done with attention');
    expect(decision.report.kind).toBe('section'); // REQ-14: отчёт одного проекта без banner

    const boom = fakeRunStep();
    boom.mockRejectedValue(new Error('step exploded'));
    const failed = await runUpgradeHere(hereDeps(proj, { runStep: boom as unknown as typeof runProjectStep }), {
      yes: true,
    });
    expect(failed.exitCode).toBe(1);
    expect(plain(failed).split('\n')).toContain('error: Failed');
    expect(plain(failed)).toContain(`${basename(proj)} — error: step exploded`);
  });

  it('exit-модель: schema refused → статус error, «schema: refused» в деталях, exit 1', async () => {
    const res = await runUpgradeHere(
      hereDeps(proj, {
        runStep: fakeRunStep({
          schema: { status: 'refused', error: 'schema from the future' },
          verify: { items: [], summary: { byCode: {}, needsDecision: 0, errors: 1 } },
          exitKind: 'error',
        }) as unknown as typeof runProjectStep,
      }),
      { yes: true }
    );

    expect(res.exitCode).toBe(1);
    expect(plain(res).split('\n')).toContain('error: Failed');
    expect(plain(res)).toContain('schema: refused — schema from the future');
  });

  it('confirmedRemovals: шаг получает все removed-цели карты (ADR-4), root = cwd', async () => {
    const runStep = fakeRunStep();
    await runUpgradeHere(hereDeps(proj, { runStep: runStep as unknown as typeof runProjectStep }), { yes: true });

    expect(runStep).toHaveBeenCalledWith(expect.anything(), proj, MINI_MAP, {
      confirmedRemovals: MINI_MAP.files.filter((f) => f.category === 'removed').map(projectPath),
    });
  });

  it('статус-словарь = T7 statusOf: done без действий → up-to-date; с действиями → updated', async () => {
    const idle = await runUpgradeHere(
      hereDeps(proj, { runStep: fakeRunStep({}) as unknown as typeof runProjectStep }),
      { yes: true }
    );
    expect(statusOf(stepReport(proj))).toBe('up-to-date'); // словарь T7 (санити-якорь)
    expect(plain(idle)).toContain(`${basename(proj)} — ${STATUS_TEXT['up-to-date']}`);
    expect(idle.exitCode).toBe(0);

    const active = await runUpgradeHere(
      hereDeps(proj, { runStep: fakeRunStep() as unknown as typeof runProjectStep }),
      {
        yes: true,
      }
    );
    expect(statusOf(stepReport(proj, { sync: CHANGED_SYNC }))).toBe('updated');
    expect(plain(active)).toContain(`${basename(proj)} — updated`);
    expect(active.exitCode).toBe(0);
  });
});

/* ---------- диспетчеризация §4.18: --resolve в фазе 1 (T7) ---------- */

describe('upgradeRoute: порядок режимов и несовместимые пары (§4.18)', () => {
  it('--check сильнее --here; --resolve — отдельный режим; --yes/--check с --resolve — ошибка', () => {
    expect(upgradeRoute({ check: true, here: true })).toEqual({ mode: 'check' });
    expect(upgradeRoute({ resolve: ['1=keep'] })).toEqual({ mode: 'resolve' });
    expect(upgradeRoute({ resolve: ['1=keep'], here: true })).toEqual({ mode: 'resolve' });
    expect(upgradeRoute({ here: true })).toEqual({ mode: 'here' });
    expect(upgradeRoute({})).toEqual({ mode: 'pass' });
    expect(upgradeRoute({ resolve: ['3=protect'], yes: true }).error).toMatch(/--yes describes a pass/);
    expect(upgradeRoute({ resolve: ['3=protect'], check: true }).error).toMatch(/--check is read-only/);
  });
});

describe('--resolve (commander): решение не теряется и npm-фаза не запускается (R06-9)', () => {
  it('парковый --resolve на пустом реестре: exit 1 по неизвестной цели, npm не позван', async () => {
    const home = mkdtempSync(join(tmpdir(), 'wolf-resolve-cli-'));
    const shimDir = join(home, 'npm-shim');
    const marker = join(home, 'npm-was-called');
    mkdirSync(shimDir, { recursive: true });
    const shim = join(shimDir, 'npm');
    writeFileSync(shim, `#!/bin/sh\ntouch '${marker}'\nprintf '%s\\n' 9.9.9\n`);
    chmodSync(shim, 0o755);

    const out: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((c: string) => {
      out.push(String(c));
      return true;
    }) as typeof process.stdout.write);
    const prevPath = process.env.PATH;
    const prevXdg = process.env.XDG_CONFIG_HOME;
    const prevExit = process.exitCode;
    process.env.PATH = `${shimDir}:${prevPath ?? ''}`;
    process.env.XDG_CONFIG_HOME = join(home, '.config'); // пустой изолированный реестр
    try {
      const program = new Command();
      program.addCommand(memoryUpgradeCommand());
      await program.parseAsync(['node', 'wolf', 'upgrade', '--resolve', '1=keep', '--resolve', '1=keep'], {
        from: 'node',
      });
    } finally {
      process.env.PATH = prevPath;
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevXdg;
      writeSpy.mockRestore();
    }
    const exitCode = process.exitCode;
    process.exitCode = prevExit;

    expect(existsSync(marker)).toBe(false); // npm-фаза не выполнялась (флаг не потерян)
    expect(exitCode).toBe(1);
    const text = out.join('\n');
    expect(text).toContain('unknown target 1'); // режим resolve дошёл до разбора, а не до npm
    expect(text).toContain('Failed');
    rmSync(home, { recursive: true, force: true });
  });

  it('несовместимая пара --resolve --yes: UserFacingError, записей нет', async () => {
    const program = new Command();
    program.addCommand(memoryUpgradeCommand());
    await expect(
      program.parseAsync(['node', 'wolf', 'upgrade', '--resolve', '3=protect', '--yes'], { from: 'node' })
    ).rejects.toThrow(/--yes describes a pass/);
  });
});

describe('upgradeRoute: --show и несовместимые пары (T8, §4.10/§4.18)', () => {
  it('--show — read-only режим до --resolve/--here; пары с --yes/--check/--resolve — ошибка', () => {
    expect(upgradeRoute({ show: '.opencode/agents/x.md' })).toEqual({ mode: 'show' });
    expect(upgradeRoute({ show: '1', here: true })).toEqual({ mode: 'show' }); // --here сужает проект
    expect(upgradeRoute({ show: 'x.md', resolve: ['1=keep'] }).error).toMatch(/--show views a file/);
    expect(upgradeRoute({ show: 'x.md', yes: true }).error).toMatch(/--yes describes a pass/);
    expect(upgradeRoute({ show: 'x.md', check: true }).error).toMatch(/different read-only modes/);
  });
});

/* ---------- --review (T9, REQ-07, design §4.9): TTY-цикл и non-TTY рецепт ---------- */

const REVIEW_MAP: UpdateMap = {
  version: '2.19.0',
  prev: '2.17.1',
  files: [
    { path: 'base/agents/a.md', kind: 'agent', category: 'changed' },
    { path: 'base/agents/b.md', kind: 'agent', category: 'changed' },
    { path: 'base/agents/c.md', kind: 'agent', category: 'changed' },
    { path: 'base/skills/s/SKILL.md', kind: 'skill', category: 'changed' },
  ],
  faces: [],
  agents_md: { category: 'unchanged', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: [],
};

const REVIEW_FILES: Record<string, string> = {
  '.opencode/agents/a.md': '---\nname: a\n---\n# A local\n',
  '.opencode/agents/b.md': '---\nname: b\n---\n# B local\n',
  '.opencode/agents/c.md': '---\nname: c\n---\n# C local\n',
  '.opencode/skills/s/SKILL.md': '---\nname: s\n---\n# S local\n',
};

const REVIEW_FRESH: Record<string, string> = {
  '.opencode/agents/a.md': '---\nname: a\n---\n# A base\n',
  '.opencode/agents/b.md': '---\nname: b\n---\n# B base\n',
  '.opencode/agents/c.md': '---\nname: c\n---\n# C base\n',
  '.opencode/skills/s/SKILL.md': '---\nname: s\n---\n# S base\n',
};

/** Проект-фикстура ревью: файлы на диске + read-only инспекция по факту. */
function reviewProject(files: Record<string, string> = REVIEW_FILES): string {
  const proj = mkdtempSync(join(tmpdir(), 'wolf-review-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(proj, rel, '..'), { recursive: true });
    writeFileSync(join(proj, rel), content);
  }
  mkdirSync(join(proj, '.opencode'), { recursive: true });
  return proj;
}

function reviewDeps(proj: string, over: Partial<UpgradeResolveDeps> = {}): UpgradeResolveDeps {
  return {
    here: proj,
    loadMap: () => REVIEW_MAP,
    inspect: async (root) =>
      REVIEW_MAP.files.map((entry) => {
        const rel = projectPath(entry);
        const abs = join(root, rel);
        if (!existsSync(abs)) return { file: rel, action: 'missing' as const };
        const content = readFileSync(abs, 'utf-8');
        if (parseProtect(content).held) return { file: rel, action: 'protected' as const, protected: true as const };
        return { file: rel, action: content === REVIEW_FRESH[rel] ? ('identical' as const) : ('mutated' as const) };
      }),
    renderer: { renderFreshFile: (_root: string, rel: string) => REVIEW_FRESH[rel] ?? null },
    ...over,
  };
}

interface FakeIo extends ReviewIo {
  out: string[];
}

function fakeIo(tty: boolean, answers: Array<string | null>): FakeIo {
  const out: string[] = [];
  return {
    tty,
    out,
    write: (text) => out.push(text),
    ask: async () => (answers.length > 0 ? answers.shift()! : null),
  };
}

describe('runUpgradeReview (T9): TTY-цикл, non-TTY рецепт, diverged', () => {
  it('R07-1: TTY, выбор p → protect дописан, файл больше не решение, exit 0', async () => {
    const proj = reviewProject({ '.opencode/agents/a.md': REVIEW_FILES['.opencode/agents/a.md']! });
    const io = fakeIo(true, ['p']);
    const res = await runUpgradeReview(reviewDeps(proj), { here: true, cwd: proj, io });

    expect(res.exitCode).toBe(0);
    expect(res.applied).toHaveLength(1);
    expect(res.applied[0]).toMatchObject({ verb: 'protect', file: '.opencode/agents/a.md' });
    expect(parseProtect(readFileSync(join(proj, '.opencode/agents/a.md'), 'utf-8')).held).toBe(true);
    expect(io.out.join('')).toContain('[1/1] ');
    expect(io.out.join('')).toContain('[t]ake [k]eep [p]rotect [v]pin [s]kip');
    rmSync(proj, { recursive: true, force: true });
  });

  it('R07-3: «ко всем похожим» — 3 agent/mutated применены, skill остался; перечень до применения', async () => {
    const proj = reviewProject();
    const io = fakeIo(true, ['t', 'y']);
    const res = await runUpgradeReview(reviewDeps(proj), { here: true, cwd: proj, io });

    expect(res.exitCode).toBe(2); // skill/mutated остался решением
    expect(res.applied.map((a) => a.file).sort()).toEqual([
      '.opencode/agents/a.md',
      '.opencode/agents/b.md',
      '.opencode/agents/c.md',
    ]);
    for (const rel of ['.opencode/agents/a.md', '.opencode/agents/b.md', '.opencode/agents/c.md']) {
      expect(readFileSync(join(proj, rel), 'utf-8')).toBe(REVIEW_FRESH[rel]);
    }
    expect(readFileSync(join(proj, '.opencode/skills/s/SKILL.md'), 'utf-8')).toBe(
      REVIEW_FILES['.opencode/skills/s/SKILL.md']
    );
    const text = io.out.join('');
    expect(text).toContain('apply "take" to 2 more agent/mutated?');
    expect(text).toContain('  .opencode/agents/b.md'); // перечень целей до применения
  });

  it('R07-4: q и EOF завершают цикл — принятые решения остаются, остальные не тронуты', async () => {
    const proj = reviewProject();
    const quitIo = fakeIo(true, ['t', 'n', 'q']);
    const quit = await runUpgradeReview(reviewDeps(proj), { here: true, cwd: proj, io: quitIo });
    expect(quit.exitCode).toBe(2); // b/c agent + skill остались
    expect(quit.applied.map((a) => a.file)).toEqual(['.opencode/agents/a.md']);
    expect(readFileSync(join(proj, '.opencode/agents/b.md'), 'utf-8')).toBe(REVIEW_FILES['.opencode/agents/b.md']);

    const eofIo = fakeIo(true, [null]);
    const eof = await runUpgradeReview(reviewDeps(proj), { here: true, cwd: proj, io: eofIo });
    expect(eof.exitCode).toBe(2);
    expect(eof.applied).toEqual([]);
    expect(eofIo.out.join('')).toContain('Done with attention');
    rmSync(proj, { recursive: true, force: true });
  });

  it('R07-2/R07-6: non-TTY — список с готовой командой --resolve, exit 2, без записей; пусто → 0', async () => {
    const proj = reviewProject();
    const io = fakeIo(false, []);
    const before = takeParkSnapshot(proj);
    const res = await runUpgradeReview(reviewDeps(proj), { here: true, cwd: proj, io });

    expect(res.exitCode).toBe(2);
    expect(res.applied).toEqual([]);
    const text = renderReport(res.report, { tty: false, colors: 'mono', width: 400 });
    expect(text).toContain('review (non-interactive): 4 files need a decision');
    expect(text).toMatch(/1\s+\S+\s+\.opencode\/agents\/a\.md\s+mutated\s+base 2\.19\.0/);
    expect(text).toContain('wolf upgrade --here --resolve 1=take --resolve 2=take');
    expect(text).toContain('wolf upgrade --here --show 1');
    expect(takeParkSnapshot(proj)).toEqual(before); // ни одного байта

    const clean = reviewProject(
      Object.fromEntries(Object.entries(REVIEW_FRESH).map(([rel, content]) => [rel, content]))
    );
    const empty = await runUpgradeReview(reviewDeps(clean), { here: true, cwd: clean, io: fakeIo(false, []) });
    expect(empty.exitCode).toBe(0);
    expect(renderReport(empty.report, { tty: false, colors: 'mono', width: 400 })).toContain('no decisions');
    rmSync(proj, { recursive: true, force: true });
    rmSync(clean, { recursive: true, force: true });
  });

  it('R07-5/N01-3: diverged — отдельная секция steward zone, держит exit 2; глагол не предлагается', async () => {
    const proj = reviewProject({
      '.opencode/agents/a.md': REVIEW_FRESH['.opencode/agents/a.md']!,
      '.opencode/agents/b.md': REVIEW_FRESH['.opencode/agents/b.md']!,
      '.opencode/agents/c.md': REVIEW_FRESH['.opencode/agents/c.md']!,
      '.opencode/skills/s/SKILL.md': REVIEW_FRESH['.opencode/skills/s/SKILL.md']!,
    });
    const deps = reviewDeps(proj, {
      loadMap: () => ({
        ...REVIEW_MAP,
        faces: [
          {
            template: 'base/playbooks/executor-lead-playbook.md',
            owner_skill: 'executor-lead',
            category: 'new',
            seed: true,
          },
        ],
      }),
      liveFaces: async () => [
        { ownerSkill: 'executor-lead', version: '2', body: 'Local body.\n', initiator: 'steward' },
      ],
      faceTemplates: new Map([['executor-lead-playbook.md', '---\nowner_skill: executor-lead\n---\nTemplate body.\n']]),
    });
    const nonTty = await runUpgradeReview(deps, { here: true, cwd: proj, io: fakeIo(false, []) });
    expect(nonTty.exitCode).toBe(2);
    const text = renderReport(nonTty.report, { tty: false, colors: 'mono', width: 400 });
    expect(text).toContain('steward zone (not addressable by --resolve): 1');
    expect(text).toContain('faces/executor-lead.md  diverged  v2');
    expect(text).not.toContain('--resolve 1=take'); // решений нет — рецепт не печатается

    const tty = await runUpgradeReview(deps, { here: true, cwd: proj, io: fakeIo(true, []) });
    expect(tty.exitCode).toBe(2);
    rmSync(proj, { recursive: true, force: true });
  });
});
