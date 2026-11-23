import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import {
  JsonlMicroNoteDeliveryLog,
  JournalMigrationIncompleteError,
  JournalStateUnknownError,
} from '../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { listWorktreeCheckouts } from '../../src/adapters/fs/memory-root.js';
import { indexPath } from '../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../src/domain/errors.js';
import type { MicroNoteSuppressionRecord } from '../../src/ports/micro-note-delivery-log.port.js';

// patch 3.4.x review: незавершённый перенос журнала (F1.2) и validate-before-
// publish (F3). Completion pass — журнал без v2-маркера (3.3.1/3.4.0 или окно
// сбоя) довосстанавливается при первом доступе: wt-источники перечисляются и
// сливаются идемпотентно; публикация первого импорта/restore выполняется
// только когда ВСЕ источники валидны. listWorktreeCheckouts (F1.1) — парсинг
// `git worktree list --porcelain -z` без trim (имена каталогов с пробелом
// в конце валидны). Реальный git (child_process) в tmp, очистка в afterEach.

const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');
const MARKER = join('.wolf', 'memory', 'micro-note-delivery.migrated.json');

/** chmod-тесты значимы только для не-root (root читает «закрытые» каталоги
 *  мимо прав; прецедент F-1 ревью ef61bfaf) — скипаются громко, не false-green. */
const RUN_AS_NON_ROOT = process.getuid?.() !== 0;
const itNonRoot = RUN_AS_NON_ROOT ? it : it.skip;

function sup(
  id: string,
  memoryId: string,
  overrides: Partial<MicroNoteSuppressionRecord> = {}
): MicroNoteSuppressionRecord {
  return {
    suppression_id: id,
    memory_id: memoryId,
    revision: 'a'.repeat(40),
    // причина БЕЗ id: якоря-счётчики считают ВХОЖДЕНИЯ id в файле журнала
    reason: 'observed contradiction',
    note_evidence: `${memoryId}@${'a'.repeat(12)}`,
    contradiction_evidence: `observed against ${memoryId}`,
    suppressed_at: '2026-11-19T00:00:00.000Z',
    resolved_at: null,
    resolution: null,
    ...overrides,
  };
}

function line(record: MicroNoteSuppressionRecord): string {
  return `${JSON.stringify({ kind: 'suppression', record })}\n`;
}

const cleanupDirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (cleanupDirs.length > 0) {
    const d = cleanupDirs.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

/** Реальный git-репо с одним linked worktree; возвращает пути [root, wt]. */
function makeRepo(name: string): { root: string; wt: string } {
  const root = mkdtempSync(join(tmpdir(), `wolf-mig-${name}-`));
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

function seedLegacyRow(root: string, memoryId: string, reason: string): void {
  mkdirSync(join(root, '.wolf', 'cache'), { recursive: true });
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

/** Legacy-маркер формата 3.3.1/3.4.0 (без поля format — перенос не доказан). */
function seedLegacyMarker(root: string): void {
  mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
  writeFileSync(
    join(root, MARKER),
    JSON.stringify({ migrated_at: '2026-11-01T00:00:00.000Z', sources: ['index.sqlite'] }),
    'utf8'
  );
}

function markerOf(root: string): { format: number; complete: boolean; sources: string[]; worktrees: string[] } {
  return JSON.parse(readFileSync(join(root, MARKER), 'utf8'));
}

describe('listWorktreeCheckouts (patch 3.4.x review F1.1: porcelain -z, no trim)', () => {
  it('returns the full path of a linked worktree whose directory name ends with a space', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-wt-space-'));
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
    // имя каталога с пробелом в конце — валидно и не должно искажаться
    const trailingSpaceDir = join(root, 'wt ');
    git(['worktree', 'add', '-q', trailingSpaceDir, '-b', 'wtb']);

    const enumeration = listWorktreeCheckouts(main);
    expect(enumeration).not.toBeNull();
    expect(enumeration!.refusals).toEqual([]); // все пути канонизированы
    const paths = enumeration!.paths;
    const realMain = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: main, encoding: 'utf8' }).trim();
    // realpath каталогов: listWorktreeCheckouts канонизирует пути
    const realTrailingSpace = realpathSync(trailingSpaceDir);
    expect(paths!.some((p) => p === realTrailingSpace)).toBe(true); // без trim, путь целиком
    expect(paths).toContain(realMain);
    // -z-парсинг не «склеивает» записи: два чекаута → две записи
    expect(paths!.length).toBe(2);
  });
  it('a vanished worktree directory is skipped; a broken git repo yields null (fail-closed)', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-wt-vanish-'));
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
    rmSync(wt, { recursive: true, force: true }); // каталог исчез

    const enumeration = listWorktreeCheckouts(main);
    expect(enumeration).not.toBeNull();
    expect(enumeration!.paths.some((p) => p === wt)).toBe(false);
    expect(enumeration!.refusals).toEqual([]); // исчезнувшая запись — не отказ

    // не-git каталог: git-спавн падает → null (fail-closed)
    const nogit = mkdtempSync(join(tmpdir(), 'wolf-wt-nogit-'));
    cleanupDirs.push(nogit);
    expect(listWorktreeCheckouts(nogit)).toBeNull();
  });

  itNonRoot(
    'patch 3.4.4 review (P1): a registered worktree behind an INACCESSIBLE PARENT is a per-path refusal (EACCES) outside paths, not a silent absence; ENOENT (removed dir) stays a skip',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'wolf-wt-eacces-'));
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
      // wt в ОТДЕЛЬНОМ родителе (сценарий владельца): закрывается РОДИТЕЛЬ,
      // не сам wt — realpath записи отбивается на родителе с EACCES
      const wtParent = join(root, 'wt-parent');
      mkdirSync(wtParent);
      const wt = join(wtParent, 'wt');
      git(['worktree', 'add', '-q', wt, '-b', 'wtb']);
      const realMain = realpathSync(main);

      chmodSync(wtParent, 0o000);
      try {
        const enumeration = listWorktreeCheckouts(main);
        expect(enumeration).not.toBeNull(); // git-спавн успешен (проверено: git отдаёт запись + prunable)
        expect(enumeration!.refusals).toHaveLength(1);
        expect(enumeration!.refusals[0]).toContain(wt); // путь и код в отказе
        expect(enumeration!.refusals[0]).toMatch(/EACCES/);
        expect(enumeration!.paths).toEqual([realMain]); // закрытый путь НЕ в путях
      } finally {
        chmodSync(wtParent, 0o755); // права возвращаются ДО rmSync в afterEach
      }

      // права возвращены → путь снова перечисляется (канонизирован)
      expect(listWorktreeCheckouts(main)!.paths).toContain(realpathSync(wt));

      // ENOENT (каталог wt удалён) — по-прежнему честный пропуск без отказа
      rmSync(wt, { recursive: true, force: true });
      const after = listWorktreeCheckouts(main)!;
      expect(after.paths).toEqual([realMain]);
      expect(after.refusals).toEqual([]);
    }
  );
});

