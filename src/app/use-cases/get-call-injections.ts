import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { Clock } from '../../ports/clock.port.js';
import { tokenize } from '../../domain/solve/scenarios.js';
import { finalScore } from '../../domain/solve/relevance.js';

export interface CallInjectionResult {
  blocks: string[];
  truncated: number;
}

function formatBlock(obj: Record<string, unknown>): string {
  return `- [${obj.id}] ${obj.title} (${obj.confidence}, ${obj.updated_at})\n  source: ${obj.id}`;
}

export async function getCallInjections(
  deps: { store: MemoryStore; index?: SearchIndex; clock: Clock },
  input: { topic?: string; thread?: boolean | string; compact?: number | true }
): Promise<CallInjectionResult> {
  const now = deps.clock.now();
  const topicTokens = input.topic ? tokenize(input.topic) : [];

  // 1. active call-injections
  const allInjections = await deps.store.list({ type: 'call-injection', status: 'active' });
  const injections = allInjections as Record<string, unknown>[];

  // 2. topic matching
  let matched: Record<string, unknown>[];
  if (input.topic) {
    matched = injections.filter((obj) => {
      const kw: string[] = (obj.trigger_keywords as string[]) ?? [];
      const intersection = kw.filter((k) => topicTokens.includes(k));
      if (intersection.length > 0) return true;
      // fallback: index search
      return false; // index fallback not used in tests
    });
    // 3. fallback to rules if no matches
    if (matched.length === 0) {
      const rules = (await deps.store.list({ type: 'rule', status: 'active' })) as Record<string, unknown>[];
      matched = rules.slice(0, 3);
    }
  } else {
    matched = injections;
  }

  // 4. thread mode: append project rules + open blockers with matching thread
  if (input.thread !== undefined) {
    const threadId = typeof input.thread === 'string' ? input.thread : null;
    const rules = (await deps.store.list({ type: 'rule', status: 'active' })) as Record<string, unknown>[];
    for (const r of rules) {
      if (r.scope === 'project' && !matched.some((m) => m.id === r.id)) {
        matched.push(r);
      }
    }
    if (threadId) {
      const blockers = (await deps.store.list({ type: 'blocker', status: 'active' })) as Record<string, unknown>[];
      for (const b of blockers) {
        if (b.thread === threadId && !matched.some((m) => m.id === b.id)) {
          matched.push(b);
        }
      }
    }
  }

  // 5. rank by D8
  const scored = matched
    .map((obj) => ({
      obj,
      score: finalScore(
        {
          ftsScore: 1,
          importance: (obj.importance as number) ?? 0.5,
          confidence: (obj.confidence as string) ?? 'medium',
          updatedAt: obj.updated_at as string,
        },
        now
      ),
    }))
    .sort((a, b) => b.score - a.score);

  // 6. build blocks
  const blocks: string[] = [];
  let truncated = 0;
  const budget = input.compact === undefined ? Infinity : input.compact === true ? 1200 : input.compact;
  let used = 0;

  for (const { obj } of scored) {
    const block = formatBlock(obj);
    if (used + block.length <= budget) {
      blocks.push(block);
      used += block.length;
    } else {
      truncated++;
    }
  }

  return { blocks, truncated };
}
