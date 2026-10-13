import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import { validateMemoryObject } from '../../domain/policies/write-protocol.js';
import { governanceDefaults } from '../../domain/governance.js';
import {
  getDeclaration,
  DEFAULT_CHARACTER_FACETS,
  MEMORY_TYPES,
  SIGNAL_FACETS,
  type MemoryTypeDeclaration,
} from '../../domain/memory-types.js';
import {
  buildTypeSchema,
  applyFacetEnum,
  PROPOSAL_FACET,
  PROPOSAL_CONTRACT_FIELDS,
} from '../../domain/type-schema-builder.js';
import { UserFacingError } from '../../domain/errors.js';
import { isAbsolute, normalize, relative, sep } from 'path';

/** WP3 §6.3: related.files/docs — project-relative posix-пути; абсолют вне root — отказ.
 * Прецедент: tool-librarian.ts:151 (script_path хранится относительным).
 * decisions не трогаем — это id, не пути. */
export function normalizeRelatedPaths(
  related: MemoryObject['related'] | undefined,
  projectRoot: string | undefined
): MemoryObject['related'] {
  const base = related ?? { files: [], docs: [], decisions: [] };
  if (projectRoot === undefined) return base; // legacy-вызовы/фейки без root — как сегодня
  const norm = (p: string): string => {
    const rel = isAbsolute(p) ? relative(projectRoot, p) : normalize(p);
    if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) {
      throw new UserFacingError(`related path escapes the project root: "${p}" (use a project-relative path)`);
    }
    return rel.split(sep).join('/');
  };
  return { files: base.files.map(norm), docs: base.docs.map(norm), decisions: base.decisions };
}

export interface AddMemoryObjectInput {
  type: MemoryObject['type'];
  title: string;
  body?: string;
  createdBy: string;
  tags?: string[];
  related?: MemoryObject['related'];
  confidence?: MemoryObject['confidence'];
  importance?: number;
  source?: MemoryObject['source'];
  reviewState?: MemoryObject['review_state'];
  memoryClass?: MemoryObject['memory_class'];
  truthRole?: MemoryObject['truth_role'];
  lifetime?: MemoryObject['lifetime'];
  extra?: Record<string, unknown>;
  status?: MemoryObject['status'];
  /** 2.13 §5.3: фасет «характер записи» — обязателен для note, запрещён прочим типам. */
  facet?: string;
}

export interface AddMemoryObjectResult {
  object: MemoryObject;
  warnings: string[];
}

