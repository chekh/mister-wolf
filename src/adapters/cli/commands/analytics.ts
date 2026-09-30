import { Command, Option } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeCwd } from '../cli-entry.js';
import { readSignalLog } from '../../fs/session-metrics-log.js';
import { loadWolfConfigSync } from '../../fs/config-file.js';
import {
  buildAnalyticsReport,
  buildEffectivenessReport,
  filterAnalytics,
  parseSkillInvocations,
  resolveThresholds,
  type AnalyticsInput,
  type AnalyticsReport,
  type AnalyticsViewFilter,
  type EffectivenessReport,
} from '../../../app/use-cases/build-analytics.js';
import { computeSnapshotDelta, type DeltaRow } from '../../../app/use-cases/snapshot-delta.js';
import { appendSnapshot, readSnapshots, type SnapshotEntry } from '../../fs/effectiveness-snapshots.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { parseRouterLog } from '../../../domain/router-log.js';
import { renderTable } from './table-render.js';

/**
 * §6.2 спеки аналитики + §6.5 спеки CLI-diet (P221): `wolf analytics` — окно
 * состояния «все числа»: выборки Стюарда с фильтрами + effectiveness/dashboard.
 * Фильтры class/type/origin/agent/silent/top применяются ВНУТРИ filterAnalytics —
 * CLI только парсит аргументы. `--json` — машинный вывод (дефолт для агентов),
 * иначе текстовые таблицы по секциям (общий Unicode-генератор — DRY).
 * baseDir инъектится для тестов (прецедент: memory-effectiveness.ts).
 */

type AnalyticsView =
  | 'memory'
  | 'tools'
  | 'rules'
  | 'weeklyActivity'
  | 'agents'
  | 'steward'
  | 'outliers'
  | 'readiness'
  | 'councils'
  | 'coordination'
  | 'campaign'
  | 'delivery'
  | 'acceptance'
  | 'effectiveness'
  | 'dashboard'
  | 'all';
type SectionView = Exclude<AnalyticsView, 'all' | 'effectiveness' | 'dashboard'>;

const SECTION_VIEWS: SectionView[] = [
  'memory',
  'tools',
  'rules',
  'weeklyActivity',
  'agents',
  'steward',
  'outliers',
  'readiness',
  'councils',
  'coordination',
  'campaign',
  'delivery',
  'acceptance',
];

/** null/undefined → '-', остальное — строкой (колонки с nullable-полей). */
function cell(v: unknown): string {
  return v === null || v === undefined ? '-' : String(v);
}

