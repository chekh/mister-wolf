// tests/unit/adapters/commands/upgrade-projects.test.ts
// T8 (волна 2.19.0, REQ-01/04, test-plan решение №1 уровни 1): контракт spawn
// re-exec против фейкового бинарника (argv/state/stdio inherit/env: process.env/
// проксирование exit 0/1/2/ENOENT), склейка фаз 1 (up-to-date → re-exec,
// local-newer/linked-refusal → нет, npm-сбой → `└ Failed` без spawn, R01.3
// юнит-часть), обвязка фазы 2 (прод-deps провайдинг, plans ДО вопроса, exitCode)
// и R04.1 — прямой вызов фазы 2 с картой новой версии (штампы/сверка у ребёнка).
import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { chmodSync, existsSync, fstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import { reExecUpgradeProjects, runUpgradeWithProjects } from '../../../../src/adapters/cli/commands/memory-upgrade.js';
import { upgradeProjectsAction, type ProjectsIo } from '../../../../src/adapters/cli/commands/upgrade-projects.js';
import { UserFacingError } from '../../../../src/domain/errors.js';
import type { UpgradeDeps } from '../../../../src/app/use-cases/upgrade.js';
import { runUpgradeProjects, type UpgradeProjectsDeps } from '../../../../src/app/use-cases/upgrade-projects.js';
import {
  runProjectStep,
  type ProjectReport,
  type ProjectStepDeps,
} from '../../../../src/app/use-cases/project-step.js';
import type { RegisteredProject } from '../../../../src/adapters/fs/projects-registry.js';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';
import { MarkdownMemoryStore } from '../../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../../src/adapters/fs/jsonl-event-log.js';
import { SQLiteSearchIndex } from '../../../../src/adapters/sqlite/sqlite-search-index.js';
import { SystemClock } from '../../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../../src/adapters/fs/hash-id-generator.js';
import { FsMemoryLock } from '../../../../src/adapters/fs/memory-lock.js';
import { eventsPath, indexPath, memoryDir } from '../../../../src/adapters/fs/project-paths.js';
import { parseStamp } from '../../../../src/adapters/render/stamp.js';
import type { UpdateMap } from '../../../../src/adapters/fs/update-map.js';

/* ---------- контур: tmp-каталоги, env-патчи, фейковый бинарник ---------- */

const tmpDirs: string[] = [];
function mkTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Запись шаблона с созданием каталогов (прецедент upgrade-park.test.ts). */
function put(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** Точечный set/delete env с гарантированным восстановлением (наследуется ребёнку). */
const envBackup = new Map<string, string | undefined>();
function setEnv(key: string, value: string): void {
  if (!envBackup.has(key)) envBackup.set(key, process.env[key]);
  process.env[key] = value;
}
function delEnv(key: string): void {
  if (!envBackup.has(key)) envBackup.set(key, process.env[key]);
  delete process.env[key];
}
function restoreEnv(): void {
  for (const [key, value] of envBackup) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  envBackup.clear();
}

/** Node-стаб ребёнка (test-plan №1): маркер argv/state/env/fd, exit из env. */
const FAKE_CHILD = [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'const argv = process.argv.slice(2);',
  'const i = argv.indexOf("--state");',
  'fs.writeFileSync(process.env.WOLF_T8_MARKER, JSON.stringify({',
  '  argv,',
  '  stateContent: i >= 0 ? fs.readFileSync(argv[i + 1], "utf-8") : null,',
  '  envProbe: process.env.WOLF_T8_PROBE ?? null,',
  '  stdoutIno: fs.fstatSync(1).ino,',
  '}));',
  'process.exit(Number(process.env.WOLF_T8_EXIT ?? "0"));',
  '',
].join('\n');

interface ChildMarker {
  argv: string[];
  stateContent: string | null;
  envProbe: string | null;
  stdoutIno: number;
}

let fakeBin = '';
let markerPath = '';

/** Спай-эмиттер вместо ребёнка: опции spawn без реального процесса. */
function spySpawn(): { spy: ReturnType<typeof vi.fn>; emitter: EventEmitter } {
  const emitter = new EventEmitter();
  return { spy: vi.fn(() => emitter), emitter };
}

beforeAll(() => {
  const dir = mkTmp('wolf-t8-fakebin-');
  fakeBin = join(dir, 'fake-child');
  writeFileSync(fakeBin, FAKE_CHILD);
  chmodSync(fakeBin, 0o755);
  markerPath = join(dir, 'marker.json');
});

afterAll(() => {
  restoreEnv();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/* ---------- AC1/AC2/AC8: контракт spawn против фейкового бинарника ---------- */

describe('reExecUpgradeProjects: контракт spawn (фейковый бинарник, реальный spawn)', () => {
  const FIXED_NOW = 1_761_000_000_000;

  afterEach(() => {
    restoreEnv();
    if (existsSync(markerPath)) rmSync(markerPath);
  });

  it('argv (--from/--to/--yes/--no-banner/--state), state-файл до spawn, env: process.env, stdio inherit (тот же fd 1), exit 0', async () => {
    setEnv('WOLF_T8_MARKER', markerPath);
    setEnv('WOLF_T8_PROBE', 'env-passed-through');
    setEnv('WOLF_T8_EXIT', '0');
    const exit = vi.fn();

    await reExecUpgradeProjects('2.18.5', '2.19.0', '/fake-prefix', {
      yes: true,
      childBin: fakeBin,
      exit,
      now: () => FIXED_NOW,
    });

    expect(exit).toHaveBeenCalledWith(0);
    const marker = JSON.parse(readFileSync(markerPath, 'utf-8')) as ChildMarker;
    const statePath = marker.argv[marker.argv.indexOf('--state') + 1]!;
    expect(marker.argv).toEqual([
      'upgrade-projects',
      '--from',
      '2.18.5',
      '--to',
      '2.19.0',
      '--yes',
      '--no-banner',
      '--state',
      statePath,
    ]);
    // state: tmp-путь, { from, to, startedAt }, существовал ДО spawn — ребёнок его прочитал
    expect(existsSync(statePath)).toBe(true);
    expect(JSON.parse(marker.stateContent as string)).toEqual({ from: '2.18.5', to: '2.19.0', startedAt: FIXED_NOW });
    expect(marker.envProbe).toBe('env-passed-through'); // env: process.env
    expect(marker.stdoutIno).toBe(fstatSync(1).ino); // stdio inherit — тот же fd 1
  });

  it('без --yes флаг ребёнку не передаётся', async () => {
    setEnv('WOLF_T8_MARKER', markerPath);
    setEnv('WOLF_T8_EXIT', '0');
    await reExecUpgradeProjects('1.0.0', '2.0.0', '/fake-prefix', { childBin: fakeBin, exit: vi.fn() });
    expect((JSON.parse(readFileSync(markerPath, 'utf-8')) as ChildMarker).argv).not.toContain('--yes');
  });

  it('проксирование exit-кода ребёнка: 1 и 2', async () => {
    for (const code of [1, 2]) {
      setEnv('WOLF_T8_MARKER', markerPath);
      setEnv('WOLF_T8_EXIT', String(code));
      const exit = vi.fn();
      await reExecUpgradeProjects('1.0.0', '2.0.0', '/fake-prefix', { childBin: fakeBin, exit });
      expect(exit).toHaveBeenCalledWith(code);
      rmSync(markerPath);
    }
  });

  it('сбой spawn (ENOENT) → UserFacingError «CLI updated; projects not touched», exit НЕ вызван', async () => {
    const exit = vi.fn();
    const absent = join(mkTmp('wolf-t8-nope-'), 'no-such-bin');
    const promise = reExecUpgradeProjects('1.0.0', '2.0.0', '/fake-prefix', { childBin: absent, exit });
    await expect(promise).rejects.toThrow(UserFacingError);
    await expect(promise).rejects.toThrow(/CLI updated; projects not touched — run wolf upgrade again/);
    expect(exit).not.toHaveBeenCalled();
  });

  it('спай-spawn: опции ровно { stdio: inherit, env: process.env }; сигнал → exit 1', async () => {
    const { spy, emitter } = spySpawn();
    const exit = vi.fn();
    const pending = reExecUpgradeProjects('1.0.0', '2.0.0', '/fake-prefix', {
      spawnImpl: spy as unknown as typeof spawn,
      exit,
      stateDir: mkTmp('wolf-t8-state-'),
    });
    emitter.emit('close', 2);
    await pending;
    expect(spy).toHaveBeenCalledOnce();
    const [bin, argv, opts] = spy.mock.calls[0] as unknown as [string, string[], { stdio: string; env: unknown }];
    expect(bin).toBe(join('/fake-prefix', 'bin', 'wolf'));
    expect(argv).toEqual(['upgrade-projects', '--from', '1.0.0', '--to', '2.0.0', '--no-banner', '--state', argv[7]!]);
    expect(opts).toEqual({ stdio: 'inherit', env: process.env });
    expect(exit).toHaveBeenCalledWith(2);

    const killed = spySpawn();
    const exit2 = vi.fn();
    const pending2 = reExecUpgradeProjects('1.0.0', '2.0.0', '/fake-prefix', {
      spawnImpl: killed.spy as unknown as typeof spawn,
      exit: exit2,
      stateDir: mkTmp('wolf-t8-state-'),
    });
    killed.emitter.emit('close', null, 'SIGINT');
    await pending2;
    expect(exit2).toHaveBeenCalledWith(1);
  });

  it('резолв ребёнка: дефолт <npmPrefix>/bin/wolf; WOLF_UPGRADE_CHILD_BIN переопределяет; null-префикс не валит', async () => {
    const cases: Array<{ envBin?: string; prefix: string | null; expected: string }> = [
      { prefix: '/fake-prefix', expected: join('/fake-prefix', 'bin', 'wolf') },
      { envBin: '/custom/child-bin', prefix: '/fake-prefix', expected: '/custom/child-bin' },
      { prefix: null, expected: join(tmpdir(), 'bin', 'wolf') },
    ];
    for (const c of cases) {
      if (c.envBin !== undefined) setEnv('WOLF_UPGRADE_CHILD_BIN', c.envBin);
      else delEnv('WOLF_UPGRADE_CHILD_BIN');
      const { spy, emitter } = spySpawn();
      const pending = reExecUpgradeProjects('1.0.0', '2.0.0', c.prefix, {
        spawnImpl: spy as unknown as typeof spawn,
        exit: vi.fn(),
        stateDir: mkTmp('wolf-t8-state-'),
      });
      emitter.emit('close', 0);
      await pending;
      expect(spy.mock.calls[0]![0]).toBe(c.expected);
    }
  });
});

/* ---------- AC3/AC4: фаза 1 — npm-исходы и склейка (моки) ---------- */

function phase1Deps(over: Partial<UpgradeDeps> = {}): UpgradeDeps & { reExec: ReturnType<typeof vi.fn> } {
  return {
    currentVersion: '2.18.5',
    binaryPath: '/fake-prefix/bin/wolf',
    npmPrefix: '/fake-prefix',
    registryVersion: async () => '2.19.0',
    installLatest: async () => {},
    reExec: vi.fn(async () => {}),
    ...over,
  };
}

function silenceStdio(): Array<ReturnType<typeof vi.spyOn>> {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  return [log, write];
}

describe('runUpgradeWithProjects: исходы npm-фазы → re-exec', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updated → re-exec(from, to, prefix, { yes }); шапку печатает только фаза 1 (banner)', async () => {
    const spies = silenceStdio();
    const deps = phase1Deps();
    await runUpgradeWithProjects(deps, { yes: true });
    expect(deps.reExec).toHaveBeenCalledWith('2.18.5', '2.19.0', '/fake-prefix', { yes: true });
    const wrote = (spies[1]!.mock.calls.map((c) => c[0]) as string[]).join('');
    expect(wrote).toContain('Mr Wolf upgrade 2.18.5'); // plain-шапка (пайп → текстовый логотип)
    expect(spies[0]).toHaveBeenCalledWith('updated; the new wolf version takes effect on the next run');
  });

  it('up-to-date → НЕ выход: фаза идемпотентна, re-exec вызван (from = to = current)', async () => {
    silenceStdio();
    const deps = phase1Deps({
      registryVersion: async () => '2.18.5',
      installLatest: async () => {
        throw new Error('must not install when up-to-date');
      },
    });
    await runUpgradeWithProjects(deps, {});
    expect(deps.reExec).toHaveBeenCalledWith('2.18.5', '2.18.5', '/fake-prefix', { yes: undefined });
  });

  it('local-newer → spawn НЕ нужен; linked-refusal → отказ, re-exec НЕ вызван', async () => {
    const [log] = silenceStdio();
    const newer = phase1Deps({ registryVersion: async () => '2.18.0' });
    await runUpgradeWithProjects(newer, {});
    expect(newer.reExec).not.toHaveBeenCalled();

    const linked = phase1Deps({ binaryPath: '/somewhere/dev/wolf' });
    await expect(runUpgradeWithProjects(linked, {})).rejects.toThrow(/dev\/linked copy/);
    expect(linked.reExec).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('npm-сбой → `└ Failed`, UserFacingError, spawn НЕ вызван (R01.3 юнит-часть)', async () => {
    const [log] = silenceStdio();
    const deps = phase1Deps({
      installLatest: async () => {
        throw new UserFacingError('npm install -g mister-wolf@latest failed (mock)');
      },
    });
    await expect(runUpgradeWithProjects(deps, {})).rejects.toThrow(UserFacingError);
    expect(log).toHaveBeenCalledWith('└ Failed');
    expect(deps.reExec).not.toHaveBeenCalled();
  });
});

/* ---------- AC6: фаза 2 — обвязка hidden-команды (моки deps/io) ---------- */

const T8_MAP: UpdateMap = {
  version: '2.19.0',
  prev: '2.18.5',
  files: [
    { path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'changed' },
    { path: 'base/skills/using-skills/SKILL.md', kind: 'skill', category: 'unchanged' },
  ],
  faces: [],
  agents_md: { category: 'unchanged', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: [],
};

function stepReport(root: string): ProjectReport {
  return {
    name: basename(root),
    root,
    sync: { outcomes: [{ file: '.opencode/agents/mr-wolf.md', action: 'updated' }], orphaned: [], removed: [] },
    seed: [],
    schema: { status: 'ok' },
    verify: { items: [], summary: { byCode: {}, needsDecision: 0, errors: 0 } },
    wallMs: 1,
    exitKind: 'done',
  };
}

const entryOf = (path: string): RegisteredProject => ({
  path,
  schema_version: 2,
  initialized_at: '2026-01-01T00:00:00.000Z',
});

function actionDeps(proj: string, runStep: ReturnType<typeof vi.fn>): UpgradeProjectsDeps {
  return {
    registry: { listStrict: async () => [entryOf(proj)] },
    loadMap: () => T8_MAP,
    makeStepDeps: vi.fn(() => ({}) as ProjectStepDeps),
    runStep: runStep as unknown as typeof runProjectStep,
  };
}

/** IO-фейка: фиксирует порядок write/ask (планы ДО вопроса). */
function fakeIo(tty: boolean): ProjectsIo & { writes: string[]; seq: string[]; ask: ReturnType<typeof vi.fn> } {
  const writes: string[] = [];
  const seq: string[] = [];
  return {
    tty,
    env: { tty: false, colors: 'mono', width: 400 },
    writes,
    seq,
    write: (text: string) => {
      writes.push(text);
      seq.push('write');
    },
    ask: vi.fn(async () => {
      seq.push('ask');
      return true;
    }),
  };
}

describe('upgradeProjectsAction: ребёнок фазы 2', () => {
  let proj = '';
  let prevExitCode: string | number | undefined;

  beforeEach(() => {
    proj = mkTmp('wolf-t8-proj-');
    prevExitCode = process.exitCode;
  });
  afterEach(() => {
    process.exitCode = prevExitCode;
  });

  it('--yes: проход без вопросов, отчёт renderer-ом, process.exitCode = exitCode', async () => {
    const runStep = vi.fn(async (_d: ProjectStepDeps, root: string) => stepReport(root));
    const io = fakeIo(true); // tty=true при yes=true — вопроса быть не должно
    await upgradeProjectsAction(true, actionDeps(proj, runStep), io);
    expect(io.ask).not.toHaveBeenCalled();
    expect(runStep).toHaveBeenCalledOnce();
    const text = io.writes.join('');
    expect(text).toContain('wolf upgrade — projects');
    expect(text).toContain('Done');
    expect(process.exitCode).toBe(0);
  });

  it('TTY-confirm: plans-узел отрендерен ДО вопроса; y → шаг выполнен', async () => {
    const runStep = vi.fn(async (_d: ProjectStepDeps, root: string) => stepReport(root));
    const io = fakeIo(true);
    await upgradeProjectsAction(false, actionDeps(proj, runStep), io);
    expect(io.seq.slice(0, 3)).toEqual(['write', 'ask', 'write']); // список ДО вопроса, затем отчёт
    expect(io.writes[0]).toContain('plan:');
    expect(io.writes[1]).toContain('Done');
    expect(runStep).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
  });

  it('отказ (N) → Cancelled — no changes, exit 0, шаг не выполнялся', async () => {
    const runStep = vi.fn(async (_d: ProjectStepDeps, root: string) => stepReport(root));
    const io = fakeIo(true);
    io.ask.mockResolvedValue(false);
    await upgradeProjectsAction(false, actionDeps(proj, runStep), io);
    expect(io.writes.join('')).toContain('Cancelled — no changes');
    expect(runStep).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });
});

/* ---------- AC7/R04.1: фаза 2 с картой новой версии (реальные шаги) ---------- */

const R041_MAP: UpdateMap = {
  version: '2.19.0',
  prev: '2.18.5',
  files: [{ path: 'base/agents/mr-wolf.md', kind: 'agent', category: 'changed' }],
  faces: [],
  agents_md: { category: 'changed', mode: 'append-block' },
  schema_migrations: [],
  outside_v1: [],
};

describe('R04.1: runUpgradeProjects с фикстурной картой новой версии (ребёнок v_new)', () => {
  it('проект на 2.18.5 → штампы/сверка 2.19.0, exit 0', async () => {
    // фикстурный «пакет» ребёнка: новые шаблоны + карта (прецедент upgrade-park.test.ts)
    const pkgRoot = mkTmp('wolf-t8-pkg-');
    const templatesRoot = join(pkgRoot, 'templates', 'base');
    put(templatesRoot, 'agents/mr-wolf.md', '# Mr.Wolf agent\n\nNew agent body (2.19.0).\n');
    put(templatesRoot, 'AGENTS.md', '# Agent brief\n\nNew onboarding text (2.19.0).\n');
    // старые шаблоны (2.18.5) — ими проект был инициализирован
    const oldRoot = mkTmp('wolf-t8-old-');
    put(oldRoot, 'agents/mr-wolf.md', '# Mr.Wolf agent\n\nOld agent body (2.18.5).\n');
    put(oldRoot, 'AGENTS.md', '# Agent brief\n\nOld onboarding text.\n');

    const proj = mkTmp('wolf-t8-r041-');
    await new OpencodeBaseSetRenderer(oldRoot, { setVersion: '2.18.5' }).renderBaseSet(proj, { models: 'omit' });
    mkdirSync(join(proj, '.wolf'), { recursive: true });
    writeFileSync(join(proj, '.wolf', 'config.yaml'), 'schema_version: 2\n');

    const deps: UpgradeProjectsDeps = {
      registry: { listStrict: async () => [entryOf(proj)] },
      loadMap: () => R041_MAP,
      makeStepDeps: (root: string): ProjectStepDeps => ({
        renderer: new OpencodeBaseSetRenderer(templatesRoot, { setVersion: '2.19.0' }),
        files: new Map(),
        store: new MarkdownMemoryStore(root),
        log: new JsonlEventLog(eventsPath(root)),
        index: new SQLiteSearchIndex(indexPath(root)),
        clock: new SystemClock(),
        idGen: new HashIdGenerator(),
        lock: new FsMemoryLock(memoryDir(root)),
      }),
    };
    const res = await runUpgradeProjects(deps, { yes: true });

    expect(res.exitCode).toBe(0);
    expect(res.counters.find((c) => c.label === 'updated')?.count).toBe(1);
    expect(parseStamp(readFileSync(join(proj, '.opencode/agents/mr-wolf.md'), 'utf-8'))).toEqual({
      base: 'mr-wolf.md',
      set: '2.19.0', // штамп новой версии — шаг работал от карты ребёнка
    });
  });
});

/* ---------- --json (T11, REQ-11, design §4.13): документ сквозь re-exec ---------- */

describe('--json: argv ребёнка, единственный документ, сквозь npm-фазу', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('R11-4/R11-8: argv ребёнка содержит --json; без --json его нет', async () => {
    for (const json of [true, false]) {
      setEnv('WOLF_T8_MARKER', markerPath);
      setEnv('WOLF_T8_EXIT', '0');
      await reExecUpgradeProjects('1.0.0', '2.0.0', '/fake-prefix', {
        yes: true,
        json,
        childBin: fakeBin,
        exit: vi.fn(),
      });
      const argv = (JSON.parse(readFileSync(markerPath, 'utf-8')) as ChildMarker).argv;
      if (json) {
        expect(argv).toContain('--json');
        expect(argv.indexOf('--json')).toBe(argv.length - 1); // §4.18: единственный флаг вывода
      } else {
        expect(argv).not.toContain('--json');
      }
      rmSync(markerPath);
    }
  });

  it('R11-1/R11-3: ребёнок фазы 2 печатает ровно один документ wolf.upgrade/1, exit = документ', async () => {
    const proj = mkTmp('wolf-t11-proj-');
    const runStep = vi.fn(async (_d: ProjectStepDeps, root: string) => stepReport(root));
    const io = fakeIo(false);
    const chunks: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((c: string) => {
      chunks.push(String(c));
      return true;
    }) as typeof process.stdout.write);
    const prevExit = process.exitCode;
    try {
      await upgradeProjectsAction(true, actionDeps(proj, runStep), io, true);
      const exitCode = process.exitCode;
      process.exitCode = prevExit;
      const stdout = chunks.join('');
      expect(stdout.trim().split('\n')).toHaveLength(1); // единственный JSON-документ
      const doc = JSON.parse(stdout) as Record<string, unknown>;
      expect(doc['schema']).toBe('wolf.upgrade/1');
      expect(doc['mode']).toBe('pass');
      expect(doc['exit']).toBe(0);
      expect(doc['plan']).toMatchObject({ projects: 1, changed: 1 });
      expect((doc['projects'] as Array<{ files: Array<{ path: string; inMap: boolean }> }>)[0]!.files).toEqual([
        { path: '.opencode/agents/mr-wolf.md', code: 'updated', inMap: true },
      ]);
      expect(doc['decisions']).toEqual([]);
      expect(doc['protections']).toEqual([]);
      expect(exitCode).toBe(0);
      expect(io.writes).toEqual([]); // баннер/человеческие строки подавлены
      write.mockRestore();
    } finally {
      write.mockRestore();
    }
  });

  it('M-1: --json local-newer → документ exit 0 с available; linked-refusal → документ exit 1 + throw', async () => {
    const chunks: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((c: string) => {
      chunks.push(String(c));
      return true;
    }) as typeof process.stdout.write);
    try {
      const newer = phase1Deps({ registryVersion: async () => '2.18.0' });
      await runUpgradeWithProjects(newer, { json: true });
      const doc = JSON.parse(chunks.join('')) as Record<string, unknown>;
      expect(doc).toMatchObject({ schema: 'wolf.upgrade/1', mode: 'pass', exit: 0, projects: [] });
      expect((doc['cli'] as { available: string | null }).available).toBe('2.18.0');
      expect(doc['error']).toBeUndefined();
      expect(newer.reExec).not.toHaveBeenCalled();

      chunks.length = 0;
      const linked = phase1Deps({ binaryPath: '/somewhere/dev/wolf' });
      await expect(runUpgradeWithProjects(linked, { json: true })).rejects.toThrow(/dev\/linked copy/);
      const failed = JSON.parse(chunks.join('')) as Record<string, unknown>;
      expect(failed).toMatchObject({ schema: 'wolf.upgrade/1', mode: 'pass', exit: 1 });
      expect(String(failed['error'])).toMatch(/dev\/linked copy/);
      expect(linked.reExec).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it('R11-7: --json в TTY не задаёт вопросов, шапка фазы 1 подавлена', async () => {
    const spies = silenceStdio();
    const deps = phase1Deps();
    await runUpgradeWithProjects(deps, { yes: true, json: true });
    expect(deps.reExec).toHaveBeenCalledWith('2.18.5', '2.19.0', '/fake-prefix', { yes: true, json: true });
    expect((spies[1]!.mock.calls.map((c) => c[0]) as string[]).join('')).not.toContain('Mr Wolf upgrade');
    expect(spies[0]).not.toHaveBeenCalled(); // printOutcome молчит
  });

  it('R11-4: падение npm-фазы при --json → документ с exit:1 и error, spawn не вызван', async () => {
    const chunks: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((c: string) => {
      chunks.push(String(c));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const deps = phase1Deps({
      installLatest: async () => {
        throw new UserFacingError('npm install -g mister-wolf@latest failed (mock json)');
      },
    });
    try {
      await expect(runUpgradeWithProjects(deps, { json: true })).rejects.toThrow(UserFacingError);
      const doc = JSON.parse(chunks.join('')) as Record<string, unknown>;
      expect(doc).toMatchObject({ schema: 'wolf.upgrade/1', mode: 'pass', exit: 1, projects: [] });
      expect(String(doc['error'])).toMatch(/npm install -g mister-wolf@latest failed/);
      expect(deps.reExec).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });
});
