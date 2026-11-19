import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { JsonlMicroNoteDeliveryLog } from '../../../../src/adapters/fs/jsonl-micro-note-delivery-log.js';
import { UserFacingError } from '../../../../src/domain/errors.js';
import type {
  MicroNoteDeliveryRecord,
  MicroNoteObservation,
  MicroNoteSuppressionRecord,
} from '../../../../src/ports/micro-note-delivery-log.port.js';

// Патч 3.3.1 (REQ-331-2/3, design §6/§7): JsonlMicroNoteDeliveryLog — единственный
// владелец журнала противоречий/доставок/наблюдений в постоянном файле
// `.wolf/memory/micro-note-delivery.jsonl` (вне кэша). T-1.6, T-2.4, T-3.1–T-3.4
// тест-плана: append-only с отказом на дубликат id, REQ-03-отказ resolve,
// миграция 3.3.0-фикстуры 1:1 с детерминированными id, идемпотентность и
// сохранение legacy-строк (поправка ADR-3), чистый проект без создания журнала.
// Патч 3.3.2 (REQ-332-1/3): без межвызовного кэша (внешние записи видны тем же
// инстансом) и с восстановлением границы последней корректной строки при записи.

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

function obs(memoryId: string, overrides: Partial<MicroNoteObservation> = {}): MicroNoteObservation {
  return {
    memory_id: memoryId,
    revision: 'rev111',
    observed_use: 'cited',
    observed_outcome: 'unknown',
    updated_at: '2026-11-18T00:00:00.000Z',
    ...overrides,
  };
}

