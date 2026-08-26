import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export interface RecapReport {
  activeRules: MemoryObject[];
  activeWorkThreads: MemoryObject[];
  openBlockers: MemoryObject[];
  openQuestions: MemoryObject[];
  openInfoRequests: MemoryObject[];
  recentDecisions: MemoryObject[]; // top 5 по updated_at (убывание)
}

export async function generateRecap(deps: { store: MemoryStore }): Promise<RecapReport> {
  // ponytail: store.list() — полный reparse всех md (V6); ровно один вызов на отчёт (D1)
  const all = await deps.store.list();

  // Вопросы живут в 'open' (defaultStatus) или 'active' (созданные до введения defaultStatus)
  const openQuestions = all.filter(
    (obj) => obj.type === 'open-question' && (obj.status === 'open' || obj.status === 'active')
  );

  return {
    activeRules: all.filter((obj) => obj.type === 'rule' && obj.status === 'active'),
    activeWorkThreads: all.filter((obj) => obj.type === 'work-thread' && obj.status === 'active'),
    openBlockers: all.filter((obj) => obj.type === 'blocker' && obj.status === 'active'),
    openQuestions,
    openInfoRequests: all.filter((obj) => obj.type === 'info-request' && obj.status === 'open'),
    recentDecisions: all
      .filter((obj) => obj.type === 'decision' && obj.status === 'active')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5),
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

export function renderRecap(report: RecapReport): string {
  const fmtObj = (obj: MemoryObject): string => `- ${obj.id} [${obj.type}] ${obj.title}`;
  const lines: string[] = ['Recap'];

  section(lines, 'Active rules', report.activeRules.map(fmtObj));
  section(lines, 'Active work threads', report.activeWorkThreads.map(fmtObj));
  section(lines, 'Open blockers', report.openBlockers.map(fmtObj));
  section(lines, 'Open questions', report.openQuestions.map(fmtObj));
  section(lines, 'Open info requests', report.openInfoRequests.map(fmtObj));
  section(lines, 'Recent decisions', report.recentDecisions.map(fmtObj));

  return lines.join('\n');
}
