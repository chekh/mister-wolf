import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import type { MemoryLock } from '../../ports/memory-lock.port.js';
import { shouldSummarize } from './should-summarize.js';
import { addMemoryObject, AddMemoryObjectResult } from './add-memory-object.js';
import { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';

const MAX_RECENT_EVENTS = 20;

export interface SummarizeSessionInput {
  title?: string;
  tags?: string[];
  createdBy: string;
}

export interface SummarizeSessionResult {
  object: AddMemoryObjectResult['object'];
}

function renderSummaryBody(events: MemoryEvent[]): string {
  if (events.length === 0) {
    return 'No recent events.';
  }

  const lines = events.map((evt) => `- ${evt.type}: ${JSON.stringify(evt.payload)} (actor: ${evt.actor})`);
  return `# Session wrap-up\n\nRecent events:\n${lines.join('\n')}`;
}

export async function summarizeSession(
  deps: { store: MemoryStore; log: EventLog; clock: Clock; idGen: IdGenerator; index?: SearchIndex; lock?: MemoryLock },
  input: SummarizeSessionInput
): Promise<SummarizeSessionResult | null> {
  const now = deps.clock.now();
  const objects = await deps.store.list();

  if (!shouldSummarize(objects, now)) {
    return null;
  }

  const events = await deps.log.readAll();
  let lastSummaryIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    // 2.13 P210(е): wrap-up пишет note+facet history с тегом session-summary;
    // legacy-события (payload.type 'session-summary') читаются как раньше (инвариант i)
    const p = evt.payload as { type?: unknown; tags?: unknown };
    const isSummaryEvent =
      evt.type === 'memory.added' &&
      (p.type === 'session-summary' ||
        (p.type === 'note' && Array.isArray(p.tags) && p.tags.includes('session-summary')));
    if (isSummaryEvent) {
      lastSummaryIndex = i;
      break;
    }
  }
  const recentEvents = events.slice(lastSummaryIndex + 1).slice(-MAX_RECENT_EVENTS);

  const title = input.title ?? `Session wrap-up ${now.toISOString().slice(0, 16).replace('T', ' ')}`;
  const tags = ['session-summary', ...(input.tags ?? [])];
  const body = renderSummaryBody(recentEvents);

  const result = await addMemoryObject(
    { store: deps.store, log: deps.log, clock: deps.clock, idGen: deps.idGen, index: deps.index, lock: deps.lock },
    {
      // 2.13 C16-хвост: session-summary → note facet history, тег сохраняется
      // (на нём держится should-summarize дедуп)
      type: 'note',
      facet: 'history',
      title,
      body,
      createdBy: input.createdBy,
      tags,
      source: { kind: 'session' },
    }
  );

  return { object: result.object };
}
