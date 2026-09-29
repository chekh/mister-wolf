import { MemoryStore } from '../../ports/memory-store.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { Clock } from '../../ports/clock.port.js';
import { tokenize } from '../../domain/solve/scenarios.js';
import { finalScore } from '../../domain/solve/relevance.js';
import { highlightFacet } from '../../domain/facet-colors.js';
import { checksumBlock } from '../../adapters/fs/session-delivery-registry.js';

export interface CallInjectionResult {
  blocks: string[];
  truncated: number;
  /** Ф26: id объектов, реально попавших в вывод (срабатывание доставки → decay-пробег). */
  deliveredIds: string[];
  /** P108 (4.C): сколько объектов отфильтровано сессионной дедупликацией
   * (id уже в реестре сессии с той же checksum блока). */
  deduplicated: number;
}

function formatBlock(obj: Record<string, unknown>, colors?: boolean): string {
  // P212 (2.13 §5.3в): фасет перед title — формат как в list; нет фасета → без скобок
  const facet = typeof obj.facet === 'string' ? obj.facet : null;
  const facetPart = facet ? `[${highlightFacet(facet, colors ?? false)}] ` : '';
  return `- [${obj.id}] ${facetPart}${obj.title} (${obj.confidence}, ${obj.updated_at})\n  source: ${obj.id}`;
}

/** Машино-состояние (routing-объект моделей) — не руководство для агента: в инъекции никогда. */
function isMachineState(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj.tags) && (obj.tags as unknown[]).includes('wolf-routing');
}

export async function getCallInjections(
  deps: { store: MemoryStore; index?: SearchIndex; clock: Clock },
  input: {
    topic?: string;
    thread?: boolean | string;
    compact?: number | true;
    /** P108 (4.C): мапа id→checksum уже доставленных в сессию блоков (готовит
     * memory-call из loadSessionRegistry). Не передана (MCP-канал) — фильтр выключен. */
    deliveredRegistry?: Record<string, string>;
    /** P212 (2.13 §5.3в): подсветка фасета (CLI-TTY); false/undefined → плоский текст. */
    colors?: boolean;
  }
): Promise<CallInjectionResult> {
  const now = deps.clock.now();
  const topicTokens = input.topic ? tokenize(input.topic) : [];

  // P103 (волна 2.12 A4): ровно ОДИН store.list() — list() в любом случае
  // обходит всё дерево, type/status-фильтры не сокращают IO (прецедент T013
  // в generate-agent-brief.ts). Было 5 полных проходов, один — буквальный
  // дубль rules-запроса; фильтрация по типу/статусу — в памяти.
  const memoryObjects = (await deps.store.list()) as Record<string, unknown>[];
  const activeOf = (type: string): Record<string, unknown>[] =>
    memoryObjects.filter((o) => o.type === type && o.status === 'active');

  // 1. active call-injections.
  // wave13-a §3.4 (инвариант v): call-injection поглощён note+howto; старые
  // записи читаются как note с transient alias_origin='call-injection' — пул
  // доставок находит их по alias_origin (доставка живёт до migrate; после
  // migrate alias_origin исчезает и пул их не видит — задумано спекой 8.1)
  const injections = memoryObjects.filter(
    (o) =>
      o.status === 'active' &&
      (o.type === 'call-injection' || (o.type === 'note' && o.alias_origin === 'call-injection'))
  );

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
    const lessons = activeOf('lesson') as Record<string, unknown>[];
    for (const l of lessons) {
      if (kwMatched(l) && !matched.some((m) => m.id === l.id)) matched.push(l);
    }
    const rules = activeOf('rule') as Record<string, unknown>[];
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
    const rules = activeOf('rule') as Record<string, unknown>[];
    for (const r of rules) {
      if (!isMachineState(r) && r.scope === 'project' && !matched.some((m) => m.id === r.id)) {
        matched.push(r);
      }
    }
    if (threadId) {
      // wave13-a: blocker → note+facet pitfall (старые файлы — alias_origin);
      // «открытые блокеры треда» = активные note-pitfall с thread
      const blockers = memoryObjects.filter(
        (o) =>
          o.status === 'active' &&
          o.type === 'note' &&
          ((o.facet === 'pitfall' || o.alias_origin === 'blocker') as boolean)
      );
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

  // P108 (4.C): сессионная дедупликация ДО бюджета — уже доставленные в этой
  // сессии с той же checksum блока не занимают бюджет; изменившийся текст
  // (иная checksum) доставляется повторно. Реестр не передан → фильтр выключен.
  let deduplicated = 0;
  const pending = input.deliveredRegistry
    ? scored.filter(({ obj }) => {
        if (input.deliveredRegistry![obj.id as string] !== checksumBlock(formatBlock(obj, input.colors))) return true;
        deduplicated++;
        return false;
      })
    : scored;

  // 6. build blocks (deliveredIds — то, что прошло бюджет, включая fallback)
  const blocks: string[] = [];
  const deliveredIds: string[] = [];
  let truncated = 0;
  const budget = input.compact === undefined ? Infinity : input.compact === true ? 1200 : input.compact;
  let used = 0;

  for (const { obj } of pending) {
    const block = formatBlock(obj, input.colors);
    if (used + block.length <= budget) {
      blocks.push(block);
      deliveredIds.push(obj.id as string);
      used += block.length;
    } else {
      truncated++;
    }
  }

  return { blocks, truncated, deliveredIds, deduplicated };
}
