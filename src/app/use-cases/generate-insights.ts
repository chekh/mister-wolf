import { MemoryStore } from '../../ports/memory-store.port.js';
import { Clock } from '../../ports/clock.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export type AnalysisType = 'patterns' | 'technical_debt' | 'decisions' | 'lessons' | 'activity';

export const ANALYSIS_TYPES: readonly AnalysisType[] = [
  'patterns',
  'technical_debt',
  'decisions',
  'lessons',
  'activity',
];

export const INSIGHTS_STALE_DAYS = 30;
export const DEBUG_TAGS: readonly string[] = ['debug', 'bug', 'bugfix', 'memory-repair', 'solve'];
const DECISION_STATUSES = ['active', 'superseded', 'rejected', 'obsolete'] as const;

export interface InsightsInput {
  topic?: string; // undefined => весь проект
  analysisType?: AnalysisType; // default 'patterns'
}

export interface TagCount {
  tag: string;
  count: number;
}
export interface FileCount {
  file: string;
  count: number;
}
export interface WeekBucket {
  week: string; // YYYY-MM-DD понедельника ISO-недели (UTC)
  decisions: number;
  lessons: number;
  debug: number;
  total: number;
}

export interface InsightsReport {
  topic: string | null;
  analysisType: AnalysisType;
  generatedAt: string;
  scope: { total: number; matched: number };
  topTags: TagCount[]; // top 10, убывание count, tie => алфавит
  topFiles: FileCount[]; // top 10 из related.files, та же сортировка
  typeDistribution: TagCount[]; // {tag: type, count}
  stale: MemoryObject[]; // D5
  supersededDecisions: MemoryObject[]; // decision status='superseded'
  conflicts: { statusConflicting: MemoryObject[]; candidates: MemoryObject[][] }; // D6
  lowConfidenceActive: MemoryObject[];
  openBlockers: MemoryObject[];
  decisionsByStatus: Record<string, MemoryObject[]>; // active/superseded/rejected/obsolete
  lessonsTopTags: TagCount[]; // top 5 по типам lesson+observation
  density: WeekBucket[]; // 8 недель, D7
  statusTally: TagCount[];
  truthRoleTally: TagCount[];
}

function matchesTopic(obj: MemoryObject, topic: string): boolean {
  const t = topic.toLowerCase();
  return (
    obj.tags.some((tag) => tag.toLowerCase() === t) ||
    obj.title.toLowerCase().includes(t) ||
    obj.body.toLowerCase().includes(t)
  );
}

function topCounts(values: string[], limit: number): TagCount[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

export async function generateInsights(
  deps: { store: MemoryStore; clock: Clock },
  input: InsightsInput = {}
): Promise<InsightsReport> {
  const analysisType = input.analysisType ?? 'patterns';
  if (!ANALYSIS_TYPES.includes(analysisType)) {
    throw new Error(`Invalid analysis type "${String(input.analysisType)}". Allowed: ${ANALYSIS_TYPES.join(', ')}`);
  }

  const all = await deps.store.list();
  // ponytail: store.list() — полный reparse всех md (V6); ровно один вызов на отчёт (D1)
  const base = all.filter((obj) => obj.status !== 'archived');
  const topic = input.topic;
  const matched = topic ? base.filter((obj) => matchesTopic(obj, topic)) : base;

  const now = deps.clock.now().getTime();
  const staleMs = INSIGHTS_STALE_DAYS * 24 * 60 * 60 * 1000;
  const stale = matched.filter(
    (obj) => obj.status === 'stale' || (obj.status === 'active' && now - new Date(obj.updated_at).getTime() > staleMs)
  );

  const statusConflicting = matched.filter((obj) => obj.status === 'conflicting');
  const activeDecisions = matched.filter((obj) => obj.type === 'decision' && obj.status === 'active');
  // ponytail: O(n²) попарная группировка — норм для local-first масштабов; union-find если память вырастет
  const claimed = new Set<string>();
  const candidates: MemoryObject[][] = [];
  for (let i = 0; i < activeDecisions.length; i++) {
    if (claimed.has(activeDecisions[i].id)) continue;
    const group = [activeDecisions[i]];
    for (let j = i + 1; j < activeDecisions.length; j++) {
      if (activeDecisions[j].tags.some((tag) => activeDecisions[i].tags.includes(tag))) {
        group.push(activeDecisions[j]);
        claimed.add(activeDecisions[j].id);
      }
    }
    if (group.length >= 2) candidates.push(group);
  }

  const lowConfidenceActive = matched.filter((obj) => obj.confidence === 'low' && obj.status === 'active');
  const openBlockers = matched.filter((obj) => obj.type === 'blocker' && obj.status === 'active'); // прецедент brief

  const decisionsByStatus: Record<string, MemoryObject[]> = {};
  for (const status of DECISION_STATUSES) decisionsByStatus[status] = [];
  for (const obj of matched) {
    if (obj.type === 'decision' && Object.hasOwn(decisionsByStatus, obj.status)) {
      decisionsByStatus[obj.status].push(obj);
    }
  }

  return {
    topic: input.topic ?? null,
    analysisType,
    generatedAt: deps.clock.now().toISOString(),
    scope: { total: base.length, matched: matched.length },
    topTags: topCounts(
      matched.flatMap((obj) => obj.tags),
      10
    ),
    topFiles: topCounts(
      matched.flatMap((obj) => obj.related.files),
      10
    ).map(({ tag, count }) => ({
      file: tag,
      count,
    })),
    typeDistribution: topCounts(
      matched.map((obj) => obj.type),
      Math.max(matched.length, 1)
    ),
    stale,
    supersededDecisions: decisionsByStatus['superseded'] ?? [],
    conflicts: { statusConflicting, candidates },
    lowConfidenceActive,
    openBlockers,
    decisionsByStatus,
    lessonsTopTags: [],
    density: [],
    statusTally: [],
    truthRoleTally: [],
  };
}
