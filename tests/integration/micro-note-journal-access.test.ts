import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import {
  JsonlMicroNoteDeliveryLog,
  JournalMigrationIncompleteError,
} from '../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { indexPath } from '../../src/adapters/fs/project-paths.js';
import type { MicroNoteSuppressionRecord } from '../../src/ports/micro-note-delivery-log.port.js';

// patch 3.4.3 review (P1): недоступный источник переноса (EACCES) не имеет права
// молча считаться отсутствующим — existsSync возвращает false и для «нет», и для
// «нет прав», поэтому перенос завершался и следующий brief выдавал спорную
// заметку, чьё подавление лежит в закрытом источнике. Контракт (директива
// владельца): ТОЛЬКО ENOENT означает «источника нет»; EACCES/EPERM/EIO/… — отказ
// переноса (JournalMigrationIncompleteError на первом импорте/completion/явном
// import, явный отказ restore с перечнем). Приёмка: пока доступ закрыт, перенос
// не завершён и спорная заметка не выдаётся; после возврата прав перенос идёт
// без дублей. Тесты выполняются не-root — chmod 0o000 на каталог даёт EACCES;
// права возвращаются ДО rmSync (withClosed — try/finally, cleanupDirs afterEach).
// Root-окружение (Docker-джоба CI) игнорирует chmod — EACCES не возникает,
// тесты (1)-(4) дали бы ложную тревогу: скипаем по getuid()===0 (громко, не
// false-green; F-1 ревью ef61bfaf).

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO_ROOT, 'dist', 'bootstrap', 'cli.js');
const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');
const MARKER = join('.wolf', 'memory', 'micro-note-delivery.migrated.json');

/** chmod 0o000 значим только для не-root: root читает «закрытые» каталоги мимо
 *  прав. Тесты (1)-(4) зависят от EACCES — под root скипаются (условие
 *  задокументировано в шапке файла; ревью ef61bfaf F-1). */
const RUN_AS_NON_ROOT = process.getuid?.() !== 0;
const itNonRoot = RUN_AS_NON_ROOT ? it : it.skip;
const LEGACY_DIR = join('.wolf', 'cache');

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sup(id: string, memoryId: string, revision = 'rev111'): MicroNoteSuppressionRecord {
  return {
    suppression_id: id,
    memory_id: memoryId,
    revision,
    // причина БЕЗ id: якоря-счётчики считают ВХОЖДЕНИЯ id в файле журнала
    reason: 'observed contradiction',
    note_evidence: `${memoryId}@${revision}`,
    contradiction_evidence: `observed against ${memoryId}`,
    suppressed_at: '2026-11-19T00:00:00.000Z',
    resolved_at: null,
    resolution: null,
  };
}

function supLine(record: MicroNoteSuppressionRecord): string {
  return `${JSON.stringify({ kind: 'suppression', record })}\n`;
}

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const { npm_command: _npxGuard, ...base } = process.env;
  const r = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf-8', timeout: 60_000, env: base });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

interface Proj {
  dir: string;
  noteId: string;
  wt: string;
}

/** Проект с одной micro-note и linked worktree (прецедент corruption-теста):
 *  git init + init --yes + add + worktree add. Журнал/маркер ещё НЕ созданы. */
function makeProjectWithWorktree(parent: string, title: string): Proj {
  const dir = join(parent, 'proj');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', '.'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t.local'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  expect(runCli(['init', '--yes'], dir).status).toBe(0);
  const added = runCli(
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
      `Body of ${title}.`,
    ],
    dir
  );
  expect(added.status).toBe(0);
  const noteId = added.stdout.match(/mem_[0-9a-zA-Z_]+/)?.[0] ?? '';
  expect(noteId).not.toBe('');
  const wt = join(parent, 'wt');
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'wtb'], { cwd: dir });
  return { dir, noteId, wt };
}

