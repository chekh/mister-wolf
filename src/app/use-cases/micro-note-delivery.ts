// src/app/use-cases/micro-note-delivery.ts
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { learningSignalRevision } from '../../domain/learning-signals.js';
import type { MicroNoteSuppressionRecord } from '../../ports/micro-note-delivery-log.port.js';

/**
 * 3.2.0 T-09 (REQ-09, design §3.1/§7): адресный selector micro-notes — короткие
 * адресные подсказки локального знания, НЕ новый универсальный SKILL.md.
 *
 * Контракт хранения (passthrough-поля memory-объекта, схема не меняется):
 * - tag `micro-note` — объект участвует в адресной доставке (note/lesson/rule);
 *   без тега поведение существующих каналов не меняется;
 * - passthrough-поле `applies` — границы применимости: необязательные массивы
 *   строк projects/environments/versions/targets. Нет поля → подсказка
 *   универсальна; поле есть, но не парсится → подсказка НЕ доставляется
 *   (applicability unknown — fail-closed, REQ-09: неподходящее не включается);
 * - tag `constraint` — обязательное ограничение (S-18: лимит объёма его не
 *   выбрасывает; длинный текст сокращается, но доставляется).
 *
 * Выборка детерминированная и чистая: статус/rev/применимость/подавление по
 * уже прочитанному списку объектов (тот же один store.list() канала, P103) —
 * без нового RAG, без семантического поиска и без каких-либо модельных вызовов
 * (REQ-09 AC: нет подходящих → пустой результат, 0 LLM-вызовов).
 *
 * Версия подсказки — ревизия содержимого (та же функция, что у сигналов
 * очереди): sha256(type|status|title|body). Вывод доставки несёт точный
 * `id@rev12` (REQ-09 AC: exact id/version in output).
 */

/** Tag marking an object as an addressed micro-note. */
export const MICRO_NOTE_TAG = 'micro-note';
/** Tag marking a micro-note as a mandatory constraint (never budget-dropped). */
export const CONSTRAINT_TAG = 'constraint';

export interface MicroNoteContext {
  projectId?: string;
  environment?: string;
  version?: string;
  target?: string;
}

export interface MicroNoteBudget {
  /** Character budget of the micro-note section (NFR-02 symbol fallback). */
  maxChars: number;
  /** Record budget (NFR-02: up to 8 notes); caps optional notes only. */
  maxNotes: number;
}

/** NFR-02: до 8 записей / 4800 символов при отсутствии токенизатора. */
export const DEFAULT_MICRO_NOTE_BUDGET: MicroNoteBudget = { maxChars: 4800, maxNotes: 8 };

/** Character cap for a single mandatory constraint block that alone exceeds the budget. */
const SINGLE_NOTE_HARD_CAP = 1200;

export interface MicroNoteCandidate {
  id: string;
  /** Exact content revision at delivery time (REQ-09 attribution). */
  revision: string;
  title: string;
  mandatory: boolean;
  block: string;
}

export interface MicroNoteDeliveryResult {
  blocks: string[];
  /** Eligible notes after applicability/status/suppression filters, before budget. */
  selected: MicroNoteCandidate[];
  /** Notes actually emitted (attribution: delivered, design §10). */
  delivered: MicroNoteCandidate[];
  /** Optional notes dropped by the volume budget (S-18). */
  dropped: MicroNoteCandidate[];
  /** Channel-level skips: session dedup or already delivered in the same call. */
  skipped: MicroNoteCandidate[];
  /** Active notes temporarily out of delivery by an unresolved contradiction (S-27). */
  underReview: { id: string; revision: string; reason: string }[];
}

interface ParsedApplicability {
  projects?: string[];
  environments?: string[];
  versions?: string[];
  targets?: string[];
}

function isMicroNote(obj: MemoryObject): boolean {
  if (obj.status !== 'active') return false;
  if (obj.superseded_by != null) return false; // superseded never delivers (S-17)
  if (obj.review_state === 'rejected') return false;
  if (!(obj.tags ?? []).includes(MICRO_NOTE_TAG)) return false;
  return obj.type === 'note' || obj.type === 'lesson' || obj.type === 'rule';
}

/** strict-array parse: non-string members → null (fail-closed). */
function stringArrayOf(raw: unknown): string[] | null {
  if (raw === undefined) return undefined as unknown as string[] | null;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || v === '') return null;
    out.push(v);
  }
  return out;
}

/** undefined — no applicability declared (universal); null — malformed (fail-closed). */
function applicabilityOf(obj: MemoryObject): ParsedApplicability | null | undefined {
  const raw = (obj as Record<string, unknown>).applies;
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const projects = stringArrayOf(rec.projects);
  const environments = stringArrayOf(rec.environments);
  const versions = stringArrayOf(rec.versions);
  const targets = stringArrayOf(rec.targets);
  if (projects === null || environments === null || versions === null || targets === null) return null;
  const parsed: ParsedApplicability = {};
  if (projects !== undefined) parsed.projects = projects;
  if (environments !== undefined) parsed.environments = environments;
  if (versions !== undefined) parsed.versions = versions;
  if (targets !== undefined) parsed.targets = targets;
  return parsed;
}