describe('completion pass (patch 3.4.x review F1.2: marker v2 proves the migration)', () => {
  it('a legacy-marker journal plus a wt journal with a suppression: the first access completes the migration, a repeat adds no duplicates', () => {
    const { root, wt } = makeRepo('comp');
    // главный журнал 3.3.1 (подавление A) + legacy-маркер + wt-журнал (подавление B)
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(root, JOURNAL), line(sup('cnr_20261119_000001', 'nA')), 'utf8');
    seedLegacyMarker(root);
    seedWtJournal(wt, line(sup('cnr_20261119_000002', 'nB')));

    const log = new JsonlMicroNoteDeliveryLog(root);
    const ids = log.suppressions().map((s) => s.suppression_id);
    expect(ids).toEqual(['cnr_20261119_000001', 'cnr_20261119_000002']); // A и B перенесены

    // маркер переписан в v2 с перечисленными wt-путями (канонизированными)
    const marker = markerOf(root);
    expect(marker.format).toBe(2);
    expect(marker.complete).toBe(true);
    expect(marker.worktrees).toContain(realpathSync(wt));

    // повторный доступ без дублей
    const snapshot = readFileSync(join(root, JOURNAL), 'utf8');
    expect(new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id)).toEqual(ids);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(snapshot);
    expect((snapshot.match(/cnr_20261119_000002/g) ?? []).length).toBe(1);
  });

  it('a journal with NO marker (crash window): the same completion pass runs and the state is preserved', () => {
    const { root, wt } = makeRepo('comp-nomarker');
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(root, JOURNAL), line(sup('cnr_20261119_000003', 'nC')), 'utf8');
    seedWtJournal(wt, line(sup('cnr_20261119_000004', 'nD')));

    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000003', 'cnr_20261119_000004']);
    expect(markerOf(root).complete).toBe(true);
    // journal-only snapshot stays single-copy
    expect((readFileSync(join(root, JOURNAL), 'utf8').match(/cnr_20261119_000003/g) ?? []).length).toBe(1);
  });

  it('an already-resolved (released) record does not come back open after the completion pass', () => {
    const { root, wt } = makeRepo('comp-resolved');
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    // в общем журнале запись уже РАЗРЕШЕНА (снимок решения последняя строка)
    writeFileSync(
      join(root, JOURNAL),
      line(sup('cnr_20261119_000005', 'nE')) +
        line({ ...sup('cnr_20261119_000005', 'nE'), resolved_at: '2026-11-20T00:00:00.000Z', resolution: 'done' }),
      'utf8'
    );
    seedLegacyMarker(root);
    // wt-журнал содержит старый открытый снимок той же записи (≤3.3.1 снапшот)
    seedWtJournal(wt, line(sup('cnr_20261119_000005', 'nE')));

    const log = new JsonlMicroNoteDeliveryLog(root);
    const records = log.suppressions();
    expect(records).toHaveLength(1);
    expect(records[0]!.resolved_at).not.toBeNull(); // разрешённая не вернулась в открытое состояние
    expect(markerOf(root).format).toBe(2);
  });

  it('a refused wt source suspends the completion pass: nothing is written, the error lists the refusal', () => {
    const { root, wt } = makeRepo('comp-refused');
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(root, JOURNAL), line(sup('cnr_20261119_000006', 'nF')), 'utf8');
    seedLegacyMarker(root);
    // wt-журнал: валидная строка + НЕВАЛИДНАЯ строка В СЕРЕДИНЕ (structure) — источник отвергается целиком
    seedWtJournal(
      wt,
      line(sup('cnr_20261119_000007', 'nG')) +
        JSON.stringify({ kind: 'suppression', record: { suppression_id: 'broken' } }) +
        '\n' +
        line(sup('cnr_20261119_000008', 'nH'))
    );

    const before = readFileSync(join(root, JOURNAL), 'utf8');
    const log = new JsonlMicroNoteDeliveryLog(root);
    let message = '';
    try {
      log.suppressions();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/migration is unfinished/);
    expect(message).toContain(join(wt, JOURNAL));
    // ничего не написано: журнал и маркер не изменены
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(before);
    expect(markerOf(root).format).toBeUndefined(); // legacy-маркер не переписан
    // после исправления источника перенос завершается
    seedWtJournal(wt, line(sup('cnr_20261119_000007', 'nG')) + line(sup('cnr_20261119_000008', 'nH')));
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual([
      'cnr_20261119_000006',
      'cnr_20261119_000007',
      'cnr_20261119_000008',
    ]);
    expect(markerOf(root).complete).toBe(true);
  });
});

