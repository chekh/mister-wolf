// src/app/use-cases/model-routing.ts
// Routing-объект моделей агентов в памяти Wolf (onboarding v2, §4.5 «Хранение»):
// type=rule, memory_class working, scope project, теги wolf-routing+models;
// значения едут в body (extra-поля у rule вне деклараций конвейер отвергает).
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import type { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { ModelContext } from '../../ports/base-set-renderer.port.js';
import { addMemoryObject } from './add-memory-object.js';
import { supersedeMemoryObject } from './supersede-memory-object.js';

export const ROUTING_TAGS = ['wolf-routing', 'models'] as const;

export interface ModelRoutingDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  declarations?: readonly MemoryTypeDeclaration[];
}

export interface UpsertModelRoutingResult {
  action: 'created' | 'unchanged' | 'superseded';
  id: string;
  supersededId?: string;
}

/** Guard (как init-отчёт §4.1): активный объект по тегам; один — первый. */
export async function findModelRouting(store: MemoryStore): Promise<MemoryObject | null> {
  const rules = await store.list({ type: 'rule' });
  const active = rules.filter((o) => o.status === 'active' && ROUTING_TAGS.every((t) => o.tags.includes(t)));
  return active.length > 0 ? active[0] : null;
}

/** Машинно-читаемые строки `primary: <id>` / `worker: <id>` в body. */
export function parseModelRouting(obj: MemoryObject): ModelContext | null {
  const primary = obj.body.match(/^primary:[ \t]*(\S+)/m)?.[1];
  const worker = obj.body.match(/^worker:[ \t]*(\S+)/m)?.[1];
  return primary && worker ? { primary, worker } : null;
}

export async function upsertModelRouting(
  deps: ModelRoutingDeps,
  models: ModelContext,
  createdBy: string
): Promise<UpsertModelRoutingResult> {
  const existing = await findModelRouting(deps.store);
  if (existing) {
    const parsed = parseModelRouting(existing);
    if (parsed && parsed.primary === models.primary && parsed.worker === models.worker) {
      return { action: 'unchanged', id: existing.id };
    }
  }
  const { object } = await addMemoryObject(deps, {
    type: 'rule',
    title: 'Routing: модели агентов',
    body: `Модели агентов базового набора (onboarding v2, §4.5).\nprimary: ${models.primary}\nworker: ${models.worker}\n`,
    createdBy,
    tags: [...ROUTING_TAGS],
    memoryClass: 'working',
    extra: { scope: 'project' },
  });
  if (existing) {
    await supersedeMemoryObject(deps, existing.id, object.id);
    return { action: 'superseded', id: object.id, supersededId: existing.id };
  }
  return { action: 'created', id: object.id };
}
