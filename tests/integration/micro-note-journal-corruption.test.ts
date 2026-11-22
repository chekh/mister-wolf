import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  JsonlMicroNoteDeliveryLog,
  JournalMigrationIncompleteError,
} from '../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import type { MicroNoteSuppressionRecord } from '../../src/ports/micro-note-delivery-log.port.js';

// patch 3.4.2 review (F-A/F-B/F-C): обработка ошибок импорта журнала доставки
// микро-заметок. F-A: толерантность к обрыву wt-журнала — ТОЛЬКО последний
// фрагмент split('\n') при отсутствии завершающего '\n' (crash в append);
// битая строка С '\n' и битая середина отвергают источник ЦЕЛИКОМ с номером
// строки. F-B: completion pass валидирует ВЕСЬ общий журнал строго (семантика
// load(), REQ-332-3) ДО любых мутаций — при отказе байты журнала и маркер
// не изменяются. F-C: отказ явного `contradict import` персистится — маркер
// complete:false под журнальным локом; следующий brief идёт в completion pass
// (suspended, пока источник повреждён; идемпотентное завершение после починки).
// Ключевые проверки — отдельный процесс CLI (dist/bootstrap/cli.js, прецедент:
// micro-note-journal-races); состояние журнала/маркера — прямые чтения
// (sha256 байтов, JSON маркера).

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO_ROOT, 'dist', 'bootstrap', 'cli.js');
const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');
const MARKER = join('.wolf', 'memory', 'micro-note-delivery.migrated.json');

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

/** Проект с одной micro-note и linked worktree: git init + init --yes + add + worktree add.
 *  Журнал/маркер ещё НЕ созданы (их создаёт первый brief/report/import). */
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
  // HEAD должен существовать: git worktree add -b на unborn-ветке отказывает на
  // старых git (образ Docker-джобы), новые версии допускают — делаем явный commit
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'wtb'], { cwd: dir });
  return { dir, noteId, wt };
}

function seedWtJournal(wt: string, text: string): void {
  mkdirSync(join(wt, '.wolf', 'memory'), { recursive: true });
  writeFileSync(join(wt, JOURNAL), text, 'utf8');
}

/** Первый brief: публикует пустой журнал + маркер v2 complete:true и доставляет
 *  заметку; возвращает текущую ревизию заметки (12 hex) из delivery-строки журнала. */
function firstBrief(p: Proj, title: string): string {
  const b = runCli(['brief'], p.dir);
  expect(b.status).toBe(0);
  expect(b.stdout).toContain(title); // заметка доставлена (маркер complete:true)
  const delivery = readFileSync(join(p.dir, JOURNAL), 'utf8')
    .split('\n')
    .find((l) => l.includes(`"memory_id":"${p.noteId}"`));
  expect(delivery).not.toBeUndefined();
  // delivery-строка несёт полную ревизию learning-signal; suppression биндится
  // к 12-hex префиксу (как пишет contradict report, suppressionRevisionMatches)
  const revision = delivery!.match(/"revision":"([0-9a-f]{64})"/)?.[1]?.slice(0, 12) ?? '';
  expect(revision).not.toBe('');
  return revision;
}

/** Маркер 3.3.1/3.4.0 (без format) — перенос не доказан, следующий доступ идёт
 *  в completion pass. */
function seedLegacyMarker(dir: string): void {
  writeFileSync(
    join(dir, MARKER),
    JSON.stringify({ migrated_at: '2026-11-01T00:00:00.000Z', sources: ['worktree-journal'] }),
    'utf8'
  );
}

function markerOf(dir: string): { format?: number; complete?: boolean; sources?: string[]; worktrees?: string[] } {
  return JSON.parse(readFileSync(join(dir, MARKER), 'utf8'));
}

/** Битая JSON-строка С завершающим '\n': по F-A источник отвергается целиком. */
const CORRUPTED_LINE_WITH_NL = '{"kind":"suppression","record":{"suppression_id":"cnr_broken"\n';