describe('first import validate-before-publish (patch 3.4.x review F3.4)', () => {
  it('(а) a wt source with a valid line plus a torn tail (no \\n) keeps the valid prefix — the import completes', () => {
    const { root, wt } = makeRepo('val-tail');
    seedWtJournal(
      wt,
      line(sup('cnr_20261119_000010', 'n1')) +
        JSON.stringify({ kind: 'suppression', record: sup('cnr_20261119_000011', 'n2') }).slice(0, 40) // обрывок без \n
    );

    const log = new JsonlMicroNoteDeliveryLog(root);
    const ids = log.suppressions().map((s) => s.suppression_id);
    expect(ids).toEqual(['cnr_20261119_000010']); // префикс сохранён, обрывок отброшен
    expect(markerOf(root).complete).toBe(true);
    expect(markerOf(root).worktrees).toContain(realpathSync(wt));
    // журнал опубликован одной публикацией; обрывок (000011) не попал
    const journal = readFileSync(join(root, JOURNAL), 'utf8');
    expect(journal).toContain('cnr_20261119_000010');
    expect(journal).not.toContain('cnr_20261119_000011');
    expect(journal.endsWith('\n')).toBe(true);
  });

  it('(б) an invalid FULL record in the legacy SQLite refuses the source: no journal, no marker, the error lists it, a repeat behaves the same', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-mig-val-sqlite-'));
    cleanupDirs.push(root);
    seedLegacyRow(root, 'n_bad', 'legacy with a null reason');
    // портим строку: reason = NULL в таблице → String(null) = 'null'... вместо
    // этого удалим обязательное поле: unsupported revision type — эмулируем
    // невалидную ПОЛНУЮ запись через пустой memory_id
    const db = new Database(indexPath(root));
    db.prepare('UPDATE micro_note_suppressions SET memory_id = ?').run('');
    db.close();

    const log = new JsonlMicroNoteDeliveryLog(root);
    const refuse = (): string => {
      try {
        log.suppressions();
        return 'NO ERROR';
      } catch (e) {
        return (e as Error).message;
      }
    };
    const first = refuse();
    expect(first).toMatch(/migration is unfinished/);
    expect(first).toContain('index.sqlite');
    expect(first).toMatch(/memory_id must be a non-empty string/);
    // ничего не опубликовано
    expect(existsSync(join(root, JOURNAL))).toBe(false);
    expect(existsSync(join(root, MARKER))).toBe(false);
    // повторный вызов — то же поведение
    const second = refuse();
    expect(second).toMatch(/migration is unfinished/);
    expect(existsSync(join(root, JOURNAL))).toBe(false);
  });

  it('(в) one valid + one corrupted source: JournalMigrationIncompleteError, no publication; after fixing the source the import completes without duplicates', () => {
    const { root, wt } = makeRepo('val-mixed');
    seedWtJournal(wt, line(sup('cnr_20261119_000020', 'n3')));
    // второй wt с невалидной строкой
    mkdirSync(join(root, 'wt2'));
    execFileSync('git', ['worktree', 'add', '-q', join(root, 'wt2'), '-b', 'wtb2'], { cwd: root, stdio: 'pipe' });
    seedWtJournal(join(root, 'wt2'), `${JSON.stringify({ kind: 'wat', record: {} })}\n`);

    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(() => log.suppressions()).toThrow(JournalMigrationIncompleteError);
    // публикация отсутствует: валидный источник тоже не опубликован (all-or-nothing)
    expect(existsSync(join(root, JOURNAL))).toBe(false);
    expect(existsSync(join(root, MARKER))).toBe(false);

    // исправление источника → импорт завершается без дублей
    seedWtJournal(join(root, 'wt2'), line(sup('cnr_20261119_000021', 'n4')));
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000020', 'cnr_20261119_000021']);
    const snapshot = readFileSync(join(root, JOURNAL), 'utf8');
    expect(new JsonlMicroNoteDeliveryLog(root).suppressions()).toHaveLength(2);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(snapshot);
  });

  it('a git enumeration failure with .git present refuses the first import (git metadata unavailable)', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-mig-val-git-'));
    cleanupDirs.push(root);
    mkdirSync(join(root, '.git'), { recursive: true }); // «сломанные» git-метаданные
    const log = new JsonlMicroNoteDeliveryLog(root);
    let message = '';
    try {
      log.suppressions();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/migration is unfinished/);
    expect(message).toContain('git metadata unavailable');
    expect(existsSync(join(root, JOURNAL))).toBe(false);
    expect(existsSync(join(root, MARKER))).toBe(false);
  });

  it('an empty new project (0 lines, 0 refusals) still gets the empty journal + v2 marker in one publication', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-mig-val-empty-'));
    cleanupDirs.push(root);
    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(log.suppressions()).toEqual([]);
    expect(existsSync(join(root, JOURNAL))).toBe(true);
    const marker = markerOf(root);
    expect(marker.format).toBe(2);
    expect(marker.complete).toBe(true);
    expect(marker.sources).toEqual([]);
    expect(marker.worktrees).toEqual([]);
    // маркер v2 complete → последующие доступы идут по normal без пересмотра источников
    expect(new JsonlMicroNoteDeliveryLog(root).suppressions()).toEqual([]);
  });
});