/** Реальный git-репо с одним linked worktree, без CLI (прецедент corruption-теста). */
function makeRepo(name: string): { root: string; wt: string } {
  const root = mkdtempSync(join(tmpdir(), `wolf-p1-${name}-`));
  cleanupDirs.push(root);
  mkdirSync(join(root, 'main'));
  const main = join(root, 'main');
  const git = (args: string[]): void => execFileSync('git', args, { cwd: main, stdio: 'pipe' });
  git(['init', '-q', '.']);
  git(['config', 'user.email', 't@t.local']);
  git(['config', 'user.name', 't']);
  writeFileSync(join(main, 'f.txt'), 'x\n');
  git(['add', '.']);
  git(['commit', '-qm', 'init']);
  const wt = join(root, 'wt');
  git(['worktree', 'add', '-q', wt, '-b', 'wtb']);
  return { root: main, wt };
}

function seedWtJournal(wt: string, text: string): void {
  mkdirSync(join(wt, '.wolf', 'memory'), { recursive: true });
  writeFileSync(join(wt, JOURNAL), text, 'utf8');
}

/** Первый brief: публикует пустой журнал + маркер v2 complete:true и доставляет
 *  заметку; возвращает ревизию заметки (12 hex) из delivery-строки журнала. */
function firstBrief(p: Proj, title: string): string {
  const b = runCli(['brief'], p.dir);
  expect(b.status).toBe(0);
  expect(b.stdout).toContain(title);
  const delivery = readFileSync(join(p.dir, JOURNAL), 'utf8')
    .split('\n')
    .find((l) => l.includes(`"memory_id":"${p.noteId}"`));
  expect(delivery).not.toBeUndefined();
  const revision = delivery!.match(/"revision":"([0-9a-f]{64})"/)?.[1]?.slice(0, 12) ?? '';
  expect(revision).not.toBe('');
  return revision;
}

/** Legacy-маркер 3.3.1/3.4.0 (без format) — loss-состояние для restore. */
function seedLegacyMarker(dir: string): void {
  mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
  writeFileSync(
    join(dir, MARKER),
    JSON.stringify({ migrated_at: '2026-11-01T00:00:00.000Z', sources: ['index.sqlite'] }),
    'utf8'
  );
}

function markerOf(dir: string): { format?: number; complete?: boolean; sources?: string[]; worktrees?: string[] } {
  return JSON.parse(readFileSync(join(dir, MARKER), 'utf8'));
}

function seedLegacyRow(root: string, memoryId: string, reason: string): void {
  mkdirSync(join(root, LEGACY_DIR), { recursive: true });
  const db = new Database(indexPath(root));
  db.exec(`CREATE TABLE IF NOT EXISTS micro_note_suppressions (
    memory_id TEXT NOT NULL, revision TEXT NOT NULL, reason TEXT NOT NULL,
    note_evidence TEXT NOT NULL, contradiction_evidence TEXT NOT NULL,
    suppressed_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT)`);
  db.prepare('INSERT INTO micro_note_suppressions VALUES (?,?,?,?,?,?,?,?)').run(
    memoryId,
    'legacy-rev-330',
    reason,
    `${memoryId}@legacy`,
    'legacy evidence',
    '2026-10-01T00:00:00.000Z',
    null,
    null
  );
  db.close();
}

/** Закрыть каталог (EACCES для не-root) на время fn; вернуть права ДО выхода —
 *  cleanup afterEach делает rmSync, который иначе упал бы на закрытом каталоге. */
function withClosed<T>(dir: string, fn: () => T): T {
  chmodSync(dir, 0o000);
  try {
    return fn();
  } finally {
    chmodSync(dir, 0o755);
  }
}

