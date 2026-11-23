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
import { resolveMemoryRoot, listWorktreeCheckouts, cachedWorktreeEnumeration } from './memory-root.js';
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
 * (патч 3.3.2, REQ-332-1: кэша нет), устойчив к обрыву хвоста (design §11;
 * patch 3.4.2 review F-A: незавершённой может быть только последняя строка
 * БЕЗ завершающего '\n' — строка с '\n' и битая середина отвергают файл
 * целиком, ошибка разбора не глушится).
 *
 * Миграция 3.3.0 → 3.3.1 (REQ-331-3, ADR-3): триггер — файла журнала нет И
 * index.sqlite содержит legacy-таблицы; строки читаются в детерминированном
 * порядке (suppressions по suppressed_at, memory_id; deliveries по ts;
 * observations по memory_id), получают cnr_-id по порядку, значения переносятся
 * 1:1 включая NULL; запись журнала атомарная (tmp + rename); legacy-строки в
 * index.sqlite НЕ удаляются и не используются (замороженная копия для отката).
 * Идемпотентность — patch 3.4.x review (F1.2/F3.4): перенос доказан ТОЛЬКО
 * маркером v2 {format:2, complete:true, worktrees}; журнал без v2-маркера
 * (проект 3.3.1/3.4.0 или окно сбоя) → довосстановление при следующем доступе
 * (completion pass, идемпотентен по каноническому JSON).
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

/**
 * patch 3.4.x review (F3.1): перенос журнала не завершён — есть отвергнутые
 * источники или недоступные git-метаданные при наличии .git. Доставка
 * приостановлена до завершения переноса; состояние (журнал, маркер) не
 * меняется ни одной командой; перечень отказов в тексте.
 */
