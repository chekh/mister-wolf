import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { Clock } from '../../ports/clock.port.js';
import { tokenize } from '../../domain/solve/scenarios.js';
import { finalScore } from '../../domain/solve/relevance.js';

export interface CallInjectionResult {
  blocks: string[];
  truncated: number;
  /** Ф26: id объектов, реально попавших в вывод (срабатывание доставки → decay-пробег). */
  deliveredIds: string[];
}

function formatBlock(obj: Record<string, unknown>): string {
  return `- [${obj.id}] ${obj.title} (${obj.confidence}, ${obj.updated_at})\n  source: ${obj.id}`;
}

/** Машино-состояние (routing-объект моделей) — не руководство для агента: в инъекции никогда. */
function isMachineState(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj.tags) && (obj.tags as unknown[]).includes('wolf-routing');
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
    // one index query per call: injections whose body/title match the topic
    // even when trigger_keywords don't overlap (FTS fallback)
    const ftsIds = new Set<string>();
    if (deps.index && topicTokens.length > 0) {
      try {
        const results = await deps.index.search(input.topic, { type: 'call-injection', limit: 10 });
        for (const r of results) ftsIds.add(r.object.id);
      } catch {
        // ponytail: broken index degrades to keyword-only matching, never crashes wolf call
      }
    }
    matched = injections.filter((obj) => {
      const kw: string[] = (obj.trigger_keywords as string[]) ?? [];
      if (kw.some((k) => topicTokens.includes(k))) return true;
      return ftsIds.has(obj.id as string);
    });
    // D2: active lessons/rules with trigger_keywords ∩ topicTokens join the
    // match (keyword-only, no FTS for these types — deliberate simplification)
    const kwMatched = (obj: Record<string, unknown>): boolean => {
      const kw: string[] = (obj.trigger_keywords as string[]) ?? [];
      return kw.some((k) => topicTokens.includes(k));
    };
    const lessons = (await deps.store.list({ type: 'lesson', status: 'active' })) as Record<string, unknown>[];
    for (const l of lessons) {
      if (kwMatched(l) && !matched.some((m) => m.id === l.id)) matched.push(l);
    }
    const rules = (await deps.store.list({ type: 'rule', status: 'active' })) as Record<string, unknown>[];
    const keywordRules = rules.filter((r) => !isMachineState(r) && kwMatched(r));
    for (const r of keywordRules) {
      if (!matched.some((m) => m.id === r.id)) matched.push(r);
    }
    // 3. fallback to rules if no matches (keyword-matched rules excluded)
    if (matched.length === 0) {
      matched = rules.filter((r) => !isMachineState(r) && !keywordRules.some((k) => k.id === r.id)).slice(0, 3);
    }
  } else {
    matched = injections;
  }

  // 4. thread mode: append project rules + open blockers with matching thread
  if (input.thread !== undefined) {
    const threadId = typeof input.thread === 'string' ? input.thread : null;
    const rules = (await deps.store.list({ type: 'rule', status: 'active' })) as Record<string, unknown>[];
    for (const r of rules) {
      if (!isMachineState(r) && r.scope === 'project' && !matched.some((m) => m.id === r.id)) {
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

  // 6. build blocks (deliveredIds — то, что прошло бюджет, включая fallback)
  const blocks: string[] = [];
  const deliveredIds: string[] = [];
  let truncated = 0;
  const budget = input.compact === undefined ? Infinity : input.compact === true ? 1200 : input.compact;
  let used = 0;

  for (const { obj } of scored) {
    const block = formatBlock(obj);
    if (used + block.length <= budget) {
      blocks.push(block);
      deliveredIds.push(obj.id as string);
      used += block.length;
    } else {
      truncated++;
    }
  }

  return { blocks, truncated, deliveredIds };
}