describe('P1: an inaccessible migration source (EACCES) is a refusal, not a silent absence', () => {
  itNonRoot('(1) wt journal dir closed at FIRST import: brief stays suspended and the disputed note is not delivered; after chmod back the suppression migrates without duplicates', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-p1-first-'));
    cleanupDirs.push(root);
    const p = makeProjectWithWorktree(root, 'P1 first import note');
    const revision = firstBrief(p, 'P1 first import note'); // фикстура: ревизия заметки
    // fresh-состояние: журнал и маркер удалены — следующий доступ = ПЕРВЫЙ импорт
    rmSync(join(p.dir, JOURNAL));
    rmSync(join(p.dir, MARKER));
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000100', p.noteId, revision)));
    const wtJournalDir = join(p.wt, '.wolf', 'memory');

    withClosed(wtJournalDir, () => {
      // первый импорт (первый brief): источник недоступен → отказ переноса,
      // suspended, спорная заметка НЕ выдана, ничего не опубликовано
      const suspended = runCli(['brief'], p.dir);
      expect(suspended.status).toBe(0);
      expect(suspended.stdout).toContain('Micro-Notes Delivery Suspended');
      expect(suspended.stdout).toMatch(/migration is unfinished/);
      expect(suspended.stdout).not.toContain('P1 first import note');
      expect(existsSync(join(p.dir, JOURNAL))).toBe(false);
      expect(existsSync(join(p.dir, MARKER))).toBe(false);
      // причина названа: путь wt-источника и EACCES (явный import повторит отказ)
      const why = runCli(['contradict', 'import'], p.dir);
      const whyOut = why.stdout + why.stderr;
      expect(whyOut).toMatch(/migration is unfinished/);
      expect(whyOut).toContain(join(p.wt, JOURNAL));
      expect(whyOut).toMatch(/EACCES/);
    });

    // права возвращены → перенос подавления без дублей; заметка подавлена
    const fixed = runCli(['brief'], p.dir);
    expect(fixed.status).toBe(0);
    expect(fixed.stdout).not.toContain('Micro-Notes Delivery Suspended');
    expect(fixed.stdout).not.toContain('P1 first import note');
    expect(markerOf(p.dir).complete).toBe(true);
    const journalAfterFix = readFileSync(join(p.dir, JOURNAL), 'utf8');
    expect((journalAfterFix.match(/cnr_20261119_000100/g) ?? []).length).toBe(1);
    // повторный brief — тот же набор записей
    const repeat = runCli(['brief'], p.dir);
    expect(repeat.status).toBe(0);
    expect(readFileSync(join(p.dir, JOURNAL), 'utf8')).toBe(journalAfterFix);
  }, 120_000);

  itNonRoot('(2) explicit `contradict import` with a closed wt source: refusal with EACCES, marker complete:false, journal bytes unchanged; after chmod back it completes without duplicates', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-p1-import-'));
    cleanupDirs.push(root);
    const p = makeProjectWithWorktree(root, 'P1 explicit import note');
    const revision = firstBrief(p, 'P1 explicit import note'); // маркер v2 complete:true
    const markerBefore = markerOf(p.dir);
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000200', p.noteId, revision)));
    const journalBefore = sha256(join(p.dir, JOURNAL));
    const wtJournalDir = join(p.wt, '.wolf', 'memory');

    withClosed(wtJournalDir, () => {
      // явный import: отказ с EACCES-причиной (не молча-успех)
      const refused = runCli(['contradict', 'import'], p.dir);
      expect(refused.status).not.toBe(0);
      const out = refused.stdout + refused.stderr;
      expect(out).toMatch(/migration is unfinished/);
      expect(out).toContain(join(p.wt, JOURNAL));
      expect(out).toMatch(/EACCES/);
      // F-C: отказ персистится — маркер v2 complete:false, журнал не изменён
      expect(markerOf(p.dir).format).toBe(2);
      expect(markerOf(p.dir).complete).toBe(false);
      expect(markerOf(p.dir).sources).toEqual(markerBefore.sources ?? []);
      expect(markerOf(p.dir).worktrees).toEqual(markerBefore.worktrees ?? []);
      expect(sha256(join(p.dir, JOURNAL))).toBe(journalBefore);
      // следующий brief: suspended, спорная заметка не выдаётся
      const suspended = runCli(['brief'], p.dir);
      expect(suspended.status).toBe(0);
      expect(suspended.stdout).toContain('Micro-Notes Delivery Suspended');
      expect(suspended.stdout).not.toContain('P1 explicit import note');
    });

    // права возвращены → перенос завершается: подавление действует, без дублей
    const fixed = runCli(['brief'], p.dir);
    expect(fixed.status).toBe(0);
    expect(fixed.stdout).not.toContain('Micro-Notes Delivery Suspended');
    expect(fixed.stdout).not.toContain('P1 explicit import note');
    expect(markerOf(p.dir).complete).toBe(true);
    const journalAfterFix = readFileSync(join(p.dir, JOURNAL), 'utf8');
    expect((journalAfterFix.match(/cnr_20261119_000200/g) ?? []).length).toBe(1);
    // повторный явный import — успех без дублей
    const again = runCli(['contradict', 'import'], p.dir);
    expect(again.status).toBe(0);
    expect(readFileSync(join(p.dir, JOURNAL), 'utf8')).toBe(journalAfterFix);
  }, 120_000);

  itNonRoot('(3) legacy index.sqlite behind a closed dir: first import refuses instead of silently skipping legacy rows; after chmod back the legacy rows migrate', () => {
    const { root, wt } = makeRepo('sqlite');
    seedLegacyRow(root, 'n_legacy', 'P1 legacy reason');
    seedWtJournal(wt, supLine(sup('cnr_20261119_000300', 'n_wt')));
    const log = new JsonlMicroNoteDeliveryLog(root);

    withClosed(join(root, LEGACY_DIR), () => {
      let message = '';
      try {
        log.suppressions();
      } catch (e) {
        if (e instanceof JournalMigrationIncompleteError) message = e.message;
        else throw e;
      }
      expect(message).toMatch(/migration is unfinished/);
      expect(message).toContain(join(root, LEGACY_DIR, 'index.sqlite'));
      expect(message).toMatch(/EACCES/);
      // приёмка: перенос не завершён — ни журнал, ни маркер не опубликованы
      expect(existsSync(join(root, JOURNAL))).toBe(false);
      expect(existsSync(join(root, MARKER))).toBe(false);
    });

    // права возвращены → первый импорт переносит legacy-строки и wt-журнал
    const ids = log.suppressions().map((s) => s.suppression_id);
    expect(ids).toContain('cnr_20261119_000300'); // wt-источник
    expect(ids).toContain('cnr_20261001_000001'); // legacy-строка (день из suppressed_at)
    expect(markerOf(root).complete).toBe(true);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toContain('n_legacy');
  });

  itNonRoot('(4) `contradict restore` with a closed legacy source among recorded sources: explicit refusal naming path+EACCES, not a silent success from the healthy wt source; after chmod back restore rebuilds everything', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-p1-restore-'));
    cleanupDirs.push(root);
    const p = makeProjectWithWorktree(root, 'P1 restore note');
    seedLegacyRow(p.dir, 'n_legacy', 'P1 restore legacy');
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000400', p.noteId)));
    seedLegacyMarker(p.dir); // loss-состояние: журнала нет, маркер есть
    expect(existsSync(join(p.dir, JOURNAL))).toBe(false);

    withClosed(join(p.dir, LEGACY_DIR), () => {
      const refused = runCli(['contradict', 'restore'], p.dir);
      expect(refused.status).not.toBe(0);
      const out = refused.stdout + refused.stderr;
      expect(out).toMatch(/restore refused invalid sources/);
      expect(out).toContain(join(p.dir, LEGACY_DIR, 'index.sqlite'));
      expect(out).toMatch(/EACCES/);
      expect(out).toMatch(/nothing was written/);
      expect(existsSync(join(p.dir, JOURNAL))).toBe(false);
    });

    // права возвращены → restore собирает журнал из ОБОИХ источников
    const report = runCli(['contradict', 'restore'], p.dir);
    expect(report.status).toBe(0);
    expect(markerOf(p.dir).complete).toBe(true);
    const journal = readFileSync(join(p.dir, JOURNAL), 'utf8');
    expect(journal).toContain('n_legacy');
    expect(journal).toContain('cnr_20261119_000400');
    expect(report.stdout).toContain('index.sqlite');
    expect(report.stdout).toContain('worktree-journal');
  }, 120_000);

  it('(5) regression: a genuinely absent source (ENOENT — the wt journal dir was removed) is still honestly skipped; the migration completes without it', () => {
    const { root, wt } = makeRepo('enoent');
    seedLegacyRow(root, 'n_legacy', 'P1 enoent legacy');
    seedWtJournal(wt, supLine(sup('cnr_20261119_000500', 'n_wt')));
    rmSync(join(wt, '.wolf'), { recursive: true, force: true }); // ENOENT на пути журнала
    const log = new JsonlMicroNoteDeliveryLog(root);
    // прежнее поведение: отсутствующий источник честно пропускается, перенос
    // завершается по оставшимся источникам
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261001_000001']);
    expect(markerOf(root).complete).toBe(true);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).not.toContain('cnr_20261119_000500');
  });
});
