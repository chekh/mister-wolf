// src/adapters/fs/jsonl-micro-note-delivery-log.ts
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { UserFacingError } from '../../domain/errors.js';
import {
  MicroNoteDeliveryLog,
  MicroNoteDeliveryRecord,
  MicroNoteObservation,
  MicroNoteSuppressionRecord,
} from '../../ports/micro-note-delivery-log.port.js';
import { resolveMemoryRoot, listWorktreeCheckouts } from './memory-root.js';
import { indexPath } from './project-paths.js';
import { withJournalLockSync, LockHeldError } from './memory-lock.js';
import { createHash } from 'crypto';
import { realpathSync } from 'fs';

/**
 * Патч 3.3.1 (REQ-331-2, ADR-2 вариант A): единственный владелец журнала
 * противоречий/доставок/наблюдений micro-notes — append-only JSONL
 * `.wolf/memory/micro-note-delivery.jsonl`, рядом с events.jsonl/relations.jsonl
 * и ВНЕ кэша `.wolf/cache` (rebuild и удаление index.sqlite журнал не трогают).
 *
 * Формат: одна строка — одна запись-снимок `{ kind, record }`
 * (kind: suppression | delivery | observation). Все рабочие записи — добавление
 * строки; состояние подавления/наблюдения = последняя строка своего ключа
 * (suppression_id / memory_id). Чтение — полный скан на каждый публичный вызов
 * (патч 3.3.2, REQ-332-1: кэша нет), устойчив к незавершённой последней строке
 * (design §11); незавершённой может быть только последняя строка — ошибка
 * разбора в середине файла не глушится.
 *
 * Миграция 3.3.0 → 3.3.1 (REQ-331-3, ADR-3): триггер — файла журнала нет И
 * index.sqlite содержит legacy-таблицы; строки читаются в детерминированном
 * порядке (suppressions по suppressed_at, memory_id; deliveries по ts;
 * observations по memory_id), получают cnr_-id по порядку, значения переносятся
 * 1:1 включая NULL; запись журнала атомарная (tmp + rename); legacy-строки в
 * index.sqlite НЕ удаляются и не используются (замороженная копия для отката).
 * Идемпотентность: существование файла журнала — признак выполненной миграции.
 *
 * Патч 3.3.2 (REQ-332-2, ADR-2): общий корень памяти резолвится самим адаптером
 * (resolveMemoryRoot) — linked worktree использует журнал main-чекоута, как и
 * заметки; вне linked worktree путь прежний. (REQ-332-3, ADR-3): repair-on-write
 * — перед дописыванием хвост файла восстанавливается до границы последней
 * корректной строки.
 */

const MICRO_NOTE_DELIVERY_LOG_FILE = join('.wolf', 'memory', 'micro-note-delivery.jsonl');
/** Маркер миграции (REQ-333-4, ADR-340-2): «первый импорт уже выполнялся». */
const MIGRATION_MARKER_FILE = join('.wolf', 'memory', 'micro-note-delivery.migrated.json');

/**
 * Утрата журнала после миграции (REQ-333-4, ADR-340-2): состояние подавлений
 * неизвестно (REQ-03) — ни одна команда не угадывает его и не воскрешает
 * legacy-копию молча. Явное восстановление — только `wolf contradict restore`.
 */
export class JournalStateUnknownError extends UserFacingError {
  constructor(journalFile: string) {
    super(
      `suppression journal is missing after migration: "${journalFile}" — state unknown (REQ-03: unknown stays unknown); run \`wolf contradict restore\` to rebuild from sources, or remove BOTH the journal marker (${MIGRATION_MARKER_FILE}) and the journal file for the documented reset`
    );
    this.name = 'JournalStateUnknownError';
  }
}

/** Отчёт по одному источнику импорта (ADR-340-3, design §10.4). */
export interface ImportSourceReport {
  path: string;
  kind: 'index.sqlite' | 'worktree-journal';
  imported: { suppressions: number; deliveries: number; observations: number };
  reid: Array<{ from: string; to: string }>;
  refused?: string;
}

/** Отчёт импорта/restore (design §10.4): источники, счётчики, re-id, граница потерь. */
export interface ImportReport {
  sources: ImportSourceReport[];
  unrecoverable: string;
}

export type RestoreReport = ImportReport;

const UNRECOVERABLE_TEXT =
  'records appended to the shared journal after the migration are unrecoverable: the append-only carrier keeps no copies (restore rebuilds from the frozen index.sqlite snapshot and pre-upgrade worktree journals)';

/** Канонический JSON (сортировка ключей) — детерминированное сравнение записей импорта. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Состояние слияния импорта: что уже есть в журнале (ADR-340-3). */
interface MergeState {
  /** канонические JSON всех suppression-строк (открытые и снимки) — дедуп */
  suppressionCanonicals: Set<string>;
  /** канонические JSON всех delivery-строк — дедуп повторного import */
  deliveryCanonicals: Set<string>;
  /** эффективные подавления по id — детектор коллизий и занятости re-id */
  suppressionsById: Map<string, MicroNoteSuppressionRecord>;
  /** наблюдения по memory_id — merge по большему updated_at */
  observations: Map<string, { updatedAt: string; canonical: string }>;
}

