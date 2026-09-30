import { UserFacingError } from './errors.js';

export type MemoryStatus =
  | 'active'
  | 'open'
  | 'resolved'
  | 'stale'
  | 'conflicting'
  | 'superseded'
  | 'archived'
  | 'paused'
  | 'completed'
  | 'answered'
  | 'rejected'
  | 'obsolete'
  | 'proposed'
  | 'accepted'
  | 'candidate'
  | 'deprecated'
  // волна 2.13 §5.2: blocker/info_request/question — статусы thread
  | 'blocked'
  | 'waiting_answer';
export type ReviewState = 'accepted' | 'proposed' | 'rejected' | 'review_required';
export type Confidence = 'low' | 'medium' | 'high';
export type SourceKind = 'manual' | 'session' | 'file' | 'scan';

/** Алфавит типов полей для project-типов (config.yaml) и деклараций core-типов. */
export type FieldSpec =
  | { kind: 'string'; required: true; min?: number }
  | { kind: 'string'; optional: true }
  | { kind: 'string'; default: string }
  | { kind: 'string[]'; required: true; minItems?: number }
  | { kind: 'string[]'; default?: readonly string[] }
  | { kind: 'boolean'; optional: true }
  | { kind: 'int'; default?: number }
  | { kind: 'enum'; values: readonly string[]; optional?: true };

export interface MemoryTypeDeclaration {
  name: MemoryType;
  /** Множество статусов типа; эффективные переходы = ALLOWED_TRANSITIONS ∩ lifecycle */
  lifecycle: readonly MemoryStatus[];
  /** Стартовый статус при создании; по умолчанию — голова lifecycle */
  defaultStatus?: MemoryStatus;
  /** Подкаталог внутри threads/<tid>/; null — тип не живёт в треде */
  subdirThread: string | null;
  /** Подкаталог внутри shared/; null — тип не живёт в shared */
  subdirShared: string | null;
  /** Спецслучай: work-thread кладётся как threads/<tid>/WORK-THREAD.md */
  layout?: 'work-thread-file';
  fields?: Record<string, FieldSpec>;
  /** document-ref: требует непустой source.path */
  requireSourcePath?: boolean;
  deprecated?: boolean;
}

const FULL: readonly MemoryStatus[] = [
  'active',
  'open',
  'resolved',
  'stale',
  'conflicting',
  'superseded',
  'archived',
  'paused',
  'completed',
  'answered',
  'rejected',
  'obsolete',
  'proposed',
  'accepted',
];

// Волна 2.13 §5.3: закрытый словарь фасетов «характер записи» для типа note.
// Диапазон длины словаря 7–10 (config-file); кастомизация — facets.character в config.yaml.
export const DEFAULT_CHARACTER_FACETS: readonly string[] = [
  'howto',
  'pitfall',
  'context',
  'metric',
  'history',
  'legacy',
  'constraint',
];

