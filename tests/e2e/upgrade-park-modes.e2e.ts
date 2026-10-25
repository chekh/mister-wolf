// tests/e2e/upgrade-park-modes.e2e.ts
// T14 (волна 2.20.0): интеграционный сценарий волны на парке-фикстуре из 3
// проектов через РЕАЛЬНЫЙ dist-CLI (spawn, а не in-process): `--check --json` →
// `--review` (non-TTY) → `--resolve N=protect` → повторный `--check --json` →
// `--yes --json` с бэкапами → восстановление из бэкапа → `--show` → повторный
// `--yes`. Проверяются exit-модель 0/1/2, read-only `--check`/`--review`/`--show`
// (NFR-03, снапшот mtime+sha256), идемпотентность повтора (NFR-02),
// паритет нумерации text↔json (NFR-06) и отсутствие ложных решений у
// deprecated-целей (m-7). Изоляция: tmp-XDG (реестр проектов), фейковый npm
// первой записью PATH, shim вместо установленного бинаря — live-конфиг и
// live-проекты не участвуют.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { insertProtect } from '../../src/domain/protect-key.js';
import { parseStamp } from '../../src/adapters/render/stamp.js';
import { takeParkSnapshot, takeTreeSnapshot } from '../helpers/park-snapshot.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(REPO, 'dist', 'bootstrap', 'cli.js');
const SET = '2.19.0';
const OLD_SET = '2.17.1';

interface Run {
  stdout: string;
  stderr: string;
  status: number | null;
}

let park: string;
let xdg: string;
let bin: string;
let env: NodeJS.ProcessEnv;
const projects: Record<'clean' | 'decisions' | 'stale', string> = {} as never;

/** Проект фикстуры: tmp-каталог + `package.json` (маркер корня проекта). */
function mkProject(name: string): string {
  const dir = join(park, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `{ "name": "${name}" }`);
  return dir;
}

