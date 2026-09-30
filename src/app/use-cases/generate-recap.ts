import { MemoryStore } from '../../ports/memory-store.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { Relation } from '../../domain/schemas/relation-schema.js';
import type { RouterLogRow } from '../../domain/router-log.js';
import { BOOTSTRAP_THREAD_TITLE } from './bootstrap-project.js';
import { detectUnaggregatedLessons } from './detect-unaggregated-lessons.js';

/** Сигнал «онбординг не завершён» (спека onboarding-pipeline-v2 §3, D6/D8). */
export type OnboardingSignal = { kind: 'bootstrap' } | { kind: 'continue'; threadId: string };

/** P110: окно панели доставки в recap — 7 дней от «сейчас». */
const DELIVERY_WINDOW_MS = 7 * 86_400_000;

/** P110: панель наблюдаемости доставки по router.log (нет данных в окне → null, секция опускается). */
export interface RecapDelivery {
  deliveries: number;
  /** Промахи канона ⊆ доставок: hit-строки с variant === 'fallback'. */
  fallbacks: number;
  /** Топ-3 agentId по числу fallback-строк; сорт count убыв., потом агент. */
  topMissAgents: { agent: string; count: number }[];
}

export interface RecapReport {
  activeRules: MemoryObject[]; // active ∪ accepted (F11/D9)
  activeWorkThreads: MemoryObject[];
  openBlockers: MemoryObject[];
  openQuestions: MemoryObject[];
  openInfoRequests: MemoryObject[];
  recentDecisions: MemoryObject[]; // top 5 по updated_at (убывание)
  onboarding: OnboardingSignal | null;
  delivery: RecapDelivery | null;
  /** 2.14 §6.3: resolved-жалобы без ребра исхода; null = relations не передан (секция опускается). */
  complaintsWithoutOutcome: number | null;
  /** 2.14 §7.2/§7.4: агрегация уроков; null = relations не передан (секция опускается). */
  stewardAggregation: { unaggregatedTotal: number; unaggregatedMature: number; proposedAggregates: number } | null;
}

/**
 * Правила вывода секции Onboarding (§3):
 * 1. bootstrap-thread active → продолжение-сигнал (покрывает legacy без init-report);
 * 2. иначе init-report (теги wolf-init + onboarding-v2, active) есть, а thread
 *    отсутствует вовсе → bootstrap-сигнал; thread paused — тишина (Q4);
 * 3. иначе (нет ни того ни другого; thread completed/archived/paused) — null.
 */
function detectOnboarding(all: MemoryObject[]): OnboardingSignal | null {
  // wave13-a: work-thread → thread (alias-чтение отдаёт старые как thread);
  // report → note+facet history
  const thread = all.find((o) => o.type === 'thread' && o.title === BOOTSTRAP_THREAD_TITLE);
  if (thread) {
    return thread.status === 'active' ? { kind: 'continue', threadId: thread.id } : null;
  }
  const hasInitReport = all.some(
    (o) =>
      o.type === 'note' && o.status === 'active' && o.tags.includes('wolf-init') && o.tags.includes('onboarding-v2')
  );
  return hasInitReport ? { kind: 'bootstrap' } : null;
}

/** P110: доставки за 7 дней по router.log; NaN-ts — пропуск (fail-safe), пустое окно → null. */
function buildDeliveryStats(rows: RouterLogRow[] | undefined, nowMs: number): RecapDelivery | null {
  if (rows === undefined) return null;
  const inWindow = rows.filter((r) => {
    const ts = Date.parse(r.ts);
    return !Number.isNaN(ts) && ts >= nowMs - DELIVERY_WINDOW_MS;
  });
  if (inWindow.length === 0) return null;
  const hits = inWindow.filter((r) => r.hit);
  const byAgent = new Map<string, number>();
  for (const r of hits) {
    if (r.variant === 'fallback') byAgent.set(r.agentId, (byAgent.get(r.agentId) ?? 0) + 1);
  }
  return {
    deliveries: hits.length,
    fallbacks: [...byAgent.values()].reduce((n, c) => n + c, 0),
    topMissAgents: [...byAgent.entries()]
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count || a.agent.localeCompare(b.agent))
      .slice(0, 3),
  };
}

