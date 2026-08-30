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

export interface SignalKeyCount {
  key: string;
  count: number;
}

/** Сводка сигнального лога Ф20; готовит вызывающий слой (CLI), use-case только passthrough+render. */
export interface SignalLogSummary {
  totalEvents: number;
  topKeys: SignalKeyCount[];
}

export interface InsightsInput {
  topic?: string; // undefined => весь проект
  analysisType?: AnalysisType; // default 'patterns'
  signalLog?: SignalLogSummary; // Ф20: densities/top-повторы без LLM (§8 п.1)
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
  signalLog?: SignalLogSummary; // passthrough из input
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

function mondayOf(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  const mondayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86_400_000;
  return new Date(mondayMs).toISOString().slice(0, 10);
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

  const currentMondayMs = Date.parse(`${mondayOf(deps.clock.now().toISOString())}T00:00:00Z`);
  const buckets = new Map<string, WeekBucket>();
  for (let i = 7; i >= 0; i--) {
    const key = new Date(currentMondayMs - i * 7 * 86_400_000).toISOString().slice(0, 10);
    buckets.set(key, { week: key, decisions: 0, lessons: 0, debug: 0, total: 0 });
  }
  for (const obj of matched) {
    const bucket = buckets.get(mondayOf(obj.created_at));
    if (!bucket) continue;
    if (obj.type === 'decision') bucket.decisions += 1;
    if (obj.type === 'lesson' || obj.type === 'observation') bucket.lessons += 1;
    if (obj.tags.some((tag) => DEBUG_TAGS.includes(tag))) bucket.debug += 1;
    bucket.total += 1;
  }

  const lessonsTopTags = topCounts(
    matched.filter((obj) => obj.type === 'lesson' || obj.type === 'observation').flatMap((obj) => obj.tags),
    5
  );
  const statusTally = topCounts(
    matched.map((obj) => obj.status),
    Math.max(matched.length, 1)
  );
  const truthRoleTally = topCounts(
    matched.map((obj) => obj.truth_role),
    Math.max(matched.length, 1)
  );

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
    lessonsTopTags,
    density: [...buckets.values()],
    statusTally,
    truthRoleTally,
    signalLog: input.signalLog,
  };
}

function section(lines: string[], title: string, items: string[]): void {
  lines.push('', `## ${title}`);
  if (items.length === 0) {
    lines.push('-');
  } else {
    for (const item of items) lines.push(item);
  }
}

export function renderInsights(report: InsightsReport): string {
  const lines: string[] = [];
  const topicLabel = report.topic ? `topic: ${report.topic}` : 'project-wide';
  lines.push(
    `Insights [${report.analysisType}] (${topicLabel}), matched ${report.scope.matched}/${report.scope.total} objects`
  );
  const roles = report.truthRoleTally.map((t) => `${t.tag} ${t.count}`).join(' / ');
  lines.push(`Scope: matched ${report.scope.matched}/${report.scope.total} objects, truth roles: ${roles || '-'}`);

  const fmtObj = (obj: MemoryObject): string => `- ${obj.id} [${obj.type}] ${obj.title}`;

  if (report.analysisType === 'patterns') {
    section(
      lines,
      'Top tags',
      report.topTags.map((t) => `- ${t.tag} (${t.count})`)
    );
    section(
      lines,
      'Frequent related.files',
      report.topFiles.map((f) => `- ${f.file} (${f.count})`)
    );
    section(
      lines,
      'Type distribution',
      report.typeDistribution.map((t) => `- ${t.tag} (${t.count})`)
    );
    if (report.signalLog) {
      section(lines, 'Signal log (Ф20)', [
        `events: ${report.signalLog.totalEvents}`,
        ...report.signalLog.topKeys.map((k) => `- ${k.key} (${k.count})`),
      ]);
    }
  }

  if (report.analysisType === 'technical_debt') {
    section(lines, 'Stale objects', report.stale.map(fmtObj));
    section(lines, 'Superseded decisions', report.supersededDecisions.map(fmtObj));
    section(lines, 'Low-confidence active', report.lowConfidenceActive.map(fmtObj));
    section(lines, 'Open blockers', report.openBlockers.map(fmtObj));
  }

  if (report.analysisType === 'decisions') {
    section(
      lines,
      'Decisions by status',
      Object.entries(report.decisionsByStatus).map(([status, objs]) => `- ${status}: ${objs.length}`)
    );
    section(lines, 'Potential conflicts', [
      ...report.conflicts.statusConflicting.map((obj) => `- ${fmtObj(obj)} (status: conflicting)`),
      ...report.conflicts.candidates.map((group) => {
        const shared = group[0].tags.find((tag) => group.every((o) => o.tags.includes(tag)));
        return `- potential conflict (shared tag: ${shared ?? '?'}): ${group.map((o) => o.id).join(', ')}`;
      }),
    ]);
    const recent = [...(report.decisionsByStatus['active'] ?? [])]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);
    section(lines, 'Recent decisions', recent.map(fmtObj));
  }

  if (report.analysisType === 'lessons') {
    const counts = report.typeDistribution.filter((t) => t.tag === 'lesson' || t.tag === 'observation');
    section(
      lines,
      'Lesson/Observation counts',
      counts.map((t) => `- ${t.tag}: ${t.count}`)
    );
    section(
      lines,
      'Stale lessons',
      report.stale.filter((obj) => obj.type === 'lesson' || obj.type === 'observation').map(fmtObj)
    );
    section(
      lines,
      'Top lesson tags',
      report.lessonsTopTags.map((t) => `- ${t.tag} (${t.count})`)
    );
  }

  if (report.analysisType === 'activity') {
    section(
      lines,
      'Weekly density',
      report.density.map(
        (b) => `- ${b.week}: ${b.decisions} decisions, ${b.lessons} lessons, ${b.debug} debug, ${b.total} total`
      )
    );
    section(
      lines,
      'Status tally',
      report.statusTally.map((t) => `- ${t.tag} (${t.count})`)
    );
  }

  lines.push('', `Generated: ${report.generatedAt}`);
  return lines.join('\n');
}
