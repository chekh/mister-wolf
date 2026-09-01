import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { BOOTSTRAP_THREAD_TITLE } from './bootstrap-project.js';

/** Сигнал «онбординг не завершён» (спека onboarding-pipeline-v2 §3, D6/D8). */
export type OnboardingSignal = { kind: 'bootstrap' } | { kind: 'continue'; threadId: string };

export interface RecapReport {
  activeRules: MemoryObject[]; // active ∪ accepted (F11/D9)
  activeWorkThreads: MemoryObject[];
  openBlockers: MemoryObject[];
  openQuestions: MemoryObject[];
  openInfoRequests: MemoryObject[];
  recentDecisions: MemoryObject[]; // top 5 по updated_at (убывание)
  onboarding: OnboardingSignal | null;
}

/**
 * Правила вывода секции Onboarding (§3):
 * 1. bootstrap-thread active → продолжение-сигнал (покрывает legacy без init-report);
 * 2. иначе init-report (теги wolf-init + onboarding-v2, active) есть, а thread
 *    отсутствует вовсе → bootstrap-сигнал; thread paused — тишина (Q4);
 * 3. иначе (нет ни того ни другого; thread completed/archived/paused) — null.
 */
function detectOnboarding(all: MemoryObject[]): OnboardingSignal | null {
  const thread = all.find((o) => o.type === 'work-thread' && o.title === BOOTSTRAP_THREAD_TITLE);
  if (thread) {
    return thread.status === 'active' ? { kind: 'continue', threadId: thread.id } : null;
  }
  const hasInitReport = all.some(
    (o) =>
      o.type === 'report' && o.status === 'active' && o.tags.includes('wolf-init') && o.tags.includes('onboarding-v2')
  );
  return hasInitReport ? { kind: 'bootstrap' } : null;
}

export async function generateRecap(deps: { store: MemoryStore }): Promise<RecapReport> {
  // ponytail: store.list() — полный reparse всех md (V6); ровно один вызов на отчёт (D1)
  const all = await deps.store.list();

  // Вопросы живут в 'open' (defaultStatus) или 'active' (созданные до введения defaultStatus)
  const openQuestions = all.filter(
    (obj) => obj.type === 'open-question' && (obj.status === 'open' || obj.status === 'active')
  );

  return {
    activeRules: all.filter((obj) => obj.type === 'rule' && (obj.status === 'active' || obj.status === 'accepted')),
    activeWorkThreads: all.filter((obj) => obj.type === 'work-thread' && obj.status === 'active'),
    openBlockers: all.filter((obj) => obj.type === 'blocker' && obj.status === 'active'),
    openQuestions,
    openInfoRequests: all.filter((obj) => obj.type === 'info-request' && obj.status === 'open'),
    recentDecisions: all
      .filter((obj) => obj.type === 'decision' && obj.status === 'active')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5),
    onboarding: detectOnboarding(all),
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

/** Тексты секции — контракт для рамки mr-wolf (§6.2), дословно. */
function onboardingText(signal: OnboardingSignal): string {
  if (signal.kind === 'bootstrap') {
    return (
      'Onboarding v2: init выполнен, bootstrap — нет. Уточни у пользователя: предложить выполнить ' +
      '`wolf bootstrap` (можно исполнить прямо в сессии: `wolf bootstrap`; в dogfood-репо Wolf — ' +
      '`node dist/bootstrap/cli.js bootstrap`) или следовать пути пользователя. ' +
      'Действия с побочными эффектами — только с согласия пользователя.'
    );
  }
  return (
    'Onboarding v2: bootstrap выполнен, онбординг не завершён (thread active). Работай под управлением ' +
    'пользователя — свёртка черновиков, глубокое изучение проекта — как решит пользователь; предписанных ' +
    `ролей нет. Когда онбординг завершён — предложи закрыть thread (\`wolf transition ${signal.threadId} ` +
    'completed`) и закрой с согласия пользователя.'
  );
}

export function renderRecap(report: RecapReport): string {
  const fmtObj = (obj: MemoryObject): string => `- ${obj.id} [${obj.type}] ${obj.title}`;
  const lines: string[] = ['Recap'];

  if (report.onboarding !== null) {
    section(lines, 'Onboarding', [onboardingText(report.onboarding)]);
  }

  section(lines, 'Active rules', report.activeRules.map(fmtObj));
  section(lines, 'Active work threads', report.activeWorkThreads.map(fmtObj));
  section(lines, 'Open blockers', report.openBlockers.map(fmtObj));
  section(lines, 'Open questions', report.openQuestions.map(fmtObj));
  section(lines, 'Open info requests', report.openInfoRequests.map(fmtObj));
  section(lines, 'Recent decisions', report.recentDecisions.map(fmtObj));

  return lines.join('\n');
}