describe('restore validate-before-publish (patch 3.4.x review F3.6)', () => {
  function lossState(root: string): void {
    // loss: маркер есть (v2 — как публикует fresh), журнала нет
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(
      join(root, MARKER),
      JSON.stringify({
        format: 2,
        migrated_at: '2026-11-01T00:00:00.000Z',
        sources: [],
        complete: true,
        worktrees: [],
      }),
      'utf8'
    );
  }

  it('(г) restore with an invalid legacy source refuses and writes nothing (journal stays absent, marker in place)', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-mig-restore-'));
    cleanupDirs.push(root);
    seedLegacyRow(root, 'n5', 'legacy reason');
    const db = new Database(indexPath(root));
    db.prepare('UPDATE micro_note_suppressions SET memory_id = ?').run('');
    db.close();
    lossState(root);

    const log = new JsonlMicroNoteDeliveryLog(root);
    let message = '';
    try {
      log.restoreFromSources();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/restore refused invalid sources/);
    expect(message).toContain('nothing was written');
    expect(message).toMatch(/memory_id must be a non-empty string/);
    expect(existsSync(join(root, JOURNAL))).toBe(false);
    expect(existsSync(join(root, MARKER))).toBe(true);

    // исправление источника → restore успешен
    const db2 = new Database(indexPath(root));
    db2.prepare('UPDATE micro_note_suppressions SET memory_id = ?').run('n5');
    db2.close();
    const report = log.restoreFromSources();
    expect(report.sources[0]!.imported.suppressions).toBe(1);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toContain('legacy reason');
  });

  it('(д) restore with one valid and one corrupted wt source writes nothing and lists both the refusal and the rule', () => {
    const { root, wt } = makeRepo('restore-refused');
    seedWtJournal(wt, `${JSON.stringify({ kind: 'suppression', record: {} })}\n`); // невалидная структура
    lossState(root);

    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(() => log.restoreFromSources()).toThrow(UserFacingError);
    let message = '';
    try {
      log.restoreFromSources();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('nothing was written — fix the source(s) and rerun restore');
    expect(message).toContain(join(wt, JOURNAL));
    expect(existsSync(join(root, JOURNAL))).toBe(false);
    expect(existsSync(join(root, MARKER))).toBe(true);
  });

  it('restore keeps the existing refusals: journal present / marker missing / nothing to restore', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-mig-restore-keep-'));
    cleanupDirs.push(root);
    const log = new JsonlMicroNoteDeliveryLog(root);

    // журнал есть → отказ
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(root, JOURNAL), '', 'utf8');
    expect(() => log.restoreFromSources()).toThrow(/restore requires a lost journal/);
    rmSync(join(root, JOURNAL));

    // маркера нет → отказ
    expect(() => log.restoreFromSources()).toThrow(/restore requires the loss state/);

    // маркер есть, источников нет → «nothing to restore», журнал не создаётся
    lossState(root);
    expect(() => log.restoreFromSources()).toThrow(/nothing to restore from/);
    expect(existsSync(join(root, JOURNAL))).toBe(false);
  });
});

describe('import validate-before-append (patch 3.4.x review F3.5)', () => {
  it('a refused wt source appends nothing and throws with the list; the valid source is not published either', () => {
    const { root, wt } = makeRepo('imp-refused');
    const log = new JsonlMicroNoteDeliveryLog(root);
    log.recordSuppression(sup('cnr_20261119_000030', 'n7')); // журнал уже есть
    const before = readFileSync(join(root, JOURNAL), 'utf8');
    // отказ 'structure' (валидный JSON, неполная структура) — источник отвергается
    // ЦЕЛИКОМ; обрыв хвоста ('json' на последнем фрагменте) по F3.2 ТЕРПИМ —
    // проверяется отдельно (тест (а) validate-before-publish)
    seedWtJournal(wt, line(sup('cnr_20261119_000031', 'n8')) + `${JSON.stringify({ kind: 'wat', record: {} })}\n`);

    let message = '';
    try {
      log.importWorktreeJournals();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/migration is unfinished/);
    expect(message).toContain(join(wt, JOURNAL));
    // валидный источник НЕ дописан (validate-before-append)
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(before);

    // исправление → импорт завершается: подавление перенесено РОВНО ОДИН раз
    // (patch 3.4.2 review F-C: отказ персистится маркером complete:false, поэтому
    // повторный import сначала завершает перенос через completion pass, и явный
    // скан может честно показать 0 новых строк — проверяем конечное состояние)
    seedWtJournal(wt, line(sup('cnr_20261119_000031', 'n8')));
    log.importWorktreeJournals();
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000030', 'cnr_20261119_000031']);
    expect((readFileSync(join(root, JOURNAL), 'utf8').match(/cnr_20261119_000031/g) ?? []).length).toBe(1);
    expect(markerOf(root).complete).toBe(true);
  });

  it('a mid-file json corruption refuses the source; a torn LAST fragment is tolerated with the prefix kept', () => {
    const { root, wt } = makeRepo('imp-tail');
    const log = new JsonlMicroNoteDeliveryLog(root);
    log.recordSuppression(sup('cnr_20261119_000032', 'n9a'));
    const before = readFileSync(join(root, JOURNAL), 'utf8');

    // обрыв ПОСЛЕДНЕГО фрагмента (без \n) — источник валиден, префикс переносится
    seedWtJournal(
      wt,
      line(sup('cnr_20261119_000033', 'n9b')) + '{"kind":"suppression","record":{"suppression_id":"cnr_torn'
    );
    const report = log.importWorktreeJournals();
    expect(report.sources[0]!.refused).toBeUndefined();
    expect(
      log
        .suppressions()
        .map((s) => s.suppression_id)
        .sort()
    ).toEqual(['cnr_20261119_000032', 'cnr_20261119_000033']);

    // отказ 'json' В СЕРЕДИНЕ файла — источник отвергается целиком, ничего не дописано
    const snapshot = readFileSync(join(root, JOURNAL), 'utf8');
    seedWtJournal(
      wt,
      line(sup('cnr_20261119_000034', 'n9c')) + 'garbage line\n' + line(sup('cnr_20261119_000035', 'n9d'))
    );
    let message = '';
    try {
      log.importWorktreeJournals();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/migration is unfinished/);
    expect(message).toContain('line 2');
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(snapshot);
  });
});

