import { describe, it, expect, afterEach } from 'vitest';
import { spawn, spawnSync, execFileSync } from 'child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

// REQ-333-2 (ADR-340-1): параллельные операции журнала противоречий — взаимное
// исключение через журнальный лок. Проверки — РЕАЛЬНЫЕ процессы (spawn node
// dist/bootstrap/cli.js) с управляемой паузой
// NODE_OPTIONS="--require tests/helpers/journal-pause.cjs" (порт стенда
// repro-333: r2a/r2b/r2c). Паузы ≤ 2.5 с — в пределах maxWait лока 5 с:
// второй процесс дожидается, а не крадёт лок (design §11).

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO_ROOT, 'dist', 'bootstrap', 'cli.js');
const PAUSE_HELPER = join(REPO_ROOT, 'tests', 'helpers', 'journal-pause.cjs');
const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');

interface Proj {
  dir: string;
  noteId: string;
}

function run(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): { stdout: string; status: number | null } {
  const { npm_command: _npxGuard, ...base } = process.env;
  const r = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...base, ...env },
  });
  return { stdout: r.stdout ?? '', status: r.status };
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

describe('journal lock: parallel CLI operations keep the journal consistent (3.4.0 REQ-333-2)', () => {
  // T-333-2.1 (AC-2.1, r2a): repair-окно под локом — оба подтверждённых report
  // выживают; список показывает обе записи.
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
    await sleep(1200); // B стартует ВНУТРИ паузы A (repair-окно открыто)
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
    await sleep(1200);
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

  // T-333-2.3 (AC-2.3, r2c): два параллельных resolve одного id — ровно один
  // успех, второй — явный отказ; конфликтующих снимков решения в журнале нет.
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
    await sleep(1200);
    const b = run(['contradict', 'resolve', '--id', c1, '--resolution', 'fix B'], proj.dir);
    const aCode = await new Promise<number | null>((resolve) => a.on('exit', (c) => resolve(c)));
    expect(aCode).toBe(0);
    expect(b.status).not.toBe(0);
    const journal = journalOf(proj);
    // ровно один снимок решения по одному id
    expect(journal.match(/"resolved_at":"2/g) ?? []).toHaveLength(1);
    expect(journal.includes('fix A')).toBe(true);
    expect(journal.includes('fix B')).toBe(false);
  }, 40_000);
});