/** Записи голосов Record<string,number>: count убыв., затем ключ по алфавиту. */
function voteEntries(v: Record<string, number>): [string, number][] {
  return Object.entries(v).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Фильтр секции: AnalyticsViewFilter с view конкретной секции (без 'all'). */
export type SectionViewFilter = AnalyticsViewFilter & { view: SectionView };

/** Одна секция текстового рендера: `== <view> ==` + таблица/строки; фильтры применяет filterAnalytics. */
export function renderSection(report: AnalyticsReport, filter: SectionViewFilter): string {
  const payload = filterAnalytics(report, filter);
  // D1/D8: единственный view с человекочитаемым заголовком (не camelCase-идентификатор)
  const title = filter.view === 'weeklyActivity' ? 'Weekly activity' : filter.view;
  const header = `== ${title} ==`;
  switch (payload.view) {
    case 'memory': {
      const rows = payload.rows.map((r) => [
        r.id,
        r.type,
        r.lifecycle,
        cell(r.age_days),
        cell(r.deliveries),
        cell(r.triggers),
        cell(r.complaints),
        cell(r.last_used),
      ]);
      const garbage = payload.garbage.ratioPct === null ? 'n/a' : `${payload.garbage.ratioPct.toFixed(1)}%`;
      // P2 D4: воронка added→applied (added — объекты store, events '-') + атрибуция
      const funnelRows = [
        ['added', '-', cell(payload.funnel.added)] as string[],
        ...(['retrieved', 'injected', 'cited', 'applied'] as const).map((stage) => [
          stage,
          cell(payload.funnel[stage].events),
          cell(payload.funnel[stage].uniqueIds),
        ]),
      ];
      const a = payload.attribution;
      const attribution =
        a.attributionCoveragePct === null
          ? `attribution: n/a (${a.reason})`
          : `attribution: accepted ${a.acceptedWithInjection}/${a.acceptedTotal} (${a.attributionCoveragePct.toFixed(1)}%)`;
      // P3 D3: per-memory ROI — корреляционная витрина (дисклеймер обязателен);
      // срез по --top того же фильтра, дефолт 20 — как у строк реестра памяти
      const roiLines =
        payload.roi.rows.length === 0
          ? ['memory ROI (correlational, not causal): no data']
          : [
              'memory ROI (correlational, not causal):',
              renderTable(
                ['id', 'assoc_accepted', 'assoc_applied', 'injected_total', 'last_activity'],
                payload.roi.rows
                  .slice(0, filter.top ?? 20)
                  .map((r) => [
                    r.id,
                    cell(r.associatedAccepted),
                    cell(r.associatedApplied),
                    cell(r.injectedTotal),
                    cell(r.lastActivity),
                  ])
              ),
            ];
      return [
        header,
        renderTable(['id', 'type', 'lifecycle', 'age_days', 'deliveries', 'triggers', 'complaints', 'last_used'], rows),
        `garbage: dead/base = ${payload.garbage.dead}/${payload.garbage.base} = ${garbage}`,
        renderTable(['stage', 'events', 'unique_ids'], funnelRows),
        attribution,
        ...roiLines,
      ].join('\n');
    }
    case 'tools': {
      const rows = payload.rows.map((r) => [
        r.name,
        r.origin,
        cell(r.status),
        cell(r.usageCount),
        cell(r.errorCount),
        cell(r.promotion),
      ]);
      return [header, renderTable(['name', 'origin', 'status', 'usage', 'errors', 'promotion'], rows)].join('\n');
    }
    case 'rules': {
      const rows = payload.rows.map((r) => [
        r.id,
        cell(r.prevented),
        cell(r.checked),
        r.silent ? 'yes' : 'no',
        r.title,
      ]);
      return [header, renderTable(['id', 'prevented', 'checked', 'silent', 'title'], rows)].join('\n');
    }
    case 'weeklyActivity': {
      // D1: текст без колонок конверсии; проценты остаются только в JSON (WeeklyActivityWeek)
      const rows = payload.weeks.map((r) => [r.week, cell(r.writes), cell(r.delivers), cell(r.triggers)]);
      return [header, renderTable(['week', 'writes', 'delivers', 'triggers'], rows)].join('\n');
    }
    case 'agents': {
      const rows = payload.rows.map((r) => [
        r.agent,
        cell(r.runs),
        cell(r.weighted),
        cell(r.avgDurationMs),
        cell(r.processFailureRatePct === null ? null : r.processFailureRatePct.toFixed(1)),
        cell(r.completedRuns),
        cell(r.accepted),
        `${r.complaintsBy}/${r.complaintsAbout}`,
        cell(r.holdoutPrevented),
      ]);
      return [
        header,
        renderTable(
          ['agent', 'runs', 'weighted', 'avg_ms', 'pfail_%', 'completed', 'accepted', 'compl by/about', 'prevented'],
          rows
        ),
      ].join('\n');
    }
    case 'steward': {
      const lines = [
        header,
        'mutations:',
        renderTable(
          ['kind', 'count'],
          payload.steward.mutations.map((m) => [m.kind, cell(m.count)])
        ),
        'mutations by week:',
        renderTable(
          ['week', 'total'],
          payload.steward.mutationsByWeek.map((w) => [w.week, cell(w.total)])
        ),
        'complaint funnel:',
        `  filed: ${cell(payload.steward.complaintFunnel.filed)}`,
        `  resolved: ${cell(payload.steward.complaintFunnel.resolved)}`,
        `  rejected: ${cell(payload.steward.complaintFunnel.rejected)}`,
        `  avg lifetime: ${cell(
          payload.steward.complaintFunnel.avgLifetimeHours === null
            ? null
            : payload.steward.complaintFunnel.avgLifetimeHours.toFixed(1) + 'h'
        )}`,
        `  sla escalations (dispatch_ages>=3): ${cell(payload.steward.complaintFunnel.slaEscalations)}`,
      ];
      const autoShare =
        payload.steward.autoMutationSharePct === null ? 'n/a' : `${payload.steward.autoMutationSharePct.toFixed(1)}%`;
      lines.push(
        `recidivism: ${cell(payload.steward.recidivismCount)} | churn: ${cell(
          payload.steward.churnIds.length
        )} | autoShare: ${autoShare}`
      );
      // 2.14 §7.4: затухание класса агрегатов (метрика Т5); сноска об эвристике
      // класса обязательна (решение ревью спеки Р3 — ограничение честно отражено)
      if (payload.steward.aggregationDecay.length > 0) {
        lines.push(
          'aggregation decay (7d before / after):',
          renderTable(
            ['aggregate', 'src', 'lessons -/+7d', 'complaints -/+7d'],
            payload.steward.aggregationDecay.map((a) => [
              a.aggregateId,
              cell(a.sources),
              `${a.lessonsBefore} / ${a.lessonsAfter}`,
              `${a.complaintsBefore} / ${a.complaintsAfter}`,
            ])
          ),
          'note: class = free-tag heuristic (>=1 shared tag); upgrade path — pattern_key'
        );
      }
      return lines.join('\n');
    }
    case 'outliers': {
      const rows = payload.runs.map((r) => [
        cell(r.ts),
        cell(r.model),
        cell(r.weighted),
        cell(r.costUsd === null ? null : `$${r.costUsd}`),
        cell(r.title),
      ]);
      return [header, renderTable(['ts', 'model', 'weighted', 'cost', 'title'], rows)].join('\n');
    }
    case 'readiness': {
      const share = payload.readiness.withArmPct === null ? 'n/a' : `${payload.readiness.withArmPct.toFixed(1)}%`;
      const arms = payload.readiness.byArm.map((a) => `${a.arm}=${a.runs}`).join(' ');
      const experiments = payload.readiness.byExperiment.map((e) => `${e.experiment}:${e.runs}`).join(' ');
      return [
        header,
        `runs: total=${payload.readiness.totalRuns} withArm=${payload.readiness.withArm} share=${share}`,
        `arms: ${arms || '-'} | experiments: ${experiments || '-'}`,
      ].join('\n');
    }
    case 'councils': {
      const c = payload.councils;
      // per-question статистика: null (0 вопросов) → n/a; avg — одна десятичная
      const pq = (v: number | null): string => (v === null ? 'n/a' : String(v));
      const avg = c.opinions.perQuestionAvg;
      const perQuestion = `${pq(c.opinions.perQuestionMin)}/${avg === null ? 'n/a' : avg.toFixed(1)}/${pq(c.opinions.perQuestionMax)}`;
      const share = c.synthesis.sharePct === null ? 'n/a' : `${c.synthesis.sharePct.toFixed(1)}%`;
      const median = c.synthesis.medianHours === null ? '-' : `${c.synthesis.medianHours.toFixed(1)}h`;
      // компактный расклад голосов вопроса: `за=2, нет=1`; пустой → '-'
      const compactVotes = (v: Record<string, number>): string =>
        voteEntries(v)
          .map(([k, n]) => `${k}=${n}`)
          .join(', ') || '-';
      return [
        header,
        `questions: total=${c.questions.total} inWindow=${c.questions.inWindow} open=${c.questions.open}`,
        `opinions: total=${c.opinions.total} per-question min/avg/max = ${perQuestion}`,
        'participation:',
        renderTable(
          ['agent', 'opinions'],
          c.participation.map((p) => [p.agent, cell(p.opinions)])
        ),
        'votes:',
        renderTable(
          ['vote', 'count'],
          voteEntries(c.votes).map(([vote, count]) => [vote, cell(count)])
        ),
        `synthesis: questions=${c.synthesis.questionsWithSynthesis}/${c.questions.total} (${share}) median question->synthesis=${median}`,
        'weeks:',
        renderTable(
          ['week', 'questions', 'opinions', 'syntheses'],
          c.weeks.map((w) => [w.week, cell(w.questions), cell(w.opinions), cell(w.syntheses)])
        ),
        'open questions:',
        renderTable(
          ['id', 'days_open', 'opinions', 'votes'],
          c.openQuestions.map((q) => [q.id, cell(q.daysOpen), cell(q.opinions), compactVotes(q.votes)])
        ),
      ].join('\n');
    }
    case 'coordination': {
      // P2 D5: counts (kind × from), последние 20 событий, blocker-пары ref → resolved
      const cd = payload.coordination;
      return [
        header,
        'counts:',
        renderTable(
          ['kind', 'from', 'count'],
          cd.counts.map((c) => [c.kind, c.actorFrom, cell(c.count)])
        ),
        'recent:',
        renderTable(
          ['ts', 'kind', 'from->to', 'refs'],
          cd.recent.map((e) => [e.ts, e.kind, e.to === null ? e.from : `${e.from}->${e.to}`, e.refs.join(',')])
        ),
        'blockers:',
        renderTable(
          ['ref', 'opened', 'resolved'],
          cd.blockers.map((b) => [b.ref, b.openedAt, cell(b.resolvedAt)])
        ),
      ].join('\n');
    }
    case 'campaign': {
      // P3 D2: кампания — ДВЕ строки (когорты with/no memory); null-метрики → n/a,
      // note — честные причины (малая выборка / нет вердиктов)
      if (payload.campaign.rows.length === 0) return [header, 'no campaigns yet'].join('\n');
      const na = (v: number | null): string => (v === null ? 'n/a' : String(v));
      const pct = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(1));
      const rows = payload.campaign.rows.flatMap((r) =>
        [r.withMemory, r.noMemory].map((c) => [
          r.campaign,
          c.cohort,
          cell(c.n),
          na(c.medianWeighted),
          pct(c.acceptedSharePct),
          pct(c.processFailureRatePct),
          c.reason ?? (r.hasVerdicts ? '' : 'no verdicts'),
        ])
      );
      return [
        header,
        renderTable(['campaign', 'cohort', 'n', 'median_weighted', 'accepted_%', 'pfail_%', 'note'], rows),
      ].join('\n');
    }
    case 'delivery': {
      // P110: панель наблюдаемости доставки — applied-join, miss-rate, байты/латентность, skills
      const d = payload.delivery;
      const pct = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(1));
      const int = (v: number | null): string => (v === null ? 'n/a' : String(Math.round(v)));
      return [
        header,
        'top delivered:',
        renderTable(
          ['name', 'deliveries', 'applied', 'applied_%'],
          d.topDelivered.map((r) => [r.name, cell(r.deliveries), cell(r.applied), pct(r.appliedPct)])
        ),
        `highlight (deliveries>=10, applied<10%): ${d.underApplied.join(', ') || '-'}`,
        'miss-rate by agent:',
        renderTable(
          ['agent', 'fallbacks', 'total', 'miss_%'],
          d.missRateByAgent.map((r) => [r.agent, cell(r.fallbacks), cell(r.total), pct(r.missRatePct)])
        ),
        `avg injection bytes: delivery_signals=${int(d.avgInjectionBytes.deliverySignals)} router_log=${int(
          d.avgInjectionBytes.routerLog
        )}`,
        `router resolve ms: p50=${int(d.routerMs.p50)} p90=${int(d.routerMs.p90)} (n=${d.routerMs.count})`,
        'skills:',
        renderTable(
          ['skill', 'count'],
          d.skills.map((r) => [r.skill, cell(r.count)])
        ),
      ].join('\n');
    }
    case 'acceptance': {
      // T003: машинная приёмка волн 1–3 — router miss-rate, mcp_call latency/errors,
      // burst'ы delivery, search->get follow, vitality; null-метрики → n/a
      const a = payload.acceptance;
      const pct = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(1));
      const num = (v: number | null): string => (v === null ? 'n/a' : String(v));
      return [
        header,
        'router:',
        renderTable(
          ['agent', 'hits', 'misses', 'miss_%'],
          a.router.rows.map((r) => [r.agent, cell(r.hits), cell(r.misses), pct(r.missRatePct)])
        ),
        'tool calls:',
        renderTable(
          ['tool', 'calls', 'errors', 'err_%', 'p50_ms', 'p90_ms'],
          a.toolCalls.map((r) => [
            r.tool,
            cell(r.calls),
            cell(r.errors),
            pct(r.errorRatePct),
            cell(r.p50Ms),
            cell(r.p90Ms),
          ])
        ),
        'error classes:',
        renderTable(
          ['class', 'count'],
          a.errorClasses.map((r) => [r.id, cell(r.count)])
        ),
        `bursts: ${a.bursts.bursts} (deliveries ${a.bursts.deliveries}, avg/burst ${num(
          a.bursts.avgDeliveriesPerBurst
        )}, max repeat-streak ${num(a.bursts.maxRepeatStreak)}, streak<=2 ${pct(
          a.bursts.repeatStreakLe2SharePct
        )}%, no-session ${a.bursts.withoutSession})`,
        `search->get follow: ${a.searchFollow.followed}/${a.searchFollow.searches} (${pct(
          a.searchFollow.followRatePct
        )}%)`,
        `vitality: core calls 72h = ${a.vitality.coreCalls72h}`,
      ].join('\n');
    }
    default:
      // 'all' обрабатывается вызывающим кодом до renderSection; ветка закрывает switch (TS2366)
      throw new Error(`renderSection: unexpected view ${String((payload as { view: string }).view)}`);
  }
}

