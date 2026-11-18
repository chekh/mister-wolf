// src/adapters/fs/jsonl-micro-note-delivery-log.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { UserFacingError } from '../../domain/errors.js';
import {
  MicroNoteDeliveryLog,
  MicroNoteDeliveryRecord,
  MicroNoteObservation,
  MicroNoteSuppressionRecord,
} from '../../ports/micro-note-delivery-log.port.js';
import { indexPath } from './project-paths.js';

/**
 * Патч 3.3.1 (REQ-331-2, ADR-2 вариант A): единственный владелец журнала
 * противоречий/доставок/наблюдений micro-notes — append-only JSONL
 * `.wolf/memory/micro-note-delivery.jsonl`, рядом с events.jsonl/relations.jsonl
 * и ВНЕ кэша `.wolf/cache` (rebuild и удаление index.sqlite журнал не трогают).
 *
 * Формат: одна строка — одна запись-снимок `{ kind, record }`
 * (kind: suppression | delivery | observation). Все рабочие записи — добавление
 * строки; состояние подавления/наблюдения = последняя строка своего ключа
 * (suppression_id / memory_id). Чтение — полный скан при первом обращении,
 * устойчив к незавершённой последней строке (design §11); незавершённой может
 * быть только последняя строка — ошибка разбора в середине файла не глушится.
 *
 * Миграция 3.3.0 → 3.3.1 (REQ-331-3, ADR-3): триггер — файла журнала нет И
 * index.sqlite содержит legacy-таблицы; строки читаются в детерминированном
 * порядке (suppressions по suppressed_at, memory_id; deliveries по ts;
 * observations по memory_id), получают cnr_-id по порядку, значения переносятся
 * 1:1 включая NULL; запись журнала атомарная (tmp + rename); legacy-строки в
 * index.sqlite НЕ удаляются и не используются (замороженная копия для отката).
 * Идемпотентность: существование файла журнала — признак выполненной миграции.
 */

const MICRO_NOTE_DELIVERY_LOG_FILE = join('.wolf', 'memory', 'micro-note-delivery.jsonl');

type JournalLine =
  | { kind: 'suppression'; record: MicroNoteSuppressionRecord }
  | { kind: 'delivery'; record: MicroNoteDeliveryRecord }
  | { kind: 'observation'; record: MicroNoteObservation };

export class JsonlMicroNoteDeliveryLog implements MicroNoteDeliveryLog {
  private loaded = false;
  private readonly suppressionsById = new Map<string, MicroNoteSuppressionRecord>();
  private readonly deliveryRows: MicroNoteDeliveryRecord[] = [];
  private readonly observationsById = new Map<string, MicroNoteObservation>();

  constructor(private readonly baseDir: string) {}