/**
 * 2.14 §6.3: счётчик «жалоб без исхода» — resolved-объекты типа complaint,
 * у которых нет ребра исхода. Множество «имеющих исход» собирается по ОБЕИМ
 * сторонам пары: outcome → subject, outcome_of → object (removed-строки уже
 * отфильтрованы адаптером). 2.14 §7.2: rows читаются один раз на отчёт и
 * передаются сюда готовыми — IO не дублируется.
 */
function countComplaintsWithoutOutcome(rows: Relation[] | undefined, all: MemoryObject[]): number | null {
  if (rows === undefined) return null;
  const withOutcome = new Set<string>();
  for (const r of rows) {
    if (r.predicate === 'outcome') withOutcome.add(r.subject);
    else if (r.predicate === 'outcome_of') withOutcome.add(r.object);
  }
  return all.filter((o) => o.type === 'complaint' && o.status === 'resolved' && !withOutcome.has(o.id)).length;
}

/** 2.14 §7.4: proposed-агрегаты — lesson в proposed с ≥1 живым ребром aggregates от себя. */
function countProposedAggregates(all: MemoryObject[], rows: Relation[]): number {
  const proposers = new Set(rows.filter((r) => r.predicate === 'aggregates').map((r) => r.subject));
  return all.filter((o) => o.type === 'lesson' && o.status === 'proposed' && proposers.has(o.id)).length;
}

export async function generateRecap(deps: {
  store: MemoryStore;
  routerLogRows?: RouterLogRow[];
  relations?: RelationLog;
}): Promise<RecapReport> {
  // ponytail: store.list() — полный reparse всех md (V6); ровно один вызов на отчёт (D1)
  const all = await deps.store.list();

  // 2.14 §7.2: одно чтение relations на отчёт — rows кормят и контур поправок
  // (§6.3), и стюард-агрегацию; relations не передан → обе секции опускаются
  const relationRows = deps.relations ? await deps.relations.list() : undefined;
  let stewardAggregation: RecapReport['stewardAggregation'] = null;
  if (relationRows !== undefined) {
    const detect = detectUnaggregatedLessons(all, relationRows, new Date(Date.now()));
    stewardAggregation = {
      unaggregatedTotal: detect.total,
      unaggregatedMature: detect.mature,
      proposedAggregates: countProposedAggregates(all, relationRows),
    };
  }

  // wave13-a §5.4: open-question/info-request/blocker поглощены note+фасетами.
  // Вопросы: note+context БЕЗ поля question (статус open; active — только legacy
  // с alias_origin 'open-question'; скан-объекты отсекаются по source.kind=scan).
  // Info-запросы (старые и новые): note с полем question в статусе open.
  // Блокеры: note+pitfall в active. Треды: type thread (alias-чтение старых).
  const isNote = (o: MemoryObject, facet: string): boolean =>
    o.type === 'note' && (o as { facet?: string }).facet === facet;
  const openQuestions = all.filter((obj) => {
    if (!isNote(obj, 'context') && (obj as { alias_origin?: string }).alias_origin !== 'open-question') return false;
    if (obj.source?.kind === 'scan') return false;
    if (typeof (obj as { question?: unknown }).question === 'string') return false;
    return (
      obj.status === 'open' ||
      (obj.status === 'active' && (obj as { alias_origin?: string }).alias_origin === 'open-question')
    );
  });

  return {
    activeRules: all.filter((obj) => obj.type === 'rule' && (obj.status === 'active' || obj.status === 'accepted')),
    activeWorkThreads: all.filter((obj) => obj.type === 'thread' && obj.status === 'active'),
    openBlockers: all.filter((obj) => isNote(obj, 'pitfall') && obj.status === 'active'),
    openQuestions,
    openInfoRequests: all.filter(
      (obj) =>
        obj.type === 'note' && typeof (obj as { question?: unknown }).question === 'string' && obj.status === 'open'
    ),
    recentDecisions: all
      .filter((obj) => obj.type === 'decision' && obj.status === 'active')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5),
    onboarding: detectOnboarding(all),
    delivery: buildDeliveryStats(deps.routerLogRows, Date.now()),
    complaintsWithoutOutcome: countComplaintsWithoutOutcome(relationRows, all),
    stewardAggregation,
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
      'Onboarding v2: init done, bootstrap not yet. Ask the user: offer to run ' +
      '`wolf bootstrap` (can be executed right in the session: `wolf bootstrap`; in the Wolf dogfood repo — ' +
      '`node dist/bootstrap/cli.js bootstrap`) or follow the user’s path. ' +
      'Actions with side effects — only with the user’s consent.'
    );
  }
  return (
    'Onboarding v2: bootstrap done, onboarding not finished (thread active). Work under the user’s ' +
    'direction — collapsing drafts, deep project study — as the user decides; no prescribed ' +
    `roles. When onboarding is finished — offer to close the thread (\`wolf transition ${signal.threadId} ` +
    'completed`) and close it with the user’s consent.'
  );
}

