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
  | 'deprecated';
export type ReviewState = 'accepted' | 'proposed' | 'rejected';
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
  | { kind: 'enum'; values: readonly string[] };

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

// Ф22 (D2.1): поля draft-объектов propose→validate→activate; спека §2.3, §5, §6.
// Одинаковый набор для lesson и rule — носитель зависит от характера паттерна.
// polarity ('positive'|'negative'), risk_level (low|medium|high) и
// holdout_verdict (pass|fail|needs_human_review) — свободные строки:
// нормализация значений в коде propose/validate, enum не заводим.
const DRAFT_FIELDS: Record<string, FieldSpec> = {
  pattern_key: { kind: 'string', optional: true },
  pattern_count: { kind: 'int', default: 0 },
  evidence: { kind: 'string[]', default: [] },
  mechanical: { kind: 'boolean', optional: true },
  polarity: { kind: 'string', optional: true },
  constraint_tool: { kind: 'string', optional: true },
  constraint_class: { kind: 'string', optional: true },
  predicted_effect: { kind: 'string', optional: true },
  regression_risks: { kind: 'string[]', default: [] },
  blast_radius: { kind: 'string', optional: true },
  risk_level: { kind: 'string', optional: true },
  holdout_verdict: { kind: 'string', optional: true },
  holdout_prevented: { kind: 'int', default: 0 },
  holdout_checked: { kind: 'int', default: 0 },
  holdout_ts: { kind: 'string', optional: true },
};

