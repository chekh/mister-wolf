import { Command, Option } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeCwd } from '../cli-entry.js';
import { readSignals } from '../../fs/session-metrics-log.js';
import { readSnapshots, type SnapshotEntry } from '../../fs/effectiveness-snapshots.js';
import { loadWolfConfigSync } from '../../fs/config-file.js';
import { resolveThresholds } from '../../../app/use-cases/effectiveness.js';
import { buildDashboard, type DashboardData } from '../../../app/use-cases/build-dashboard.js';
import { filterAnalytics } from '../../../app/use-cases/build-analytics.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { renderTable } from './table-render.js';

/** §6.1 + D8 спеки аналитики: консольный дашборд — Unicode-таблицы, спарклайны,
 * статусы-значки; ноль зависимостей, БЕЗ записи файлов (HTML отложен). Рендер —
 * чистые экспортируемые функции (тестируемость, детерминизм: без ANSI-цветов и
 * без terminal width). baseDir инъектится для тестов (прецедент: memory-effectiveness.ts). */

// генератор таблиц общий с analytics (DRY); реэкспорт держит старый импорт в тестах
export { renderTable } from './table-render.js';

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

/** null/undefined → '-', остальное — строкой (колонки с nullable-полями). */
function cell(v: unknown): string {
  return v === null || v === undefined ? '-' : String(v);
}

/** Секция health (L1): блоки effectiveness со статусами + totals. */
function renderHealth(d: DashboardData): string {
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
        ['agent', 'runs', 'weighted', 'avg_ms', 'pfail_%', 'compl by/about', 'prevented'],
        agents.rows.map((r) => [
          r.agent,
          cell(r.runs),
          cell(r.weighted),
          cell(r.avgDurationMs),
          cell(r.processFailureRatePct === null ? null : r.processFailureRatePct.toFixed(1)),
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

  // D1: текст без колонок конверсии; проценты остаются только в JSON (WeeklyActivityWeek)
  const weeklyActivity = filterAnalytics(d.analytics, { view: 'weeklyActivity', top: 20 });
  if (weeklyActivity.view === 'weeklyActivity') {
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

export function dashboardCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('dashboard').description(
    'Console dashboard: health, ledgers, trends (unicode tables and sparklines; no files written)'
  );

  cmd
    .addOption(new Option('--tab <tab>', 'Render a single section').choices(['health', 'ledgers', 'trends']))
    .option('--json', 'Machine-readable JSON output of the whole dashboard', false);

  cmd.action(async (options) => {
    // пороги effectiveness: override из config поверх дефолтов (битый конфиг → дефолты)
    let config: ReturnType<typeof loadWolfConfigSync> | undefined = undefined;
    try {
      config = loadWolfConfigSync(baseDir);
    } catch {
      config = undefined;
    }
    const thresholds = resolveThresholds(config?.learning?.effectivenessThresholds);

    let runLogText: string | null = null;
    try {
      runLogText = readFileSync(join(baseDir, '.wolf', 'run-log.jsonl'), 'utf-8');
    } catch {
      runLogText = null; // ENOENT — run-log ещё не пишется
    }

    const { store, log, relations, clock } = createCliContainer(baseDir);
    const data = await buildDashboard(
      { store, log, relations, clock },
      {
        signals: readSignals(baseDir),
        runLogText,
        thresholds,
        ...(config?.pricing !== undefined ? { pricing: config.pricing } : {}),
        ...(config?.analytics?.thresholds !== undefined ? { analyticsThresholds: config.analytics.thresholds } : {}),
        prevSnapshot: readSnapshots(baseDir).at(-1) ?? null,
      }
    );

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const tab = options.tab as 'health' | 'ledgers' | 'trends' | undefined;
    if (tab === undefined || tab === 'health') console.log(renderHealth(data));
    if (tab === undefined || tab === 'ledgers') console.log(renderLedgers(data));
    if (tab === undefined || tab === 'trends') console.log(renderTrends(baseDir, data));
  });

  return cmd;
}