function deliv(memoryId: string, overrides: Partial<MicroNoteDeliveryRecord> = {}): MicroNoteDeliveryRecord {
  return {
    memory_id: memoryId,
    revision: 'rev111',
    channel: 'call',
    kind: 'delivered',
    ts: '2026-11-18T00:00:00.000Z',
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

    // сбой до rename: memory dir только на чтение → запись tmp невозможна.
    // Право-чувствительный путь: root (Docker CI) игнорирует permission-биты,
    // поэтому негативная проверка выполняется только под не-root
    // (идиома проекта: opencode-adapter, opencode-renderer, complaint-target).
    const memoryDir = join(dir, '.wolf', 'memory');
    if (process.getuid?.() !== 0) {
      mkdirSync(memoryDir, { recursive: true });
      chmodSync(memoryDir, 0o555);
      try {
        expect(() => new JsonlMicroNoteDeliveryLog(dir).suppressions()).toThrow();
        expect(existsSync(journalPath())).toBe(false);
      } finally {
        chmodSync(memoryDir, 0o755);
      }
    }
    // миграция успешна (повтор после снятия блокировки; под root — первая)
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

describe('JsonlMicroNoteDeliveryLog (patch 3.3.2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-jsonl-log-332-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function journalPath(): string {
    return join(dir, JOURNAL);
  }

  /** Имитация другого процесса: прямая дозапись строки в файл журнала. */
  function appendExternal(line: unknown): void {
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    appendFileSync(journalPath(), `${JSON.stringify(line)}\n`, 'utf8');
  }

  // T-332-1.1 (AC-1.1, REQ-332-1): инстанс без кэша — внешняя запись (другой
  // процесс) видна тому же инстансу без перезапуска.
  it('T-332-1.1: the same instance sees a suppression appended by another process', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    log.recordSuppression(sup('cnr_20261119_000001', 'n1'));
    expect(log.suppressions()).toHaveLength(1);

    appendExternal({ kind: 'suppression', record: sup('cnr_20261119_000002', 'n2') });

    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000001', 'cnr_20261119_000002']);
  });

  // T-332-1.2 (AC-1.2): resolve id, добавленного другим процессом, успешен тем
  // же инстансом; повторный resolve — REQ-03-отказ. Инстанс уже читал журнал
  // (как MCP при старте) — внешняя запись после этого не невидима.
  it('T-332-1.2: the same instance resolves an id appended by another process; the second resolve refuses', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    expect(log.suppressions()).toEqual([]); // инстанс уже загрузил состояние
    appendExternal({ kind: 'suppression', record: sup('cnr_20261119_00000a', 'n1') });

    log.resolveSuppression('cnr_20261119_00000a', 'resolved by long-lived instance', '2026-11-19T10:00:00.000Z');

    // решение сохранилось в носителе (видно новому инстансу)
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions()[0]).toMatchObject({
      suppression_id: 'cnr_20261119_00000a',
      resolved_at: '2026-11-19T10:00:00.000Z',
      resolution: 'resolved by long-lived instance',
    });
    expect(() => log.resolveSuppression('cnr_20261119_00000a', 'again', '2026-11-19T11:00:00.000Z')).toThrow(
      'unknown or already resolved suppression for "cnr_20261119_00000a" (REQ-03: unknown stays unknown)'
    );
  });

  // T-332-1.3 (AC-1.3): проверка дубликата видит внешние записи — повтор id
  // отказывает, retry с новым id успешен.
  it('T-332-1.3: the duplicate check sees external records — id X refuses, a retry with a new id succeeds', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    expect(log.suppressions()).toEqual([]); // инстанс уже загрузил состояние
    appendExternal({ kind: 'suppression', record: sup('cnr_20261119_00000b', 'n1') });

    expect(() => log.recordSuppression(sup('cnr_20261119_00000b', 'n2'))).toThrow(
      /duplicate suppression id "cnr_20261119_00000b"/
    );
    log.recordSuppression(sup('cnr_20261119_00000c', 'n2'));
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_00000b', 'cnr_20261119_00000c']);
  });

  // T-332-1.4 (AC-1.4): наблюдения сливаются с внешними изменениями по тем же
  // правилам — setObservation мержит поверх внешнего значения, а не поверх
  // дефолта.
  it('T-332-1.4: setObservation merges over an observation appended by another process', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    expect(log.observations()).toEqual([]); // инстанс уже загрузил состояние
    appendExternal({ kind: 'observation', record: obs('n1') });

    log.setObservation({
      memory_id: 'n1',
      revision: 'rev111',
      field: 'observed_outcome',
      value: 'applied',
      at: '2026-11-19T10:00:00.000Z',
    });

    expect(log.observations()).toEqual([
      {
        memory_id: 'n1',
        revision: 'rev111',
        observed_use: 'cited',
        observed_outcome: 'applied',
        updated_at: '2026-11-19T10:00:00.000Z',
      },
    ]);
  });

  // T-332-1.5 (AC-1.1, deliveries): внешняя delivery-строка видна тому же инстансу.
  it('T-332-1.5: the same instance sees a delivery appended by another process', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    expect(log.deliveries()).toEqual([]);

    appendExternal({ kind: 'delivery', record: deliv('n1') });

    expect(log.deliveries()).toEqual([deliv('n1')]);
  });

  // T-332-3.1 (AC-3.1, REQ-332-3): обрывок последней строки отбрасывается —
  // запись успешна, полное чтение без ошибок, обрывка в файле нет.
  it('T-332-3.1: a truncated tail is discarded — the next write succeeds and the file reads fully', () => {
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    writeFileSync(
      journalPath(),
      `${JSON.stringify({ kind: 'suppression', record: sup('cnr_20261119_000001', 'n1') })}\n` +
        '{"kind":"suppression","record":{"suppression_id":"cnr_trunc',
      'utf8'
    );

    const log = new JsonlMicroNoteDeliveryLog(dir);
    log.recordSuppression(sup('cnr_20261119_000002', 'n2'));

    // полное чтение — свежим инстансом и тем же — без ошибок
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions().map((s) => s.suppression_id)).toEqual([
      'cnr_20261119_000001',
      'cnr_20261119_000002',
    ]);
    expect(log.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000001', 'cnr_20261119_000002']);
    expect(readFileSync(journalPath(), 'utf8')).not.toContain('cnr_trunc');
  });

  // T-332-3.2 (AC-3.2): валидная последняя строка без \n финализируется и НЕ
  // теряется; новая запись дописывается после неё.
  it('T-332-3.2: a complete line without the trailing newline is finalized — it survives the next write', () => {
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    // готовая запись без завершающего \n (обрыв ровно между записью и newline)
    writeFileSync(
      journalPath(),
      JSON.stringify({ kind: 'suppression', record: sup('cnr_20261119_000001', 'n1') }),
      'utf8'
    );

    const log = new JsonlMicroNoteDeliveryLog(dir);
    log.recordSuppression(sup('cnr_20261119_000002', 'n2'));

    // первая запись не потеряна, новая добавлена, файл валиден (свежий инстанс)
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions().map((s) => s.suppression_id)).toEqual([
      'cnr_20261119_000001',
      'cnr_20261119_000002',
    ]);
    for (const line of readFileSync(journalPath(), 'utf8').split('\n')) {
      if (line !== '') expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  // T-332-3.3 (AC-3.3): после обрыва записи report-сценарий (запись + resolve)
  // полностью успешен; свежим инстансом файл читается без ошибок и без
  // невалидных строк — подтверждённая запись не оставляет файл нечитаемым.
  it('T-332-3.3: after a truncated tail the report scenario succeeds and leaves a fully readable file', () => {
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    writeFileSync(
      journalPath(),
      `${JSON.stringify({ kind: 'suppression', record: sup('cnr_20261119_000001', 'n1') })}\n` +
        '{"kind":"delivery","record":{"memory_id":"n1","rev',
      'utf8'
    );

    const log = new JsonlMicroNoteDeliveryLog(dir);
    log.recordSuppression(sup('cnr_20261119_000002', 'n2'));
    log.resolveSuppression('cnr_20261119_000002', 'confirmed', '2026-11-19T10:00:00.000Z');

    // свежие глаза: файл читается, обрывка нет, открытой осталась только первая
    expect(new JsonlMicroNoteDeliveryLog(dir).suppressions()).toHaveLength(2);
    expect(
      new JsonlMicroNoteDeliveryLog(dir)
        .suppressions()
        .filter((s) => s.resolved_at === null)
        .map((s) => s.suppression_id)
    ).toEqual(['cnr_20261119_000001']);
    for (const line of readFileSync(journalPath(), 'utf8').split('\n')) {
      if (line !== '') expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  // T-332-3.4 (AC-3.4): битая строка В СЕРЕДИНЕ файла — прежний отказ с
  // именованной причиной (молчаливой потери состояния нет; и чтение, и запись).
  it('T-332-3.4: an invalid line in the middle still refuses reads and writes with the named mid-file cause', () => {
    mkdirSync(join(dir, '.wolf', 'memory'), { recursive: true });
    writeFileSync(
      journalPath(),
      `${JSON.stringify({ kind: 'suppression', record: sup('cnr_20261119_000001', 'n1') })}\nnot-json\n`,
      'utf8'
    );

    expect(() => new JsonlMicroNoteDeliveryLog(dir).suppressions()).toThrow(/corrupted mid-file/);
    expect(() => new JsonlMicroNoteDeliveryLog(dir).recordSuppression(sup('cnr_20261119_000002', 'n2'))).toThrow(
      /corrupted mid-file/
    );
  });

  // T-332-3.5: файл пуст или директории нет — запись создаёт оба и читается
  // обратно (регресс существующего пути записи).
  it('T-332-3.5: a missing directory and an empty file — the write creates both and reads back', () => {
    const log = new JsonlMicroNoteDeliveryLog(dir);
    log.recordSuppression(sup('cnr_20261119_000001', 'n1'));
    expect(existsSync(journalPath())).toBe(true);
    expect(log.suppressions()).toHaveLength(1);

    const emptyDir = mkdtempSync(join(tmpdir(), 'wolf-jsonl-log-332-empty-'));
    try {
      mkdirSync(join(emptyDir, '.wolf', 'memory'), { recursive: true });
      writeFileSync(join(emptyDir, JOURNAL), '', 'utf8');
      const log2 = new JsonlMicroNoteDeliveryLog(emptyDir);
      log2.recordSuppression(sup('cnr_20261119_000002', 'n2'));
      expect(log2.suppressions().map((s) => s.suppression_id)).toEqual(['cnr_20261119_000002']);
      expect(new JsonlMicroNoteDeliveryLog(emptyDir).suppressions()).toHaveLength(1);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