export class JournalMigrationIncompleteError extends UserFacingError {
  constructor(public readonly refusals: string[]) {
    super(
      `micro-note journal migration is unfinished: ${refusals.join('; ')} — micro-note delivery is suspended until the migration completes; fix or remove the refused source(s), then rerun (wolf brief completes the migration; explicit scan: wolf contradict import)`
    );
    this.name = 'JournalMigrationIncompleteError';
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

/** Состояние ИСТОЧНИКА переноса по пути (patch 3.4.3 review, P1). */
type SourceState = { state: 'absent' } | { state: 'ok' } | { state: 'refused'; reason: string };

/**
 * Состояние ИСТОЧНИКА переноса (patch 3.4.3 review, P1): statSync с разбором
 * errno вместо existsSync. existsSync возвращает false и для «нет», и для
 * «нет прав» — недоступный источник (EACCES/EPERM/EIO/ENOTDIR/…) молча
 * считался отсутствующим, перенос завершался и последующий brief выдавал
 * спорную заметку, чьё подавление лежит в закрытом источнике. Контракт
 * (директива владельца ревью): ТОЛЬКО ENOENT означает «источника нет»
 * (прежнее поведение «отсутствующий пропускается»); любой другой код —
 * { state:'refused', reason } с путём и кодом ошибки, отказ идёт по
 * существующим путям незавершённого переноса (JournalMigrationIncompleteError
 * на первом импорте/completion pass/явном import, явный отказ restore).
 * Проверки СОБСТВЕННЫХ файлов адаптера (журнал/маркер проекта в load()/
 * ensureJournalState/persistIncompleteImportMarker/migrationProven/
 * buildMergeStateFromJournal/restoreFromSources-precondition, repairTail,
 * .git-гейт) намеренно остаются на existsSync — прежняя семантика: это не
 * источники переноса, а состояние самого журнала/окружения, где false
 * («файла нет») уже имеет осмысленную ветку обработки, а недоступность
 * собственного файла проявится на последующем чтении/записи с полной
 * диагностикой, не как молчаливая потеря переноса.
 */
function sourceState(path: string): SourceState {
  try {
    statSync(path);
    return { state: 'ok' };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'absent' };
    return { state: 'refused', reason: `${path}: ${(e as Error).message}` };
  }
}

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

/**
 * Единый путь чтения файла журнала (REQ-332-3; patch 3.4.2 review F-A/F-B):
 * сырой текст делится по '\n', пустые фрагменты пропускаются, каждая строка —
 * через единый валидатор parseJournalLine. Обрыв записи (причина 'json')
 * допускается ТОЛЬКО для ПОСЛЕДНЕГО фрагмента split('\n') — файл без
 * завершающего '\n' (crash в append): фрагмент отбрасывается, корректный
 * префикс сохраняется. Битый JSON в любой другой позиции — в том числе
 * повреждённая последняя строка С '\n' (F-A: не последний фрагмент) — или
 * 'structure' в любой позиции отвергают файл ЦЕЛИКОМ: 'json' → UserFacingError
 * «corrupted mid-file» с файлом и номером строки, 'structure' → JournalLineError
 * как есть. sink вызывается на каждую валидную строку (без промежуточного
 * массива — hot-path load без лишних аллокаций). Одна семантика допусков для
 * load(), wt-журналов (F-A) и строгой валидации общего журнала перед слиянием
 * (F-B).
 */
function readJournalLines(raw: string, file: string, sink: (line: JournalLine) => void): void {
  const fragments = raw.split('\n');
  // REQ-333-7 (r7): where-объект ОДИН на файл; trim только для «странного» края
  const where = { file, line: 0 };
  for (let i = 0; i < fragments.length; i++) {
    let line = fragments[i]!;
    if (line.length === 0) continue;
    if (line.charCodeAt(0) !== 0x7b /* { */ || line.charCodeAt(line.length - 1) !== 0x7d /* } */) {
      line = line.trim();
      if (line === '') continue;
    }
    where.line = i + 1;
    try {
      sink(parseJournalLine(line, where));
    } catch (e) {
      if (e instanceof JournalLineError) {
        // обрыв записи (crash в append): незавершённый ПОСЛЕДНИЙ фрагмент
        // (файл без '\n') отбрасывается (REQ-332-3); повреждённая строка
        // С '\n' или битая середина — отказ (REQ-03: unknown stays unknown)
        if (e.cause_ === 'json' && i === fragments.length - 1) return;
        if (e.cause_ === 'json') {
          throw new UserFacingError(
            `delivery log is corrupted mid-file: "${file}" line ${i + 1} is not valid JSON (REQ-03: unknown stays unknown)`
          );
        }
      }
      throw e;
    }
  }
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

  /** Маркер миграции v2 — атомарно (tmp + rename), внутри критической секции
   *  импорта (ADR-340-2). patch 3.4.x review (F1.2): «перенос доказан» —
   *  format:2 + complete:true + перечисленные wt-пути; маркер 3.3.1/3.4.0
   *  (без format) перенос не доказывает — при следующем доступе выполняется
   *  довосстановление (completion pass). patch 3.4.2 review (F-C): complete
   *  — параметр; false персистит незавершённый явный импорт. */
  private writeMarkerV2(sources: string[], worktrees: string[], complete: boolean): void {
    mkdirSync(this.lockDir, { recursive: true });
    const tmp = `${this.markerPath}.tmp-${process.pid}`;
    writeFileSync(
      tmp,
      JSON.stringify({ format: 2, migrated_at: new Date().toISOString(), sources, complete, worktrees }),
      'utf8'
    );
    renameSync(tmp, this.markerPath);
  }

  /**
   * patch 3.4.2 review (F-C): отказ явного импорта при существующем журнале
   * персистится — маркер v2 переписывается с complete:false (прочие поля схемы
   * сохраняются из прежнего маркера; worktrees при нечитаемом маркере
   * актуализируется перечислением), затем вызывающий возвращает ошибку.
   * Следующий доступ видит неподтверждённый перенос и идёт в completion pass:
   * источник всё ещё повреждён → suspended; источник починен → довосстановление
   * идемпотентно (дедуп каноническим JSON). Журнала нет (первый импорт отказал)
   * — НИЧЕГО не пишется: маркер без журнала создал бы loss-состояние, а
   * следующий доступ сам повторит первый импорт и сообщит о незавершённости.
   * Возвращает sources, сохранённые из прежнего маркера (P1-2: финализация
   * явного импорта записывает их же — явный импорт SQLite не перечитывает).
   */
  private persistIncompleteImportMarker(wtPaths: string[]): string[] {
    if (!existsSync(this.file)) return [];
    let sources: string[] = [];
    let worktrees = wtPaths;
    try {
      const prev = JSON.parse(readFileSync(this.markerPath, 'utf8')) as { sources?: unknown; worktrees?: unknown };
      if (Array.isArray(prev.sources)) {
        const kept = prev.sources.filter((s): s is string => typeof s === 'string');
        if (kept.length > 0) sources = kept;
      }
      if (Array.isArray(prev.worktrees)) {
        const kept = prev.worktrees.filter((s): s is string => typeof s === 'string');
        if (kept.length > 0) worktrees = kept;
      }
    } catch {
      // маркера нет или он нечитаем — схема заполняется доступным перечислением
    }
    this.writeMarkerV2(sources, worktrees, false);
    return sources;
  }

  /**
   * patch 3.4.x review (F1.2): доказан ли перенос. true — маркер v2
   * {format:2, complete:true} И его списки источников покрывают текущее
   * перечисление; null — маркера нет; false — маркер есть, но написан
   * 3.3.1/3.4.0 (без format), не complete, ПОДОЗРИТЕЛЕН (P1-1: см.
   * markerSourcesSuspect) или бит — перенос не доказан.
   * patch 3.4.5 review (P1-1): ошибочный complete:true старых версий не
   * доверяется навсегда — списки маркера сверяются с текущим перечислением
   * источников (legacy SQLite + wt); расхождение → completion pass, после
   * успеха маркер переписывается актуальными списками (самоисцеление).
   */
  private migrationProven(): boolean | null {
    if (!existsSync(this.markerPath)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.markerPath, 'utf8'));
    } catch {
      return false; // битый маркер перенос не доказывает
    }
    // коррекция 3.4.5 (F-2): маркер-литерал (валидный JSON не-объект, например
    // null) — доказательства нет, как у битого; не внутренний TypeError команды
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
    const marker = parsed as { format?: unknown; complete?: unknown; sources?: unknown; worktrees?: unknown };
    if (marker.format !== 2 || marker.complete !== true) return false;
    if (this.markerSourcesSuspect(marker)) return false;
    return true;
  }

  /**
   * patch 3.4.5 review (P1-1): «подозрительный» proven-маркер — записанные
   * списки источников не покрывают ТЕКУЩЕЕ перечисление: (а) существует
   * wt-путь, которого нет в worktrees (3.4.3 молча выбрасывала wt с
   * недоступным родителем — маркер с worktrees:[] доказан стендом repro-344);
   * (б) legacy SQLite существует, но не записан в sources — ни путём (форма
   * 3.4.5), ни kind-меткой 'index.sqlite' (здоровые маркеры 3.4.2–3.4.4 писали
   * kinds) (3.4.2 молча пропускала недоступный SQLite). Пропавшие пути и
   * источники подозрительными НЕ считаются (ENOENT-пропуск честен — см.
   * регресс (7)); недоступный для stat SQLite сравнение не поднимает
   * (доступность — как в 3.4.4); НЕВОЗМОЖНОСТЬ перечислить (сбой git или
   * недоступные пути) сравнение не поднимает: сверить нельзя — доверяем
   * записи маркера (доступность как в 3.4.4; отказ перечисления не рвёт
   * F-C-персистенцию явного импорта, а после возврата доступа сверка
   * выполняется — тогда дрейф обнаруживается).
   * Коррекция 3.4.5 (F-1): правило (б) legacy-SQLite применяется БЕЗ .git-гварда
   * — замороженный источник не требует перечисления wt; гвард остаётся только
   * для правила (а) wt-дрейфа (не-git: worktree нет по построению).
   */
  private markerSourcesSuspect(marker: { sources?: unknown; worktrees?: unknown }): boolean {
    // (б) legacy SQLite существует, но не записан в sources — ни путём (форма
    // 3.4.5), ни kind-меткой 'index.sqlite' (здоровые маркеры 3.4.2–3.4.4
    // писали kinds) — БЕЗ git-гварда (F-1)
    const sqlitePath = indexPath(this.root);
    const state = sourceState(sqlitePath);
    if (state.state === 'ok') {
      const sources = Array.isArray(marker.sources)
        ? marker.sources.filter((s): s is string => typeof s === 'string')
        : [];
      if (!sources.includes(sqlitePath) && !sources.includes('index.sqlite')) return true;
    }
    // (а) существует wt-путь, которого нет в worktrees — только при .git
    if (!existsSync(join(this.root, '.git'))) return false; // не-git: worktree нет по построению
    const enumeration = cachedWorktreeEnumeration(this.root);
    if (enumeration === null) return false; // перечислить нельзя — сравнить нельзя (см. выше)
    let self: string | null = null;
    try {
      self = realpathSync(this.root);
    } catch {
      // фильтр себя недоступен — сравнение по полному списку (как worktreeSourcePaths)
    }
    const current = self === null ? enumeration.paths : enumeration.paths.filter((p) => p !== self);
    const recorded = Array.isArray(marker.worktrees)
      ? marker.worktrees.filter((s): s is string => typeof s === 'string')
      : [];
    if (current.some((p) => !recorded.includes(p))) return true; // новый wt-источник
    return false;
  }

  /**
   * Первый импорт в состоянии fresh (ADR-340-2/3; patch 3.4.x review (F3.4)):
   * validate-before-publish — ВСЕ источники (замороженный SQLite, wt-журналы,
   * перечисление git) читаются и валидируются ДО публикации; хоть один отказ —
   * НЕ создаётся ни журнал, ни маркер, JournalMigrationIncompleteError
   * (следующий доступ повторит первый импорт и снова сообщит о
   * незавершённости). Все источники валидны → журнал публикуется одной
   * атомарной заменой (tmp + rename) вместе с маркером v2 в той же
   * критической секции (под журнальным локом); строки в детерминированном
   * порядке (замороженный SQLite, затем wt-журналы по лексикографическому
   * пути чекаута). Окно «журнал опубликован, маркер нет» закрывается само:
   * ensureJournalState видит журнал без v2-маркера → completion pass
   * (идемпотентен). Пустое состояние нового проекта (0 строк, 0 отказов) —
   * прежнее: пустой журнал + маркер.
   */
  private runFirstImport(): void {
    const sqlitePath = indexPath(this.root);
    const refusals: string[] = [];
    let legacyLines: JournalLine[] = [];
    // patch 3.4.3 review (P1): источник — sourceState (statSync + errno), не
    // existsSync: EACCES/… — отказ переноса, ENOENT — источника нет
    const sqliteState = sourceState(sqlitePath);
    if (sqliteState.state === 'refused') {
      refusals.push(sqliteState.reason);
    } else if (sqliteState.state === 'ok') {
      try {
        legacyLines = this.collectLegacyLines();
      } catch (e) {
        refusals.push(`${sqlitePath}: ${(e as Error).message}`);
      }
    }
    const wtPaths = this.enumerateWtSourcesOrFail(refusals);
    const wtSources = this.readWorktreeJournals(wtPaths);
    for (const src of wtSources) {
      if (src.refused !== undefined) refusals.push(`${src.path}: ${src.refused}`);
    }
    if (refusals.length > 0) {
      // REQ-03: отвергнутые источники не молчат — публикация не выполняется
      throw new JournalMigrationIncompleteError(refusals);
    }

    const state: MergeState = {
      suppressionCanonicals: new Set(),
      deliveryCanonicals: new Set(),
      suppressionsById: new Map(),
      observations: new Map(),
    };
    const out: JournalLine[] = [];
    if (sqliteState.state === 'ok') {
      const reportSrc: ImportSourceReport = {
        path: sqlitePath,
        kind: 'index.sqlite',
        imported: { suppressions: 0, deliveries: 0, observations: 0 },
        reid: [],
      };
      const merged = this.mergeImportSource({ path: sqlitePath, kind: 'index.sqlite' }, legacyLines, state, reportSrc);
      out.push(...merged);
    }
    for (const src of wtSources) {
      const reportSrc: ImportSourceReport = {
        path: src.path,
        kind: 'worktree-journal',
        imported: { suppressions: 0, deliveries: 0, observations: 0 },
        reid: [],
      };
      const merged = this.mergeImportSource({ path: src.path, kind: 'worktree-journal' }, src.lines, state, reportSrc);
      out.push(...merged);
    }

    // REQ-333-4 (F-2, design §5 — уточнение ведущего REV-340, §6) + F3.4:
    // журнал и маркер v2 публикуются одной критической секцией; для пустого
    // нового проекта — пустой журнал + маркер, последующие вызовы идут по
    // normal (пересмотр источников/git-спавн не на горячем пути).
    // patch 3.4.5 review (P1-1): sources маркера — path-форма (участвовавший
    // legacy SQLite), их сверяет с текущим перечислением migrationProven.
    mkdirSync(this.lockDir, { recursive: true });
    const tmp = `${this.file}.importing-${process.pid}.tmp`;
    writeFileSync(tmp, out.map((l) => `${JSON.stringify(l)}\n`).join(''), 'utf8');
    renameSync(tmp, this.file);
    this.writeMarkerV2(sqliteState.state === 'ok' ? [sqlitePath] : [], wtPaths, true);
  }

  /**
   * patch 3.4.x review (F1.2/F3.4): перечисление wt-источников с fail-closed
   * правилом. null от git при наличии `.git` в корне — отказ «git metadata
   * unavailable» (добавляется в refusals, причина невозможна только вместе с
   * отказом); null без `.git` — linked worktree нет по построению (пустой
   * список, перенос возможен). patch 3.4.4 review (P1): по-путевые отказы
   * перечисления (realpath EACCES/…, директива владельца) попадают в refusals
   * → все существующие механики отказа (JournalMigrationIncompleteError на
   * первом импорте/completion/явном import, явный отказ restore, F-C
   * персистенция complete:false) срабатывают без нового «молчания».
   */
  private enumerateWtSourcesOrFail(refusals: string[]): string[] {
    // свежее перечисление: контракт явного import/restore/первого импорта — «сканируй сейчас»
    return this.failClosedWtPaths(refusals, this.worktreeSourcePaths(refusals));
  }

  /** Обработка сбоя перечисления (null): при .git — отказ «git metadata
   *  unavailable» (причина невозможна только вместе с отказом), без .git —
   *  worktree нет по построению. Общее правило для свежего и кэшированного
   *  перечислений. */
  private failClosedWtPaths(refusals: string[], paths: string[] | null): string[] {
    if (paths !== null) return paths;
    if (existsSync(join(this.root, '.git'))) {
      refusals.push('(git worktree list): git metadata unavailable (worktree enumeration failed)');
      return [];
    }
    return []; // не-git каталог: worktree нет по построению
  }

  /** Коррекция 3.4.5 (F-3): кэшированный близнец worktreeSourcePaths для
   *  лечебного completion pass — тот идёт СРАЗУ после suspect-проверки того же
   *  доступа и переиспользует её ревалидированный (достижимость путей
   *  проверяется при каждом обращении к кэшу) снимок: 2→1 git-спавн на
   *  лечебный доступ (NFR-01). Валидного снимка нет (null: отказное
   *  перечисление не кэшируется, P2) → фолбэк на свежее worktreeSourcePaths —
   *  коррекция 3.4.5 review (R-1): по-путевые причины (путь+код) восстанавливаются
   *  в refusals полностью, тексты — как у свежего перечисления 3.4.4;
   *  fail-closed «git metadata unavailable» остаётся только для истинного
   *  сбоя git-спавна. Лишний git-спавн возникает только в уже сломанном
   *  случае (отказное перечисление), чистый лечебный путь остаётся 2→1. */
  private worktreeSourcePathsCached(refusals: string[]): string[] | null {
    const snapshot = cachedWorktreeEnumeration(this.root);
    if (snapshot === null) return this.worktreeSourcePaths(refusals);
    return this.wtPathsExcludingSelf(snapshot.paths);
  }

  /** Пост-обработка перечисления, общая для свежего и кэшированного путей:
   *  корневой чекаут исключается — его журнал и есть цель; нерезолвимый
   *  корень — без фильтра (реального «себя» нет в списке). */
  private wtPathsExcludingSelf(paths: string[]): string[] {
    let self: string;
    try {
      self = realpathSync(this.root);
    } catch {
      return paths;
    }
    return paths.filter((p) => p !== self);
  }

  /**
   * patch 3.4.x review (F1.2): довосстановление (completion pass) — для
   * журнала, перенесённого 3.3.1/3.4.0 (маркер без format), с маркером,
   * утраченным в окне сбоя, или с ПОДОЗРИТЕЛЬНЫМ proven-маркером (P1-1).
   * Существование журнала перенос не доказывает: источники перечисляются и
   * читаются ЗАНОВО исправленным ридером и сливаются идемпотентно (дедуп
   * каноническим JSON — дублей нет, разрешённые записи не возвращаются в
   * открытое состояние). patch 3.4.5 review (P1-1): путь лечения обязан
   * покрывать И legacy SQLite, И wt (3.4.2 молча пропускала недоступный
   * SQLite — довосстановление перечитывает оба вида источников). Любой отказ
   * источника → ничего не пишется, JournalMigrationIncompleteError. patch
   * 3.4.2 review (F-B): общий журнал строго валидируется (семантика load(),
   * REQ-332-3) ДО любых мутаций — отказ → JournalMigrationIncompleteError,
   * байты журнала и маркер побайтово не изменяются. Успех → маркер v2
   * {complete:true, sources:[SQLite путь если участвовал], worktrees:[текущее
   * перечисление]} — актуальные списки, следующие доступы стабильны
   * (самоисцеление без повторных прогонов).
   */
  private runCompletionPass(): void {
    const refusals: string[] = [];
    const sqlitePath = indexPath(this.root);
    const sqliteState = sourceState(sqlitePath);
    let legacyLines: JournalLine[] = [];
    if (sqliteState.state === 'refused') {
      refusals.push(sqliteState.reason);
    } else if (sqliteState.state === 'ok') {
      try {
        legacyLines = this.collectLegacyLines();
      } catch (e) {
        refusals.push(`${sqlitePath}: ${(e as Error).message}`);
      }
    }
    const wtPaths = this.failClosedWtPaths(refusals, this.worktreeSourcePathsCached(refusals));
    const sources = this.readWorktreeJournals(wtPaths);
    for (const src of sources) {
      if (src.refused !== undefined) refusals.push(`${src.path}: ${src.refused}`);
    }
    if (refusals.length > 0) {
      throw new JournalMigrationIncompleteError(refusals);
    }
    let state: MergeState;
    try {
      state = this.buildMergeStateFromJournal();
    } catch (e) {
      // F-B: повреждённый общий журнал — отказ до мутаций, причина с файлом и строкой
      throw new JournalMigrationIncompleteError([(e as Error).message]);
    }
    const newLines: JournalLine[] = [];
    if (sqliteState.state === 'ok') {
      newLines.push(
        ...this.mergeImportSource({ path: sqlitePath, kind: 'index.sqlite' }, legacyLines, state, {
          path: sqlitePath,
          kind: 'index.sqlite',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
        })
      );
    }
    for (const src of sources) {
      newLines.push(
        ...this.mergeImportSource({ path: src.path, kind: 'worktree-journal' }, src.lines, state, {
          path: src.path,
          kind: 'worktree-journal',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
        })
      );
    }
    // idемпотентность: mergeImportSource отфильтровал уже присутствующие строки
    this.appendMany(newLines);
    this.writeMarkerV2(sqliteState.state === 'ok' ? [sqlitePath] : [], wtPaths, true);
  }

  /** Пути wt-источников (ADR-340-3): живые чекауты; корневой исключён — его
   *  журнал и есть цель. patch 3.4.4 review (P1): по-путевые отказы
   *  перечисления добавляются в refusals с путём и кодом. null — сбой
   *  git-метаданных. */
  private worktreeSourcePaths(refusals: string[]): string[] | null {
    const enumeration = listWorktreeCheckouts(this.root);
    if (enumeration === null) return null;
    refusals.push(...enumeration.refusals);
    return this.wtPathsExcludingSelf(enumeration.paths);
  }

  /**
   * Чтение wt-журналов (лексикографический порядок путей чекаута); каждая
   * строка — через единый валидатор; источник с невалидной строкой
   * отвергается ЦЕЛИКОМ (all-or-nothing, ADR-340-3). Отсутствующий файл —
   * источник не добавляется. patch 3.4.x review (F3.2), уточнено patch 3.4.2
   * (F-A): терпимость к обрыву хвоста — ТОЛЬКО отказ валидатора с причиной
   * 'json' на ПОСЛЕДНЕМ фрагменте файла БЕЗ завершающего '\n' (обрывок
   * отбрасывается, корректные строки перед ним СОХРАНЯЮТСЯ; тот же
   * repair-принцип, что REQ-332-3 для общего журнала, единый путь
   * readJournalLines). Повреждённая строка С '\n' (не последний фрагмент) или
   * повреждение в середине, как и 'structure' в любой позиции, — источник
   * отвергается целиком (refused с файлом и номером строки).
   */
  private readWorktreeJournals(paths: string[]): Array<{ path: string; lines: JournalLine[]; refused?: string }> {
    const out: Array<{ path: string; lines: JournalLine[]; refused?: string }> = [];
    for (const wt of [...paths].sort()) {
      const j = join(wt, '.wolf', 'memory', 'micro-note-delivery.jsonl');
      try {
        const lines: JournalLine[] = [];
        readJournalLines(readFileSync(j, 'utf8'), j, (line) => lines.push(line));
        out.push({ path: wt, lines });
      } catch (e) {
        // patch 3.4.3 review (P1): источник — errno-разбор, не existsSync-пропуск.
        // ТОЛЬКО ENOENT — источника нет (прежнее «отсутствующий пропускается»);
        // EACCES/… — отказ источника с путём и кодом (readFileSync называет оба):
        // закрытый каталог журнала приостанавливает перенос (все вызывающие
        // отказы ведут к JournalMigrationIncompleteError / отказу restore),
        // а не трактуется как «журнала в worktree нет».
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
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
   *  patch 3.4.2 review (F-B): ошибки разбора НЕ глушатся — строгая валидация
   *  ВСЕГО журнала с семантикой допусков строгого load() (REQ-332-3, единый
   *  путь readJournalLines): хвост-фрагмент без завершающего '\n' допускается
   *  и отбрасывается, повреждение в середине или 'structure' в любой позиции
   *  отвергают журнал целиком (вызывающий completion pass обязан отказаться
   *  ДО мутаций). Вызывается под локом в редких CLI-командах, не на горячем
   *  пути. */
  private buildMergeStateFromJournal(): MergeState {
    const state: MergeState = {
      suppressionCanonicals: new Set(),
      deliveryCanonicals: new Set(),
      suppressionsById: new Map(),
      observations: new Map(),
    };
    if (!existsSync(this.file)) return state;
    readJournalLines(readFileSync(this.file, 'utf8'), this.file, (parsed) => {
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
    });
    return state;
  }

  /** REQ-333-1 (ADR-340-3): идемпотентный досмотр wt-журналов ≤3.3.1; patch
   *  3.4.x review (F3.5): validate-before-append — отказ ЛЮБОГО источника →
   *  ничего не дописывается, JournalMigrationIncompleteError с перечнем.
   *  patch 3.4.2 review (F-C): отказ при существующем журнале персистится —
   *  маркер complete:false под взятым локом (persistIncompleteImportMarker),
   *  иначе следующий brief пропустил бы перенос по устаревшему complete:true.
   *  patch 3.4.5 review (P1-2): НАМЕРЕНИЕ явного импорта персистится ДО начала
   *  работы с источниками (под тем же локом): сбой процесса после чтения
   *  источников, но до записи журнала, оставляет complete:false — следующий
   *  запуск безопасно заканчивает импорт (completion pass идемпотентен) или
   *  приостанавливает выдачу с объяснением при отказе источника; после записи
   *  журнала, но до финализации — completion pass перечитывает и досматривает,
   *  дублей нет. Окно до намерения — ничего не сделано, потерь нет. */
  importWorktreeJournals(): ImportReport {
    return this.withJournalLock(() => {
      this.load(); // fresh выполняет первый импорт (SQLite + wt); loss бросит
      // P1-2: намерение персистено до перечисления/чтения источников;
      // sources прежнего маркера сохраняются до финализации
      const preservedSources = this.persistIncompleteImportMarker([]);
      // patch 3.4.x review (F3.4/F3.5): сбой перечисления git при наличии .git —
      // отказ переноса (validate-before-append)
      const enumRefusals: string[] = [];
      const wtPaths = this.enumerateWtSourcesOrFail(enumRefusals);
      const sources = this.readWorktreeJournals(wtPaths);
      const refused = [...enumRefusals];
      for (const src of sources) {
        if (src.refused !== undefined) refused.push(`${src.path}: ${src.refused}`);
      }
      if (refused.length > 0) {
        this.persistIncompleteImportMarker(wtPaths);
        throw new JournalMigrationIncompleteError(refused);
      }

      const report: ImportReport = { sources: [], unrecoverable: UNRECOVERABLE_TEXT };
      const state = this.buildMergeStateFromJournal();
      const newLines: JournalLine[] = [];
      for (const src of sources) {
        const reportSrc: ImportSourceReport = {
          path: src.path,
          kind: 'worktree-journal',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
        };
        newLines.push(
          ...this.mergeImportSource({ path: src.path, kind: 'worktree-journal' }, src.lines, state, reportSrc)
        );
        report.sources.push(reportSrc);
      }
      this.appendMany(newLines);
      // P1-2: финализация под тем же локом; worktrees актуализируются текущим
      // перечислением, sources — сохранённые из прежнего маркера
      this.writeMarkerV2(preservedSources, wtPaths, true);
      return report;
    });
  }

  /** REQ-333-4 (ADR-340-2): единственный путь состояния-в-состояние при утрате:
   *  пересборка журнала из замороженного index.sqlite + wt-журналов одной
   *  атомарной заменой (tmp + rename) под локом; отчёт источников и границы
   *  потерь; при существующем журнале — отказ. patch 3.4.x review (F3.6):
   *  validate-before-publish — отказ ЛЮБОГО источника → ничего не
   *  публикуется (журнал остаётся отсутствующим, маркер на месте), ошибка с
   *  перечнем и явной границей «ничего не написано». */
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

      const sqlitePath = indexPath(this.root);
      const refusals: string[] = [];
      let legacyLines: JournalLine[] = [];
      // patch 3.4.3 review (P1): источник — sourceState (statSync + errno), не
      // existsSync: EACCES/… — отказ restore с перечнем, ENOENT — источника нет
      const sqliteState = sourceState(sqlitePath);
      if (sqliteState.state === 'refused') {
        refusals.push(sqliteState.reason);
      } else if (sqliteState.state === 'ok') {
        try {
          legacyLines = this.collectLegacyLines();
        } catch (e) {
          refusals.push(`${sqlitePath}: ${(e as Error).message}`);
        }
      }
      const wtPaths = this.enumerateWtSourcesOrFail(refusals);
      const wtSources = this.readWorktreeJournals(wtPaths);
      for (const src of wtSources) {
        if (src.refused !== undefined) refusals.push(`${src.path}: ${src.refused}`);
      }
      if (refusals.length > 0) {
        throw new UserFacingError(
          `restore refused invalid sources: ${refusals.join('; ')} — nothing was written — fix the source(s) and rerun restore`
        );
      }

      const state: MergeState = {
        suppressionCanonicals: new Set(),
        deliveryCanonicals: new Set(),
        suppressionsById: new Map(),
        observations: new Map(),
      };
      const out: JournalLine[] = [];
      const report: ImportReport = { sources: [], unrecoverable: UNRECOVERABLE_TEXT };

      if (sqliteState.state === 'ok') {
        const reportSrc: ImportSourceReport = {
          path: sqlitePath,
          kind: 'index.sqlite',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
        };
        const merged = this.mergeImportSource(
          { path: sqlitePath, kind: 'index.sqlite' },
          legacyLines,
          state,
          reportSrc
        );
        out.push(...merged);
        report.sources.push(reportSrc);
      }

      for (const src of wtSources) {
        const reportSrc: ImportSourceReport = {
          path: src.path,
          kind: 'worktree-journal',
          imported: { suppressions: 0, deliveries: 0, observations: 0 },
          reid: [],
        };
        const merged = this.mergeImportSource(
          { path: src.path, kind: 'worktree-journal' },
          src.lines,
          state,
          reportSrc
        );
        out.push(...merged);
        report.sources.push(reportSrc);
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
      // patch 3.4.5 review (P1-1): sources маркера — path-форма (участвовавший
      // legacy SQLite), сверяются migrationProven с текущим перечислением
      this.writeMarkerV2(sqliteState.state === 'ok' ? [sqlitePath] : [], wtPaths, true);
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
   * patch 3.4.x review (F2.1): лок — SQLite BEGIN IMMEDIATE в отдельной базе
   * блокировки рядом с журналом (без кражи по возрасту); чужой активный лок —
   * busy-отказ после тайм-аута ожидания.
   */
  private withJournalLock<T>(fn: () => T): T {
    try {
      return withJournalLockSync(this.lockDir, fn);
    } catch (e) {
      if (e instanceof LockHeldError) {
        throw new UserFacingError(
          `delivery journal is busy: ${e.lockPath} — another wolf process holds the write lock (SQLite BEGIN IMMEDIATE); retry when it finishes`
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
    // patch 3.4.2 review (F-A/F-B): единый путь чтения (REQ-332-3) — строгий
    // разбор, допуск только для хвост-обрывка без завершающего '\n'
    readJournalLines(readFileSync(this.file, 'utf8'), this.file, (line) => this.apply(line));
  }

  /**
   * REQ-333-7 (ADR-340-6): машина состояний БЕЗ полного парса (для пути
   * доставки): fresh → первый импорт; loss → отказ; normal (маркер v2
   * complete, чьи списки источников сходятся с текущим перечислением — P1-1)
   * → без пересмотра источников. patch 3.4.x review (F1.2):
   * существование общего JSONL или маркера НЕ доказывает перенос — журнал без
   * v2-маркера (маркер 3.3.1/3.4.0 без format, битый маркер или его absence в
   * окне сбоя) → довосстановление (completion pass) при следующем доступе,
   * внутри уже имеющегося журнального лока. Семантика loss («журнал
   * отсутствует + маркер есть») не меняется.
   */
  private ensureJournalState(): void {
    const journalExists = existsSync(this.file);
    const markerExists = existsSync(this.markerPath);
    if (!journalExists && markerExists) {
      // утрата: состояние неизвестно — fail-closed, без воссоздания журнала
      throw new JournalStateUnknownError(this.file);
    }
    if (!journalExists) {
      // fresh: первый импорт из всех источников (validate-before-publish, F3.4)
      this.runFirstImport();
      return;
    }
    // журнал есть: перенос доказан ТОЛЬКО маркером v2 {format:2, complete:true}
    if (this.migrationProven() === true) return;
    this.runCompletionPass(); // 3.3.1/3.4.0-маркер или его отсутствие
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
   * patch 3.4.x review (F3.3): собранные строки прогоняются через ЕДИНЫЙ
   * валидатор parseJournalLine (строка сериализуется канонически перед
   * валидацией); невалидная ПОЛНАЯ запись → JournalLineError('structure') →
   * источник index.sqlite отвергается целиком (refusal у вызывающего).
   */
  private collectLegacyLines(): JournalLine[] {
    const legacyPath = indexPath(this.root);
    // patch 3.4.3 review (P1): источник — sourceState (statSync + errno), не
    // existsSync: ТОЛЬКО ENOENT — «источника нет» (пустой массив); EACCES/… —
    // отказ источника (throw с путём и кодом; вызывающий добавляет его в
    // refusals/отказ restore), не молчаливый пропуск закрытого legacy-источника
    const st = sourceState(legacyPath);
    if (st.state === 'absent') return [];
    if (st.state === 'refused') throw new UserFacingError(st.reason);
    const db = new Database(legacyPath, { readonly: true, fileMustExist: true });
    try {
      const tableExists = (name: string): boolean =>
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
      const hasSuppressions = tableExists('micro_note_suppressions');
      const hasDeliveries = tableExists('micro_note_deliveries');
      const hasObservations = tableExists('micro_note_observations');
      if (!hasSuppressions && !hasDeliveries && !hasObservations) return [];

      const lines: JournalLine[] = [];
      // единый валидатор: канонический JSON строки → parseJournalLine; невалидная
      // запись — JournalLineError (structure) с файлом и порядковым номером строки
      const validated = (line: JournalLine): JournalLine =>
        parseJournalLine(canonicalJson(line), { file: legacyPath, line: lines.length + 1 });
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
          lines.push(
            validated({
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
            })
          );
        });
      }
      if (hasDeliveries) {
        const rows = db
          .prepare(
            'SELECT memory_id, revision, channel, kind, ts FROM micro_note_deliveries ORDER BY ts ASC, rowid ASC'
          )
          .all() as Array<Record<string, string>>;
        for (const row of rows) {
          lines.push(
            validated({
              kind: 'delivery',
              record: {
                memory_id: row.memory_id,
                revision: row.revision,
                channel: row.channel as MicroNoteDeliveryRecord['channel'],
                kind: row.kind as MicroNoteDeliveryRecord['kind'],
                ts: row.ts,
              },
            })
          );
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
          lines.push(
            validated({
              kind: 'observation',
              record: {
                memory_id: String(row.memory_id),
                revision: String(row.revision),
                observed_use: row.observed_use ?? null,
                observed_outcome: String(row.observed_outcome),
                updated_at: String(row.updated_at),
              },
            })
          );
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