/** D5: строка coverage — только при runs>0 и <100% (полный/нулевой coverage не шумит). */
export function coverageLine(c: AnalyticsReport['coverage']): string | null {
  if (!(c.runs > 0 && c.scoredTaskRatePct !== null && c.scoredTaskRatePct < 100)) return null;
  return `coverage: partial — scored ${c.scored}/${c.runs} (${c.scoredTaskRatePct.toFixed(1)}%)`;
}

/** D7/D6: блок dataQuality; nullText — текст при отсутствии stats (контекст вызывающего). */
export function dataQualityLine(q: AnalyticsReport['dataQuality'], nullText: string): string {
  if (q.validEventRatePct === null) return `dataQuality: ${nullText}`;
  const pct = (v: number | null): string => (v === null ? 'n/a' : `${v.toFixed(1)}%`);
  return [
    `dataQuality: valid ${q.validEventRatePct.toFixed(1)}% (malformed lines: ${q.malformedLines})`,
    `duplicateEventRatePct: ${pct(q.duplicateEventRatePct)}`,
    `unknownModelRatePct: ${pct(q.unknownModelRatePct)}`,
    `pricingCoveragePct: ${pct(q.pricingCoveragePct)}`,
    `completeTraceRatePct: n/a (${q.completeTraceRateReason})`,
  ].join('\n');
}

