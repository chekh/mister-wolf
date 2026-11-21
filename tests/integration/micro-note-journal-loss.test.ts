import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

// REQ-333-4 (ADR-340-2): маркер миграции различает первый импорт и утрату уже
// мигрированного журнала. Проверки — РЕАЛЬНЫЕ процессы (spawn node
// dist/bootstrap/cli.js): утрата → fail-closed (brief приостанавливает
// micro-notes с явной строкой; list/report/resolve отказывают), журнал не
// воссоздаётся молча, legacy SQLite не воскрешается (инверсия r4);
// `wolf contradict restore` — единственный путь состояния-в-состояние.

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

/** Legacy-таблица 3.3.0 с одной suppression-строкой (источник восстановления). */
function insertLegacyRow(proj: Proj): void {
  const db = new Database(join(proj.dir, '.wolf', 'cache', 'index.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS micro_note_suppressions (
    memory_id TEXT NOT NULL, revision TEXT NOT NULL, reason TEXT NOT NULL,
    note_evidence TEXT NOT NULL, contradiction_evidence TEXT NOT NULL,
    suppressed_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT)`);
  db.prepare('INSERT INTO micro_note_suppressions VALUES (?,?,?,?,?,?,?,?)').run(
    proj.noteId,
    'legacy-rev-330',
    'legacy reason from 3.3.0',
    `${proj.noteId}@legacyrev330`,
    'legacy evidence from 3.3.0',
    '2026-10-01T00:00:00.000Z',
    null,
    null
  );
  db.close();
}

/** Pre-upgrade wt-журнал ≤3.3.1: строки формата 3.3.1 кладутся напрямую (фикстура r1). */
function seedWtJournal(wt: string, lines: string[]): void {
  mkdirSync(join(wt, '.wolf', 'memory'), { recursive: true });
  writeFileSync(join(wt, JOURNAL), lines.map((l) => `${l}\n`).join(''), 'utf8');
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

/** Временный linked worktree проекта (источник восстановления второго рода);
 *  абсолютный путь РЯДОМ с проектом (внутри temp-root, вне чекаута). */
function addWorktree(proj: Proj, parent: string): string {
  const wt = join(parent, 'wt');
  execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'wtb'], { cwd: proj.dir });
  return wt;
}

describe('journal loss and restore (3.4.0 REQ-333-4, real processes)', () => {
  // T-333-4.1 (AC-4.1, инверсия r4): утрата мигрированного журнала —
  // fail-closed: brief приостанавливает доставку micro-notes с явной строкой,
  // list/report/resolve отказывают с подсказкой restore, журнал не воссоздан,
  // legacy SQLite не воскрешён.
  it('T-333-4.1: journal loss suspends delivery and refuses list/report/resolve without resurrecting SQLite', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-loss-41-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R4 note');
    insertLegacyRow(proj);

    // миграция: первый доступ создаёт журнал + маркер; свежее подавление
    expect(run(['brief'], proj.dir).status).toBe(0);
    expect(existsSync(join(proj.dir, JOURNAL))).toBe(true);
    expect(existsSync(join(proj.dir, MARKER))).toBe(true);
    const report = run(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'fresh', '--evidence', 'e-new'],
      proj.dir
    );
    expect(report.status).toBe(0);
    const cnew = report.stdout.match(/cnr_[0-9a-f_]+/)?.[0] ?? '';
    expect(cnew).not.toBe('');

    // утрата журнала
    rmSync(join(proj.dir, JOURNAL));
    const brief = run(['brief'], proj.dir);
    expect(brief.status).toBe(0);
    expect(brief.stdout).not.toContain('R4 note'); // fail-closed: micro-notes не доставляются
    expect(brief.stdout).toContain('Micro-note delivery suspended');
    expect(brief.stdout).toContain('wolf contradict restore');

    const list = run(['contradict', 'list'], proj.dir);
    expect(list.status).not.toBe(0);
    expect(list.stdout + list.stderr).toContain('suppression journal is missing');
    expect(list.stdout + list.stderr).not.toContain('legacy reason'); // SQLite не воскрешён

    const rep = run(['contradict', 'report', '--note', proj.noteId, '--reason', 'r', '--evidence', 'e'], proj.dir);
    expect(rep.status).not.toBe(0);
    expect(rep.stdout + rep.stderr).toContain('wolf contradict restore');

    const res = run(['contradict', 'resolve', '--id', cnew, '--resolution', 'x'], proj.dir);
    expect(res.status).not.toBe(0);
    expect(res.stdout + res.stderr).toContain('suppression journal is missing');

    // журнал не воссоздан ни одной командой
    expect(existsSync(join(proj.dir, JOURNAL))).toBe(false);
  }, 60_000);

  // T-333-4.2 (AC-4.2): явный restore пересобирает журнал из замороженного
  // SQLite + wt-журналов с отчётом источников и границей потерь; после restore
  // подавление эффективно; при существующем журнале restore отказывает.
  it('T-333-4.2: restore rebuilds the journal from SQLite + worktree journals with a source report', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-loss-42-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R42 note');
    insertLegacyRow(proj);
    const wt = addWorktree(proj, root);

    // pre-upgrade wt-строка — создана КАНДИДАТОМ (ревизия записи совпадает с
    // заметкой → восстановленное подавление эффективно); wt-журнал ≤3.3.1 —
    // тот же формат строки
    const line = reportAndGetLine(proj, 'wt-suppress');
    const cnrWt = (JSON.parse(line).record as { suppression_id: string }).suppression_id;
    rmSync(join(proj.dir, JOURNAL));
    rmSync(join(proj.dir, MARKER), { force: true });
    seedWtJournal(wt, [line]);

    // миграция (первый доступ) + свежая post-migration запись
    expect(run(['brief'], proj.dir).status).toBe(0);
    const report = run(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'fresh', '--evidence', 'e-new'],
      proj.dir
    );
    expect(report.status).toBe(0);
    const cnew = report.stdout.match(/cnr_[0-9a-f_]+/)?.[0] ?? '';
    expect(cnew).not.toBe('');
    rmSync(join(proj.dir, JOURNAL));

    // restore в loss-состоянии: отчёт называет источники, счётчики и границу потерь
    const restore = run(['contradict', 'restore'], proj.dir);
    expect(restore.status).toBe(0);
    expect(restore.stdout).toContain('index.sqlite');
    expect(restore.stdout).toContain('worktree');
    expect(restore.stdout).toContain('unrecoverable');
    expect(existsSync(join(proj.dir, JOURNAL))).toBe(true);
    expect(existsSync(join(proj.dir, MARKER))).toBe(true);

    const journal = readFileSync(join(proj.dir, JOURNAL), 'utf-8');
    expect(journal).toContain('legacy reason'); // из замороженного SQLite
    expect(journal).toContain(cnrWt); // из wt-журнала
    expect(journal).not.toContain(cnew); // граница потерь: post-migration записи невосстановимы

    // подавление эффективно: wt-подавление (memory_id совпадает) скрывает заметку
    const brief = run(['brief'], proj.dir);
    expect(brief.status).toBe(0);
    expect(brief.stdout).not.toContain('R42 note');

    // повторный restore при существующем журнале — явный отказ
    const again = run(['contradict', 'restore'], proj.dir);
    expect(again.status).not.toBe(0);
  }, 90_000);

  // T-333-4.3 (AC-4.3, сброс): удалены И журнал, И маркер → следующий доступ =
  // свежий первый импорт (те же детерминированные id), путь документирован в
  // выводе restore.
  it('T-333-4.3: removing both journal and marker resets to a fresh first import; restore output documents the reset path', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-loss-43-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R43 note');
    insertLegacyRow(proj);
    expect(run(['brief'], proj.dir).status).toBe(0);
    const idsBefore = run(['contradict', 'list'], proj.dir);
    expect(idsBefore.status).toBe(0);

    rmSync(join(proj.dir, JOURNAL));
    rmSync(join(proj.dir, MARKER), { force: true });
    expect(run(['brief'], proj.dir).status).toBe(0); // свежий первый импорт

    const listAfter = run(['contradict', 'list'], proj.dir);
    expect(listAfter.status).toBe(0);
    // те же детерминированные legacy-записи (cnr_-id первого импорта воспроизводим)
    expect(listAfter.stdout).toContain('legacy reason');
    expect(existsSync(join(proj.dir, MARKER))).toBe(true);

    // путь сброса задокументирован в выводе restore (существующий журнал → отказ
    // с подсказкой, где описан сброс)
    const again = run(['contradict', 'restore'], proj.dir);
    expect(again.status).not.toBe(0);
    expect(again.stdout + again.stderr).toContain('remove');
  }, 90_000);

  // T-333-8.1 (F-1, design §10.4): restore без единого источника (нет
  // index.sqlite, нет wt-журналов) — явный отказ «nothing to restore»,
  // пустой журнал НЕ создаётся.
  it('T-333-8.1: restore with no sources at all refuses explicitly and does not create an empty journal', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-loss-81-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R81 note');
    // без insertLegacyRow: index.sqlite отсутствует; wt-чекаутов нет
    expect(run(['brief'], proj.dir).status).toBe(0); // fresh: журнал + маркер
    // маркер первого импорта БЕЗ источников (v2 с sources: [] — состояние,
    // которое создаёт fresh с нулём строк, T-333-8.4; patch 3.4.x review:
    // маркер v2 {format:2, complete:true} доказывает перенос)
    writeFileSync(
      join(proj.dir, MARKER),
      JSON.stringify({
        format: 2,
        migrated_at: '2026-11-19T00:00:00.000Z',
        sources: [],
        complete: true,
        worktrees: [],
      }),
      'utf-8'
    );
    rmSync(join(proj.dir, JOURNAL));
    const restore = run(['contradict', 'restore'], proj.dir);
    expect(restore.status).not.toBe(0);
    expect(restore.stdout + restore.stderr).toContain('nothing to restore');
    expect(existsSync(join(proj.dir, JOURNAL))).toBe(false);
  }, 90_000);
});