// Единственный источник истины: типы (MemoryType, MEMORY_TYPES) выводятся
// отсюда — новый core-тип добавляется ТОЛЬКО в этот массив.
const CORE_TAXONOMY_DECLS = [
  { name: 'document', lifecycle: FULL, subdirThread: 'documents', subdirShared: 'documents', deprecated: true },
  {
    name: 'decision',
    lifecycle: ['active', 'superseded', 'rejected', 'obsolete'],
    subdirThread: 'decisions',
    subdirShared: 'decisions',
    fields: {
      thread: { kind: 'string', optional: true },
    },
  },
  {
    name: 'lesson',
    lifecycle: FULL,
    subdirThread: 'lessons',
    subdirShared: 'lessons',
    fields: { trigger_keywords: { kind: 'string[]', default: [] }, ...DRAFT_FIELDS },
  },
  {
    name: 'observation',
    lifecycle: FULL,
    subdirThread: 'lessons',
    subdirShared: 'lessons',
    // Поля жалобы (wolf complain, B3): обоснование выбора типа — в memory-complain.ts.
    fields: {
      about: { kind: 'string', optional: true },
      complaint: { kind: 'string', optional: true },
      semantic: { kind: 'string', optional: true },
      trigger: { kind: 'boolean', optional: true },
    },
  },
  { name: 'session-summary', lifecycle: FULL, subdirThread: 'sessions', subdirShared: null },
  {
    name: 'open-question',
    lifecycle: FULL,
    defaultStatus: 'open',
    subdirThread: 'notes',
    subdirShared: 'notes',
  },
  { name: 'context', lifecycle: FULL, subdirThread: 'notes', subdirShared: 'notes' },
  {
    name: 'work-thread',
    lifecycle: ['active', 'paused', 'completed', 'archived'],
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
    name: 'info-request',
    lifecycle: ['open', 'answered', 'rejected', 'obsolete', 'archived'],
    subdirThread: 'notes',
    subdirShared: 'notes',
    fields: {
      thread: { kind: 'string', optional: true },
      question: { kind: 'string', required: true, min: 1 },
      detour_reason: { kind: 'string', required: true, min: 1 },
      needed_for: { kind: 'string[]', default: [] },
      expected_answer: { kind: 'string[]', required: true, minItems: 1 },
      preliminary_answer: { kind: 'string', default: '' },
    },
  },
  {
    name: 'article',
    lifecycle: ['proposed', 'accepted', 'stale', 'superseded', 'archived'],
    subdirThread: 'notes',
    subdirShared: 'notes',
    fields: {
      thread: { kind: 'string', required: true, min: 1 },
      summary: { kind: 'string', required: true, min: 1 },
      answers: { kind: 'string[]', default: [] },
      supports: { kind: 'string[]', default: [] },
      evidence: { kind: 'string[]', default: [] },
    },
  },
  {
    name: 'blocker',
    lifecycle: ['active', 'resolved', 'obsolete'],
    subdirThread: 'blockers',
    subdirShared: 'blockers',
    fields: {
      thread: { kind: 'string', optional: true },
      impact: { kind: 'string', required: true, min: 1 },
      workaround: { kind: 'string', optional: true },
    },
  },
  {
    name: 'session-checkpoint',
    lifecycle: FULL,
    subdirThread: 'sessions',
    subdirShared: null,
    fields: { thread: { kind: 'string', required: true, min: 1 } },
  },
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
      ...DRAFT_FIELDS,
    },
  },
  {
    name: 'document-ref',
    lifecycle: ['active', 'stale', 'superseded'],
    subdirThread: 'documents',
    subdirShared: 'documents',
    requireSourcePath: true,
  },
  {
    name: 'document-native',
    lifecycle: ['active', 'superseded', 'archived'],
    subdirThread: 'documents',
    subdirShared: 'documents',
  },
  {
    name: 'task-brief',
    lifecycle: ['active', 'completed', 'superseded'],
    subdirThread: 'tasks',
    subdirShared: null,
    fields: {
      executor: { kind: 'string', required: true, min: 1 },
      priority: { kind: 'string', required: true, min: 1 },
    },
  },
  { name: 'report', lifecycle: ['active', 'completed'], subdirThread: 'tasks', subdirShared: null },
  {
    name: 'council-question',
    lifecycle: ['open', 'answered', 'archived'],
    subdirThread: 'councils',
    subdirShared: null,
    fields: { question: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'council-opinion',
    lifecycle: ['proposed', 'accepted'],
    subdirThread: 'councils',
    subdirShared: null,
    fields: { vote: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'synthesis',
    lifecycle: ['proposed', 'accepted'],
    subdirThread: 'councils',
    subdirShared: null,
    fields: { recommendation: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'escalation',
    lifecycle: ['open', 'resolved', 'archived'],
    subdirThread: 'escalations',
    subdirShared: null,
    fields: { question: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'decision-request',
    lifecycle: ['open', 'answered', 'archived'],
    subdirThread: 'escalations',
    subdirShared: null,
    fields: { question: { kind: 'string', required: true, min: 1 } },
  },
  {
    name: 'call-injection',
    lifecycle: ['active', 'superseded', 'archived'],
    subdirThread: null,
    subdirShared: 'calls',
    fields: {
      trigger_keywords: { kind: 'string[]', default: [] },
      related_objects: { kind: 'string[]', default: [] },
    },
  },
  {
    name: 'playbook',
    lifecycle: ['active', 'stale', 'superseded', 'archived'],
    subdirThread: null,
    subdirShared: 'playbooks',
    fields: {
      trigger_keywords: { kind: 'string[]', default: [] },
      steps: { kind: 'string[]', required: true, minItems: 1 },
      owner_skill: { kind: 'string', required: true, min: 1 },
      version: { kind: 'string', required: true, min: 1 },
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
] as const;

export type MemoryType = (typeof CORE_TAXONOMY_DECLS)[number]['name'];

export const MEMORY_TYPES = CORE_TAXONOMY_DECLS.map((d) => d.name);

/** Типизированное представление канона (compile-time проверка полей деклараций). */
export const CORE_TAXONOMY: readonly MemoryTypeDeclaration[] = CORE_TAXONOMY_DECLS;

/** Поиск декларации: сначала core-таксономия, потом extra (project-типы из config.yaml). */
export function getDeclaration(type: string, extra?: readonly MemoryTypeDeclaration[]): MemoryTypeDeclaration {
  const decl = CORE_TAXONOMY.find((d) => d.name === type) ?? extra?.find((d) => d.name === type);
  if (!decl) throw new Error(`No taxonomy declaration for type: ${type}`);
  return decl;
}

export function subdirectoryFor(type: MemoryType, scope: 'thread' | 'shared'): string | null {
  const d = getDeclaration(type);
  return scope === 'thread' ? d.subdirThread : d.subdirShared;
}