/** `view: 'all'`: все секции подряд, каждая — с теми же фильтрами (прокидываются в filterAnalytics);
 * в конец — coverage (при частичном) и dataQuality (D5/D7). */
export function renderAllSections(report: AnalyticsReport, filter: AnalyticsViewFilter): string {
  const sections = SECTION_VIEWS.map((v) => renderSection(report, { ...filter, view: v }));
  const cov = coverageLine(report.coverage);
  return [...sections, ...(cov !== null ? [cov] : []), dataQualityLine(report.dataQuality, 'n/a')].join('\n\n');
}

// ---------------------------------------------------------------------------
// P221 §6.5: render-функции dashboard (перенесены из умершей dashboard-команды,
// тестируются tests/unit/adapters/dashboard-render.test.ts)
// ---------------------------------------------------------------------------

/** Единый JSON-документ `analytics --view dashboard --json` (§6.1 спеки аналитики). */
export interface DashboardData {
  generatedAt: string;
  effectiveness: EffectivenessReport;
  analytics: AnalyticsReport;
  snapshot: { prevTs: string | null; delta: DeltaRow[] };
}

const BARS = '▁▂▃▄▅▆▇█';

/** Спарклайн: [] → '', все значения ≤ 0 → '▁'×n, иначе v/max → символ шкалы (max → '█'). */
export function sparkline(values: number[]): string {
  if (values.length === 0) return '';
  const max = Math.max(...values);
  if (max <= 0) return BARS[0].repeat(values.length);
  return values.map((v) => BARS[Math.floor((v / max) * (BARS.length - 1))]).join('');
}

