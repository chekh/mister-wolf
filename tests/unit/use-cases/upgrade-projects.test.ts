// tests/unit/use-cases/upgrade-projects.test.ts
// T7 (волна 2.19.0, REQ-01/02/05/06/09, design §«Фазы», §«Список подтверждения»,
// §«Exit-модель», §«Гварды прохода»): оркестратор прохода парка — планы,
// подтверждение, счётчики, exit 0/1/2, lock, дедуп, скан. Юнит-уровень —
// моки registry/runStep/scan/lock; полные сценарии на реальных деревьях —
// integration/upgrade-park.test.ts. Строки test-plan: R01.2, R02.1-R02.4,
// R05.2, R06.2, R06.3, R11.6, R13.1 (статусная часть), R09 (wiring).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import {
  runUpgradeProjects,
  type UpgradeProjectsDeps,
  type UpgradeRunResult,
} from '../../../src/app/use-cases/upgrade-projects.js';
import { runProjectStep, type ProjectReport, type ProjectStepDeps } from '../../../src/app/use-cases/project-step.js';
import { renderReport } from '../../../src/adapters/cli/report-renderer.js';
import type { UpdateMap } from '../../../src/adapters/fs/update-map.js';
import type { RegisteredProject } from '../../../src/adapters/fs/projects-registry.js';
import type { ScanResult } from '../../../src/app/use-cases/scan-unregistered.js';

/** Мини-карта юнит-контура (test-plan §«Фикстуры»): категории new/changed/
 * unchanged/deprecated/removed; removed 2 + deprecated 1 — счётчики R05.2. */
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

const entry = (path: string, pinned = false): RegisteredProject => ({
  path,
  schema_version: 2,
  initialized_at: '2026-01-01T00:00:00.000Z',
  ...(pinned ? { pinned: true } : {}),
});

const registryOf = (list: RegisteredProject[]): { listStrict(): Promise<RegisteredProject[]> } => ({
  listStrict: async () => list,
});

/** Отчёт шага-заглушки: только поля, по которым оркестратор строит статус. */
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

/** Признак статуса updated: фактическое действие фазы sync этого прохода. */
const CHANGED_SYNC = {
  outcomes: [{ file: '.opencode/agents/mr-wolf.md', action: 'updated' as const }],
  orphaned: [],
  removed: [],
};
const decisionSummary = { byCode: {}, needsDecision: 1, errors: 0 };

/** Мок шага: по basename(root) выбирает отчёт (по умолчанию — «updated»). */
function fakeRunStep(
  byRoot: Record<string, Partial<ProjectReport>> = {},
  fallback: Partial<ProjectReport> = { sync: CHANGED_SYNC }
): typeof runProjectStep {
  const impl = async (_deps: ProjectStepDeps, root: string): Promise<ProjectReport> =>
    stepReport(root, byRoot[basename(root)] ?? fallback);
  return vi.fn(impl) as unknown as typeof runProjectStep;
}

function makeDeps(over: Partial<UpgradeProjectsDeps> = {}): UpgradeProjectsDeps {
  return {
    makeStepDeps: () => ({}) as ProjectStepDeps,
    registry: registryOf([]),
    loadMap: () => MINI_MAP,
    ...over,
  };
}

/** Plain-рендер отчёта — оракул строк (ADR-6: plain = snapshot-режим). */
const plain = (res: UpgradeRunResult): string => renderReport(res.report, { tty: false, colors: 'mono', width: 400 });
const count = (res: UpgradeRunResult, label: string): number | undefined =>
  res.counters.find((c) => c.label === label)?.count;