describe('loss semantics unchanged (patch 3.4.x review: «журнал отсутствует + маркер есть»)', () => {
  it('a journal loss with ANY marker (v1 or v2) still refuses with JournalStateUnknownError', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-mig-loss-'));
    cleanupDirs.push(root);
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    // loss с legacy-маркером 3.3.1: utрата не перепутать с незавершённым переносом
    writeFileSync(join(root, MARKER), JSON.stringify({ migrated_at: '2026-11-01T00:00:00.000Z', sources: [] }), 'utf8');
    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(() => log.suppressions()).toThrow(/suppression journal is missing after migration/);
    // loss с v2-маркером — то же
    writeFileSync(
      join(root, MARKER),
      JSON.stringify({
        format: 2,
        migrated_at: '2026-11-01T00:00:00.000Z',
        sources: [],
        complete: true,
        worktrees: [],
      }),
      'utf8'
    );
    expect(() => log.suppressions()).toThrow(JournalStateUnknownError);
    expect(existsSync(join(root, JOURNAL))).toBe(false);
  });
});

// patch 3.4.5 review (P1-1): ошибочный complete:true от старых версий не
// доверяется навсегда. Маркер v2 хранит sources[] и worktrees[] — они сверяются
// с ТЕКУЩИМ перечислением источников (legacy SQLite путь + wt пути): новый
// wt-путь, которого нет в worktrees (3.4.3 молча выбрасывала wt с недоступным
// родителем — маркер worktrees:[] доказан стендом repro-344), или существующий
// legacy SQLite, не записанный в sources (3.4.2 молча пропускала недоступный
// SQLite), делают маркер «подозрительным» → completion pass. Путь лечения
// обязан покрывать SQLite + wt; после успеха маркер переписывается актуальными
// списками (самоисцеление, без повторных прогонов на каждом доступе).
describe('patch 3.4.5 review P1-1: suspicious proven markers (recorded lists vs current enumeration)', () => {
  it('(1 wt) a proven marker whose worktrees list lacks an existing wt with a legacy record (real 3.4.3 shape): the first access imports the wt record once and heals the marker; the second access is stable', () => {
    const { root, wt } = makeRepo('p343-wt');
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(root, JOURNAL), line(sup('cnr_20261119_000050', 'nW1')), 'utf8');
    // маркер реальной 3.4.3 (стенд repro-344): complete:true, wt-источник выброшен
    writeFileSync(
      join(root, MARKER),
      JSON.stringify({
        format: 2,
        migrated_at: '2026-11-01T00:00:00.000Z',
        sources: [],
        complete: true,
        worktrees: [],
      }),
      'utf8'
    );
    seedWtJournal(wt, line(sup('cnr_20261119_000051', 'nW2')));

    const ids = new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id);
    expect(ids).toEqual(['cnr_20261119_000050', 'cnr_20261119_000051']); // довосстановлен первым доступом
    const marker = markerOf(root);
    expect(marker.worktrees).toContain(realpathSync(wt)); // маркер самоисцелился актуальным списком
    expect((readFileSync(join(root, JOURNAL), 'utf8').match(/cnr_20261119_000051/g) ?? []).length).toBe(1);

    // второй доступ стабилен: журнал байт-в-байт, маркер не переписан (нет повторного completion)
    const journalSnapshot = readFileSync(join(root, JOURNAL), 'utf8');
    const markerSnapshot = readFileSync(join(root, MARKER), 'utf8');
    expect(new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id)).toEqual(ids);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(journalSnapshot);
    expect(readFileSync(join(root, MARKER), 'utf8')).toBe(markerSnapshot);
  });

  it('(2 sqlite) a proven marker whose sources list lacks the existing legacy SQLite (real 3.4.2 shape): the first access migrates the legacy rows once and heals the marker; the second access is stable', () => {
    const { root, wt } = makeRepo('p342-sqlite');
    seedLegacyRow(root, 'n_legacy', '3.4.2 silently skipped legacy');
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(root, JOURNAL), line(sup('cnr_20261119_000052', 'nS1')), 'utf8');
    // маркер реальной 3.4.2 (стенд A2): contradict import с exit 0 пишет
    // complete:true с sources:[] — ЗАТИРАЯ честный список с index.sqlite;
    // index.sqlite молча пропущен, wt-перечисление тех лет сохранено
    writeFileSync(
      join(root, MARKER),
      JSON.stringify({
        format: 2,
        migrated_at: '2026-11-01T00:00:00.000Z',
        sources: [],
        complete: true,
        worktrees: [realpathSync(wt)],
      }),
      'utf8'
    );
    seedWtJournal(wt, line(sup('cnr_20261119_000053', 'nS2')));

    const ids = new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id);
    expect(ids).toContain('cnr_20261001_000001'); // legacy-строка перенесена (день suppressed_at)
    expect(ids).toContain('cnr_20261119_000052');
    expect(ids).toContain('cnr_20261119_000053');
    expect(markerOf(root).sources).toContain(indexPath(root)); // path-форма: самоисцеление
    expect((readFileSync(join(root, JOURNAL), 'utf8').match(/cnr_20261001_000001/g) ?? []).length).toBe(1);

    const journalSnapshot = readFileSync(join(root, JOURNAL), 'utf8');
    const markerSnapshot = readFileSync(join(root, MARKER), 'utf8');
    expect(new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id)).toEqual(ids);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(journalSnapshot);
    expect(readFileSync(join(root, MARKER), 'utf8')).toBe(markerSnapshot);
  });

  it('(3 benign) a proven marker whose lists match the current enumeration is trusted without a completion pass: journal and marker stay byte-identical', () => {
    const { root, wt } = makeRepo('benign-match');
    seedWtJournal(wt, line(sup('cnr_20261119_000054', 'nB1')));
    const ids = new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id); // первый импорт публикует path-форму маркера
    const journalSnapshot = readFileSync(join(root, JOURNAL), 'utf8');
    const markerSnapshot = readFileSync(join(root, MARKER), 'utf8');
    expect(markerOf(root).complete).toBe(true);
    expect(markerOf(root).worktrees).toContain(realpathSync(wt));

    // доброкачественный доступ: сверка списков сходится — без completion pass
    expect(new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id)).toEqual(ids);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(journalSnapshot);
    expect(readFileSync(join(root, MARKER), 'utf8')).toBe(markerSnapshot);
  });

  it('(4 new wt) a wt registered AFTER the migration (no legacy journal) triggers at most one healing pass: the marker is refreshed once and later accesses are stable', () => {
    const { root, wt } = makeRepo('new-wt');
    seedWtJournal(wt, line(sup('cnr_20261119_000055', 'nC1')));
    const ids = new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id);
    const journalSnapshot = readFileSync(join(root, JOURNAL), 'utf8');

    // новый wt после миграции: legacy-журнала нет (≥3.3.1 не пишет их)
    const wt2 = join(root, 'wt2');
    execFileSync('git', ['worktree', 'add', '-q', wt2, '-b', 'wtb2'], { cwd: root, stdio: 'pipe' });

    // один довосстановительный прогон максимум: списки маркера обновлены
    expect(new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id)).toEqual(ids);
    expect(markerOf(root).worktrees).toContain(realpathSync(wt2));
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(journalSnapshot); // записей не прибавилось

    // дальше стабильно: маркер больше не переписывается
    const markerSnapshot = readFileSync(join(root, MARKER), 'utf8');
    expect(new JsonlMicroNoteDeliveryLog(root).suppressions().map((s) => s.suppression_id)).toEqual(ids);
    expect(readFileSync(join(root, MARKER), 'utf8')).toBe(markerSnapshot);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(journalSnapshot);
  });

  it('(5 resolved) an already-resolved record does not come back open when the healing pass re-reads the frozen legacy SQLite', () => {
    const { root, wt } = makeRepo('resolved-sqlite');
    seedLegacyRow(root, 'n_legacy', 'resolved later in the shared journal');
    seedWtJournal(wt, line(sup('cnr_20261119_000056', 'nR1')));
    const log = new JsonlMicroNoteDeliveryLog(root);
    const legacyId = 'cnr_20261001_000001';
    expect(log.suppressions().map((s) => s.suppression_id)).toContain(legacyId); // здоровый первый импорт
    log.resolveSuppression(legacyId, 'done', '2026-11-20T00:00:00.000Z');

    // доброкачественный дрейф → один completion pass, который теперь ЧИТАЕТ
    // sqlite заново: замороженный ОТКРЫТЫЙ снимок не открывает запись снова
    const wt2 = join(root, 'wt2');
    execFileSync('git', ['worktree', 'add', '-q', wt2, '-b', 'wtb2'], { cwd: root, stdio: 'pipe' });
    const legacy = log.suppressions().find((s) => s.suppression_id === legacyId);
    expect(legacy?.resolved_at).not.toBeNull();
    // история записи не растёт: открытая строка + снимок решения, четвёртой нет
    expect((readFileSync(join(root, JOURNAL), 'utf8').match(new RegExp(legacyId, 'g')) ?? []).length).toBe(2);
  });

  it('(6 persistent suspicion) a suspicious proven marker with a refused wt source suspends repeatedly: the marker is not rewritten and the next access re-examines again', () => {
    const { root, wt } = makeRepo('suspicious-refused');
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(root, JOURNAL), line(sup('cnr_20261119_000060', 'nP1')), 'utf8');
    writeFileSync(
      join(root, MARKER),
      JSON.stringify({
        format: 2,
        migrated_at: '2026-11-01T00:00:00.000Z',
        sources: [],
        complete: true,
        worktrees: [],
      }),
      'utf8'
    );
    seedWtJournal(
      wt,
      line(sup('cnr_20261119_000061', 'nP2')) + `${JSON.stringify({ kind: 'wat', record: {} })}\n` // отказ источника
    );
    const markerBefore = readFileSync(join(root, MARKER), 'utf8');
    const journalBefore = readFileSync(join(root, JOURNAL), 'utf8');

    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(() => log.suppressions()).toThrow(/migration is unfinished/);
    // отказ лечения не переписывает подозрительный маркер и журнал...
    expect(readFileSync(join(root, MARKER), 'utf8')).toBe(markerBefore);
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toBe(journalBefore);
    // ...и НЕ доверяет ему снова: следующий доступ повторяет довосстановление
    seedWtJournal(wt, line(sup('cnr_20261119_000061', 'nP2')));
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000060', 'cnr_20261119_000061']);
    expect(markerOf(root).worktrees).toContain(realpathSync(wt));
  });
});

