import { describe, it, expect, afterEach } from 'vitest';
import { spawn, spawnSync, execFileSync } from 'child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

// REQ-333-2 (ADR-340-1): параллельные операции журнала противоречий — взаимное
// исключение. patch 3.4.x review (F2): лок — межпроцессная блокировка SQLite
// BEGIN IMMEDIATE в отдельной базе блокировки (.wolf/memory/micro-note-delivery.lock.sqlite):
// кражи по возрасту больше нет — держатель удерживает право записи дольше любого
// возраста; ожидающий процесс ждёт до busy-тайм-аута (5 с) и затем получает
// явный busy-отказ; крах владельца (kill -9) ОС/SQLite освобождают при следующем
// открытии. Проверки — РЕАЛЬНЫЕ процессы (spawn node dist/bootstrap/cli.js) с
// управляемой паузой NODE_OPTIONS="--require tests/helpers/journal-pause.cjs"
// (порт стенда repro-333: r2a/r2b/r2c).

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO_ROOT, 'dist', 'bootstrap', 'cli.js');
const PAUSE_HELPER = join(REPO_ROOT, 'tests', 'helpers', 'journal-pause.cjs');
const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');
const LOCK_DB = join('.wolf', 'memory', 'micro-note-delivery.lock.sqlite');

interface Proj {
  dir: string;
  noteId: string;
}

function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {}
): { stdout: string; stderr: string; status: number | null } {
  const { npm_command: _npxGuard, ...base } = process.env;
  const r = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...base, ...env },
  });
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
      `Body of ${title}`,
    ],
    dir
  );
  const noteId = added.stdout.match(/mem_[0-9a-zA-Z_]+/)?.[0] ?? '';
  expect(noteId).not.toBe('');
  return { dir, noteId };
}

/** Legacy-таблицы 3.3.0 с одной suppression-строкой в index.sqlite проекта. */
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

function paused(
  args: string[],
  cwd: string,
  pauseEnv: Record<string, string>,
  logFile: string
): ReturnType<typeof spawn> {
  const { npm_command: _npxGuard, ...base } = process.env;
  return spawn('node', [CLI, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...base,
      NODE_OPTIONS: `--require ${PAUSE_HELPER}`,
      PAUSE333_LOG: logFile,
      ...pauseEnv,
    },
  });
}

function journalOf(proj: Proj): string {
  return readFileSync(join(proj.dir, JOURNAL), 'utf-8');
}

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length > 0) {
    const d = cleanupDirs.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Ждёт появления записи в pause-логе = процесс реально внутри критической секции. */
async function waitForPause(logFile: string, marker: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if (readFileSync(logFile, 'utf-8').includes(marker)) return;
    } catch {
      /* лог ещё не создан */
    }
    await sleep(50);
  }
  throw new Error(`pause log never showed "${marker}"`);
}