describe('F-A: wt-source tolerance only for a torn LAST fragment without \\n', () => {
  /** Реальный git-репо с одним linked worktree (без CLI — адаптер напрямую). */
  function makeRepo(name: string): { root: string; wt: string } {
    const root = mkdtempSync(join(tmpdir(), `wolf-jc-${name}-`));
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

  it('(а) a corrupted LAST line WITH \\n refuses the source entirely (line named); nothing is published', () => {
    const { root, wt } = makeRepo('fa-nl');
    seedWtJournal(wt, supLine(sup('cnr_20261119_000001', 'nA')) + CORRUPTED_LINE_WITH_NL);

    const log = new JsonlMicroNoteDeliveryLog(root);
    let message = '';
    try {
      log.suppressions();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).toMatch(/migration is unfinished/);
    expect(message).toContain(join(wt, JOURNAL)); // источник назван
    expect(message).toMatch(/line 2/); // причина указывает номер строки
    // ничего не опубликовано: валидный префикс тоже не перенесён (all-or-nothing)
    expect(existsSync(join(root, JOURNAL))).toBe(false);
    expect(existsSync(join(root, MARKER))).toBe(false);

    // починка источника → перенос завершается, префикс не потерян
    seedWtJournal(wt, supLine(sup('cnr_20261119_000001', 'nA')));
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000001']);
    expect(markerOf(root).complete).toBe(true);
  });

  it('(б) a real torn tail WITHOUT \\n keeps the valid prefix — the migration completes (regression)', () => {
    const { root, wt } = makeRepo('fa-torn');
    seedWtJournal(
      wt,
      supLine(sup('cnr_20261119_000010', 'nB')) +
        JSON.stringify({ kind: 'suppression', record: sup('cnr_20261119_000011', 'nB2') }).slice(0, 40) // обрывок без \n
    );

    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000010']);
    expect(markerOf(root).complete).toBe(true);
    const journal = readFileSync(join(root, JOURNAL), 'utf8');
    expect(journal).toContain('cnr_20261119_000010');
    expect(journal).not.toContain('cnr_20261119_000011'); // обрывок отброшен
  });

  it('(в) a corrupted line in the MIDDLE refuses the source entirely (regression)', () => {
    const { root, wt } = makeRepo('fa-mid');
    seedWtJournal(
      wt,
      supLine(sup('cnr_20261119_000020', 'nC')) + 'garbage line\n' + supLine(sup('cnr_20261119_000021', 'nC2'))
    );

    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(() => log.suppressions()).toThrow(JournalMigrationIncompleteError);
    expect(existsSync(join(root, JOURNAL))).toBe(false);
    expect(existsSync(join(root, MARKER))).toBe(false);
  });
});

/** Приёмка (текст владельца ревью): состояние журнала и маркера сразу после
 *  ошибки, затем brief отдельным процессом; пока перенос неполон — спорная
 *  заметка не выдаётся; после починки источника подавление восстановлено и
 *  повторный запуск сохраняет тот же набор записей. */
describe('F-A(a) acceptance: refused wt source suspends delivery via a separate brief process', () => {
  it('a corrupted wt tail line with \\n keeps brief suspended; after the fix the suppression is restored without duplicates', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-jc-fa-accept-'));
    cleanupDirs.push(root);
    const p = makeProjectWithWorktree(root, 'FA acceptance note');
    const revision = firstBrief(p, 'FA acceptance note'); // журнал + маркер v2 + ревизия заметки

    // 3.3.1-маркер → следующий доступ идёт в completion pass
    seedLegacyMarker(p.dir);
    // wt-журнал: подавление спорной заметки + битая последняя строка С '\n'
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000030', p.noteId, revision)) + CORRUPTED_LINE_WITH_NL);
    const journalBefore = sha256(join(p.dir, JOURNAL));

    // brief: источник отказан → перенос незавершён → suspended, заметка не выдаётся
    const suspended = runCli(['brief'], p.dir);
    expect(suspended.status).toBe(0);
    expect(suspended.stdout).toContain('Micro-Notes Delivery Suspended');
    expect(suspended.stdout).toMatch(/migration is unfinished/);
    expect(suspended.stdout).not.toContain('FA acceptance note');
    // состояние не изменено: журнал побайтово тот же, маркер остался 3.3.1 (не переписан)
    expect(sha256(join(p.dir, JOURNAL))).toBe(journalBefore);
    expect(markerOf(p.dir).format).toBeUndefined();

    // источник починен → brief завершает перенос: подавление действует, без дублей
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000030', p.noteId, revision)));
    const fixed = runCli(['brief'], p.dir);
    expect(fixed.status).toBe(0);
    expect(fixed.stdout).not.toContain('Micro-Notes Delivery Suspended');
    expect(fixed.stdout).not.toContain('FA acceptance note'); // подавлена, не «выдана»
    expect(markerOf(p.dir).complete).toBe(true);
    const journalAfterFix = readFileSync(join(p.dir, JOURNAL), 'utf8');
    expect((journalAfterFix.match(/cnr_20261119_000030/g) ?? []).length).toBe(1);

    // повторный запуск сохраняет тот же набор записей
    const repeat = runCli(['brief'], p.dir);
    expect(repeat.status).toBe(0);
    expect(repeat.stdout).not.toContain('FA acceptance note');
    expect(readFileSync(join(p.dir, JOURNAL), 'utf8')).toBe(journalAfterFix);
  }, 60_000);
});

