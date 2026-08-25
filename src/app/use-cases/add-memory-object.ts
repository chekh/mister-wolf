import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import { validateMemoryObject } from '../../domain/policies/write-protocol.js';
import { governanceDefaults } from '../../domain/governance.js';
import { getDeclaration } from '../../domain/memory-types.js';
import { buildTypeSchema } from '../../domain/type-schema-builder.js';

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
}

export interface AddMemoryObjectResult {
  object: MemoryObject;
  warnings: string[];
}

export async function addMemoryObject(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex; lock?: MemoryLock },
  input: AddMemoryObjectInput
): Promise<AddMemoryObjectResult> {
  const run = async (): Promise<AddMemoryObjectResult> => {
    const now = deps.clock.now();
    const defaults = governanceDefaults(input.createdBy);
    const object: MemoryObject = {
      id: deps.idGen.generateMemoryId(now, input.title),
      type: input.type,
      title: input.title,
      body: input.body || '',
      status: input.status ?? getDeclaration(input.type).defaultStatus ?? getDeclaration(input.type).lifecycle[0],
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
    const decl = getDeclaration(object.type);
    const baseKeys = new Set(Object.keys(MemoryObjectSchema.shape));
    for (const key of Object.keys(input.extra ?? {})) {
      if (!baseKeys.has(key) && !(key in (decl.fields ?? {}))) {
        throw new Error(`Unknown field "${key}" for type "${object.type}"`);
      }
    }
    const typeCheck = buildTypeSchema(decl).safeParse(object);
    if (!typeCheck.success) {
      throw new Error(
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
      payload: { memory_id: object.id, type: object.type },
    });
    if (deps.index) {
      await deps.index.indexObject(object);
    }

    return { object, warnings: validation.warnings };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
