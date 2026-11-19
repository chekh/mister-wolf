// T-333-8.4 (F-2, design §5 — уточнение ведущего REV-340, §6): fresh-оценка
// с нулём строк И без отказов источников выполняется РОВНО ОДИН раз: создаёт
// ПУСТОЙ журнал + маркер `sources: []` в той же критической секции; все
// последующие вызовы идут по normal (пересмотр источников и git-спавн не на
// горячем пути). Часть источников отказала и строк нет — fresh сохраняется
// (повторная попытка; транзиентные IO-ошибки не замораживаются).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonlMicroNoteDeliveryLog } from '../../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';

// Счётчик пересмотров источников (git-спавн внутри listWorktreeCheckouts) —
// прокси-метрика «fresh выполняется один раз»; реальная функция вызывается.
const gitSpawns = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../../../src/adapters/fs/memory-root.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/adapters/fs/memory-root.js')>();
  return {
    ...actual,
    listWorktreeCheckouts: (...args: Parameters<typeof actual.listWorktreeCheckouts>) => {
      gitSpawns.count++;
      return actual.listWorktreeCheckouts(...args);
    },
  };
});

describe('T-333-8.4: fresh with zero sources runs exactly once (empty journal + marker)', () => {
  let dir: string;
  let log: JsonlMicroNoteDeliveryLog;

  const journalPath = () => join(dir, '.wolf', 'memory', 'micro-note-delivery.jsonl');
  const markerPath = () => join(dir, '.wolf', 'memory', 'micro-note-delivery.migrated.json');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-fresh-once-'));
    gitSpawns.count = 0;
    log = new JsonlMicroNoteDeliveryLog(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('the first suppressions() on a clean project creates an empty journal + marker sources:[]', () => {
    expect(existsSync(journalPath())).toBe(false);
    expect(log.suppressions()).toEqual([]);
    expect(existsSync(journalPath())).toBe(true);
    const marker = JSON.parse(readFileSync(markerPath(), 'utf8')) as { sources: string[]; migrated_at: string };
    expect(marker.sources).toEqual([]);
    expect(marker.migrated_at).not.toBe('');
  });

  it('the second suppressions() does not re-enumerate sources (no git spawn, normal state)', () => {
    log.suppressions();
    expect(gitSpawns.count).toBe(1);
    expect(existsSync(journalPath())).toBe(true);
    log.suppressions();
    expect(gitSpawns.count).toBe(1); // fresh не повторяется
    expect(log.suppressions()).toEqual([]);
    expect(gitSpawns.count).toBe(1);
  });

  it('after the empty fresh, the first record lands in the existing journal (write path unchanged)', () => {
    log.suppressions(); // fresh once → пустой журнал + маркер
    expect(existsSync(journalPath())).toBe(true);
    log.recordSuppression({
      suppression_id: 'cnr_20261119_abc123',
      memory_id: 'n1',
      revision: 'aaaaaaaaaaaa',
      reason: 'first record',
      note_evidence: 'note evidence',
      contradiction_evidence: 'contradiction evidence',
      suppressed_at: '2026-11-19T00:00:00.000Z',
      resolved_at: null,
      resolution: null,
    });
    const again = log.suppressions();
    expect(again).toHaveLength(1);
    expect(again[0]?.suppression_id).toBe('cnr_20261119_abc123');
    expect(gitSpawns.count).toBe(1);
  });
});