// Единственный источник истины: типы (MemoryType, MEMORY_TYPES) выводятся
// отсюда — новый core-тип добавляется ТОЛЬКО в этот массив.
// Волна 2.13 §5.1: 7 выживших типов (дословно Т1); старые типы — карта
// DEPRECATED_TYPE_ALIASES ниже (alias-чтение P211) и migrate taxonomy (P213).
const CORE_TAXONOMY_DECLS = [
  {
    name: 'rule',
    // proposed/accepted/rejected/archived — bootstrap-черновики (§7.4):
    // proposed → accepted (Стюард) → active; effective = ALLOWED_TRANSITIONS ∩ lifecycle
    lifecycle: ['active', 'superseded', 'obsolete', 'proposed', 'accepted', 'rejected', 'archived'],
    subdirThread: null,
    subdirShared: 'rules',
    fields: {
      scope: { kind: 'enum', values: ['project', 'global'] },
      applies_to: { kind: 'string[]', default: [] },
      trigger: { kind: 'string', default: '' },
      trigger_keywords: { kind: 'string[]', default: [] },
    },
  },
  {
    name: 'lesson',
    lifecycle: FULL,
    subdirThread: 'lessons',
    subdirShared: 'lessons',
    fields: { trigger_keywords: { kind: 'string[]', default: [] } },
  },
  {
    name: 'decision',
    lifecycle: ['active', 'superseded', 'rejected', 'obsolete'],
    subdirThread: 'decisions',
    subdirShared: 'decisions',
    fields: { thread: { kind: 'string', optional: true } },
  },
  {
    // Волна 2.13 §5.2: переименование work-thread → thread; blocker/info_request/
    // question поглощаются статусами blocked/waiting_answer/open.
    name: 'thread',
    lifecycle: ['active', 'paused', 'blocked', 'waiting_answer', 'open', 'completed', 'archived'],
    subdirThread: null,
    subdirShared: null,
    layout: 'work-thread-file',
    fields: {
      goal: { kind: 'string', required: true, min: 1 },
      current_state: { kind: 'string', default: '' },
      next_steps: { kind: 'string[]', default: [] },
    },
  },
  {
    // Жалобный контур v2 (спека 2026-09-01 §3.1): жалоба объектом памяти;
    // «взял в работу» — поле triage, не статус (Q2). Асимметрия подкаталогов
    // (threads/<tid>/notes/ vs shared/complaints/) — сознательна (§5.1 спеки 2.13):
    // жалобы вне треда образуют отдельную общую очередь триажа.
    name: 'complaint',
    lifecycle: ['open', 'resolved', 'rejected', 'archived'],
    defaultStatus: 'open',
    subdirThread: 'notes',
    subdirShared: 'complaints',
    fields: {
      about: { kind: 'string', required: true, min: 1 },
      rule: { kind: 'string', required: true, min: 1 },
      evidence: { kind: 'string', required: true, min: 1 },
      proposal: { kind: 'string', required: true, min: 1 },
      // Волна 2.14 §6.1: классификация жалобы; опционально — старые жалобы
      // читаются без kind (list-рендер показывает «—»)
      kind: { kind: 'enum', values: ['technical', 'behavioral'], optional: true },
      triage: { kind: 'string', optional: true },
      resolution: { kind: 'string', optional: true },
      dispatch_ages: { kind: 'int', default: 0 },
      corroborations: { kind: 'int', default: 1 },
    },
  },
  {
    // Фаза C roadmap v3 «инструменты как память»: files remain canonical —
    // тело скрипта живёт в .wolf/tools/<name>.<ext>, объект — только метаданные.
    name: 'tool',
    lifecycle: ['candidate', 'active', 'deprecated', 'archived'],
    defaultStatus: 'candidate',
    subdirThread: null,
    subdirShared: 'tools',
    fields: {
      name: { kind: 'string', required: true, min: 1 },
      script_path: { kind: 'string', required: true, min: 1 },
      language: { kind: 'string', required: true, min: 1 },
      contract_input: { kind: 'string', optional: true },
      contract_output: { kind: 'string', optional: true },
      contract_environment: { kind: 'string', optional: true },
      usage_count: { kind: 'int', default: 0 },
      last_used_at: { kind: 'string', optional: true },
      deprecation_reason: { kind: 'string', optional: true },
    },
  },
  {
    // Волна 2.13 §5.1/§5.3: универсальный тип «запись» с обязательным фасетом
    // «характер записи»; наследует нишу observation/context/open-question/…
    name: 'note',
    lifecycle: FULL,
    subdirThread: 'notes',
    subdirShared: 'notes',
    fields: {
      facet: { kind: 'enum', values: DEFAULT_CHARACTER_FACETS },
    },
  },
] as const;

export type MemoryType = (typeof CORE_TAXONOMY_DECLS)[number]['name'];

export const MEMORY_TYPES = CORE_TAXONOMY_DECLS.map((d) => d.name);

/**
 * Волна 2.13 §5.4: карта миграции старых типов (alias-чтение P211 + migrate P213).
 * Identity-строки (rule→rule и т.п.) и task-brief (project-тип dogfood) НЕ входят —
 * только поглощаемые типы. subdir* — каталоги СТАРОГО типа (резервные корни чтения
 * и тип-предфильтрация list); facet инжектится при чтении, только если его нет
 * в frontmatter.
 */