/** Prefix version rule: entry '3.2' matches '3.2.0'; exact equality always matches. */
function versionMatches(entry: string, version: string): boolean {
  if (version === entry) return true;
  return version.startsWith(entry.endsWith('.') ? entry : `${entry}.`);
}

/** Deterministic applicability predicate of the micro-note selector (REQ-09). */
export function appliesToContext(applies: ParsedApplicability | null | undefined, ctx: MicroNoteContext): boolean {
  if (applies === undefined) return true; // universal
  if (applies === null) return false; // malformed → applicability unknown → not delivered
  const list = (arr: string[] | undefined, value: string | undefined, match: (entry: string, v: string) => boolean) =>
    arr === undefined ? true : value !== undefined && arr.some((entry) => match(entry, value));
  return (
    list(applies.projects, ctx.projectId, (e, v) => e === v) &&
    list(applies.environments, ctx.environment, (e, v) => e === v) &&
    list(applies.versions, ctx.version, versionMatches) &&
    list(applies.targets, ctx.target, (e, v) => v.includes(e))
  );
}

function formatMicroBlock(candidate: Omit<MicroNoteCandidate, 'block'>, body: string): string {
  const lines = [`- [${candidate.id}@${candidate.revision.slice(0, 12)}] ${candidate.title}`];
  const first = body.split('\n')[0].trim();
  if (first !== '') lines.push(`  ${first}`);
  return lines.join('\n');
}

/**
 * Детерминированная выборка active micro-notes под контекст (S-17) с бюджетом
 * объёма (S-18) и учётом подавленных противоречием (S-27): активная подавленная
 * подсказка (та же ревизия) не доставляется и видна в underReview; подсказка с
 * новой ревизией снова доставляется (правка факта — исход пересмотра; запись
 * конфликта с обоими evidence сохраняется в журнале).
 */
export function selectMicroNotes(
  objects: readonly Record<string, unknown>[],
  ctx: MicroNoteContext,
  budget: Partial<MicroNoteBudget> = {},
  suppressions: readonly MicroNoteSuppressionRecord[] = []
): MicroNoteDeliveryResult {
  const limits = { ...DEFAULT_MICRO_NOTE_BUDGET, ...budget };
  const openByRevision = new Map<string, string>(); // memory_id → reason (open conflict on this revision)
  for (const s of suppressions) {
    if (s.resolved_at === null) openByRevision.set(s.memory_id, s.reason);
  }

  const selected: MicroNoteCandidate[] = [];
  const underReview: MicroNoteDeliveryResult['underReview'] = [];
  for (const source of objects) {
    const obj = source as unknown as MemoryObject;
    if (!isMicroNote(obj)) continue;
    if (!appliesToContext(applicabilityOf(obj), ctx)) continue;

    const revision = learningSignalRevision(obj);
    const reason = openByRevision.get(obj.id);
    if (reason !== undefined) {
      // S-27: open conflict binds to the revision it contradicted; a revised
      // note is a review outcome and returns to delivery, evidence stays in the log.
      const suppressedRevision = suppressions.find((s) => s.memory_id === obj.id && s.resolved_at === null)?.revision;
      if (suppressedRevision === revision) {
        underReview.push({ id: obj.id, revision, reason });
        continue;
      }
    }
    const mandatory = (obj.tags ?? []).includes(CONSTRAINT_TAG);
    const candidate: MicroNoteCandidate = {
      id: obj.id,
      revision,
      title: obj.title,
      mandatory,
      block: '',
    };
    candidate.block = formatMicroBlock(candidate, obj.body);
    selected.push(candidate);
  }

  // Deterministic order: mandatory constraints first, then importance desc, id asc.
  const importanceOf = (obj: Record<string, unknown>): number =>
    typeof obj.importance === 'number' && Number.isFinite(obj.importance) ? obj.importance : 0.5;
  const byId = new Map(objects.map((o) => [o.id, o]));
  const order = [...selected].sort((a, b) => {
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
    const ia = importanceOf(byId.get(a.id)!);
    const ib = importanceOf(byId.get(b.id)!);
    return ib - ia || a.id.localeCompare(b.id);
  });

  const blocks: string[] = [];
  const delivered: MicroNoteCandidate[] = [];
  const dropped: MicroNoteCandidate[] = [];
  const skipped: MicroNoteCandidate[] = [];
  let used = 0;
  for (const candidate of order) {
    // S-18: mandatory constraints are never dropped — oversized text is shortened.
    let block = candidate.block;
    if (candidate.mandatory && used + block.length > limits.maxChars && block.length > SINGLE_NOTE_HARD_CAP) {
      block = block.slice(0, SINGLE_NOTE_HARD_CAP);
    }
    const fits = used + block.length <= limits.maxChars;
    if (candidate.mandatory) {
      blocks.push(block);
      delivered.push({ ...candidate, block });
      used += block.length;
    } else if (fits && delivered.length < limits.maxNotes) {
      blocks.push(block);
      delivered.push({ ...candidate, block });
      used += block.length;
    } else {
      dropped.push(candidate);
    }
  }

  return { blocks, selected, delivered, dropped, skipped, underReview };
}
