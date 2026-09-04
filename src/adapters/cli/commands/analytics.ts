import { Command, Option } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeCwd } from '../cli-entry.js';
import { readSignals } from '../../fs/session-metrics-log.js';
import { loadWolfConfigSync } from '../../fs/config-file.js';
import {
  buildAnalyticsReport,
  filterAnalytics,
  type AnalyticsReport,
  type AnalyticsViewFilter,
} from '../../../app/use-cases/build-analytics.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { renderTable, formatFunnelRatio } from './table-render.js';

/**
 * §6.2 спеки аналитики: `wolf analytics` — выборки для Стюарда с фильтрами.
 * Фильтры class/type/origin/agent/silent/top применяются ВНУТРИ filterAnalytics —
 * CLI только парсит аргументы. `--json` — машинный вывод (дефолт для агентов),
 * иначе текстовые таблицы по секциям (общий Unicode-генератор с dashboard — DRY).
 * baseDir инъектится для тестов (прецедент: memory-effectiveness.ts).
 */

type AnalyticsView = 'memory' | 'tools' | 'rules' | 'funnel' | 'agents' | 'steward' | 'outliers' | 'readiness' | 'all';
type SectionView = Exclude<AnalyticsView, 'all'>;

const SECTION_VIEWS: SectionView[] = [
  'memory',
  'tools',
  'rules',
  'funnel',
  'agents',
  'steward',
  'outliers',
  'readiness',
];

/** null/undefined → '-', остальное — строкой (колонки с nullable-полей). */
function cell(v: unknown): string {
  return v === null || v === undefined ? '-' : String(v);
}

/** Фильтр секции: AnalyticsViewFilter с view конкретной секции (без 'all'). */
export type SectionViewFilter = AnalyticsViewFilter & { view: SectionView };

/** Одна секция текстового рендера: `== <view> ==` + таблица/строки; фильтры применяет filterAnalytics. */
export function renderSection(report: AnalyticsReport, filter: SectionViewFilter): string {
  const payload = filterAnalytics(report, filter);
  const header = `== ${filter.view} ==`;
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
      return [
        header,
        renderTable(['id', 'type', 'lifecycle', 'age_days', 'deliveries', 'triggers', 'complaints', 'last_used'], rows),
        `garbage: dead/base = ${payload.garbage.dead}/${payload.garbage.base} = ${garbage}`,
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
    case 'funnel': {
      const rows = payload.weeks.map((r) => [
        r.week,
        cell(r.writes),
        cell(r.delivers),
        cell(r.triggers),
        formatFunnelRatio(r.writeToDeliverPct),
        formatFunnelRatio(r.deliverToTriggerPct),
      ]);
      return [header, renderTable(['week', 'writes', 'delivers', 'triggers', 'W->D', 'D->T'], rows)].join('\n');
    }
    case 'agents': {
      const rows = payload.rows.map((r) => [
        r.agent,
        cell(r.runs),
        cell(r.weighted),
        cell(r.avgDurationMs),
        cell(r.failureRatePct === null ? null : r.failureRatePct.toFixed(1)),
        `${r.complaintsBy}/${r.complaintsAbout}`,
        cell(r.holdoutPrevented),
      ]);
      return [
        header,
        renderTable(['agent', 'runs', 'weighted', 'avg_ms', 'fail_%', 'compl by/about', 'prevented'], rows),
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
    default:
      // 'all' обрабатывается вызывающим кодом до renderSection; ветка закрывает switch (TS2366)
      throw new Error(`renderSection: unexpected view ${String((payload as { view: string }).view)}`);
  }
}

/** `view: 'all'`: все секции подряд, каждая — с теми же фильтрами (прокидываются в filterAnalytics). */
export function renderAllSections(report: AnalyticsReport, filter: AnalyticsViewFilter): string {
  return SECTION_VIEWS.map((v) => renderSection(report, { ...filter, view: v })).join('\n\n');
}

export function analyticsCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('analytics').description(
    'Effectiveness analytics: ledgers (memory/tools/rules), funnel, agents, steward view, outliers, experiment readiness'
  );

  cmd
    .addOption(
      new Option('--view <view>', 'Analytics view')
        .choices(['memory', 'tools', 'rules', 'funnel', 'agents', 'steward', 'outliers', 'readiness', 'all'])
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
    .option('--weeks <n>', 'Funnel window in weeks', (v: string) => parseInt(v, 10), 8)
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

    const { store, log, clock } = createCliContainer(baseDir);
    const report = await buildAnalyticsReport(
      { store, log, clock },
      {
        signals: readSignals(baseDir),
        runLogText,
        ...(analyticsThresholds !== undefined ? { thresholds: analyticsThresholds } : {}),
        weeks: options.weeks,
        topOutliers: options.top,
        ...(config?.pricing !== undefined ? { pricing: config.pricing } : {}),
      }
    );

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
    const filter: AnalyticsViewFilter = {
      view: options.view as AnalyticsView,
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
