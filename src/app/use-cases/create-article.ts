import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { Article, ArticleSchema } from '../../domain/schemas/article-schema.js';
import { recordRelation } from './record-relation.js';

export interface CreateArticleInput {
  title: string;
  thread: string;
  summary: string;
  body: string;
  answers?: string[];
  supports?: string[];
  evidence?: string[];
  createdBy: string;
}

export interface CreateArticleResult {
  object: Article;
}

export async function createArticle(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    relations?: RelationLog;
  },
  input: CreateArticleInput
): Promise<CreateArticleResult> {
  const now = deps.clock.now();
  const object: Article = {
    id: deps.idGen.generateMemoryId(now, input.title),
    type: 'article',
    title: input.title,
    status: 'proposed',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.6,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: input.body,
    thread: input.thread,
    summary: input.summary,
    answers: input.answers || [],
    supports: input.supports || [],
    evidence: input.evidence || [],
  };

  ArticleSchema.parse(object);

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
  if (deps.relations) {
    for (const answerId of object.answers) {
      await recordRelation(deps, now, object.id, 'answers', answerId);
    }
    for (const supportId of object.supports) {
      await recordRelation(deps, now, object.id, 'supports', supportId);
    }
  }

  return { object };
}