describe('F-B: completion pass validates the whole shared journal BEFORE any mutation', () => {
  it('a corrupted shared journal (mid-file, with \\n) + a healthy wt journal: error, bytes unchanged, brief suspended; the fix completes idempotently', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-jc-fb-'));
    cleanupDirs.push(root);
    const p = makeProjectWithWorktree(root, 'FB acceptance note');
    const revision = firstBrief(p, 'FB acceptance note');

    // общий журнал повреждён в середине (битая строка С '\n'), маркер 3.3.1 →
    // следующий доступ идёт в completion pass; wt-журнал исправен и содержит
    // подавление спорной заметки
    seedLegacyMarker(p.dir);
    writeFileSync(
      join(p.dir, JOURNAL),
      supLine(sup('cnr_20261119_000040', 'mem_other')) + CORRUPTED_LINE_WITH_NL,
      'utf8'
    );
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000041', p.noteId, revision)));
    const journalBefore = sha256(join(p.dir, JOURNAL));
    const markerBefore = sha256(join(p.dir, MARKER));

    // brief: completion отказывает ДО мутаций → suspended, байты не изменены
    const suspended = runCli(['brief'], p.dir);
    expect(suspended.status).toBe(0);
    expect(suspended.stdout).toContain('Micro-Notes Delivery Suspended');
    expect(suspended.stdout).not.toContain('FB acceptance note');
    expect(sha256(join(p.dir, JOURNAL))).toBe(journalBefore);
    expect(sha256(join(p.dir, MARKER))).toBe(markerBefore);

    // общий журнал починен → completion завершается: подавление действует
    writeFileSync(join(p.dir, JOURNAL), supLine(sup('cnr_20261119_000040', 'mem_other')), 'utf8');
    const fixed = runCli(['brief'], p.dir);
    expect(fixed.status).toBe(0);
    expect(fixed.stdout).not.toContain('Micro-Notes Delivery Suspended');
    expect(fixed.stdout).not.toContain('FB acceptance note'); // подавлена
    expect(markerOf(p.dir).complete).toBe(true);
    const journalAfterFix = readFileSync(join(p.dir, JOURNAL), 'utf8');
    expect((journalAfterFix.match(/cnr_20261119_000041/g) ?? []).length).toBe(1); // без дублей

    // повторный brief — тот же набор записей
    const repeat = runCli(['brief'], p.dir);
    expect(repeat.status).toBe(0);
    expect(repeat.stdout).not.toContain('FB acceptance note');
    expect(readFileSync(join(p.dir, JOURNAL), 'utf8')).toBe(journalAfterFix);
  }, 60_000);
});

