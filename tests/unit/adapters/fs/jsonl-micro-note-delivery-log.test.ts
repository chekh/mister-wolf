import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { JsonlMicroNoteDeliveryLog } from '../../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { UserFacingError } from '../../../../src/domain/errors.js';
import type { MicroNoteSuppressionRecord } from '../../../../src/ports/micro-note-delivery-log.port.js';

// Патч 3.3.1 (REQ-331-2/3, design §6/§7): JsonlMicroNoteDeliveryLog — единственный
// владелец журнала противоречий/доставок/наблюдений в постоянном файле
// `.wolf/memory/micro-note-delivery.jsonl` (вне кэша). T-1.6, T-2.4, T-3.1–T-3.4
// тест-плана: append-only с отказом на дубликат id, REQ-03-отказ resolve,
// миграция 3.3.0-фикстуры 1:1 с детерминированными id, идемпотентность и
// сохранение legacy-строк (поправка ADR-3), чистый проект без создания журнала.

const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'micro-note-index-330', 'index.sqlite');
const JOURNAL = join('.wolf', 'memory', 'micro-note-delivery.jsonl');

function sup(
  id: string,
  memoryId: string,
  overrides: Partial<MicroNoteSuppressionRecord> = {}
): MicroNoteSuppressionRecord {
  return {
    suppression_id: id,
    memory_id: memoryId,
    revision: 'rev111',
    reason: `reason ${id}`,
    note_evidence: `${memoryId}@rev111`,
    contradiction_evidence: `observed against ${memoryId}`,
    suppressed_at: '2026-11-18T00:00:00.000Z',
    resolved_at: null,
    resolution: null,
    ...overrides,
  };
}