/** Строки трендов по снапшотам; <2 снапшотов → 'n/a' (спарклайн из 0–1 точки не информативен). */
export function trendSparklineLines(snaps: SnapshotEntry[]): string[] {
  if (snaps.length < 2) {
    const na = 'n/a (need ≥2 snapshots)';
    return [`noise.share: ${na}`, `silentShare: ${na}`, `totals.sumWeighted: ${na}`];
  }
  return [
    `noise.share: ${sparkline(snaps.map((s) => s.report.noise.share ?? 0))}`,
    `silentShare: ${sparkline(snaps.map((s) => s.report.delivery.silentShare ?? 0))}`,
    `totals.sumWeighted: ${sparkline(snaps.map((s) => s.report.totals.sumWeighted))}`,
  ];
}

/** Значок статуса L1-блока: OK/WARN/BAD/NO_DATA -> ✓/!/✗/· */
export function statusMark(status: 'OK' | 'WARN' | 'BAD' | 'NO_DATA'): string {
  if (status === 'OK') return '✓';
  if (status === 'WARN') return '!';
  if (status === 'BAD') return '✗';
  return '·';
}

/** Секция health (L1): блоки effectiveness со статусами + totals. */
export function renderHealth(d: DashboardData): string {
  const r = d.effectiveness;
  const holdout =
    r.rules.prevented === null || r.rules.checked === null ? 'n/a' : `${r.rules.prevented}/${r.rules.checked}`;
  const e = r.tools.economy;
  const economy = e.sufficient
    ? `medianTool=${e.medianTool} medianAll=${e.medianAll}`
    : `n/a: ${e.reason ?? 'not enough data'}`;
  const silent = r.delivery.silentShare === null ? 'n/a' : `${r.delivery.silentShare.toFixed(1)}%`;
  const noise =
    r.noise.share === null ? 'n/a' : `${r.noise.writeOnly}/${r.noise.totalObjects} = ${r.noise.share.toFixed(1)}%`;
  const routing =
    r.routing.length === 0
      ? 'n/a'
      : r.routing.map((row) => `${row.model}: tasks=${row.tasks} median=${row.medianWeighted}`).join(' | ');
  return [
    '== health ==',
    `rules: ${statusMark(r.rules.prevented === null ? 'NO_DATA' : 'OK')} active=${r.rules.activeRules} prevented/checked: ${holdout}`,
    `tools: ${statusMark(e.sufficient ? 'OK' : 'NO_DATA')} count=${r.tools.toolCount} usage=${r.tools.totalUsage} economy: ${economy}`,
    `delivery: ${statusMark(r.silentStatus)} events=${r.delivery.deliveryEvents} triggered=${r.delivery.triggeredObjects} silentRules=${r.delivery.silentRules} (${silent})`,
    `noise: ${statusMark(r.noiseStatus)} ${noise}`,
    `routing: ${routing}`,
    `totals: runs=${cell(r.totals.runs)} weighted=${cell(r.totals.sumWeighted)}`,
  ].join('\n');
}

/** Секция ledgers (L2): таблицы memory/tools/rules/agents/councils/outliers. */
export function renderLedgers(d: DashboardData): string {
  const parts: string[] = ['== ledgers =='];

  const memory = filterAnalytics(d.analytics, { view: 'memory', top: 20 });
  if (memory.view === 'memory') {
    parts.push(
      renderTable(
        ['id', 'type', 'lifecycle', 'age', 'deliveries', 'triggers', 'complaints', 'last_used'],
        memory.rows.map((r) => [
          r.id,
          r.type,
          r.lifecycle,
          cell(r.age_days),
          cell(r.deliveries),
          cell(r.triggers),
          cell(r.complaints),
          cell(r.last_used),
        ])
      )
    );
  }

  const tools = filterAnalytics(d.analytics, { view: 'tools', top: 20 });
  if (tools.view === 'tools') {
    parts.push(
      renderTable(
        ['name', 'origin', 'status', 'usage', 'errors', 'promotion'],
        tools.rows.map((r) => [
          r.name,
          r.origin,
          cell(r.status),
          cell(r.usageCount),
          cell(r.errorCount),
          cell(r.promotion),
        ])
      )
    );
  }

  const rules = filterAnalytics(d.analytics, { view: 'rules', top: 20 });
  if (rules.view === 'rules') {
    parts.push(
      renderTable(
        ['id', 'prevented', 'checked', 'silent', 'title'],
        rules.rows.map((r) => [r.id, cell(r.prevented), cell(r.checked), r.silent ? 'yes' : 'no', r.title])
      )
    );
  }

  const agents = filterAnalytics(d.analytics, { view: 'agents', top: 20 });
  if (agents.view === 'agents') {
    parts.push(
      renderTable(
        ['agent', 'runs', 'weighted', 'avg_ms', 'pfail_%', 'completed', 'accepted', 'compl by/about', 'prevented'],
        agents.rows.map((r) => [
          r.agent,
          cell(r.runs),
          cell(r.weighted),
          cell(r.avgDurationMs),
          cell(r.processFailureRatePct === null ? null : r.processFailureRatePct.toFixed(1)),
          cell(r.completedRuns),
          cell(r.accepted),
          `${r.complaintsBy}/${r.complaintsAbout}`,
          cell(r.holdoutPrevented),
        ])
      )
    );
  }

  const councils = filterAnalytics(d.analytics, { view: 'councils', top: 20 });
  if (councils.view === 'councils') {
    parts.push(
      renderTable(
        ['open council', 'days_open', 'opinions', 'votes'],
        councils.councils.openQuestions.map((q) => [
          q.id,
          cell(q.daysOpen),
          cell(q.opinions),
          Object.entries(q.votes)
            .map(([option, n]) => `${option}=${n}`)
            .join(', ') || '-',
        ])
      )
    );
  }

  const outliers = filterAnalytics(d.analytics, { view: 'outliers', top: 10 });
  if (outliers.view === 'outliers') {
    parts.push(
      renderTable(
        ['ts', 'model', 'weighted', 'cost', 'title'],
        outliers.runs.map((r) => [
          cell(r.ts),
          cell(r.model),
          cell(r.weighted),
          cell(r.costUsd === null ? null : `$${r.costUsd}`),
          cell(r.title),
        ])
      )
    );
  }

  return parts.join('\n');
}

