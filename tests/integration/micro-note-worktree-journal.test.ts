import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonlMicroNoteDeliveryLog } from '../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { getCallInjections } from '../../src/app/use-cases/get-call-injections.js';
import { reportMicroNoteContradiction } from '../../src/app/use-cases/micro-note-contradiction.js';
import { MICRO_NOTE_TAG } from '../../src/app/use-cases/micro-note-delivery.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';
import type { MicroNoteSuppressionRecord } from '../../src/ports/micro-note-delivery-log.port.js';

// Патч 3.3.2 (REQ-332-2, ADR-2): журнал противоречий и legacy-индекс резолвятся
// через ОБЩИЙ корень памяти внутри адаптера — linked worktree читает и пишет
// журнал main-чекоута, миграция из worktree идёт в общий корень, вне linked
// worktree путь журнала не меняется (AC-2.5). Механика реального git
// (child_process): git init + git worktree add в tmp, очистка в afterEach
// (прецедент: интеграционные тесты upgrade, skill-runtime-helpers).

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'micro-note-index-330', 'index.sqlite');
const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');

function microNote(id: string): MemoryObject {
  return {
    title: `Hint ${id}`,
    body: `Body of ${id}.`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [MICRO_NOTE_TAG],
    superseded_by: null,
    // note survives per-type validation only with a dictionary facet (howto)
    facet: 'howto',
    type: 'note',
    id,
  } as MemoryObject;
}

function sup(id: string, memoryId: string): MicroNoteSuppressionRecord {
  return {
    suppression_id: id,
    memory_id: memoryId,
    revision: 'rev111',
    reason: `reason ${id}`,
    note_evidence: `${memoryId}@rev111`,
    contradiction_evidence: `observed against ${memoryId}`,
    suppressed_at: '2026-11-19T00:00:00.000Z',
    resolved_at: null,
    resolution: null,
  };
}