export function renderRecap(report: RecapReport): string {
  const fmtObj = (obj: MemoryObject): string => `- ${obj.id} [${obj.type}] ${obj.title}`;
  const lines: string[] = ['Recap'];

  if (report.onboarding !== null) {
    section(lines, 'Onboarding', [onboardingText(report.onboarding)]);
  }

  // P110: панель доставки — после Onboarding, до Active rules; тело строки русское (Т3)
  if (report.delivery !== null) {
    const d = report.delivery;
    let line = `доставок ${d.deliveries}, промахов ${d.fallbacks}`;
    if (d.topMissAgents.length > 0) {
      line += `, топ промахов: ${d.topMissAgents.map((a) => `${a.agent} (×${a.count})`).join(', ')}`;
    }
    section(lines, 'Delivery (7d)', [line]);
  }

  section(lines, 'Active rules', report.activeRules.map(fmtObj));
  section(lines, 'Active work threads', report.activeWorkThreads.map(fmtObj));
  section(lines, 'Open blockers', report.openBlockers.map(fmtObj));
  section(lines, 'Open questions', report.openQuestions.map(fmtObj));
  section(lines, 'Open info requests', report.openInfoRequests.map(fmtObj));
  // 2.14 §6.3: контур поправок — после Open info requests, до Recent decisions
  if (report.complaintsWithoutOutcome !== null) {
    section(lines, 'Контур поправок', [`жалоб без исхода: ${report.complaintsWithoutOutcome}`]);
  }
  // 2.14 §7.4: стюард-агрегация — после контура поправок, до Recent decisions;
  // строки — контракт для рамок (§7.1), дословно; пусто → секция целиком опускается
  if (report.stewardAggregation !== null) {
    const s = report.stewardAggregation;
    const items: string[] = [];
    if (s.unaggregatedMature >= 1) {
      items.push(
        `неагрегированных уроков: ${s.unaggregatedTotal} (зрелых: ${s.unaggregatedMature}) — ` +
          'вызовите Стюарда: opencode run --agent steward'
      );
    }
    if (s.proposedAggregates >= 1) {
      items.push(`предложенных агрегатов: ${s.proposedAggregates} — wolf aggregate apply <id> для подтверждения`);
    }
    if (items.length > 0) section(lines, 'Стюард: агрегация', items);
  }
  section(lines, 'Recent decisions', report.recentDecisions.map(fmtObj));

  return lines.join('\n');
}
