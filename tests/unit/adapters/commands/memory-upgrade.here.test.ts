// tests/unit/adapters/commands/memory-upgrade.here.test.ts
// T9 (волна 2.19.0, REQ-14, design §«--here», §«Exit-модель», §«Список
// подтверждения»): runUpgradeHere — guard R14.3 (.wolf/memory), одиночное
// подтверждение по правилам REQ-02 (--yes / не-TTY / TTY-decline), exit-модель
// одного проекта (0 Done / 2 Done with attention / 1 Failed), confirmedRemovals
// = все removed-цели карты, статус-словарь T7 (statusOf). Моки runStep/
// makeStepDeps; полный шаг на реальных адаптерах — integration/upgrade-here.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import {
  runUpgradeHere,
  type UpgradeHereDeps,
  type UpgradeHereResult,
} from '../../../../src/adapters/cli/commands/memory-upgrade.js';
import { UserFacingError } from '../../../../src/domain/errors.js';
import {
  runProjectStep,
  type ProjectReport,
  type ProjectStepDeps,
} from '../../../../src/app/use-cases/project-step.js';
import { projectPath } from '../../../../src/app/use-cases/verify-against-map.js';
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