/** Секция trends (L3): спарклайны по снапшотам, недельная активность, cache-hit, readiness, steward, councils. */
export function renderTrends(baseDir: string, d: DashboardData): string {
  const parts: string[] = ['== trends =='];

  const snaps = readSnapshots(baseDir);
  parts.push(...trendSparklineLines(snaps));

  // D5/D7: честность метрик — частичный coverage и качество сигнального лога
  const cov = coverageLine(d.analytics.coverage);
  if (cov !== null) parts.push(cov);
  parts.push(dataQualityLine(d.analytics.dataQuality, 'n/a (no signal log)'));

  // D1: текст без колонок конверсии; проценты остаются только в JSON (WeeklyActivityWeek)
  const weeklyActivity = filterAnalytics(d.analytics, { view: 'weeklyActivity', top: 20 });
  if (weeklyActivity.view === 'weeklyActivity') {
    parts.push('weekly activity:');
    parts.push(
      renderTable(
        ['week', 'writes', 'delivers', 'triggers'],
        weeklyActivity.weeks.map((r) => [r.week, cell(r.writes), cell(r.delivers), cell(r.triggers)])
      )
    );
  }

  const tot = d.effectiveness.totals;
  const cacheHit =
    tot.sumTokens !== null && tot.sumTokens.input + tot.sumTokens.cache_read > 0
      ? `${((tot.sumTokens.cache_read / (tot.sumTokens.input + tot.sumTokens.cache_read)) * 100).toFixed(1)}%`
      : 'n/a (no raw token data yet)';
  parts.push(`cache-hit ratio: ${cacheHit}`);

  const readiness = filterAnalytics(d.analytics, { view: 'readiness', top: 20 });
  if (readiness.view === 'readiness') {
    parts.push(`experiment readiness: runs=${readiness.readiness.totalRuns} withArm=${readiness.readiness.withArm}`);
  }

  const steward = filterAnalytics(d.analytics, { view: 'steward', top: 20 });
  if (steward.view === 'steward') {
    parts.push(`steward mutations/week: ${sparkline(steward.steward.mutationsByWeek.map((w) => w.total))}`);
  }

  const councilTrend = filterAnalytics(d.analytics, { view: 'councils', top: 20 });
  if (councilTrend.view === 'councils') {
    parts.push(`council questions/week: ${sparkline(councilTrend.councils.weeks.map((w) => w.questions))}`);
    parts.push(`council opinions/week: ${sparkline(councilTrend.councils.weeks.map((w) => w.opinions))}`);
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// P221 §6.5: печать панели effectiveness (перенесена из умершей effectiveness-команды)
// ---------------------------------------------------------------------------

function fmtPct(v: number): string {
  return v.toFixed(1);
}

function printReport(r: EffectivenessReport): void {
  const holdout =
    r.rules.prevented === null || r.rules.checked === null
      ? 'n/a (not enough mileage)'
      : `${r.rules.prevented}/${r.rules.checked}`;
  console.log(`rules: active=${r.rules.activeRules} | prevented/checked: ${holdout}`);

  const e = r.tools.economy;
  const economy = e.sufficient
    ? `medianTool=${e.medianTool} medianAll=${e.medianAll} savings=${e.savingsPct !== null ? fmtPct(e.savingsPct) + '%' : 'n/a'}`
    : `n/a: ${e.reason ?? 'not enough data'}`;
  console.log(`tools: count=${r.tools.toolCount} | usage=${r.tools.totalUsage} | economy: ${economy} [INFO]`);

  const silent =
    r.delivery.silentShare === null
      ? !r.delivery.enoughDeliveryData
        ? 'not enough delivery data'
        : 'no active rules'
      : `${fmtPct(r.delivery.silentShare)}% [${r.silentStatus}]`;
  console.log(
    `delivery: events=${r.delivery.deliveryEvents} | triggered=${r.delivery.triggeredObjects}` +
      ` | silentRules=${r.delivery.silentRules} (${silent})`
  );

  const noise =
    r.noise.share === null
      ? 'n/a (memory is empty)'
      : `${r.noise.writeOnly}/${r.noise.totalObjects} = ${fmtPct(r.noise.share)}% [${r.noiseStatus}]`;
  console.log(`noise: ${noise}`);
  console.log(`documents: ${r.noise.documents} (registered refs, not part of the noise metric) [INFO]`);
  console.log(`archived: ${r.noise.archived} (outside the noise metric) [INFO]`);

  const routing =
    r.routing.length === 0
      ? 'n/a (run-log is empty)'
      : r.routing.map((row) => `${row.model}: tasks=${row.tasks} median=${row.medianWeighted}`).join(' | ');
  console.log(`routing: ${routing}`);

  // M3: блок абсолютов из run-сигналов; null → честное n/a
  const t = r.totals;
  const cache = t.cacheHitRatio === null ? 'n/a' : `${fmtPct(t.cacheHitRatio)}%`;
  const avg = t.avgDurationMs === null ? 'n/a' : `${t.avgDurationMs}ms`;
  console.log(
    `totals: runs=${t.runs} processFailures=${t.processFailures} weighted=${t.sumWeighted} cache=${cache} avg=${avg}`
  );
  const cost = t.costUsd === null ? 'n/a (no pricing configured)' : `$${t.costUsd} (pricing enabled)`;
  console.log(`cost: ${cost}`);
  for (const row of t.byModel) {
    const c = row.costUsd === null ? 'n/a' : `$${row.costUsd}`;
    const cpc = row.costPerCompletedRun === null ? 'n/a' : `$${row.costPerCompletedRun}`;
    console.log(
      `model ${row.model}: runs=${row.runs} processFailures=${row.processFailures} cost=${c} cost/completedRun=${cpc}`
    );
  }
}

export function analyticsCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('analytics').description(
    'Analytics state window: ledgers (memory/tools/rules), weekly activity, agents, steward, councils, outliers, readiness, coordination, campaigns, delivery, acceptance, effectiveness, dashboard'
  );

  cmd
    .addOption(
      new Option('--view <view>', 'Analytics view')
        .choices([
          'memory',
          'tools',
          'rules',
          'weeklyActivity',
          'agents',
          'steward',
          'outliers',
          'readiness',
          'councils',
          'coordination',
          'campaign',
          'delivery',
          'acceptance',
          'effectiveness',
          'dashboard',
          'all',
        ])
        .default('all')
    )
    .addOption(
      new Option('--class <class>', 'Memory lifecycle filter').choices(['new', 'sleeper', 'workhorse', 'dead'])
    )
    .option('--type <type>', 'Memory type filter')
    .addOption(new Option('--origin <origin>', 'Tool origin filter').choices(['script', 'native']))
    .option('--agent <agent>', 'Agent name filter')
    .option('--silent', 'Rules view: only silent rules', false)
    // ponytail: явный radix 10 — commander передаёт дефолт как previous, bare parseInt принял бы его за radix
    .option('--top <n>', 'Row limit', (v: string) => parseInt(v, 10), 20)
    .option('--weeks <n>', 'Weekly activity window in weeks', (v: string) => parseInt(v, 10), 8)
    .option('--snapshot', 'Effectiveness view: append the report to .wolf/metrics/effectiveness-snapshots.jsonl', false)
    .option('--json', 'Machine-readable JSON output', false);

  cmd.action(async (options) => {
    // конфиг: pricing + analytics.thresholds (битый yaml → undefined, дефолты внутри use-case)
    let config: ReturnType<typeof loadWolfConfigSync> | undefined = undefined;
    try {
      config = loadWolfConfigSync(baseDir);
    } catch {
      config = undefined;
    }
    const analyticsThresholds = config?.analytics?.thresholds;

    let runLogText: string | null = null;
    try {
      runLogText = readFileSync(join(baseDir, '.wolf', 'run-log.jsonl'), 'utf-8');
    } catch {
      runLogText = null; // ENOENT — run-log ещё не пишется
    }

    // T003: router.log плагина wolf-router (нет файла → пустая структура)
    let routerLogText: string | null = null;
    try {
      routerLogText = readFileSync(join(baseDir, '.wolf', 'router.log'), 'utf-8');
    } catch {
      routerLogText = null; // ENOENT — плагин ещё не писал
    }
    const parsedRouterLog = parseRouterLog(routerLogText ?? '');

    // P110: skill-invocations.jsonl плагина (нет файла → не передаём, skills пустые)
    let skillInvocations: AnalyticsInput['skillInvocations'] = undefined;
    try {
      skillInvocations = parseSkillInvocations(
        readFileSync(join(baseDir, '.wolf', 'metrics', 'skill-invocations.jsonl'), 'utf-8')
      );
    } catch {
      skillInvocations = undefined; // ENOENT — плагин ещё не писал
    }

    const { store, log, relations, clock } = createCliContainer(baseDir);
    // D7: readSignalLog вместо readSignals — events + счётчики битых строк для dataQuality
    const signalLog = readSignalLog(baseDir);

    // P221 §6.5: окно состояния effectiveness — ранний путь (до общего filterAnalytics-пути);
    // --top/--weeks и прочие фильтры для этого view игнорируются
    if (options.view === 'effectiveness') {
      const thresholds = resolveThresholds(config?.learning?.effectivenessThresholds);
      const report = await buildEffectivenessReport(
        { store, log, relations },
        {
          signals: signalLog.events,
          runLogText,
          thresholds,
          ...(config?.pricing !== undefined ? { pricing: config.pricing } : {}),
        }
      );
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      console.log('effectiveness panel (mileage aggregation, no LLM):');
      printReport(report);
      // M2: --snapshot аппендит полный отчёт; обычный вызов печатает дельту к последнему
      if (options.snapshot) {
        appendSnapshot(baseDir, report, new Date().toISOString());
        console.log(`snapshot appended (total: ${readSnapshots(baseDir).length})`);
      } else {
        const snaps = readSnapshots(baseDir);
        if (snaps.length > 0) {
          const last = snaps[snaps.length - 1]!;
          const changed = computeSnapshotDelta(last.report, report).filter((r) => r.diff !== null && r.diff !== 0);
          console.log(`delta vs ${last.ts}:`);
          if (changed.length === 0) {
            console.log('  no changes');
          } else {
            for (const r of changed) {
              const sign = r.diff! > 0 ? '+' : '';
              console.log(`  ${r.path}: ${r.prev} -> ${r.curr} (${sign}${r.diff})`);
            }
          }
        }
      }
      const note = config?.learning?.effectivenessThresholds !== undefined ? ' (config override)' : '';
      console.log(
        `thresholds: noise ok<${thresholds.noiseOk} warn<=${thresholds.noiseWarn} bad | silent ok<${thresholds.silentOk}${note}`
      );
      return;
    }

    const report = await buildAnalyticsReport(
      { store, log, relations, clock },
      {
        signals: signalLog.events,
        signalLogStats: { malformedLines: signalLog.malformedLines, totalLines: signalLog.totalLines },
        runLogText,
        routerLog: {
          rows: parsedRouterLog.rows,
          lines: parsedRouterLog.rows.length + parsedRouterLog.malformedLines,
          malformedLines: parsedRouterLog.malformedLines,
        },
        ...(skillInvocations !== undefined ? { skillInvocations } : {}),
        ...(analyticsThresholds !== undefined ? { thresholds: analyticsThresholds } : {}),
        weeks: options.weeks,
        topOutliers: options.top,
        ...(config?.pricing !== undefined ? { pricing: config.pricing } : {}),
      }
    );

    // P221 §6.5: окно состояния dashboard — композиция effectiveness + analytics +
    // snapshot delta (ранее build-dashboard.ts), рендер — перенесённые функции
    if (options.view === 'dashboard') {
      const thresholds = resolveThresholds(config?.learning?.effectivenessThresholds);
      const effectiveness = await buildEffectivenessReport(
        { store, log, relations },
        {
          signals: signalLog.events,
          runLogText,
          thresholds,
          ...(config?.pricing !== undefined ? { pricing: config.pricing } : {}),
        }
      );
      const prev = readSnapshots(baseDir).at(-1) ?? null;
      const data: DashboardData = {
        generatedAt: report.generatedAt,
        effectiveness,
        analytics: report,
        snapshot: {
          prevTs: prev !== null ? prev.ts : null,
          delta: prev !== null ? computeSnapshotDelta(prev.report, effectiveness) : [],
        },
      };
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log(renderHealth(data));
      console.log(renderLedgers(data));
      console.log(renderTrends(baseDir, data));
      return;
    }

    // commander отдаёт строки — приводим к union контракта задачи 6; CLI-флаг по спеке
    // §6.2 называется `native`, а `ToolLedgerRow.origin` — 'model-native' (D11)
    const origin: 'script' | 'model-native' | undefined =
      options.origin === 'script' ? 'script' : options.origin === 'native' ? 'model-native' : undefined;
    const klass: 'new' | 'sleeper' | 'workhorse' | 'dead' | undefined =
      options.class === 'new' ||
      options.class === 'sleeper' ||
      options.class === 'workhorse' ||
      options.class === 'dead'
        ? options.class
        : undefined;

    // единая точка: фильтры строятся ОДИН раз и идут и в --json, и в текстовый рендер
    // (effectiveness/dashboard сюда не доходят — ранние пути выше; каст сужает
    // commander-строку к контракту filterAnalytics)
    const filter: AnalyticsViewFilter = {
      view: options.view as AnalyticsViewFilter['view'],
      ...(klass !== undefined ? { class: klass } : {}),
      ...(options.type !== undefined ? { type: options.type } : {}),
      ...(origin !== undefined ? { origin } : {}),
      ...(options.agent !== undefined ? { agent: options.agent } : {}),
      ...(options.silent ? { silent: true } : {}),
      top: options.top,
    };
    const payload = filterAnalytics(report, filter);

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    // текстовый рендер: all — все секции подряд с заголовками, иначе одна секция
    if (payload.view === 'all') {
      console.log(renderAllSections(report, filter));
    } else {
      console.log(renderSection(report, { ...filter, view: payload.view as SectionView }));
    }
  });

  return cmd;
}
