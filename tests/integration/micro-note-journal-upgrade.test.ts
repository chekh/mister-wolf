import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

// REQ-333-1 (ADR-340-3): апгрейд не теряет активные подавления из
// worktree-журналов ≤3.3.1. Проверки — РЕАЛЬНЫЕ процессы (spawn node
// dist/bootstrap/cli.js); pre-upgrade состояние моделируется СОДЕРЖИМЫМ:
// журнал формата 3.3.1 кладётся в <wt>/.wolf/memory/ напрямую (фикстура r1),
// legacy — таблицы 3.3.0 в index.sqlite (фикстура mklegacy).

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO_ROOT, 'dist', 'bootstrap', 'cli.js');
const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');
const MARKER = join('.wolf', 'memory', 'micro-note-delivery.migrated.json');

interface Proj {
  dir: string;
  noteId: string;
}

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length > 0) {
    const d = cleanupDirs.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

function run(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const { npm_command: _npxGuard, ...base } = process.env;
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf-8', timeout: 60_000, env: base });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

function createProject(parent: string, title: string): Proj {
  const dir = join(parent, 'proj');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', '.'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t.local'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  run(['init', '--yes'], dir);
  const added = run(
    [
      'add',
      '--type',
      'note',
      '--facet',
      'howto',
      '--tags',
      'micro-note',
      '--title',
      title,
      '--body',
      `Body of ${title} (v1)`,
    ],
    dir
  );
  const noteId = added.stdout.match(/mem_[0-9a-zA-Z_]+/)?.[0] ?? '';
  expect(noteId).not.toBe('');
  // Docker CI: git refuses `worktree add` on an unborn HEAD — make the initial
  // commit (same pattern as micro-note-worktree-journal.test.ts since 3.3.1).
  execFileSync('git', ['add', '-A', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
  return { dir, noteId };
}

function addWorktree(proj: Proj, name: string): string {
  const wt = join(proj.dir, '..', name);
  execFileSync('git', ['worktree', 'add', '-q', wt, '-b', `wb-${name}`], { cwd: proj.dir });
  return wt;
}

/** Валидная suppression-строка журнала (записана КАНДИДАТОМ → ревизия совпадает с заметкой). */
function reportAndGetLine(proj: Proj, reason: string): string {
  const report = run(
    ['contradict', 'report', '--note', proj.noteId, '--reason', reason, '--evidence', `observed ${reason}`],
    proj.dir
  );
  expect(report.status).toBe(0);
  const id = report.stdout.match(/cnr_[0-9a-f_]+/)?.[0] ?? '';
  expect(id).not.toBe('');
  const raw = readFileSync(join(proj.dir, JOURNAL), 'utf-8')
    .split('\n')
    .filter((l) => l.includes(id));
  expect(raw).toHaveLength(1);
  return raw[0]!;
}

/** Pre-upgrade wt-журнал ≤3.3.1: одна suppression-строка формата 3.3.1. */
function seedWtJournal(wt: string, lines: string[]): void {
  mkdirSync(join(wt, '.wolf', 'memory'), { recursive: true });
  writeFileSync(join(wt, JOURNAL), lines.map((l) => `${l}\n`).join(''), 'utf8');
}

function briefCount(projOrWt: string, title: string): number {
  const b = run(['brief'], projOrWt);
  expect(b.status).toBe(0);
  return (b.stdout.match(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
}

describe('upgrade imports worktree journals (3.4.0 REQ-333-1, real processes)', () => {
  // T-333-1.1 (AC-1.1, r1-инвариант): pre-upgrade wt-журнал с активным
  // подавлением → первый доступ кандидата из worktree И из main скрывает
  // заметку, list показывает запись с тем же cnr_-id, resolve адресует её.
  it('T-333-1.1: an active pre-upgrade worktree suppression survives the upgrade (seen from wt and main)', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-up-11-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'UP11 note');
    const wt = addWorktree(proj, 'wt');

    // запись создаётся кандидатом (ревизия совпадает), затем переносятся
    // ОБА состояния в pre-upgrade вид: wt-журнал есть, общий журнал и маркер нет
    const line = reportAndGetLine(proj, 'wt-suppress');
    const cnrId = JSON.parse(line).record.suppression_id as string;
    rmSync(join(proj.dir, JOURNAL));
    rmSync(join(proj.dir, MARKER), { force: true });
    seedWtJournal(wt, [line]);

    // первый доступ из worktree: подавление живо
    expect(briefCount(wt, 'UP11 note')).toBe(0);
    // и из main: тот же импорт (общий журнал), подавление живо
    expect(briefCount(proj.dir, 'UP11 note')).toBe(0);

    const listWt = run(['contradict', 'list'], wt);
    expect(listWt.status).toBe(0);
    expect(listWt.stdout).toContain(cnrId);
    const listMain = run(['contradict', 'list'], proj.dir);
    expect(listMain.stdout).toContain(cnrId);

    const resolve = run(['contradict', 'resolve', '--id', cnrId, '--resolution', 'done'], proj.dir);
    expect(resolve.status).toBe(0);
  }, 90_000);

  // T-333-1.3 (AC-1.3): пути апгрейда — (а) общий журнал уже есть: повторного
  // импорта и дублей нет; (б) журнала нет: первый импорт из SQLite + wt;
  // (в) несколько worktrees: все источники; повторный `contradict import`
  // не дублирует (снимки журналов равны).
  it('T-333-1.3: upgrade paths — shared journal, fresh import, several worktrees; repeated import is idempotent', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-up-13-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'UP13 note');
    const wt1 = addWorktree(proj, 'wt1');
    const wt2 = addWorktree(proj, 'wt2');

    // (а) общий журнал уже есть: report + копия той же записи в wt1 + уникальная wt2
    const line = reportAndGetLine(proj, 'shared-reason');
    seedWtJournal(wt1, [line]);
    // (в) второй worktree со своей уникальной записью (id отличается)
    const uniq = run(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'wt2-unique', '--evidence', 'observed wt2'],
      proj.dir
    );
    expect(uniq.status).toBe(0);
    const uniqLine = readFileSync(join(proj.dir, JOURNAL), 'utf-8')
      .split('\n')
      .filter((l) => l.includes('wt2-unique'));
    seedWtJournal(wt2, uniqLine);

    const importRun = run(['contradict', 'import'], proj.dir);
    expect(importRun.status).toBe(0);
    const snapshotAfterFirst = readFileSync(join(proj.dir, JOURNAL), 'utf-8');
    const firstCount = snapshotAfterFirst.split('\n').filter((l) => l.trim() !== '').length;
    // уникальная запись из wt1... в wt1 только копия существующей — импорт не дублирует
    expect(snapshotAfterFirst.includes('wt2-unique')).toBe(true);

    const importAgain = run(['contradict', 'import'], proj.dir);
    expect(importAgain.status).toBe(0);
    const snapshotAfterSecond = readFileSync(join(proj.dir, JOURNAL), 'utf-8');
    expect(snapshotAfterSecond).toBe(snapshotAfterFirst); // идемпотентность
    expect(snapshotAfterSecond.split('\n').filter((l) => l.trim() !== '').length).toBe(firstCount);

    // (б) журнала нет: сброс + legacy SQLite → первый импорт из SQLite + wt
    rmSync(join(proj.dir, JOURNAL));
    rmSync(join(proj.dir, MARKER), { force: true });
    const db = new Database(join(proj.dir, '.wolf', 'cache', 'index.sqlite'));
    db.exec(`CREATE TABLE IF NOT EXISTS micro_note_suppressions (
      memory_id TEXT NOT NULL, revision TEXT NOT NULL, reason TEXT NOT NULL,
      note_evidence TEXT NOT NULL, contradiction_evidence TEXT NOT NULL,
      suppressed_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT)`);
    db.prepare('INSERT INTO micro_note_suppressions VALUES (?,?,?,?,?,?,?,?)').run(
      proj.noteId,
      'legacy-rev-330',
      'legacy from sqlite',
      `${proj.noteId}@legacyrev330`,
      'legacy evidence',
      '2026-10-01T00:00:00.000Z',
      null,
      null
    );
    db.close();

    expect(run(['brief'], proj.dir).status).toBe(0); // первый доступ = первый импорт
    const fresh = readFileSync(join(proj.dir, JOURNAL), 'utf-8');
    expect(fresh).toContain('legacy from sqlite'); // из SQLite
    expect(fresh).toContain('wt2-unique'); // из wt-журнала
    expect(existsSync(join(proj.dir, MARKER))).toBe(true);
    // patch 3.4.x review (F3.4): маркер v2 с complete:true и wt-путями
    const marker = JSON.parse(readFileSync(join(proj.dir, MARKER), 'utf-8')) as {
      format: number;
      complete: boolean;
      worktrees: string[];
    };
    expect(marker.format).toBe(2);
    expect(marker.complete).toBe(true);
    expect(marker.worktrees).toContain(realpathSync(wt1));
    expect(marker.worktrees).toContain(realpathSync(wt2));
  }, 120_000);
});