type JournalLine =
  | { kind: 'suppression'; record: MicroNoteSuppressionRecord }
  | { kind: 'delivery'; record: MicroNoteDeliveryRecord }
  | { kind: 'observation'; record: MicroNoteObservation };

/** Различие причины отказа валидатора (ADR-340-4): 'json' — обрыв записи
 *  (crash в append, repair-семантика REQ-332-3), 'structure' — валидный JSON
 *  с неполной/неверной структурой (никогда не применяется и не обрезается). */
class JournalLineError extends UserFacingError {
  constructor(
    public readonly cause_: 'json' | 'structure',
    message: string
  ) {
    super(message);
    this.name = 'JournalLineError';
  }
}

/**
 * Единый валидатор строки журнала (REQ-333-3, ADR-340-4): единственное место
 * правила для чтения (load), tail-repair (append) и импорта wt-журналов/restore.
 * Проверяет {kind, record} и обязательные поля каждого kind с типами; любая
 * диагностика называет файл и номер строки (REQ-03: unknown stays unknown).
 */
export function parseJournalLine(raw: string, where: { file: string; line: number }): JournalLine {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JournalLineError(
      'json',
      `delivery log line is corrupted: "${where.file}" line ${where.line} is not valid JSON (REQ-03: unknown stays unknown)`
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    failStructure(where, 'line must be a JSON object');
  const { kind, record } = parsed as { kind?: unknown; record?: unknown };
  if (kind !== 'suppression' && kind !== 'delivery' && kind !== 'observation') {
    failStructure(where, `unknown kind ${JSON.stringify(kind) ?? '…'}, expected suppression|delivery|observation`);
  }
  if (typeof record !== 'object' || record === null) failStructure(where, 'record must be a non-empty object');
  const r = record as Record<string, unknown>;
  if (kind === 'delivery') {
    // HOT PATH (REQ-333-7, r7: 100k delivery-строк на выдачу): проверки без
    // замыканий и БЕЗ пересборки record (валидация cast'ом — JSON.parse уже дал
    // объект; лишние поля не отсекаются только у delivery, они не читаются
    // путем доставки); точные тексты отказов — как у rebuild-веток.
    const channel = r['channel'];
    if (channel !== 'brief' && channel !== 'call') failStructure(where, 'channel must be "brief" or "call"');
    const dkind = r['kind'];
    if (dkind !== 'selected' && dkind !== 'delivered')
      failStructure(where, 'record.kind must be "selected" or "delivered"');
    requireNonEmpty(r, 'memory_id', where);
    requireNonEmpty(r, 'revision', where);
    requireNonEmpty(r, 'ts', where);
    return { kind: 'delivery', record: r as unknown as MicroNoteDeliveryRecord };
  }
  const nonEmpty = (name: string): string => {
    const v = r[name];
    if (typeof v !== 'string' || v === '') failStructure(where, `${name} must be a non-empty string`);
    return v as string;
  };
  const optStr = (name: string): string | null => {
    const v = r[name];
    if (v !== null && typeof v !== 'string') failStructure(where, `${name} must be a string or null`);
    return v as string | null;
  };
  if (kind === 'suppression') {
    return {
      kind: 'suppression',
      record: {
        suppression_id: nonEmpty('suppression_id'),
        memory_id: nonEmpty('memory_id'),
        revision: nonEmpty('revision'),
        reason: nonEmpty('reason'),
        note_evidence: nonEmpty('note_evidence'),
        contradiction_evidence: nonEmpty('contradiction_evidence'),
        suppressed_at: nonEmpty('suppressed_at'),
        resolved_at: optStr('resolved_at'),
        resolution: optStr('resolution'),
      },
    };
  }
  return {
    kind: 'observation',
    record: {
      memory_id: nonEmpty('memory_id'),
      revision: nonEmpty('revision'),
      observed_use: optStr('observed_use'),
      observed_outcome: nonEmpty('observed_outcome'),
      updated_at: nonEmpty('updated_at'),
    },
  };
}

/** Отказ структуры (ADR-340-4): модульный уровень — без замыканий на горячем пути. */
function failStructure(where: { file: string; line: number }, detail: string): never {
  throw new JournalLineError(
    'structure',
    `delivery log line has an invalid structure: "${where.file}" line ${where.line}: ${detail} (REQ-03: unknown stays unknown — the line is never applied or silently dropped; fix or remove the line manually)`
  );
}

/** Модульный уровень (без замыканий): поле обязано быть непустой строкой. */
function requireNonEmpty(r: Record<string, unknown>, name: string, where: { file: string; line: number }): void {
  const v = r[name];
  if (typeof v !== 'string' || v === '') failStructure(where, `${name} must be a non-empty string`);
}

/** Число байтов 0x0a в буфере (номер строки хвоста для диагностики REQ-03). */
function countNewlines(buf: Buffer): number {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) n++;
  return n;
}

