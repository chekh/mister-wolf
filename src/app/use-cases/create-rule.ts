import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { Rule, RuleSchema } from '../../domain/schemas/rule-schema.js';

export interface CreateRuleInput {
  title: string;
  body: string;
  scope: 'project' | 'global';
  appliesTo?: string[];
  trigger?: string;
  createdBy: string;
}

export interface CreateRuleResult {
  object: Rule;
}

export async function createRule(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex },
  input: CreateRuleInput
): Promise<CreateRuleResult> {
  if (input.createdBy.startsWith('agent:')) {
    throw new Error('Rules can only be created by explicit user request');
  }

  const now = deps.clock.now();
  const object: Rule = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'rule',
    title: input.title,
    status: 'active',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.9,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: input.body,
    memory_class: 'canonical',
    truth_role: 'source_of_truth',
    lifetime: 'long_term',
    scope: input.scope,
    applies_to: input.appliesTo ?? [],
    trigger: input.trigger ?? '',
  };

  RuleSchema.parse(object);

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

  return { object };
}