describe('F-C: an explicit import refusal is persisted (marker complete:false)', () => {
  it('a refused source flips the proven marker to complete:false without touching the journal; the next brief is suspended; the fixed source completes without duplicates', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-jc-fc-'));
    cleanupDirs.push(root);
    const p = makeProjectWithWorktree(root, 'FC acceptance note');
    const revision = firstBrief(p, 'FC acceptance note'); // маркер v2 complete:true
    const markerBefore = markerOf(p.dir);

    // подавление спорной заметки ТОЛЬКО в wt-источнике; источник повреждён
    // (битая последняя строка С '\n')
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000050', p.noteId, revision)) + CORRUPTED_LINE_WITH_NL);
    const journalBefore = sha256(join(p.dir, JOURNAL));

    // явный import возвращает ошибку И переводит маркер в complete:false;
    // журнал не мутирует
    const refused = runCli(['contradict', 'import'], p.dir);
    expect(refused.status).not.toBe(0);
    expect(refused.stdout + refused.stderr).toMatch(/migration is unfinished/);
    expect(markerOf(p.dir).format).toBe(2);
    expect(markerOf(p.dir).complete).toBe(false); // незавершённый импорт персистится
    // F-N2 (ревью 990204da): provenance-поля маркера сохраняются при перезаписи
    // (равны значениям ДО отказа; в этой фикстуре первый импорт шёл при пустом
    // wt-источнике — sources=[], worktrees — реальное перечисление)
    expect(markerOf(p.dir).sources).toEqual(markerBefore.sources ?? []);
    expect(markerOf(p.dir).worktrees).toEqual(markerBefore.worktrees ?? []);
    expect(sha256(join(p.dir, JOURNAL))).toBe(journalBefore); // журнал не изменён

    // следующий brief: не выдаёт спорную заметку (suspended — источник всё ещё повреждён)
    const suspended = runCli(['brief'], p.dir);
    expect(suspended.status).toBe(0);
    expect(suspended.stdout).toContain('Micro-Notes Delivery Suspended');
    expect(suspended.stdout).not.toContain('FC acceptance note');

    // источник починен → brief завершает перенос: подавление восстановлено, без дублей
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000050', p.noteId, revision)));
    const fixed = runCli(['brief'], p.dir);
    expect(fixed.status).toBe(0);
    expect(fixed.stdout).not.toContain('Micro-Notes Delivery Suspended');
    expect(fixed.stdout).not.toContain('FC acceptance note'); // подавлена
    expect(markerOf(p.dir).complete).toBe(true);
    const journalAfterFix = readFileSync(join(p.dir, JOURNAL), 'utf8');
    expect((journalAfterFix.match(/cnr_20261119_000050/g) ?? []).length).toBe(1);

    // повторный явный import после починки — успех без дублей
    const again = runCli(['contradict', 'import'], p.dir);
    expect(again.status).toBe(0);
    expect(readFileSync(join(p.dir, JOURNAL), 'utf8')).toBe(journalAfterFix);
  }, 90_000);

  it('a FIRST import refusal with no journal and no marker writes nothing; the next brief is suspended by itself', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-jc-fc-first-'));
    cleanupDirs.push(root);
    const p = makeProjectWithWorktree(root, 'FC first note');
    seedWtJournal(p.wt, supLine(sup('cnr_20261119_000060', p.noteId)) + CORRUPTED_LINE_WITH_NL);

    // первый импорт отказал — НИЧЕГО не записано (ни журнала, ни маркера)
    const refused = runCli(['contradict', 'import'], p.dir);
    expect(refused.status).not.toBe(0);
    expect(refused.stdout + refused.stderr).toMatch(/migration is unfinished/);
    expect(existsSync(join(p.dir, JOURNAL))).toBe(false);
    expect(existsSync(join(p.dir, MARKER))).toBe(false);

    // следующий brief сам заходит в миграцию и остаётся suspended
    const suspended = runCli(['brief'], p.dir);
    expect(suspended.status).toBe(0);
    expect(suspended.stdout).toContain('Micro-Notes Delivery Suspended');
    expect(suspended.stdout).not.toContain('FC first note');
  }, 60_000);
});