describe('micro-note delivery journal resolves the common memory root (patch 3.3.2)', () => {
  let root: string;
  let mainDir: string;
  let wtDir: string;
  const tick = Date.UTC(2026, 10, 19, 12, 0, 0);
  const clock = { now: () => new Date(tick) };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-wt-journal-'));
    mainDir = join(root, 'main');
    wtDir = join(root, 'wt');
    mkdirSync(mainDir);
    git(mainDir, ['init', '-q', '.']);
    git(mainDir, ['config', 'user.email', 't@t.local']);
    git(mainDir, ['config', 'user.name', 't']);
    writeFileSync(join(mainDir, 'f.txt'), 'hello\n');
    git(mainDir, ['add', '.']);
    git(mainDir, ['commit', '-qm', 'init']);
    git(mainDir, ['worktree', 'add', '-q', wtDir, '-b', 'wtb']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function git(cwd: string, args: string[]): void {
    execFileSync('git', args, { cwd, stdio: 'pipe' });
  }

  // T-332-2.1 (AC-2.1): подавление из main (как CLI contradict report) скрывает
  // заметку в доставке, исполняемой с noteLog от linked worktree.
  it('T-332-2.1: a suppression recorded in main hides the note from a worktree-driven delivery', async () => {
    await new MarkdownMemoryStore(mainDir).save(microNote('n1') as never);

    // «contradict report из main»: запись подавления через инстанс от main
    const r1 = await reportMicroNoteContradiction(
      {
        store: new MarkdownMemoryStore(mainDir),
        clock,
        log: new JsonlMicroNoteDeliveryLog(mainDir),
        idGen: new HashIdGenerator(),
      },
      { note_id: 'n1', reason: 'note says A', contradiction_evidence: 'observed B' }
    );

    // инстанс от пути worktree видит ту же запись (общий журнал, не локальный)
    expect(new JsonlMicroNoteDeliveryLog(wtDir).suppressions().map((s) => s.suppression_id)).toEqual([
      r1.suppression_id,
    ]);

    // use-case доставки с noteLog от worktree не доставляет подавленную заметку
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await getCallInjections(
      { store: new MarkdownMemoryStore(mainDir), clock, noteLog: new JsonlMicroNoteDeliveryLog(wtDir) },
      { microNotes: { projectId: mainDir, version: '3.3.2' } }
    );
    expect(result.microNotes?.delivered.map((c) => c.id) ?? []).toEqual([]);
    // журнал при этом не ушёл в локальный .wolf worktree
    expect(existsSync(join(wtDir, JOURNAL))).toBe(false);
  });

  // T-332-2.2 (AC-2.2, симметрия): запись из worktree видна main-инстансу.
  it('T-332-2.2: a suppression recorded from the worktree is visible to the main instance', () => {
    const wtLog = new JsonlMicroNoteDeliveryLog(wtDir);
    wtLog.recordSuppression(sup('cnr_20261119_000002', 'n2'));

    const mainLog = new JsonlMicroNoteDeliveryLog(mainDir);
    expect(mainLog.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000002']);
    expect(existsSync(join(wtDir, JOURNAL))).toBe(false);
  });

  // T-332-2.3 (AC-2.3): resolve из worktree-инстанса снимает запись,
  // которую видит main-инстанс.
  it('T-332-2.3: a resolve from the worktree instance lifts the record the main instance sees', () => {
    new JsonlMicroNoteDeliveryLog(mainDir).recordSuppression(sup('cnr_20261119_000003', 'n3'));

    new JsonlMicroNoteDeliveryLog(wtDir).resolveSuppression(
      'cnr_20261119_000003',
      'resolved from worktree',
      clock.now().toISOString()
    );

    expect(new JsonlMicroNoteDeliveryLog(mainDir).suppressions()[0]).toMatchObject({
      suppression_id: 'cnr_20261119_000003',
      resolved_at: clock.now().toISOString(),
      resolution: 'resolved from worktree',
    });
  });

  // T-332-2.4 (AC-2.4): миграция, запущенная из linked worktree при отсутствии
  // файла журнала, находит legacy index.sqlite в общем корне и создаёт журнал там же.
  it('T-332-2.4: legacy migration triggered from the worktree lands in the common root', () => {
    mkdirSync(join(mainDir, '.wolf', 'cache'), { recursive: true });
    cpSync(FIXTURE, join(mainDir, '.wolf', 'cache', 'index.sqlite'));

    // первого вызова из worktree-инстанса достаточно: журнал появляется в общем корне
    expect(new JsonlMicroNoteDeliveryLog(wtDir).suppressions()).toHaveLength(3);
    expect(existsSync(join(mainDir, JOURNAL))).toBe(true);
    expect(existsSync(join(wtDir, JOURNAL))).toBe(false);
    // повторное открытие из main — те же записи (идемпотентность миграции)
    expect(new JsonlMicroNoteDeliveryLog(mainDir).suppressions()).toHaveLength(3);
  });

  // T-332-2.5 (AC-2.5): вне linked worktree (обычный чекаут, не-git каталог)
  // путь журнала прежний — сам каталог; существующие проекты не мигрируют повторно.
  it('T-332-2.5: outside a linked worktree the journal path is unchanged — the directory itself', () => {
    // обычный чекаут: .git — каталог, не linked worktree
    const plain = join(root, 'plain');
    mkdirSync(plain);
    git(plain, ['init', '-q', '.']);
    git(plain, ['config', 'user.email', 't@t.local']);
    git(plain, ['config', 'user.name', 't']);
    writeFileSync(join(plain, 'f.txt'), 'x\n');
    git(plain, ['add', '.']);
    git(plain, ['commit', '-qm', 'init']);

    // не-git каталог
    const nogit = join(root, 'nogit');
    mkdirSync(nogit);

    const cases: Array<[string, string]> = [
      [plain, 'cnr_20261119_000004'],
      [nogit, 'cnr_20261119_000005'],
    ];
    for (const [base, id] of cases) {
      const log = new JsonlMicroNoteDeliveryLog(base);
      log.recordSuppression(sup(id, 'n4'));
      expect(existsSync(join(base, JOURNAL))).toBe(true);
      expect(new JsonlMicroNoteDeliveryLog(base).suppressions().map((s) => s.suppression_id)).toEqual([id]);
    }
  });
});