export async function addMemoryObject(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    lock?: MemoryLock;
    declarations?: readonly MemoryTypeDeclaration[];
    /** 2.13 §5.3: кастомный словарь facets.character из config.yaml. */
    facetCharacter?: readonly string[];
    /** WP3 §6.2: дефолт scope при записи из linked worktree ('worktree:<имя>'); нет — поле не ставится. */
    defaultScope?: string;
    /** WP3 §6.3: корень проекта для нормализации related.files/docs в project-relative. */
    projectRoot?: string;
  },
  input: AddMemoryObjectInput
): Promise<AddMemoryObjectResult> {
  // T030/2.13 §6.1: гвард «rules by user request only» перенесён из create-rule
  // (CLI не всегда TTY — ошибка вместо интерактивного вопроса; пользовательский
  // путь = actor user:* через --created-by или env WOLF_ACTOR)
  if (input.type === 'rule' && input.createdBy.startsWith('agent:')) {
    throw new UserFacingError(
      'Rules can only be created by explicit user request (use a user actor: --created-by user:<name> or env WOLF_ACTOR)'
    );
  }

  // Волна 2.17 REQ-01 AC3 (design §Схемные изменения п.5): face создаётся только
  // версионирующим путём (wolf face new/restore/breakglass) — прямой add закрыт
  // для всех акторов, включая пользователя (прецедент: rule-guard выше)
  if (input.type === 'face') {
    throw new UserFacingError(
      'type "face" cannot be created with add: faces are versioned, use "wolf face" commands (new | restore | breakglass)'
    );
  }

  // 2.13 §5.3: фасетная валидация в домене (формат подсказки — прецедент getDeclaration)
  const facetDict = deps.facetCharacter ?? DEFAULT_CHARACTER_FACETS;
  const facet = input.facet ?? (input.extra?.facet as string | undefined);
  // Волна 2.17 REQ-08/ADR-3: сигнал-фасет разрешён на не-note core-типах
  // (SIGNAL_FACETS); character-фасеты — по-прежнему только note
  const isSignalFacet =
    input.type !== 'note' &&
    facet !== undefined &&
    (MEMORY_TYPES as readonly string[]).includes(input.type) &&
    SIGNAL_FACETS.includes(facet);
  if (input.type === 'note') {
    if (facet === undefined) {
      throw new UserFacingError(`facet is required for type "note" (valid values: ${facetDict.join(', ')})`);
    }
    if (!facetDict.includes(facet)) {
      throw new UserFacingError(`Invalid facet "${facet}" for type "note" (valid values: ${facetDict.join(', ')})`);
    }
  } else if (facet !== undefined && !isSignalFacet) {
    throw new UserFacingError(`facet is only valid for type "note" (got type "${input.type}")`);
  }

  const run = async (): Promise<AddMemoryObjectResult> => {
    const now = deps.clock.now();
    const defaults = governanceDefaults(input.createdBy);
    const object: MemoryObject = {
      id: deps.idGen.generateMemoryId(now, input.title),
      type: input.type,
      title: input.title,
      body: input.body || '',
      status:
        input.status ??
        getDeclaration(input.type, deps.declarations).defaultStatus ??
        getDeclaration(input.type, deps.declarations).lifecycle[0],
      review_state: input.reviewState ?? (input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted'),
      confidence: input.confidence ?? 'medium',
      importance: input.importance ?? 0.5,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      created_by: input.createdBy,
      schema_version: 1,
      source: input.source ?? { kind: 'manual' },
      related: normalizeRelatedPaths(input.related, deps.projectRoot),
      tags: input.tags ?? [],
      superseded_by: null,
      memory_class: input.memoryClass ?? defaults.memory_class,
      truth_role: input.truthRole ?? defaults.truth_role,
      lifetime: input.lifetime ?? defaults.lifetime,
    };

    Object.assign(object, input.extra ?? {});
    // WP3 §6.2: явный scope (--scope main / --set scope=...) сильнее дефолта ворктрии
    if (deps.defaultScope !== undefined && object.scope === undefined) object.scope = deps.defaultScope;
    // 2.17: фасет пишется и для сигнал-фасетов не-note core-типов (REQ-08);
    // guard выше уже отсек недопустимые комбинации тип×фасет
    if (facet !== undefined) object.facet = facet;
    const baseDecl = getDeclaration(object.type, deps.declarations);
    // note: enum фасета = эффективный словарь (кастомный из конфига или дефолт)
    const decl = object.type === 'note' ? applyFacetEnum(baseDecl, facetDict) : baseDecl;
    const baseKeys = new Set(Object.keys(MemoryObjectSchema.shape));
    for (const key of Object.keys(input.extra ?? {})) {
      // 2.17 REQ-08: поля контракта предложения допустимы только при facet='proposal'
      // (сами поля не входят в декларации типов — валидирует schema-builder superRefine)
      const proposalField = facet === PROPOSAL_FACET && PROPOSAL_CONTRACT_FIELDS.includes(key);
      if (!baseKeys.has(key) && !proposalField && !(key in (decl.fields ?? {}))) {
        // T011: список валидных полей типа в сообщении; classifyError → invalid_input
        throw new UserFacingError(
          `Unknown field "${key}" for type "${object.type}" (valid fields: ${
            Object.keys(decl.fields ?? {}).join(', ') || 'none'
          })`
        );
      }
    }
    const typeCheck = buildTypeSchema(decl).safeParse(object);
    if (!typeCheck.success) {
      throw new UserFacingError(
        `Type validation failed: ${typeCheck.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
      );
    }

    const validation = validateMemoryObject(object);
    // P300/2.14 §5.1: коллизия детерминированного id — отказ с подсказкой,
    // никогда тихая перезапись (P0-жалоба 817efd). get — один locate-обход,
    // add не hot-path (Р5 спеки 2.14)
    const existing = await deps.store.get(object.id);
    if (existing) {
      throw new UserFacingError(
        `Memory object "${object.id}" already exists (same title produced same id).\n` +
          `Use: wolf edit ${object.id} (правка) | wolf supersede ${object.id} <new-id> (смена) | другой --title.`
      );
    }
    await deps.store.save(object);
    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      type: 'memory.added',
      timestamp: now.toISOString(),
      actor: input.createdBy,
      payload: {
        memory_id: object.id,
        type: object.type,
        // 2.13: tags в payload — аддитивно (инвариант i); summarize-session ищет
        // по тегу session-summary событие последнего wrap-up (note + facet history)
        ...(object.tags.length > 0 ? { tags: object.tags } : {}),
      },
    });
    if (deps.index) {
      await deps.index.indexObject(object);
    }

    return { object, warnings: validation.warnings };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