  private get file(): string {
    return join(this.baseDir, MICRO_NOTE_DELIVERY_LOG_FILE);
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(this.file)) {
      this.migrateLegacy();
    }
    if (!existsSync(this.file)) return;
    const lines = readFileSync(this.file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '') continue;
      let parsed: JournalLine;
      try {
        parsed = JSON.parse(line) as JournalLine;
      } catch {
        // незавершённая последняя строка (crash в append) отбрасывается;
        // битый середина-файл — не молчаливая потеря состояния
        if (i === lines.length - 1) break;
        throw new UserFacingError(
          `delivery log is corrupted mid-file: "${this.file}" line ${i + 1} is not valid JSON (REQ-03: unknown stays unknown)`
        );
      }
      this.apply(parsed);
    }
  }

  private apply(line: JournalLine): void {
    if (line.kind === 'suppression') {
      this.suppressionsById.set(line.record.suppression_id, line.record);
    } else if (line.kind === 'delivery') {
      this.deliveryRows.push(line.record);
    } else {
      this.observationsById.set(line.record.memory_id, line.record);
    }
  }

  /** Добавление строки; директория создаётся на первой записи. */
  private append(line: JournalLine): void {
    mkdirSync(join(this.baseDir, '.wolf', 'memory'), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(line)}\n`, 'utf8');
  }

  /**
   * Миграция 3.3.0 → 3.3.1 (ADR-3): только когда файла журнала ещё нет;
   * legacy-строки не изменяются — после успеха остаётся замороженная копия
   * журнала в index.sqlite (страховка отката на 3.3.0).
   */
  private migrateLegacy(): void {
    const legacyPath = indexPath(this.baseDir);
    if (!existsSync(legacyPath)) return;
    const db = new Database(legacyPath, { readonly: true, fileMustExist: true });
    try {
      const tableExists = (name: string): boolean =>
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
      const hasSuppressions = tableExists('micro_note_suppressions');
      const hasDeliveries = tableExists('micro_note_deliveries');
      const hasObservations = tableExists('micro_note_observations');
      if (!hasSuppressions && !hasDeliveries && !hasObservations) return;

      const lines: JournalLine[] = [];
      if (hasSuppressions) {
        // детерминированный порядок (AC-3.2): suppressed_at, затем memory_id
        const rows = db
          .prepare(
            `SELECT memory_id, revision, reason, note_evidence, contradiction_evidence,
                    suppressed_at, resolved_at, resolution
             FROM micro_note_suppressions ORDER BY suppressed_at ASC, memory_id ASC`
          )
          .all() as Array<Record<string, string | null>>;
        rows.forEach((row, i) => {
          const day = String(row.suppressed_at).slice(0, 10).replace(/-/g, '');
          lines.push({
            kind: 'suppression',
            record: {
              // cnr_<YYYYMMDD>_<шестиразрядный hex-счётчик порядка миграции>
              suppression_id: `cnr_${day}_${(i + 1).toString(16).padStart(6, '0')}`,
              memory_id: String(row.memory_id),
              revision: String(row.revision),
              reason: String(row.reason),
              note_evidence: String(row.note_evidence),
              contradiction_evidence: String(row.contradiction_evidence),
              suppressed_at: String(row.suppressed_at),
              resolved_at: row.resolved_at ?? null,
              resolution: row.resolution ?? null,
            },
          });
        });
      }
      if (hasDeliveries) {
        const rows = db
          .prepare(
            'SELECT memory_id, revision, channel, kind, ts FROM micro_note_deliveries ORDER BY ts ASC, rowid ASC'
          )
          .all() as Array<Record<string, string>>;
        for (const row of rows) {
          lines.push({
            kind: 'delivery',
            record: {
              memory_id: row.memory_id,
              revision: row.revision,
              channel: row.channel as MicroNoteDeliveryRecord['channel'],
              kind: row.kind as MicroNoteDeliveryRecord['kind'],
              ts: row.ts,
            },
          });
        }
      }
      if (hasObservations) {
        const rows = db
          .prepare(
            `SELECT memory_id, revision, observed_use, observed_outcome, updated_at
             FROM micro_note_observations ORDER BY memory_id ASC`
          )
          .all() as Array<Record<string, string | null>>;
        for (const row of rows) {
          lines.push({
            kind: 'observation',
            record: {
              memory_id: String(row.memory_id),
              revision: String(row.revision),
              observed_use: row.observed_use ?? null,
              observed_outcome: String(row.observed_outcome),
              updated_at: String(row.updated_at),
            },
          });
        }
      }

      // атомарная инициализация журнала: tmp + rename (AC-3.3)
      mkdirSync(join(this.baseDir, '.wolf', 'memory'), { recursive: true });
      const tmp = `${this.file}.migrating-${process.pid}.tmp`;
      writeFileSync(tmp, lines.map((l) => `${JSON.stringify(l)}\n`).join(''), 'utf8');
      renameSync(tmp, this.file);
    } finally {
      db.close();
    }
  }

  recordSuppression(record: MicroNoteSuppressionRecord): void {
    this.load();
    if (this.suppressionsById.has(record.suppression_id)) {
      throw new UserFacingError(
        `duplicate suppression id "${record.suppression_id}": the delivery log is append-only (retry generates a new suppression id)`
      );
    }
    this.suppressionsById.set(record.suppression_id, record);
    this.append({ kind: 'suppression', record });
  }

  resolveSuppression(suppressionId: string, resolution: string, at: string): void {
    this.load();
    const record = this.suppressionsById.get(suppressionId);
    if (record === undefined || record.resolved_at !== null) {
      // REQ-03: unknown stays unknown — неизвестный и уже разрешённый id не различаются
      throw new UserFacingError(
        `unknown or already resolved suppression for "${suppressionId}" (REQ-03: unknown stays unknown)`
      );
    }
    const resolved: MicroNoteSuppressionRecord = { ...record, resolved_at: at, resolution };
    this.suppressionsById.set(suppressionId, resolved);
    // append-модель: новая строка-снимок той же записи, последняя строка wins
    this.append({ kind: 'suppression', record: resolved });
  }

  suppressions(): MicroNoteSuppressionRecord[] {
    this.load();
    // тот же детерминированный порядок, что в 3.3.0: suppressed_at, затем memory_id
    return [...this.suppressionsById.values()].sort(
      (a, b) => a.suppressed_at.localeCompare(b.suppressed_at) || a.memory_id.localeCompare(b.memory_id)
    );
  }

  recordDelivery(record: MicroNoteDeliveryRecord): void {
    this.load();
    this.deliveryRows.push(record);
    this.append({ kind: 'delivery', record });
  }

  deliveries(): MicroNoteDeliveryRecord[] {
    this.load();
    return [...this.deliveryRows];
  }

  setObservation(input: {
    memory_id: string;
    revision: string;
    field: 'observed_use' | 'observed_outcome';
    value: string;
    at: string;
  }): void {
    this.load();
    const base = this.observationsById.get(input.memory_id) ?? {
      memory_id: input.memory_id,
      revision: input.revision,
      observed_use: null,
      observed_outcome: 'unknown',
      updated_at: input.at,
    };
    const next: MicroNoteObservation = {
      memory_id: input.memory_id,
      revision: input.revision,
      observed_use: input.field === 'observed_use' ? input.value : base.observed_use,
      observed_outcome: input.field === 'observed_outcome' ? input.value : base.observed_outcome,
      updated_at: input.at,
    };
    this.observationsById.set(input.memory_id, next);
    this.append({ kind: 'observation', record: next });
  }

  observations(): MicroNoteObservation[] {
    this.load();
    return [...this.observationsById.values()].sort((a, b) => a.memory_id.localeCompare(b.memory_id));
  }
}