function run(args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): Run {
  // npm_command срезаем: запуск из `npx vitest` не должен выглядеть как npx try-out CLI
  const { npm_command: _drop, ...rest } = env;
  const r = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 120_000,
    env: { ...rest, ...extraEnv },
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

/** Правка после рендера с сохранением штампа (правило 6 §4.3) → mutated. */
function mutate(dir: string, rel: string): string {
  const abs = join(dir, rel);
  const edited = `${readFileSync(abs, 'utf-8')}\n<!-- local owner edit -->\n`;
  writeFileSync(abs, edited);
  return edited;
}

/** Штамп-дрейф: контент цели прежний, версия набора в штампе старая → heal. */
function ageStamp(dir: string, rel: string): void {
  const abs = join(dir, rel);
  const current = readFileSync(abs, 'utf-8');
  const before = parseStamp(current);
  expect(before?.set).toBe(SET);
  writeFileSync(abs, current.replace(`set=${SET}`, `set=${OLD_SET}`));
  expect(parseStamp(readFileSync(abs, 'utf-8'))?.set).toBe(OLD_SET);
}

const json = (r: Run): Record<string, unknown> => JSON.parse(r.stdout) as Record<string, unknown>;

interface CheckJson {
  schema: string;
  exit: number;
  projects: Array<{ name: string; class: string; mutated: string[]; differ: string[] }>;
  protections: Array<{ project: string; path: string; value: string }>;
}

interface PassJson {
  schema: string;
  exit: number;
  mode: string;
  decisions: Array<{ n: number; project: string; path: string; code: string }>;
  backups: Array<{ file: string; backup: string }>;
  projects: Array<{ name: string; status: string; backups: Array<{ file: string; backup: string }> }>;
}

const checkOf = (r: Run): CheckJson => {
  expect(r.status, r.stderr).toBe(0);
  const doc = json(r) as unknown as CheckJson;
  expect(doc.schema).toBe('wolf.upgrade.check/1');
  expect(doc.exit).toBe(0);
  return doc;
};

/** Снапшоты трёх проектов + реестра: NFR-03 (read-only) сравнивает mtime+sha256. */
function treeSnapshot(): Record<string, Record<string, string>> {
  return {
    clean: takeTreeSnapshot(projects.clean),
    decisions: takeTreeSnapshot(projects.decisions),
    stale: takeTreeSnapshot(projects.stale),
    registry: takeTreeSnapshot(xdg),
  };
}

beforeAll(() => {
  park = mkdtempSync(join(tmpdir(), 'wolf-park-modes-'));
  xdg = mkdtempSync(join(tmpdir(), 'wolf-park-modes-xdg-'));
  bin = mkdtempSync(join(tmpdir(), 'wolf-park-modes-bin-'));

  // Фейковый npm: `view` отдаёт установленную версию (апгрейд CLI не нужен),
  // `prefix -g` — корень репо (dev-копия считается глобальной установкой,
  // иначе фаза 1 честно отказывает linked-refusal и до проектов не доходит).
  const npm = join(bin, 'npm');
  writeFileSync(
    npm,
    `#!/bin/sh\ncase "$1" in\n  view) echo ${SET} ;;\n  prefix) echo "${REPO}" ;;\n  install) echo "fake npm install $*" ;;\nesac\nexit 0\n`
  );
  chmodSync(npm, 0o755);
  // Shim «установленного бинаря» для re-exec фазы 2 (dist-CLI из репо).
  const child = join(bin, 'wolf');
  writeFileSync(child, `#!/bin/sh\nexec "${process.execPath}" "${CLI}" "$@"\n`);
  chmodSync(child, 0o755);

  env = {
    ...process.env,
    XDG_CONFIG_HOME: xdg,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    WOLF_UPGRADE_CHILD_BIN: child,
  };

  projects.clean = mkProject('p-clean');
  projects.decisions = mkProject('p-decisions');
  projects.stale = mkProject('p-stale');
  // Порядок init = порядок реестра (NFR-06: реестр → карта → AGENTS.md)
  // Без --model: модель — opt-in, а проход/`--check` рендерят с models:'omit';
  // фикстура должна совпадать с эталоном (иначе ложный differ, не тема T14).
  for (const dir of [projects.clean, projects.decisions, projects.stale]) {
    const res = run(['init', '--full', '--platform', 'opencode'], dir);
    expect(res.status, res.stderr).toBe(0);
  }
  // p-decisions: 2 mutated (агент и команда) + 1 защищённый файл (вне решений)
  mutate(projects.decisions, '.opencode/agents/mr-wolf.md');
  mutate(projects.decisions, '.opencode/command/analyze-doc.md');
  const protectedAbs = join(projects.decisions, '.opencode/agents/executor-lead.md');
  writeFileSync(protectedAbs, insertProtect(readFileSync(protectedAbs, 'utf-8'), 'true').content);
  // p-stale: штамп-дрейф на двух целях (контент = эталон, версия набора старая)
  ageStamp(projects.stale, '.opencode/agents/steward.md');
  ageStamp(projects.stale, '.opencode/skills/using-skills/SKILL.md');
}, 180_000);

afterAll(() => {
  for (const dir of [park, xdg, bin]) rmSync(dir, { recursive: true, force: true });
});

describe('T14: парк из 3 проектов — все режимы волны на одном состоянии', () => {
  it('--check --json: классы проектов, реестр защит, ноль записей (NFR-03)', () => {
    const before = treeSnapshot();
    const doc = checkOf(run(['upgrade', '--check', '--json'], park));
    expect(treeSnapshot()).toEqual(before); // mtime+sha256, включая sync-state и .wolf/**

    const byName = new Map(doc.projects.map((p) => [p.name, p]));
    expect(byName.get('p-clean')?.class).toBe('current');
    // p-stale: штамп-дрейф — не отставание (heal), класс остаётся current
    expect(byName.get('p-stale')?.class).toBe('current');
    expect(byName.get('p-stale')?.differ).toEqual([]);
    expect(byName.get('p-decisions')?.class).toBe('needs-decision');
    expect(byName.get('p-decisions')?.mutated.sort()).toEqual([
      '.opencode/agents/mr-wolf.md',
      '.opencode/command/analyze-doc.md',
    ]);
    // project в реестре защит — абсолютный корень проекта (§4.11)
    expect(doc.protections.map((p) => p.path)).toEqual(['.opencode/agents/executor-lead.md']);
    expect(doc.protections[0]?.project).toContain('p-decisions');
    expect(doc.protections[0]?.value).toBe('true');
    expect(existsSync(join(projects.decisions, '.wolf/backup'))).toBe(false);
  });

  it('текстовый --check детерминирован между прогонами (NFR-06)', () => {
    const first = run(['upgrade', '--check'], park);
    const second = run(['upgrade', '--check'], park);
    expect(first.status).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(first.stdout).toContain('Done (read-only)');
    expect(first.stdout).toContain(`map ${SET}`);
  });

  it('--review non-TTY: рецепт + exit 2, записей нет; нумерация = --json.decisions (NFR-06)', () => {
    const before = treeSnapshot();
    const review = run(['upgrade', '--review'], park);
    expect(review.status).toBe(2);
    expect(review.stdout).toContain('review (non-interactive): 2 files need a decision');
    expect(review.stdout).toContain('apply a decision:');
    expect(treeSnapshot()).toEqual(before);

    // Паритет нумерации: bare `--json` (non-TTY без --yes — отменённый проход, exit 0)
    const pass = run(['upgrade', '--json'], park);
    expect(pass.status).toBe(0);
    const doc = json(pass) as unknown as PassJson;
    expect(doc.schema).toBe('wolf.upgrade/1');
    expect(doc.mode).toBe('pass');
    expect(doc.exit).toBe(0);
    expect(doc.decisions.map((d) => [d.n, d.project, d.path])).toEqual([
      [1, 'p-decisions', '.opencode/agents/mr-wolf.md'],
      [2, 'p-decisions', '.opencode/command/analyze-doc.md'],
    ]);
    for (const d of doc.decisions) {
      expect(review.stdout).toContain(`  ${d.n}  ${d.project}  ${d.path}  mutated`);
    }
    expect(treeSnapshot()).toEqual(before); // отменённый проход ничего не пишет
  });

  it('--show: read-only diff цели; неизвестный N → exit 1 без записей', () => {
    const before = treeSnapshot();
    const shown = run(['upgrade', '--show', '1'], park);
    expect(shown.status).toBe(0);
    expect(shown.stdout).toContain('.opencode/agents/mr-wolf.md');
    expect(shown.stdout).toMatch(/local owner edit/);
    const missing = run(['upgrade', '--show', '99'], park);
    expect(missing.status).toBe(1);
    expect(missing.stdout).toContain('unknown target 99');
    expect(treeSnapshot()).toEqual(before);
  });

  it('--resolve: неизвестный N → exit 1 без записей (двухфазность AC3)', () => {
    const before = treeSnapshot();
    const bad = run(['upgrade', '--resolve', '99=take'], park);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('unknown target 99');
    expect(treeSnapshot()).toEqual(before);
  });

  it('--resolve N=protect: свидетель и ключ, остаток решений держит exit 2', () => {
    const res = run(['upgrade', '--resolve', '1=protect'], park);
    expect(res.status, res.stdout).toBe(2); // второе решение осталось
    const protectedFile = readFileSync(join(projects.decisions, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(protectedFile).toContain('protect: true');
    expect(protectedFile).toContain('local owner edit'); // локальный контент цел (REQ-05)

    // повторный --check: цель в реестре защит, решение по ней больше не предлагается
    const doc = checkOf(run(['upgrade', '--check', '--json'], park));
    expect(doc.protections.map((p) => p.path).sort()).toEqual([
      '.opencode/agents/executor-lead.md',
      '.opencode/agents/mr-wolf.md',
    ]);
    expect(doc.projects.find((p) => p.name === 'p-decisions')?.mutated).toEqual(['.opencode/command/analyze-doc.md']);
  });

  it('--yes --json: take mutated с бэкапом, штамп-дрейф исцелён, exit 0 (REQ-10)', () => {
    const localBefore = readFileSync(join(projects.decisions, '.opencode/command/analyze-doc.md'), 'utf-8');
    const res = run(['upgrade', '--yes', '--json'], park);
    expect(res.status, res.stdout).toBe(0);
    const doc = json(res) as unknown as PassJson;
    expect(doc.schema).toBe('wolf.upgrade/1');
    expect(doc.exit).toBe(0);
    expect(doc.decisions).toEqual([]);
    expect(doc.backups.map((b) => b.file)).toEqual(['.opencode/command/analyze-doc.md']);

    // файл = эталон, локальный контент — в бэкапе байт-в-байт (NFR-05)
    const taken = readFileSync(join(projects.decisions, '.opencode/command/analyze-doc.md'), 'utf-8');
    expect(taken).not.toContain('local owner edit');
    const backupPath = join(projects.decisions, doc.backups[0]!.backup);
    expect(readFileSync(backupPath, 'utf-8')).toBe(localBefore);
    // штамп-дрейф p-stale: версия набора приведена к текущей базе (REQ-02)
    expect(parseStamp(readFileSync(join(projects.stale, '.opencode/agents/steward.md'), 'utf-8'))?.set).toBe(SET);
    // защищённый файл не тронут
    expect(readFileSync(join(projects.decisions, '.opencode/agents/mr-wolf.md'), 'utf-8')).toContain(
      'local owner edit'
    );
  });

  it('восстановление из бэкапа → --show видит mutated → --resolve keep закрывает решение', () => {
    const rel = '.opencode/command/analyze-doc.md';
    const backupPath = findBackup(projects.decisions, rel);
    const restored = readFileSync(backupPath, 'utf-8');
    writeFileSync(join(projects.decisions, rel), restored);

    // путь в парке адресуется как `<project>/<rel>` (голый rel неоднозначен: файл есть во всех трёх проектах)
    const scope = `p-decisions/${rel}`;
    const shown = run(['upgrade', '--show', scope], park);
    expect(shown.status).toBe(0);
    expect(shown.stdout).toContain('local owner edit');

    const kept = run(['upgrade', '--resolve', `${scope}=keep`], park);
    expect(kept.status, kept.stdout).toBe(0);
    expect(readFileSync(join(projects.decisions, rel), 'utf-8')).toBe(restored); // файл байт-в-байт (ADR-8)

    const doc = checkOf(run(['upgrade', '--check', '--json'], park));
    const project = doc.projects.find((p) => p.name === 'p-decisions');
    expect(project?.class).toBe('current');
    expect(project?.mutated).toEqual([]);
  });

  it('повторный --yes идемпотентен: exit 0, контент парка не изменился (NFR-02)', () => {
    const before = {
      clean: takeParkSnapshot(projects.clean).files,
      decisions: takeParkSnapshot(projects.decisions).files,
      stale: takeParkSnapshot(projects.stale).files,
    };
    const res = run(['upgrade', '--yes', '--json'], park);
    expect(res.status, res.stdout).toBe(0);
    const doc = json(res) as unknown as PassJson;
    expect(doc.exit).toBe(0);
    expect(doc.backups).toEqual([]);
    expect({
      clean: takeParkSnapshot(projects.clean).files,
      decisions: takeParkSnapshot(projects.decisions).files,
      stale: takeParkSnapshot(projects.stale).files,
    }).toEqual(before); // контент, включая свидетель (mtime свидетеля — атомарная перезапись, NFR-04)
  });

  it('несовместимая пара --review --json → exit 1 без записей (§4.18)', () => {
    const before = treeSnapshot();
    const res = run(['upgrade', '--review', '--json'], park);
    expect(res.status).toBe(1);
    const doc = json(res) as unknown as PassJson;
    expect(doc.exit).toBe(1);
    expect(String(doc.error)).toContain('--review is interactive');
    expect(treeSnapshot()).toEqual(before);
  });
});

/** Бэкап цели: `.wolf/backup/upgrade/<date>/<rel>` (первый свободный суффикс). */
function findBackup(dir: string, rel: string): string {
  const dateDir = join(dir, '.wolf/backup/upgrade');
  const dates = readdirSyncSafe(dateDir);
  for (const date of dates) {
    for (const candidate of [rel, rel.replace(/\.md$/, '-2.md'), rel.replace(/\.md$/, '-3.md')]) {
      const abs = join(dateDir, date, candidate);
      if (existsSync(abs)) return abs;
    }
  }
  throw new Error(`backup for ${rel} not found under ${dateDir}`);
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