export class JsonlMicroNoteDeliveryLog implements MicroNoteDeliveryLog {
  private readonly suppressionsById = new Map<string, MicroNoteSuppressionRecord>();
  private readonly deliveryRows: MicroNoteDeliveryRecord[] = [];
  private readonly observationsById = new Map<string, MicroNoteObservation>();
  /** Общий корень памяти (REQ-332-2, ADR-2): резолвится в конструкторе — любая
   *  точка входа может передать путь текущего чекаута, журнал и legacy-поиск
   *  всегда идут в общий `.wolf/`; вне linked worktree root === baseDir (AC-2.5). */
  private readonly root: string;

  constructor(baseDir: string) {
    this.root = resolveMemoryRoot(baseDir).root;
  }

  private get file(): string {
    return join(this.root, MICRO_NOTE_DELIVERY_LOG_FILE);
  }

  private get markerPath(): string {
    return join(this.root, MIGRATION_MARKER_FILE);
  }

  /** Маркер миграции — атомарно (tmp + rename), внутри критической секции
   *  первого импорта (ADR-340-2). */
  private writeMarker(sources: string[]): void {
    mkdirSync(this.lockDir, { recursive: true });
    const tmp = `${this.markerPath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify({ migrated_at: new Date().toISOString(), sources }), 'utf8');
    renameSync(tmp, this.markerPath);
  }

  /**
   * Первый импорт в состоянии fresh (ADR-340-2/3): журнал создаётся одной
   * атомарной заменой (tmp + rename) из всех доступных источников в
   * детерминированном порядке (замороженный SQLite, затем wt-журналы по
   * лексикографическому пути чекаута); маркер пишется в той же критической
   * секции (под журнальным локом). Отвергнутые источники (невалидная строка)
   * не молчат: после записи валидных состояние бросает перечень отказов.
   * Без источников журнал не создаётся (пустое состояние нового проекта).
   */
  private runFirstImport(): void {
    const state: MergeState = {
      suppressionCanonicals: new Set(),
      deliveryCanonicals: new Set(),
      suppressionsById: new Map(),
      observations: new Map(),
    };
    const out: JournalLine[] = [];
    const usedKinds = new Set<string>();
    const refused: string[] = [];

    const sqlitePath = indexPath(this.root);
    if (existsSync(sqlitePath)) {
      const reportSrc: ImportSourceReport = {
        path: sqlitePath,
        kind: 'index.sqlite',
        imported: { suppressions: 0, deliveries: 0, observations: 0 },
        reid: [],
      };
      const merged = this.mergeImportSource(
        { path: sqlitePath, kind: 'index.sqlite' },
        this.collectLegacyLines(),
        state,
        reportSrc
      );
      out.push(...merged);
      if (merged.length > 0 || reportSrc.imported.observations > 0) usedKinds.add('index.sqlite');
      if (reportSrc.refused) refused.push(`${sqlitePath}: ${reportSrc.refused}`);
    }

    const wtPaths = this.worktreeSourcePaths();
    if (wtPaths !== null) {
      for (const src of this.readWorktreeJournals(wtPaths)) {
        const reportSrc: ImportSourceReport = {
          path: src.path,
          kind: 'worktree-journal',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
        };
        if (src.refused) {
          reportSrc.refused = src.refused;
          refused.push(`${src.path}: ${src.refused}`);
        } else {
          const merged = this.mergeImportSource(
            { path: src.path, kind: 'worktree-journal' },
            src.lines,
            state,
            reportSrc
          );
          out.push(...merged);
          if (merged.length > 0) usedKinds.add('worktree-journal');
        }
      }
    }

    if (out.length === 0 && refused.length === 0) {
      // REQ-333-4 (F-2, design §5 — уточнение ведущего REV-340, §6): fresh с
      // нулём строк И без отказов источников — ровно ОДИН раз: ПУСТОЙ журнал +
      // маркер sources: [] в той же критической секции; последующие вызовы
      // идут по normal (пересмотр источников/git-спавн не на горячем пути).
      // Для пользователя неотличимо от прежнего «файл создаётся первой
      // записью» (пустой файл читается как пустое состояние).
      mkdirSync(this.lockDir, { recursive: true });
      const tmp = `${this.file}.importing-${process.pid}.tmp`;
      writeFileSync(tmp, '', 'utf8');
      renameSync(tmp, this.file);
      this.writeMarker([]);
      return;
    }
    if (out.length > 0) {
      mkdirSync(this.lockDir, { recursive: true });
      const tmp = `${this.file}.importing-${process.pid}.tmp`;
      writeFileSync(tmp, out.map((l) => `${JSON.stringify(l)}\n`).join(''), 'utf8');
      renameSync(tmp, this.file);
      this.writeMarker([...usedKinds]);
    }
    if (refused.length > 0) {
      // REQ-03: отвергнутые источники не молчат — перечень с файлом и причиной
      throw new UserFacingError(`journal first import skipped invalid sources: ${refused.join('; ')}`);
    }
  }

  /** Пути wt-источников (ADR-340-3): живые чекауты; корневой исключён — его
   *  журнал и есть цель. null — сбой git-метаданных. */
  private worktreeSourcePaths(): string[] | null {
    const paths = listWorktreeCheckouts(this.root);
    if (paths === null) return null;
    let self: string;
    try {
      self = realpathSync(this.root);
    } catch {
      return paths;
    }
    return paths.filter((p) => p !== self);
  }

  /** Чтение wt-журналов (лексикографический порядок путей чекаута); каждая
   *  строка — через единый валидатор; источник с невалидной строкой
   *  отвергается ЦЕЛИКОМ (all-or-nothing, ADR-340-3). Отсутствующий файл —
   *  источник не добавляется. */
  private readWorktreeJournals(paths: string[]): Array<{ path: string; lines: JournalLine[]; refused?: string }> {
    const out: Array<{ path: string; lines: JournalLine[]; refused?: string }> = [];
    for (const wt of [...paths].sort()) {
      const j = join(wt, '.wolf', 'memory', 'micro-note-delivery.jsonl');
      if (!existsSync(j)) continue;
      try {
        const lines: JournalLine[] = [];
        const raw = readFileSync(j, 'utf8').split('\n');
        for (let i = 0; i < raw.length; i++) {
          const line = raw[i]!.trim();
          if (line === '') continue;
          lines.push(parseJournalLine(line, { file: j, line: i + 1 }));
        }
        out.push({ path: wt, lines });
      } catch (e) {
        out.push({ path: wt, lines: [], refused: (e as Error).message });
      }
    }
    return out;
  }

  /**
   * Слияние строк одного источника в состояние (ADR-340-3): suppressions —
   * дедуп по каноническому JSON, коллизия id — re-id всей цепочки источника;
   * deliveries — дедуп точным совпадением (первый импорт переносит полностью);
   * observations — merge по memory_id, побеждает больший updated_at, идентичные
   * пропускаются. Возвращает НОВЫЕ строки в порядке источника.
   */
  private mergeImportSource(
    src: { path: string; kind: 'index.sqlite' | 'worktree-journal' },
    lines: JournalLine[],
    state: MergeState,
    report: ImportSourceReport
  ): JournalLine[] {
    void src;
    // коллизии id определяются ДО записи: id занят, а канонический JSON
    // открытой строки источника не совпадает ни с одной существующей строкой
    const groups = new Map<string, JournalLine[]>();
    for (const l of lines) {
      if (l.kind !== 'suppression') continue;
      const g = groups.get(l.record.suppression_id) ?? [];
      g.push(l);
      groups.set(l.record.suppression_id, g);
    }
    const reidByGroup = new Map<string, string>();
    for (const [id, group] of groups) {
      const open = group[0]!;
      const openCanonical = canonicalJson(open);
      if (state.suppressionCanonicals.has(openCanonical) || !state.suppressionsById.has(id)) continue;
      const newId = this.reidFor(open.record as MicroNoteSuppressionRecord, state);
      if (!newId.repeat) report.reid.push({ from: id, to: newId.id });
      reidByGroup.set(id, newId.id);
    }

    const out: JournalLine[] = [];
    for (const l of lines) {
      if (l.kind === 'suppression') {
        const newId = reidByGroup.get(l.record.suppression_id);
        const record = newId === undefined ? l.record : { ...l.record, suppression_id: newId };
        const canonical = canonicalJson({ kind: 'suppression', record });
        if (state.suppressionCanonicals.has(canonical)) continue; // присутствует — пропускается
        state.suppressionCanonicals.add(canonical);
        state.suppressionsById.set(record.suppression_id, record);
        report.imported.suppressions++;
        out.push({ kind: 'suppression', record });
      } else if (l.kind === 'delivery') {
        const canonical = canonicalJson(l);
        if (state.deliveryCanonicals.has(canonical)) continue;
        state.deliveryCanonicals.add(canonical);
        report.imported.deliveries++;
        out.push(l);
      } else {
        const canonical = canonicalJson(l);
        const existing = state.observations.get(l.record.memory_id);
        if (existing !== undefined) {
          if (existing.canonical === canonical) continue; // идентичные пропускаются
          if (l.record.updated_at > existing.updatedAt) {
            state.observations.set(l.record.memory_id, { updatedAt: l.record.updated_at, canonical });
            report.imported.observations++;
            out.push(l);
          }
          continue; // старее или равное — существующее выигрывает (детерминизм)
        }
        state.observations.set(l.record.memory_id, { updatedAt: l.record.updated_at, canonical });
        report.imported.observations++;
        out.push(l);
      }
    }
    return out;
  }

  /** Детерминированный re-id при коллизии (ADR-340-3): cnr_<день>_r<sha256
   *  канонического JSON открытой записи>; повтор того же источника распознаётся
   *  по идентичной строке под кандидатом (repeat — AC-1.3/1.4), занятое чужой
   *  записью окно расширяется 12→16→24→32 (завершающийся детерминизм). */
  private reidFor(openRecord: MicroNoteSuppressionRecord, state: MergeState): { id: string; repeat: boolean } {
    const day = openRecord.suppressed_at.slice(0, 10).replace(/-/g, '');
    const hash = createHash('sha256')
      .update(canonicalJson({ kind: 'suppression', record: openRecord }))
      .digest('hex');
    for (const len of [12, 16, 24, 32]) {
      const candidate = `cnr_${day}_r${hash.slice(0, len)}`;
      // идентичная строка уже под этим id — повтор того же источника
      const asOwn = canonicalJson({ kind: 'suppression', record: { ...openRecord, suppression_id: candidate } });
      if (state.suppressionCanonicals.has(asOwn)) return { id: candidate, repeat: true };
      if (!state.suppressionsById.has(candidate)) return { id: candidate, repeat: false };
    }
    return { id: `cnr_${day}_r${hash}`, repeat: false }; // полный хеш — уникален по построению
  }

  /** Состояние слияния из ТЕКУЩЕГО журнала (read-only досмотр импорта):
   *  отдельное чтение сырых строк — история снимков в maps не хранится.
   *  Вызывается под локом в редких CLI-командах, не на горячем пути. */
  private buildMergeStateFromJournal(): MergeState {
    const state: MergeState = {
      suppressionCanonicals: new Set(),
      deliveryCanonicals: new Set(),
      suppressionsById: new Map(),
      observations: new Map(),
    };
    if (!existsSync(this.file)) return state;
    const raw = readFileSync(this.file, 'utf8').split('\n');
    for (let i = 0; i < raw.length; i++) {
      const line = raw[i]!.trim();
      if (line === '') continue;
      let parsed: JournalLine;
      try {
        parsed = parseJournalLine(line, { file: this.file, line: i + 1 });
      } catch {
        continue; // хвост-обрывок (repair-семантика); середина уже отвергнута load()
      }
      if (parsed.kind === 'suppression') {
        state.suppressionCanonicals.add(canonicalJson(parsed));
        state.suppressionsById.set(parsed.record.suppression_id, parsed.record);
      } else if (parsed.kind === 'delivery') {
        state.deliveryCanonicals.add(canonicalJson(parsed));
      } else {
        state.observations.set(parsed.record.memory_id, {
          updatedAt: parsed.record.updated_at,
          canonical: canonicalJson(parsed),
        });
      }
    }
    return state;
  }

  /** REQ-333-1 (ADR-340-3): идемпотентный досмотр wt-журналов — новые строки
   *  дописываются одним батчем; отказавшие источники дают ошибку с перечнем. */
  importWorktreeJournals(): ImportReport {
    return this.withJournalLock(() => {
      this.load(); // fresh выполняет первый импорт (SQLite + wt); loss бросит
      const report: ImportReport = { sources: [], unrecoverable: UNRECOVERABLE_TEXT };
      const wtPaths = this.worktreeSourcePaths();
      if (wtPaths === null) {
        report.sources.push({
          path: '(git worktree list)',
          kind: 'worktree-journal',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
          refused: 'git metadata unavailable (worktree enumeration failed)',
        });
        return report;
      }
      const state = this.buildMergeStateFromJournal();
      const newLines: JournalLine[] = [];
      const refused: string[] = [];
      for (const src of this.readWorktreeJournals(wtPaths)) {
        const reportSrc: ImportSourceReport = {
          path: src.path,
          kind: 'worktree-journal',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
        };
        if (src.refused !== undefined) {
          reportSrc.refused = src.refused;
          refused.push(`${src.path}: ${src.refused}`);
        } else {
          newLines.push(
            ...this.mergeImportSource({ path: src.path, kind: 'worktree-journal' }, src.lines, state, reportSrc)
          );
        }
        report.sources.push(reportSrc);
      }
      this.appendMany(newLines);
      if (refused.length > 0) {
        throw new UserFacingError(`import skipped invalid sources: ${refused.join('; ')}`);
      }
      return report;
    });
  }

  /** REQ-333-4 (ADR-340-2): единственный путь состояния-в-состояние при утрате:
   *  пересборка журнала из замороженного index.sqlite + wt-журналов одной
   *  атомарной заменой (tmp + rename) под локом; отчёт источников и границы
   *  потерь; при существующем журнале — отказ. */
  restoreFromSources(): RestoreReport {
    return this.withJournalLock(() => {
      const journalExists = existsSync(this.file);
      const markerExists = existsSync(this.markerPath);
      if (journalExists) {
        throw new UserFacingError(
          `restore requires a lost journal (journal present at "${this.file}") — to reset, remove BOTH the journal marker (${this.markerPath}) and the journal file; the next access performs a fresh first import`
        );
      }
      if (!markerExists) {
        throw new UserFacingError(
          `restore requires the loss state (no migration marker at "${this.markerPath}") — a journal without the marker is a pre-3.4.0 project, nothing to restore`
        );
      }

      const state: MergeState = {
        suppressionCanonicals: new Set(),
        deliveryCanonicals: new Set(),
        suppressionsById: new Map(),
        observations: new Map(),
      };
      const out: JournalLine[] = [];
      const usedKinds = new Set<string>();
      const report: ImportReport = { sources: [], unrecoverable: UNRECOVERABLE_TEXT };
      const refused: string[] = [];

      const sqlitePath = indexPath(this.root);
      if (existsSync(sqlitePath)) {
        const reportSrc: ImportSourceReport = {
          path: sqlitePath,
          kind: 'index.sqlite',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
        };
        try {
          const merged = this.mergeImportSource(
            { path: sqlitePath, kind: 'index.sqlite' },
            this.collectLegacyLines(),
            state,
            reportSrc
          );
          out.push(...merged);
          if (merged.length > 0) usedKinds.add('index.sqlite');
        } catch (e) {
          reportSrc.refused = (e as Error).message;
          refused.push(`${sqlitePath}: ${reportSrc.refused}`);
        }
        report.sources.push(reportSrc);
      }

      const wtPaths = this.worktreeSourcePaths();
      if (wtPaths !== null) {
        for (const src of this.readWorktreeJournals(wtPaths)) {
          const reportSrc: ImportSourceReport = {
            path: src.path,
            kind: 'worktree-journal',
            imported: { suppressions: 0, deliveries: 0, observations: 0 },
            reid: [],
          };
          if (src.refused !== undefined) {
            reportSrc.refused = src.refused;
            refused.push(`${src.path}: ${src.refused}`);
          } else {
            const merged = this.mergeImportSource(
              { path: src.path, kind: 'worktree-journal' },
              src.lines,
              state,
              reportSrc
            );
            out.push(...merged);
            if (merged.length > 0) usedKinds.add('worktree-journal');
          }
          report.sources.push(reportSrc);
        }
      }

      if (out.length === 0 && refused.length > 0) {
        throw new UserFacingError(`nothing to restore from: ${refused.join('; ')}`);
      }
      if (out.length === 0) {
        // REQ-333-4 (F-1, design §10.4): пересобрать не из чего — журнал НЕ
        // создаётся (иначе утрата замещается «тихо пустым состоянием»);
        // документированный путь сброса — удалить И журнал, И маркер.
        throw new UserFacingError(
          `nothing to restore from: no recorded sources are available — to start over instead, remove BOTH the journal and the migration marker (.wolf/memory/micro-note-delivery.migrated.json) for the documented reset`
        );
      }

      mkdirSync(this.lockDir, { recursive: true });
      const tmp = `${this.file}.restoring-${process.pid}.tmp`;
      writeFileSync(tmp, out.map((l) => `${JSON.stringify(l)}\n`).join(''), 'utf8');
      renameSync(tmp, this.file);
      this.writeMarker([...usedKinds]);
      if (refused.length > 0) {
        throw new UserFacingError(`restore skipped invalid sources: ${refused.join('; ')}`);
      }
      return report;
    });
  }

  /** Добавление строк одним append (REQ-333-7): один repair + одна дозапись. */
  private appendMany(lines: JournalLine[]): void {
    if (lines.length === 0) return;
    mkdirSync(this.lockDir, { recursive: true });
    this.repairTail();
    appendFileSync(this.file, lines.map((l) => `${JSON.stringify(l)}\n`).join(''), 'utf8');
  }

  private get lockDir(): string {
    return join(this.root, '.wolf', 'memory');
  }

  /**
   * REQ-333-2 (ADR-340-1): любой публичный вызов — одна критическая секция
   * «прочитать состояние → решить → записать (repair+append/импорт)» под
   * журнальным локом: параллельные процессы не видят разорванное окно repair
   * и не теряют записи друг друга. Мутаторы держат лок на всю секцию,
   * читатели — на «load+parse».
   */
  private withJournalLock<T>(fn: () => T): T {
    try {
      return withJournalLockSync(this.lockDir, fn, undefined, 'micro-note-delivery.jsonl.lock');
    } catch (e) {
      if (e instanceof LockHeldError) {
        throw new UserFacingError(
          `delivery journal is busy: ${e.lockPath} (holder pid: ${e.holderPid ?? 'unknown'}) — another wolf process holds the lock; retry when it finishes`
        );
      }
      throw e;
    }
  }

  private load(): void {
    // REQ-332-1 (ADR-1): кэша нет — состояние перестраивается на каждый
    // публичный вызов (внутри журнального лока), чтобы инстанс долгоживущего
    // процесса (MCP) видел записи других процессов.
    this.suppressionsById.clear();
    this.deliveryRows.length = 0;
    this.observationsById.clear();
    this.ensureJournalState();
    if (!existsSync(this.file)) return;
    const lines = readFileSync(this.file, 'utf8').split('\n');
    // REQ-333-7 (r7): where-объект ОДИН на файл (100k аллокаций на hot-path —
    // заметная доля времени; мутация номера строки семантику не меняет)
    const where = { file: this.file, line: 0 };
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]!;
      // REQ-333-7 (r7): trim-аллокация на горячем пути не нужна — строки журнала
      // пишутся как `JSON...\n`; trim только для «странного» края (пробелы/CR),
      // пустая строка пропускается в обоих путях
      if (line.length === 0) continue;
      if (line.charCodeAt(0) !== 0x7b /* { */ || line.charCodeAt(line.length - 1) !== 0x7d /* } */) {
        line = line.trim();
        if (line === '') continue;
      }
      where.line = i + 1;
      try {
        this.apply(parseJournalLine(line, where));
      } catch (e) {
        if (e instanceof JournalLineError) {
          // обрыв записи (crash в append): незавершённая ПОСЛЕДНЯЯ строка
          // отбрасывается при чтении и обрезается при записи (REQ-332-3);
          // валидный JSON с неверной структурой — отказ В ЛЮБОЙ позиции.
          if (e.cause_ === 'json' && i === lines.length - 1) break;
          if (e.cause_ === 'json') {
            // прежний текст регресса 3.3.2: битая середина файла не глушится
            throw new UserFacingError(
              `delivery log is corrupted mid-file: "${this.file}" line ${i + 1} is not valid JSON (REQ-03: unknown stays unknown)`
            );
          }
        }
        throw e;
      }
    }
  }

  /**
   * REQ-333-7 (ADR-340-6): машина состояний БЕЗ полного парса (для пути
   * доставки): fresh → первый импорт; loss → отказ; normal → самозаживление
   * маркера. Семантика та же, что в load(), parse-чтения нет.
   */
  private ensureJournalState(): void {
    const journalExists = existsSync(this.file);
    const markerExists = existsSync(this.markerPath);
    if (!journalExists && markerExists) {
      // утрата: состояние неизвестно — fail-closed, без воссоздания журнала
      throw new JournalStateUnknownError(this.file);
    }
    if (!journalExists) {
      // fresh: первый импорт из всех доступных источников (ADR-340-3)
      this.runFirstImport();
    } else if (!markerExists) {
      // самозаживление: журнал с 3.3.x, окно сбоя между rename и маркером;
      // состояние не меняется, источник не угадывается
      this.writeMarker(['unknown']);
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

  /**
   * Добавление строки; директория создаётся на первой записи; хвост файла
   * восстанавливается до границы последней корректной строки (REQ-332-3, ADR-3).
   */
  private append(line: JournalLine): void {
    this.appendMany([line]);
  }

  /**
   * Repair-on-write (REQ-332-3, ADR-3): обрыв append (crash) может оставить
   * последнюю строку без `\n`; дописывание после неё создаёт битую строку в
   * середине файла уже после подтверждения успеха. Перед записью:
   * - файла нет или он заканчивается `\n` — граница корректна, ничего не делаем;
   * - хвост после последнего `\n` — полная валидная запись: финализация
   *   (дописывается `\n`, запись не теряется, AC-3.2);
   * - хвост — обрывок частичной записи: обрезка до границы последнего `\n`
   *   (или до нуля, AC-3.1).
   * Байтовая граница ищется в Buffer: индекс `\n` в байтах, а не в символах
   * (строки журнала могут содержать multibyte). После любого успешного append
   * файл — последовательность полных строк (AC-3.3).
   * REQ-333-7 (ADR-340-6): читается ХВОСТОВОЕ ОКНО 1 MiB позиционным readSync
   * (позиции абсолютные), не весь файл — hot-path большого журнала свободен;
   * точный абсолютный номер строки для отказа (structure) — полное чтение
   * ТОЛЬКО на error-пути; хвост длиннее окна без `\n` → честная полная
   * перечитка (строки журнала << 1 MiB, путь практически недостижим).
   */
  private static readonly REPAIR_TAIL_WINDOW = 1024 * 1024;

  private repairTail(): void {
    if (!existsSync(this.file)) return;
    const size = statSync(this.file).size;
    if (size === 0) return;
    let windowStart = Math.max(0, size - JsonlMicroNoteDeliveryLog.REPAIR_TAIL_WINDOW);
    let window: Buffer;
    const fd = openSync(this.file, 'r');
    try {
      window = Buffer.alloc(size - windowStart);
      const bytesRead = readSync(fd, window, 0, window.length, windowStart);
      window = window.subarray(0, bytesRead);
    } finally {
      closeSync(fd);
    }
    let lastNewline = window.lastIndexOf(0x0a);
    if (lastNewline === -1 && windowStart > 0) {
      // хвост длиннее окна (одна строка > 1 MiB) — корректность важнее стоимости
      window = readFileSync(this.file);
      windowStart = 0;
      lastNewline = window.lastIndexOf(0x0a);
    }
    if (window.length === 0 || window.at(-1) === 0x0a) return;
    const tailOffset = windowStart + lastNewline + 1; // абсолютная позиция хвоста
    const tail = window.subarray(lastNewline + 1).toString('utf8');
    try {
      // единый валидатор (ADR-340-4): решение финализировать/обрезать/отказать;
      // номер строки точен для windowStart === 0, иначе пере-атрибуция ниже
      parseJournalLine(tail, { file: this.file, line: 1 + countNewlines(window.subarray(0, lastNewline + 1)) });
      appendFileSync(this.file, '\n', 'utf8');
    } catch (e) {
      if (e instanceof JournalLineError && e.cause_ === 'json') {
        truncateSync(this.file, tailOffset); // обрыв записи — repair-семантика REQ-332-3
        return;
      }
      if (e instanceof JournalLineError && windowStart !== 0) {
        // точный АБСОЛЮТНЫЙ номер строки — полное чтение только на error-пути
        const fd2 = openSync(this.file, 'r');
        try {
          const prefix = Buffer.alloc(tailOffset);
          readSync(fd2, prefix, 0, tailOffset, 0);
          parseJournalLine(tail, { file: this.file, line: 1 + countNewlines(prefix) });
        } finally {
          closeSync(fd2);
        }
      }
      throw e; // валидный JSON с неверной структурой — отказ до ручного исправления
    }
  }

  /**
   * Замороженные legacy-строки 3.3.0 из index.sqlite (REQ-331-3, ADR-3 →
   * ADR-340-3): три таблицы в детерминированном порядке (suppressions по
   * suppressed_at, memory_id; deliveries по ts; observations по memory_id),
   * значения переносятся 1:1 включая NULL; cnr_-id по порядку миграции.
   * index.sqlite не изменяется — замороженная копия остаётся источником
   * для restore (ADR-340-2). Пустой массив — источников нет.
   */
  private collectLegacyLines(): JournalLine[] {
    const legacyPath = indexPath(this.root);
    if (!existsSync(legacyPath)) return [];
    const db = new Database(legacyPath, { readonly: true, fileMustExist: true });
    try {
      const tableExists = (name: string): boolean =>
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
      const hasSuppressions = tableExists('micro_note_suppressions');
      const hasDeliveries = tableExists('micro_note_deliveries');
      const hasObservations = tableExists('micro_note_observations');
      if (!hasSuppressions && !hasDeliveries && !hasObservations) return [];

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

      return lines;
    } finally {
      db.close();
    }
  }

  recordSuppression(record: MicroNoteSuppressionRecord): void {
    this.withJournalLock(() => {
      this.load();
      if (this.suppressionsById.has(record.suppression_id)) {
        throw new UserFacingError(
          `duplicate suppression id "${record.suppression_id}": the delivery log is append-only (retry generates a new suppression id)`
        );
      }
      this.suppressionsById.set(record.suppression_id, record);
      this.append({ kind: 'suppression', record });
    });
  }

  resolveSuppression(suppressionId: string, resolution: string, at: string): void {
    this.withJournalLock(() => {
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
    });
  }

  suppressions(): MicroNoteSuppressionRecord[] {
    return this.withJournalLock(() => {
      this.load();
      // тот же детерминированный порядок, что в 3.3.0: suppressed_at, затем memory_id
      return [...this.suppressionsById.values()].sort(
        (a, b) => a.suppressed_at.localeCompare(b.suppressed_at) || a.memory_id.localeCompare(b.memory_id)
      );
    });
  }

  recordDelivery(record: MicroNoteDeliveryRecord): void {
    this.recordDeliveries([record]);
  }

  /**
   * REQ-333-7 (ADR-340-6): один лок, один repair, ОДИН append N строк (порядок
   * строк как у N recordDelivery); полной перечитки журнала НЕТ (доставки
   * путём доставки не читаются); триггер первого импорта и отказ в loss
   * сохраняются (ensureJournalState).
   */
  recordDeliveries(records: MicroNoteDeliveryRecord[]): void {
    if (records.length === 0) return;
    this.withJournalLock(() => {
      this.ensureJournalState();
      this.appendMany(records.map((record) => ({ kind: 'delivery' as const, record })));
    });
  }

  deliveries(): MicroNoteDeliveryRecord[] {
    return this.withJournalLock(() => {
      this.load();
      return [...this.deliveryRows];
    });
  }

  setObservation(input: {
    memory_id: string;
    revision: string;
    field: 'observed_use' | 'observed_outcome';
    value: string;
    at: string;
  }): void {
    this.withJournalLock(() => {
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
    });
  }

  observations(): MicroNoteObservation[] {
    return this.withJournalLock(() => {
      this.load();
      return [...this.observationsById.values()].sort((a, b) => a.memory_id.localeCompare(b.memory_id));
    });
  }
}