describe('JsonlMicroNoteDeliveryLog (patch 3.3.1)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-jsonl-log-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function journalPath(): string {
    return join(dir, JOURNAL);
  }

  // T-2.4 (AC-2.4, REQ-03): утрата журнала ничего не изобретает — состояние
  // пустое, файл создаётся первой записью и лежит вне `.wolf/cache`.
  it('T-2.4: no journal and no legacy index → empty state; first write creates the file outside .wolf/cache', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    expect(log.suppressions()).toEqual([]);
    expect(log.deliveries()).toEqual([]);
    expect(log.observations()).toEqual([]);
    expect(existsSync(journalPath())).toBe(false);

    log.recordSuppression(sup('cnr_20261118_0000aa', 'n1'));
    expect(existsSync(journalPath())).toBe(true);
    expect(journalPath().includes(join(dir, '.wolf', 'cache'))).toBe(false);

    // Чтение новым экземпляром — то же состояние (носитель — файл, не память).
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions()).toEqual([sup('cnr_20261118_0000aa', 'n1')]);
  });

  // T-1.6 (design §4): append-only — дубликат suppression_id → UserFacingError,
  // файл не изменён (тихая перезапись запрещена); ретрай с новым id — успешный append.
  it('T-1.6: duplicate suppression_id refuses with UserFacingError and leaves the file unchanged; new id appends', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    log.recordSuppression(sup('cnr_20261118_0000aa', 'n1'));
    const before = readFileSync(journalPath(), 'utf8');

    expect(() => log.recordSuppression(sup('cnr_20261118_0000aa', 'n2'))).toThrow(UserFacingError);
    expect(() => log.recordSuppression(sup('cnr_20261118_0000aa', 'n2'))).toThrow(
      /duplicate suppression id "cnr_20261118_0000aa"/
    );
    expect(() => log.recordSuppression(sup('cnr_20261118_0000aa', 'n2'))).toThrow(/append-only/);
    expect(readFileSync(journalPath(), 'utf8')).toBe(before);

    log.recordSuppression(sup('cnr_20261118_0000bb', 'n2'));
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261118_0000aa', 'cnr_20261118_0000bb']);
  });

  // T-1.4 (AC-1.4, REQ-03): resolve по неизвестному и по уже разрешённому id —
  // один и тот же названный текст порта.
  it('T-1.4: resolve of an unknown id and of an already-resolved id refuse with the same named text', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    log.recordSuppression(sup('cnr_20261118_0000aa', 'n1'));
    const exact = 'unknown or already resolved suppression for "cnr_20261118_ffffff" (REQ-03: unknown stays unknown)';
    expect(() => log.resolveSuppression('cnr_20261118_ffffff', 'done', '2026-11-18T01:00:00.000Z')).toThrow(exact);

    log.resolveSuppression('cnr_20261118_0000aa', 'done', '2026-11-18T01:00:00.000Z');
    const exactAgain =
      'unknown or already resolved suppression for "cnr_20261118_0000aa" (REQ-03: unknown stays unknown)';
    expect(() => log.resolveSuppression('cnr_20261118_0000aa', 'again', '2026-11-18T02:00:00.000Z')).toThrow(
      exactAgain
    );
    expect(() => log.resolveSuppression('cnr_20261118_ffffff', 'x', '2026-11-18T02:00:00.000Z')).toThrow(exact);
    // решение сохранено в носителе
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions()[0]!.resolution).toBe('done');
  });

  // T-3.1 (AC-3.1): фикстура 3.3.0 → миграция 1:1, включая NULL и оба evidence.
  it('T-3.1: legacy 3.3.0 fixture migrates 1:1 — values, NULLs, both evidences preserved', () => {
    mkdirSync(join(dir, '.wolf', 'cache'), { recursive: true });
    cpSync(FIXTURE, join(dir, '.wolf', 'cache', 'index.sqlite'));

    const log = new JsonlMicroNoteDeliveryLog(dir);
    const records = log.suppressions();
    expect(records).toHaveLength(3);

    // порядок миграции: suppressed_at, затем memory_id; 3.3.0 хранит одну
    // строку на заметку (PK memory_id) — «несколько записей» это разные заметки
    expect(records[0]).toMatchObject({
      memory_id: 'mem_a',
      revision: 'rev_a1',
      reason: 'note says A',
      note_evidence: 'mem_a@rev_a1',
      contradiction_evidence: 'observed B (session s1)',
      suppressed_at: '2026-11-01T09:00:00.000Z',
      resolved_at: '2026-11-02T09:00:00.000Z',
      resolution: 'confirmed by lead',
    });
    // открытые записи: NULL-поля перенесены как NULL
    expect(records[1]).toMatchObject({
      memory_id: 'mem_b',
      revision: 'rev_b1',
      reason: 'note says B',
      note_evidence: 'mem_b@rev_b1',
      contradiction_evidence: 'observed C (session s2)',
      suppressed_at: '2026-11-01T10:00:00.000Z',
      resolved_at: null,
      resolution: null,
    });
    expect(records[2]).toMatchObject({
      memory_id: 'mem_c',
      revision: 'rev_c1',
      reason: 'note says C',
      suppressed_at: '2026-11-01T10:00:00.000Z',
      resolved_at: null,
      resolution: null,
    });

    expect(log.deliveries()).toEqual([
      { memory_id: 'mem_a', revision: 'rev_a0', channel: 'call', kind: 'selected', ts: '2026-10-31T08:00:00.000Z' },
      { memory_id: 'mem_a', revision: 'rev_a0', channel: 'call', kind: 'delivered', ts: '2026-10-31T08:00:00.000Z' },
      { memory_id: 'mem_b', revision: 'rev_b1', channel: 'brief', kind: 'delivered', ts: '2026-11-01T07:30:00.000Z' },
    ]);
    expect(log.observations()).toEqual([
      {
        memory_id: 'mem_a',
        revision: 'rev_a0',
        observed_use: 'cited',
        observed_outcome: 'unknown',
        updated_at: '2026-11-01T09:30:00.000Z',
      },
      {
        memory_id: 'mem_b',
        revision: 'rev_b1',
        observed_use: null,
        observed_outcome: 'unknown',
        updated_at: '2026-11-01T07:30:00.000Z',
      },
    ]);
    expect(existsSync(journalPath())).toBe(true);
  });

  // T-3.2 (AC-3.2): id присваиваются в детерминированном порядке и в формате cnr_.
  it('T-3.2: migration assigns deterministic cnr_ ids by suppressed_at then memory_id', () => {
    mkdirSync(join(dir, '.wolf', 'cache'), { recursive: true });
    cpSync(FIXTURE, join(dir, '.wolf', 'cache', 'index.sqlite'));

    const ids = new JsonlMicroNoteDeliveryLog(dir).suppressions().map((s) => s.suppression_id);
    for (const id of ids) expect(id).toMatch(/^cnr_\d{8}_[0-9a-f]{6}$/);
    // порядок: 09:00 mem_a (resolved) → 10:00 mem_b → 10:00 mem_c (tie по memory_id)
    expect(ids[0]).not.toEqual(ids[1]);
    expect(ids[1]).not.toEqual(ids[2]);
    // повторное открытие — те же id (детерминизм, см. T-3.3)
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions().map((s) => s.suppression_id)).toEqual(ids);
  });

  // T-3.3 (AC-3.3): сбой до rename не создаёт журнал и не трогает legacy, повтор
  // успешен; идемпотентность; после УСПЕШНОЙ миграции legacy-строки сохранены (ADR-3).
  it('T-3.3: failed migration leaves no journal and retries; reopen does not duplicate; legacy rows preserved', () => {
    mkdirSync(join(dir, '.wolf', 'cache'), { recursive: true });
    cpSync(FIXTURE, join(dir, '.wolf', 'cache', 'index.sqlite'));

    // сбой до rename: memory dir только на чтение → запись tmp невозможна
    const memoryDir = join(dir, '.wolf', 'memory');
    mkdirSync(memoryDir, { recursive: true });
    chmodSync(memoryDir, 0o555);
    try {
      expect(() => new JsonlMicroNoteDeliveryLog(dir).suppressions()).toThrow();
      expect(existsSync(journalPath())).toBe(false);
    } finally {
      chmodSync(memoryDir, 0o755);
    }
    // повтор миграции успешен
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions()).toHaveLength(3);
    // идемпотентность: файл журнала существует → повторная миграция не дублирует
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions()).toHaveLength(3);

    // legacy-строки сохранены бит-в-бит по содержимому (замороженная копия, design §7)
    const db = new Database(join(dir, '.wolf', 'cache', 'index.sqlite'), { readonly: true });
    try {
      const sup = db.prepare('SELECT COUNT(*) AS n FROM micro_note_suppressions').get() as { n: number };
      const del = db.prepare('SELECT COUNT(*) AS n FROM micro_note_deliveries').get() as { n: number };
      const obs = db.prepare('SELECT COUNT(*) AS n FROM micro_note_observations').get() as { n: number };
      expect([sup.n, del.n, obs.n]).toEqual([3, 3, 2]);
      const resolvedRow = db
        .prepare(
          "SELECT reason, resolved_at, resolution FROM micro_note_suppressions WHERE suppressed_at = '2026-11-01T09:00:00.000Z'"
        )
        .get() as { reason: string; resolved_at: string; resolution: string };
      expect(resolvedRow).toEqual({
        reason: 'note says A',
        resolved_at: '2026-11-02T09:00:00.000Z',
        resolution: 'confirmed by lead',
      });
    } finally {
      db.close();
    }
  });

  // T-3.4 (AC-3.4): чистый проект (нет legacy-таблиц/строк) — миграция ничего не создаёт.
  it('T-3.4: a project without legacy tables creates no journal and keeps empty state', () => {
    mkdirSync(join(dir, '.wolf', 'cache'), { recursive: true });
    const db = new Database(join(dir, '.wolf', 'cache', 'index.sqlite'));
    db.exec('CREATE TABLE memory_meta (memory_id TEXT PRIMARY KEY)');
    db.close();

    const log = new JsonlMicroNoteDeliveryLog(dir);
    expect(log.suppressions()).toEqual([]);
    expect(existsSync(journalPath())).toBe(false);
  });
});
