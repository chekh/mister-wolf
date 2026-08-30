/**
 * Ф22 (D2.2): `wolf learn propose` — превращение активного паттерна в draft-объект
 * (lesson/rule, status proposed, review_state proposed, truth_role proposed_knowledge).
 * Спека: docs/superpowers/specs/2026-08-26-self-learning-design.md §2.3, §2.5, §5, §6.
 *
 * Генерация — за интерфейсом DraftGenerator (LLM Analyzer подключается позже и
 * только здесь); дефолт — mechanicalDraftGenerator: детерминированный, без LLM.
 */
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { type MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { type MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { UserFacingError } from '../../domain/errors.js';
import { mechanicalAdviceFor } from '../../domain/mechanical-advice.js';
import { addMemoryObject } from './add-memory-object.js';
import type { PatternSummary } from './pattern-detection.js';

/** Манифест правки (M23-03, спека §5): предсказание эффекта + риски. */
export interface EditManifest {
  predicted_effect: string;
  regression_risks: string[];
  blast_radius: string;
  risk_level: 'low' | 'medium' | 'high';
}

/** Replay-констрейнт mechanical-draft: кластер `tool_name:error_class_id`. */
export interface ReplayConstraint {
  tool_name: string;
  error_class_id: string;
}

export interface GeneratedDraft {
  type: 'rule' | 'lesson';
  title: string;
  body: string;
  triggerKeywords: string[];
  mechanical: boolean;
  polarity: 'positive' | 'negative';
  constraint: ReplayConstraint | null;
  manifest: EditManifest;
}

export interface DraftGeneratorInput {
  patternKey: string;
  count: number;
  evidence: string[];
  polarity: 'positive' | 'negative';
}

export interface DraftGenerator {
  generate(input: DraftGeneratorInput): Promise<GeneratedDraft>;
}

const GENERIC_ADVICE = 'класс ошибки вне таблицы — сформулируй правило по сообщению ошибки вручную';

/**
 * Дефолтный генератор: без LLM, детерминированный (тот же вход → тот же draft).
 * Разбор patternKey: `complaint:`/`delivery:` — поведенческий кластер (rule,
 * текст готовит Analyzer или человек); иначе split по первому ':' → tool T,
 * class C (lesson, mechanical).
 */
export function mechanicalDraftGenerator(): DraftGenerator {
  return {
    async generate(input: DraftGeneratorInput): Promise<GeneratedDraft> {
      const { patternKey, count, evidence, polarity } = input;
      const title = `Draft: ${patternKey} ×${count}`;
      const evidenceLine = `evidence: ${evidence.join(', ')}`;
      const kind = patternKey.startsWith('complaint:')
        ? 'complaint'
        : patternKey.startsWith('delivery:')
          ? 'delivery'
          : null;
      if (kind !== null) {
        const about = patternKey.slice(kind.length + 1);
        return {
          type: 'rule',
          title,
          body:
            `Повторяющаяся ${kind === 'complaint' ? 'жалоба' : 'доставка'} ${patternKey} ${count} раз — ` +
            `поведение требует правила; текст draft'а готовит Analyzer (LLM) или человек\n${evidenceLine}`,
          triggerKeywords: [about],
          mechanical: false,
          polarity,
          constraint: null,
          manifest: {
            predicted_effect: 'правило формализует поведение по повторяющемуся сигналу',
            regression_risks: ['текст правила не сгенерирован механически — содержание задаёт ревьюер'],
            blast_radius: 'low',
            risk_level: 'low',
          },
        };
      }
      const sep = patternKey.indexOf(':');
      const toolName = sep >= 0 ? patternKey.slice(0, sep) : patternKey;
      const errorClass = sep >= 0 ? patternKey.slice(sep + 1) : 'uncategorized';
      const advice = mechanicalAdviceFor(errorClass) ?? GENERIC_ADVICE;
      const constraint: ReplayConstraint = { tool_name: toolName, error_class_id: errorClass };
      if (polarity === 'negative') {
        return {
          type: 'lesson',
          title,
          body:
            `АНТИ-ПРАВИЛО: не использовать ${toolName} — повторяющаяся ошибка ${patternKey} ${count} раз ` +
            `(класс ${errorClass}: ${advice})\n${evidenceLine}`,
          triggerKeywords: [toolName, errorClass],
          mechanical: true,
          polarity,
          constraint,
          manifest: {
            predicted_effect: `отсечение ошибок тула ${toolName} целиком`,
            regression_risks: ['блокирует и легитимные использования тула — сигнальный лог их не видит'],
            blast_radius: 'high: запрет тула целиком',
            risk_level: 'medium',
          },
        };
      }
      return {
        type: 'lesson',
        title,
        body: `Повторяющаяся ошибка ${patternKey} ${count} раз — правило: ${advice}\n${evidenceLine}`,
        triggerKeywords: [toolName, errorClass],
        mechanical: true,
        polarity: 'positive',
        constraint,
        manifest: {
          predicted_effect: `предотвращение повторений ${patternKey}`,
          regression_risks: ['совет может не покрыть новые классы ошибок тула'],
          blast_radius: 'low: срабатывание только при повторении класса ошибки',
          risk_level: 'low',
        },
      };
    },
  };
}

/** Статусы, в которых draft считается «живым» (дедуп propose). */
const DRAFT_OPEN_STATUSES: readonly string[] = ['proposed', 'active', 'accepted'];

export interface ProposeDraftInput {
  patternKey: string;
  patterns: PatternSummary[];
  actor: string;
  polarity?: 'positive' | 'negative';
  generator?: DraftGenerator;
}

/**
 * Propose: (а) точное совпадение ключа в активных паттернах; (б) генерация;
 * (в) дедуп по pattern_key среди живых lesson/rule; (г) addMemoryObject
 * (status 'proposed' явно: lifecycle-голова rule/lesson — 'active', это НЕ тот случай).
 */
export async function proposeDraft(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    lock?: MemoryLock;
    declarations?: readonly MemoryTypeDeclaration[];
  },
  input: ProposeDraftInput
): Promise<{ object: MemoryObject }> {
  const pattern = input.patterns.find((p) => p.key === input.patternKey);
  if (!pattern) {
    const keys = input.patterns.map((p) => p.key).join(', ');
    throw new UserFacingError(`активный паттерн не найден: ${input.patternKey}; активные: ${keys || 'нет'}`);
  }
  const polarity: 'positive' | 'negative' = input.polarity === 'negative' ? 'negative' : 'positive';
  const generator = input.generator ?? mechanicalDraftGenerator();
  const draft = await generator.generate({
    patternKey: input.patternKey,
    count: pattern.count,
    evidence: pattern.evidence,
    polarity,
  });

  // дедуп (negative constraint, спека §6): повторная генерация по живому кластеру
  // блокируется механически — один открытый draft на паттерн
  for (const type of ['lesson', 'rule'] as const) {
    const dup = (await deps.store.list({ type })).find(
      (o) => (o as Record<string, unknown>).pattern_key === input.patternKey && DRAFT_OPEN_STATUSES.includes(o.status)
    );
    if (dup) {
      throw new UserFacingError(
        `draft для паттерна уже существует: ${dup.id} (${dup.status}) — закрой его (activate/transition) перед новым propose`
      );
    }
  }

  const result = await addMemoryObject(deps, {
    type: draft.type,
    title: draft.title,
    body: draft.body,
    createdBy: input.actor,
    status: 'proposed',
    reviewState: 'proposed',
    truthRole: 'proposed_knowledge',
    tags: ['draft', 'self-learning'],
    extra: {
      pattern_key: input.patternKey,
      pattern_count: pattern.count,
      evidence: pattern.evidence,
      mechanical: draft.mechanical,
      polarity,
      ...(draft.constraint
        ? { constraint_tool: draft.constraint.tool_name, constraint_class: draft.constraint.error_class_id }
        : {}),
      predicted_effect: draft.manifest.predicted_effect,
      regression_risks: draft.manifest.regression_risks,
      blast_radius: draft.manifest.blast_radius,
      risk_level: draft.manifest.risk_level,
      trigger_keywords: draft.triggerKeywords,
      // scope — обязательное enum-поле таксономии rule
      ...(draft.type === 'rule' ? { scope: 'project' } : {}),
    },
  });
  return { object: result.object };
}