// Обрыв хвоста ОБЩЕГО журнала: чтение (load) отбрасывает незавершённую
// последнюю строку, запись (repairTail REQ-332-3) обрезает её до границы.
describe('shared journal torn tail (REQ-332-3 repair semantics, untouched by F3.2)', () => {
  it('a torn last fragment of the shared journal is dropped on read and truncated on the next write', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-mig-validator-'));
    cleanupDirs.push(root);
    mkdirSync(join(root, '.wolf', 'memory'), { recursive: true });
    writeFileSync(join(root, JOURNAL), line(sup('cnr_20261119_000040', 'n9')), 'utf8');
    appendFileSync(join(root, JOURNAL), '{"kind":"suppression","record":{"suppression_id":"cnr_torn', 'utf8');

    const log = new JsonlMicroNoteDeliveryLog(root);
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000040']);
    // чтение НЕ репарит хвост — обрывок ещё в файле до следующей записи
    expect(readFileSync(join(root, JOURNAL), 'utf8')).toContain('cnr_torn');

    // следующая запись проходит repairTail: обрывок обрезан, файл полными строками
    log.recordSuppression(sup('cnr_20261119_000041', 'n10'));
    const raw = readFileSync(join(root, JOURNAL), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).not.toContain('cnr_torn');
    expect(
      log
        .suppressions()
        .map((s) => s.suppression_id)
        .sort()
    ).toEqual(['cnr_20261119_000040', 'cnr_20261119_000041']);
  });
});