describe('journal lock: parallel CLI operations keep the journal consistent (REQ-333-2, patch 3.4.x review)', () => {
  // T-333-2.1 (AC-2.1, r2a): repair-окно под локом — оба подтверждённых report
  // выживают; список показывает обе записи. B стартует внутри паузы A и ЖДЁТ
  // освобождения (busy-тайм-аут 5 с > пауза 2.5 с), а не крадёт лок.
  it('T-333-2.1: two reports across the repair window both survive (r2a)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-races-21-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R2A note');
    run(['contradict', 'report', '--note', proj.noteId, '--reason', 'base-suppress', '--evidence', 'e0'], proj.dir);
    // обрывок хвоста: следующий report проходит repairTail под локом
    appendFileSync(join(proj.dir, JOURNAL), '{"kind":"suppression","record":{"suppression_id":"cnr_fragn', 'utf8');

    const a = paused(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'raceA', '--evidence', 'eA'],
      proj.dir,
      { PAUSE333_TRUNCATE_MS: '2500' },
      join(root, 'a-pause.log')
    );
    await waitForPause(join(root, 'a-pause.log'), 'PAUSE before truncate');
    const b = run(['contradict', 'report', '--note', proj.noteId, '--reason', 'raceB', '--evidence', 'eB'], proj.dir);
    const aCode = await new Promise<number | null>((resolve) => a.on('exit', (c) => resolve(c)));
    expect(aCode).toBe(0);
    expect(b.status).toBe(0);
    const journal = journalOf(proj);
    expect(journal).toContain('raceA');
    expect(journal).toContain('raceB');
    const list = run(['contradict', 'list'], proj.dir);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain('raceA');
    expect(list.stdout).toContain('raceB');
  }, 40_000);

  // T-333-2.2 (AC-2.2, r2b): поздний первый импорт из SQLite не заменяет
  // журнал, уже содержащий подтверждённый report.
  it('T-333-2.2: a late first import does not replace a journal with a confirmed report (r2b)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-races-22-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R2B note');
    insertLegacyRow(proj);

    const a = paused(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'raceA', '--evidence', 'eA'],
      proj.dir,
      { PAUSE333_RENAME_MS: '2500' }, // пауза внутри окна первого импорта (tmp+rename)
      join(root, 'a-pause.log')
    );
    await waitForPause(join(root, 'a-pause.log'), 'PAUSE before rename');
    const b = run(['contradict', 'report', '--note', proj.noteId, '--reason', 'raceB', '--evidence', 'eB'], proj.dir);
    const aCode = await new Promise<number | null>((resolve) => a.on('exit', (c) => resolve(c)));
    expect(aCode).toBe(0);
    expect(b.status).toBe(0);
    const journal = journalOf(proj);
    expect(journal).toContain('raceA');
    expect(journal).toContain('raceB');
    // legacy-строка из SQLite тоже в журнале (первый импорт), raceB не потерян
    expect(journal).toContain('legacy reason');
    const list = run(['contradict', 'list'], proj.dir);
    expect(list.stdout).toContain('raceB');
  }, 40_000);

  // T-333-2.3 (AC-2.3, r2c; patch 3.4.x review F2.3): два параллельных resolve
  // одного id — лок сериализует их: ровно один успех, второй получает явный
  // отказ «unknown or already resolved»; конфликтующих снимков решения нет.
  it('T-333-2.3: two parallel resolves of one id — exactly one success, the second refuses (r2c)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-races-23-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R2C note');
    const base = run(['contradict', 'report', '--note', proj.noteId, '--reason', 'solo', '--evidence', 'e'], proj.dir);
    const c1 = base.stdout.match(/cnr_[0-9a-f_]+/)?.[0] ?? '';
    expect(c1).not.toBe('');

    // A захватывает лок и замирает на append; B спавнится ПОСЛЕ и реально
    // ждёт захвата → детерминированный победитель при настоящей конкуренции
    const a = paused(
      ['contradict', 'resolve', '--id', c1, '--resolution', 'fix A'],
      proj.dir,
      { PAUSE333_APPEND_MS: '1500' },
      join(root, 'a-pause.log')
    );
    await waitForPause(join(root, 'a-pause.log'), 'PAUSE before append');
    const b = run(['contradict', 'resolve', '--id', c1, '--resolution', 'fix B'], proj.dir);
    const aCode = await new Promise<number | null>((resolve) => a.on('exit', (c) => resolve(c)));
    expect(aCode).toBe(0);
    expect(b.status).not.toBe(0);
    expect(b.stdout + b.stderr).toContain('unknown or already resolved');
    const journal = journalOf(proj);
    // ровно один снимок решения по одному id
    expect(journal.match(/"resolved_at":"2/g) ?? []).toHaveLength(1);
    expect(journal.includes('fix A')).toBe(true);
    expect(journal.includes('fix B')).toBe(false);
  }, 40_000);

  // T-333-2.4 (patch 3.4.x review F2.1): держатель удерживает право записи
  // ДОЛЬШЕ любого возраста (кражи по возрасту больше нет): ожидающий процесс
  // ждёт до busy-тайм-аута и получает явный busy-отказ; запись держателя при
  // этом не потеряна, и после освобождения следующий процесс продолжается.
  it('T-333-2.4: a holder keeps the write lock beyond any age; the waiter times out with an explicit busy error', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-races-24-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R2D note');

    // A держит критическую секцию 7 с (> busy-тайм-аута 5 с)
    const a = paused(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'slow-holder', '--evidence', 'eA'],
      proj.dir,
      { PAUSE333_APPEND_MS: '7000' },
      join(root, 'a-pause.log')
    );
    await waitForPause(join(root, 'a-pause.log'), 'PAUSE before append');

    const started = Date.now();
    const b = run(['contradict', 'report', '--note', proj.noteId, '--reason', 'waiter', '--evidence', 'eB'], proj.dir);
    const waitedMs = Date.now() - started;
    // B ждал busy-тайм-аут (~5 с), а не отказался мгновенно и не украл лок
    expect(waitedMs).toBeGreaterThanOrEqual(4500);
    expect(b.status).not.toBe(0);
    expect(b.stdout + b.stderr).toContain('delivery journal is busy');
    expect(b.stdout + b.stderr).toContain('SQLite BEGIN IMMEDIATE');

    // A завершился успешно, его запись на месте; лок освобождён — следующий
    // процесс продолжается сразу (без кражи и без stale-таймера)
    const aCode = await new Promise<number | null>((resolve) => a.on('exit', (c) => resolve(c)));
    expect(aCode).toBe(0);
    expect(journalOf(proj)).toContain('slow-holder');
    const next = run(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'after-release', '--evidence', 'eC'],
      proj.dir
    );
    expect(next.status).toBe(0);
    expect(journalOf(proj)).toContain('after-release');
  }, 60_000);

  // T-333-2.5 (patch 3.4.x review F2.1): крах владельца (kill -9) — ОС/SQLite
  // освобождают блокировку при следующем открытии (rollback hot journal):
  // следующий процесс продолжается СРАЗУ, без ожидания и без кражи по возрасту.
  it('T-333-2.5: killing the lock holder (kill -9) lets the next process proceed immediately', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-races-25-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R2E note');

    const a = paused(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'killed-holder', '--evidence', 'eA'],
      proj.dir,
      { PAUSE333_APPEND_MS: '15000' },
      join(root, 'a-pause.log')
    );
    await waitForPause(join(root, 'a-pause.log'), 'PAUSE before append');
    process.kill(a.pid!, 'SIGKILL');
    await sleep(300); // ОС освобождает описатели процесса

    // следующий процесс получает лок сразу: не ждёт busy-тайм-аут (5 с)
    const started = Date.now();
    const next = run(
      ['contradict', 'report', '--note', proj.noteId, '--reason', 'after-crash', '--evidence', 'eB'],
      proj.dir
    );
    expect(next.status).toBe(0);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(journalOf(proj)).toContain('after-crash');
  }, 60_000);

  // Лок-база лежит рядом с журналом, ВНЕ кэша: rebuild/удаление index.sqlite
  // её не трогают (взаимное исключение переживает пересоздание кэша).
  it('the lock database lives next to the journal, outside .wolf/cache', () => {
    const root = mkdtempSync(join(tmpdir(), 'wolf-races-lock-'));
    cleanupDirs.push(root);
    const proj = createProject(root, 'R2F note');
    expect(
      run(['contradict', 'report', '--note', proj.noteId, '--reason', 'lock-check', '--evidence', 'e'], proj.dir).status
    ).toBe(0);
    const lockPath = join(proj.dir, LOCK_DB);
    expect(statSync(lockPath).size).toBeGreaterThan(0);
    expect(lockPath.includes(join('.wolf', 'cache'))).toBe(false);
  }, 40_000);
});
