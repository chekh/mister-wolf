import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import { validateMemoryObject } from '../../domain/policies/write-protocol.js';
import { governanceDefaults } from '../../domain/governance.js';
import { getDeclaration, DEFAULT_CHARACTER_FACETS, type MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { buildTypeSchema, applyFacetEnum } from '../../domain/type-schema-builder.js';
import { UserFacingError } from '../../domain/errors.js';

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
  },
  input: AddMemoryObjectInput
): Promise<AddMemoryObjectResult> {
  // 2.13 §5.3: фасетная валидация в домене (формат подсказки — прецедент getDeclaration)
  const facetDict = deps.facetCharacter ?? DEFAULT_CHARACTER_FACETS;
  const facet = input.facet ?? (input.extra?.facet as string | undefined);
  if (input.type === 'note') {
    if (facet === undefined) {
      throw new UserFacingError(`facet is required for type "note" (valid values: ${facetDict.join(', ')})`);
    }
    if (!facetDict.includes(facet)) {
      throw new UserFacingError(`Invalid facet "${facet}" for type "note" (valid values: ${facetDict.join(', ')})`);
    }
  } else if (facet !== undefined) {
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
      related: input.related ?? { files: [], docs: [], decisions: [] },
      tags: input.tags ?? [],
      superseded_by: null,
      memory_class: input.memoryClass ?? defaults.memory_class,
      truth_role: input.truthRole ?? defaults.truth_role,
      lifetime: input.lifetime ?? defaults.lifetime,
    };

    Object.assign(object, input.extra ?? {});
    if (input.type === 'note' && facet !== undefined) object.facet = facet;
    const baseDecl = getDeclaration(object.type, deps.declarations);
    // note: enum фасета = эффективный словарь (кастомный из конфига или дефолт)
    const decl = object.type === 'note' ? applyFacetEnum(baseDecl, facetDict) : baseDecl;
    const baseKeys = new Set(Object.keys(MemoryObjectSchema.shape));
    for (const key of Object.keys(input.extra ?? {})) {
      if (!baseKeys.has(key) && !(key in (decl.fields ?? {}))) {
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