describe('runUpgradeProjects (T7: оркестратор прохода парка)', () => {
  let projA: string;
  let projB: string;

  beforeEach(() => {
    projA = mkdtempSync(join(tmpdir(), 'wolf-upg-a-'));
    projB = mkdtempSync(join(tmpdir(), 'wolf-upg-b-'));
  });
  afterEach(() => {
    rmSync(projA, { recursive: true, force: true });
    rmSync(projB, { recursive: true, force: true });
  });

  it('R01.2: пустой реестр — «проектов нет» + подсказка, exit 0, шаги не идут', async () => {
    const runStep = fakeRunStep();
    const res = await runUpgradeProjects(makeDeps({ runStep }), { yes: true });

    expect(res.exitCode).toBe(0);
    const text = plain(res);
    expect(text).toContain('no projects in the registry');
    expect(text).toContain('Done: no projects');
    expect(runStep).not.toHaveBeenCalled();
  });

  it('R02.1: TTY-отклонение confirm — «Cancelled», exit 0, runStep и скан не вызваны', async () => {
    const runStep = fakeRunStep();
    const scan = vi.fn(async (): Promise<ScanResult> => null);
    const confirm = vi.fn(async () => false);
    const res = await runUpgradeProjects(
      makeDeps({ runStep, scan, registry: registryOf([entry(projA), entry(projB)]) }),
      { yes: false, tty: true, confirm }
    );

    expect(res.exitCode).toBe(0);
    const text = plain(res);
    expect(confirm).toHaveBeenCalledOnce();
    // список передан confirm аргументом — caller показывает его ДО вопроса (REQ-02)
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'section' }));
    expect(text).toContain('plan: '); // список выведен до подтверждения
    expect(text).toContain('Cancelled — no changes');
    expect(text).not.toContain('— updated'); // проектов не касались
    expect(runStep).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled(); // скан — только после сводного отчёта прохода
  });

  it('R02.2: --yes — confirm не вызывается, шаги идут по всем активным планам', async () => {
    const runStep = fakeRunStep();
    const confirm = vi.fn(async () => true);
    const res = await runUpgradeProjects(makeDeps({ runStep, registry: registryOf([entry(projA), entry(projB)]) }), {
      yes: true,
      tty: true,
      confirm,
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(runStep).toHaveBeenCalledTimes(2);
    const text = plain(res);
    expect(text).toContain(`${basename(projA)} — updated`);
    expect(text).toContain('composition unknown → 2.19.0'); // справочная строка плана
    expect(res.exitCode).toBe(0);
  });

  it('R02.3: не-TTY без --yes (и TTY без confirm) — «Cancelled: --yes is required», шаги не идут', async () => {
    const runStep = fakeRunStep();
    const deps = makeDeps({ runStep, registry: registryOf([entry(projA)]) });

    const nonTty = await runUpgradeProjects(deps, { yes: false, tty: false });
    expect(nonTty.exitCode).toBe(0);
    expect(plain(nonTty)).toContain('Cancelled: --yes is required');
    expect(plain(nonTty)).toContain('plan: '); // список выведен, проход пропущен

    const ttyNoConfirm = await runUpgradeProjects(deps, { yes: false, tty: true });
    expect(ttyNoConfirm.exitCode).toBe(0);
    expect(plain(ttyNoConfirm)).toContain('Cancelled: --yes is required');
    expect(runStep).not.toHaveBeenCalled();
  });

  it('R02.4: missing-проект показан, пропущен, без остановки — остальные идут', async () => {
    const runStep = fakeRunStep();
    const missing = join(tmpdir(), 'wolf-upg-does-not-exist');
    const res = await runUpgradeProjects(makeDeps({ runStep, registry: registryOf([entry(missing), entry(projA)]) }), {
      yes: true,
    });

    const text = plain(res);
    expect(text).toContain(`plan: ${basename(missing)} · ${missing} · [missing] — skipped`);
    expect(runStep).toHaveBeenCalledTimes(1); // только существующий
    expect(text).toContain(`${basename(projA)} — updated`);
    expect(res.exitCode).toBe(0); // missing ≠ error (гварды прохода)
    expect(count(res, 'missing')).toBe(1);
    expect(count(res, 'updated')).toBe(1);
  });

  it('R13.1 (статусы): pinned показан со статусом, пропущен', async () => {
    const runStep = fakeRunStep();
    const res = await runUpgradeProjects(
      makeDeps({ runStep, registry: registryOf([entry(projA, true), entry(projB)]) }),
      { yes: true }
    );

    const text = plain(res);
    expect(text).toContain(`plan: ${basename(projA)} · ${realpathSync(projA)} · [pinned] — skipped`);
    expect(runStep).toHaveBeenCalledTimes(1); // только непиннованный
    expect(count(res, 'pinned')).toBe(1);
  });

  it('R05.2: счётчики категорий из карты фикстуры — removed 2, deprecated 1', async () => {
    const res = await runUpgradeProjects(makeDeps({ runStep: fakeRunStep(), registry: registryOf([entry(projA)]) }), {
      yes: true,
    });

    expect(count(res, 'removed')).toBe(2);
    expect(count(res, 'deprecated')).toBe(1);
    expect(count(res, 'new')).toBe(1);
    expect(count(res, 'changed')).toBe(1);
    expect(plain(res)).toContain('map: 1 new · 1 changed · 1 deprecated · 2 removed'); // строка плана
  });

  it('R06.2: 0 error + ≥1 «требует решения» → exit 2, «Done with attention»', async () => {
    const runStep = fakeRunStep(
      { [basename(projA)]: { exitKind: 'needs-decision', verify: { items: [], summary: decisionSummary } } },
      { sync: CHANGED_SYNC }
    );
    const res = await runUpgradeProjects(makeDeps({ runStep, registry: registryOf([entry(projA), entry(projB)]) }), {
      yes: true,
    });

    expect(res.exitCode).toBe(2);
    const text = plain(res);
    expect(text).toContain(`${basename(projA)} — needs decision`);
    expect(text).toContain(`${basename(projB)} — updated`);
    expect(text).toContain('Done with attention');
  });

  it('R06.3: все успешны → exit 0, «Done»', async () => {
    const res = await runUpgradeProjects(
      makeDeps({ runStep: fakeRunStep(), registry: registryOf([entry(projA), entry(projB)]) }),
      { yes: true }
    );

    expect(res.exitCode).toBe(0);
    expect(plain(res)).toContain('Done');
    expect(count(res, 'errors')).toBe(0);
    expect(count(res, 'needs decision')).toBe(0);
  });

  it('R11.6: сводка содержит счётчики категорий + «требует решения»', async () => {
    const runStep = fakeRunStep(
      { [basename(projA)]: { exitKind: 'needs-decision', verify: { items: [], summary: decisionSummary } } },
      { sync: CHANGED_SYNC }
    );
    const res = await runUpgradeProjects(makeDeps({ runStep, registry: registryOf([entry(projA)]) }), { yes: true });

    const labels = res.counters.map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining(['new', 'changed', 'deprecated', 'removed', 'needs decision', 'errors', 'faces seeded'])
    );
    expect(count(res, 'needs decision')).toBe(1);
    expect(plain(res)).toContain('needs decision 1');
  });

  it('R06.1: ошибка шага (throw) не останавливает обход — error-строка проекта, exit 1', async () => {
    const runStep = vi.fn(async (_deps: ProjectStepDeps, root: string): Promise<ProjectReport> => {
      if (basename(root) === basename(projA)) throw new Error('step boom');
      return stepReport(root, { sync: CHANGED_SYNC });
    }) as unknown as typeof runProjectStep;
    const res = await runUpgradeProjects(makeDeps({ runStep, registry: registryOf([entry(projA), entry(projB)]) }), {
      yes: true,
    });

    expect(res.exitCode).toBe(1);
    const text = plain(res);
    expect(text).toContain(`${basename(projA)} — error: step boom`);
    expect(text).toContain(`${basename(projB)} — updated`);
    expect(text).toContain('Failed'); // финальная строка никогда не говорит Done при ошибке
    expect(count(res, 'errors')).toBe(1);
  });

  describe('lock параллельного upgrade', () => {
    it('acquire в начале, release в finally при успехе', async () => {
      const lock = { acquire: vi.fn((): boolean => true), release: vi.fn() };
      await runUpgradeProjects(
        makeDeps({ upgradeLock: lock, runStep: fakeRunStep(), registry: registryOf([entry(projA)]) }),
        { yes: true }
      );

      expect(lock.acquire).toHaveBeenCalledWith('wolf-upgrade');
      expect(lock.release).toHaveBeenCalledWith('wolf-upgrade');
    });

    it('release вызывается и при ошибке шага', async () => {
      const lock = { acquire: vi.fn((): boolean => true), release: vi.fn() };
      const runStep = vi.fn(async (): Promise<ProjectReport> => {
        throw new Error('boom');
      }) as unknown as typeof runProjectStep;
      await runUpgradeProjects(makeDeps({ upgradeLock: lock, runStep, registry: registryOf([entry(projA)]) }), {
        yes: true,
      });

      expect(lock.release).toHaveBeenCalledWith('wolf-upgrade');
    });

    it('живой lock → exit 1 с error-строкой, проекты не тронуты, release не трогает чужой lock', async () => {
      const lock = {
        acquire: vi.fn((): boolean => {
          throw new Error('upgrade already running');
        }),
        release: vi.fn(),
      };
      const runStep = fakeRunStep();
      const res = await runUpgradeProjects(
        makeDeps({ upgradeLock: lock, runStep, registry: registryOf([entry(projA)]) }),
        { yes: true }
      );

      expect(res.exitCode).toBe(1);
      const text = plain(res);
      expect(text).toContain('upgrade already running');
      expect(text).toContain('Failed');
      expect(runStep).not.toHaveBeenCalled();
      expect(lock.release).not.toHaveBeenCalled(); // lock не наш — не снимаем
    });
  });

  it('реестр нечитаем (listStrict throw) → exit 1, error-строка, проекты не тронуты', async () => {
    const runStep = fakeRunStep();
    const registry = {
      listStrict: async (): Promise<RegisteredProject[]> => {
        throw new Error('yaml broken');
      },
    };
    const res = await runUpgradeProjects(makeDeps({ runStep, registry }), { yes: true });

    expect(res.exitCode).toBe(1);
    const text = plain(res);
    expect(text).toContain('failed to read the projects registry');
    expect(text).toContain('Failed');
    expect(runStep).not.toHaveBeenCalled();
  });

  it('дедуп realpath: дубль свёрнут в одну запись и отмечен в отчёте', async () => {
    const runStep = fakeRunStep();
    const res = await runUpgradeProjects(
      makeDeps({ runStep, registry: registryOf([entry(projA), entry(projA)]) }), // одна realpath дважды
      { yes: true }
    );

    expect(runStep).toHaveBeenCalledTimes(1);
    const text = plain(res);
    expect(text).toContain('duplicate registry entry collapsed');
    expect(count(res, 'updated')).toBe(1);
    expect(count(res, 'errors')).toBe(0);
  });

  describe('скан незарегистрированных (REQ-09)', () => {
    it('найдено K → строка после сводки, пути в отчёте; плюрализация 1 project', async () => {
      const scan = vi.fn(
        async (): Promise<ScanResult> => ({
          found: 3,
          top: ['/home/u/one', '/home/u/two'],
          hint: 'found 3 projects ...',
        })
      );
      const res = await runUpgradeProjects(
        makeDeps({ runStep: fakeRunStep(), registry: registryOf([entry(projA)]), scan }),
        { yes: true }
      );

      const text = plain(res);
      expect(scan).toHaveBeenCalledWith({ registeredPaths: [projA] });
      expect(text).toContain('found 3 projects with wolf memory outside the registry');
      expect(text).toContain('/home/u/one');
      expect(text.indexOf('found 3 projects')).toBeGreaterThan(text.indexOf('Done')); // после финальной строки

      const single = vi.fn(async (): Promise<ScanResult> => ({ found: 1, top: ['/x'], hint: '' }));
      const res1 = await runUpgradeProjects(
        makeDeps({ runStep: fakeRunStep(), registry: registryOf([entry(projA)]), scan: single }),
        { yes: true }
      );
      expect(plain(res1)).toContain('found 1 project with wolf memory outside the registry');
    });

    it('throw скана — предупреждение, exitCode прохода не меняется', async () => {
      const scan = vi.fn(async (): Promise<ScanResult> => {
        throw new Error('scan boom');
      });
      const res = await runUpgradeProjects(
        makeDeps({ runStep: fakeRunStep(), registry: registryOf([entry(projA)]), scan }),
        { yes: true }
      );

      expect(res.exitCode).toBe(0);
      expect(plain(res)).toContain('unregistered-projects scan failed');
      expect(count(res, 'errors')).toBe(0);
    });
  });
});
