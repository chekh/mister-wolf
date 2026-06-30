import { MemoryStore } from '../../ports/memory-store.port.js';
import { WorkThread } from '../../domain/schemas/thread-schema.js';
import { InfoRequest } from '../../domain/schemas/info-request-schema.js';
import { Article } from '../../domain/schemas/article-schema.js';
import { Decision } from '../../domain/schemas/decision-schema.js';
import { Blocker } from '../../domain/schemas/blocker-schema.js';

export interface ThreadBrief {
  thread: WorkThread;
  openInfoRequests: InfoRequest[];
  answeredInfoRequests: InfoRequest[];
  articles: Article[];
  decisions: Decision[];
  blockers: Blocker[];
  rendered: string;
}

export async function getThreadBrief(deps: { store: MemoryStore }, threadId: string): Promise<ThreadBrief> {
  const all = await deps.store.list();
  const thread = all.find((o) => o.id === threadId && o.type === 'work-thread') as WorkThread | undefined;
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  const requests = all.filter(
    (o) => o.type === 'info-request' && (o as InfoRequest).thread === threadId
  ) as InfoRequest[];
  const articles = all.filter((o) => o.type === 'article' && (o as Article).thread === threadId) as Article[];
  const decisions = all.filter(
    (o) => o.type === 'decision' && (o as Decision).thread === threadId
  ) as Decision[];
  const blockers = all.filter(
    (o) => o.type === 'blocker' && (o as Blocker).thread === threadId
  ) as Blocker[];

  const openInfoRequests = requests.filter((r) => r.status === 'open');
  const answeredInfoRequests = requests.filter((r) => r.status === 'answered' || r.status === 'archived');

  const rendered = renderBrief(thread, openInfoRequests, answeredInfoRequests, articles, decisions, blockers);

  return {
    thread,
    openInfoRequests,
    answeredInfoRequests,
    articles,
    decisions,
    blockers,
    rendered,
  };
}

function renderBrief(
  thread: WorkThread,
  openInfoRequests: InfoRequest[],
  answeredInfoRequests: InfoRequest[],
  articles: Article[],
  decisions: Decision[],
  blockers: Blocker[]
): string {
  const lines: string[] = [
    `# Thread: ${thread.title}`,
    '',
    '## Goal',
    thread.goal,
    '',
    '## Current State',
    thread.current_state || '_No current state._',
    '',
    '## Next Steps',
    ...(thread.next_steps.length > 0 ? thread.next_steps.map((s) => `- ${s}`) : ['_No next steps._']),
    '',
    '## Open Info Requests',
  ];

  for (const req of openInfoRequests) {
    lines.push(`- [${req.id}] ${req.title}`);
    lines.push(`  ${req.question}`);
  }
  if (openInfoRequests.length === 0) lines.push('_No open info requests._');

  lines.push('', '## Articles');
  for (const article of articles) {
    lines.push(`- [${article.id}] ${article.title}`);
    lines.push(`  ${article.summary}`);
  }
  if (articles.length === 0) lines.push('_No articles._');

  lines.push('', '## Decisions');
  for (const decision of decisions) {
    lines.push(`- [${decision.id}] ${decision.title}`);
  }
  if (decisions.length === 0) lines.push('_No decisions._');

  lines.push('', '## Blockers');
  for (const blocker of blockers) {
    lines.push(`- [${blocker.id}] ${blocker.title}`);
    lines.push(`  ${blocker.impact}`);
  }
  if (blockers.length === 0) lines.push('_No blockers._');

  lines.push('', '## Answered Info Requests');
  for (const req of answeredInfoRequests) {
    lines.push(`- [${req.id}] ${req.title}`);
  }
  if (answeredInfoRequests.length === 0) lines.push('_No answered info requests._');

  return lines.join('\n');
}