export interface TypeAliasSpec {
  target: MemoryType;
  facet?: string;
  subdirThread: string | null;
  subdirShared: string | null;
}

export const DEPRECATED_TYPE_ALIASES: Readonly<Record<string, TypeAliasSpec>> = {
  'work-thread': { target: 'thread', subdirThread: null, subdirShared: null },
  blocker: { target: 'note', facet: 'pitfall', subdirThread: 'blockers', subdirShared: 'blockers' },
  'info-request': { target: 'note', facet: 'context', subdirThread: 'notes', subdirShared: 'notes' },
  'open-question': { target: 'note', facet: 'context', subdirThread: 'notes', subdirShared: 'notes' },
  observation: { target: 'note', facet: 'legacy', subdirThread: 'lessons', subdirShared: 'lessons' },
  context: { target: 'note', facet: 'context', subdirThread: 'notes', subdirShared: 'notes' },
  article: { target: 'note', facet: 'context', subdirThread: 'notes', subdirShared: 'notes' },
  'session-summary': { target: 'note', facet: 'history', subdirThread: 'sessions', subdirShared: null },
  'session-checkpoint': { target: 'note', facet: 'history', subdirThread: 'sessions', subdirShared: null },
  report: { target: 'note', facet: 'history', subdirThread: 'tasks', subdirShared: null },
  'council-question': { target: 'note', facet: 'context', subdirThread: 'councils', subdirShared: null },
  'council-opinion': { target: 'note', facet: 'context', subdirThread: 'councils', subdirShared: null },
  synthesis: { target: 'note', facet: 'context', subdirThread: 'councils', subdirShared: null },
  document: { target: 'note', facet: 'legacy', subdirThread: 'documents', subdirShared: 'documents' },
  'document-ref': { target: 'note', facet: 'legacy', subdirThread: 'documents', subdirShared: 'documents' },
  'document-native': { target: 'note', facet: 'legacy', subdirThread: 'documents', subdirShared: 'documents' },
  escalation: { target: 'note', facet: 'legacy', subdirThread: 'escalations', subdirShared: null },
  'decision-request': { target: 'note', facet: 'legacy', subdirThread: 'escalations', subdirShared: null },
  playbook: { target: 'note', facet: 'howto', subdirThread: null, subdirShared: 'playbooks' },
  'call-injection': { target: 'note', facet: 'howto', subdirThread: null, subdirShared: 'calls' },
};

/** Типизированное представление канона (compile-time проверка полей деклараций). */
export const CORE_TAXONOMY: readonly MemoryTypeDeclaration[] = CORE_TAXONOMY_DECLS;

/** Поиск декларации: сначала core-таксономия, потом extra (project-типы из config.yaml). */
export function getDeclaration(type: string, extra?: readonly MemoryTypeDeclaration[]): MemoryTypeDeclaration {
  const decl = CORE_TAXONOMY.find((d) => d.name === type) ?? extra?.find((d) => d.name === type);
  if (decl) return decl;
  // C12/2.13 §5.4: старый тип — читаемая ошибка с подсказкой нового типа+фасета
  const alias = DEPRECATED_TYPE_ALIASES[type];
  if (alias) {
    throw new UserFacingError(
      `Type "${type}" was removed in 2.13: use "${alias.target}"${alias.facet ? ` (facet: ${alias.facet})` : ''}`
    );
  }
  // T011: UserFacingError + список валидных типов — агент получает читаемую
  // ошибку, classifyError матчит 'unknown memory type' → invalid_input
  const valid = [...CORE_TAXONOMY.map((d) => d.name), ...(extra ?? []).map((d) => d.name)].join(', ');
  throw new UserFacingError(`Unknown memory type "${type}". Valid types: ${valid}`);
}

export function subdirectoryFor(type: MemoryType, scope: 'thread' | 'shared'): string | null {
  const d = getDeclaration(type);
  return scope === 'thread' ? d.subdirThread : d.subdirShared;
}
