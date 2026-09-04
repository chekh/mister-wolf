import { Command } from 'commander';
import { safeCwd } from '../cli-entry.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readSignals } from '../../../adapters/fs/session-metrics-log.js';
import { appendSnapshot, readSnapshots } from '../../../adapters/fs/effectiveness-snapshots.js';
import { computeSnapshotDelta } from '../../../app/use-cases/snapshot-delta.js';
import { loadWolfConfigSync } from '../../../adapters/fs/config-file.js';
import {
  buildEffectivenessReport,
  resolveThresholds,
  type EffectivenessReport,
  type EffectivenessThresholds,
} from '../../../app/use-cases/effectiveness.js';
import type { PricingTable } from '../../../domain/pricing.js';
import { createCliContainer } from '../../../bootstrap/container.js';

/**
 * E1.2: `wolf effectiveness` — сводная панель эффективности памяти по пробегу:
 * правила (holdout), инструменты (экономика), доставка→срабатывание, шум памяти,
 * роутинг. Только агрегация, без LLM; пустые данные — честное n/a.
 * baseDir инъектится для тестов (прецедент: memory-learn.ts).
 */

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

export function memoryEffectivenessCommand(baseDir: string = safeCwd()): Command {
  const cmd = new Command('effectiveness').description(
    'Memory effectiveness panel: rules holdout, tool economy, delivery, noise, routing (aggregation only, no LLM)'
  );
  cmd.option('--snapshot', 'Append the full report to .wolf/metrics/effectiveness-snapshots.jsonl');

  cmd.action(async (options) => {
    // пороги + pricing: override из config поверх дефолтов (битый конфиг → дефолты)
    let override: Partial<EffectivenessThresholds> | undefined;
    let pricing: PricingTable | undefined;
    try {
      const cfg = loadWolfConfigSync(baseDir);
      override = cfg?.learning?.effectivenessThresholds;
      pricing = cfg?.pricing;
    } catch {
      override = undefined;
    }
    const thresholds = resolveThresholds(override);

    let runLogText: string | null = null;
    try {
      runLogText = readFileSync(join(baseDir, '.wolf', 'run-log.jsonl'), 'utf-8');
    } catch {
      runLogText = null; // ENOENT — run-log ещё не пишется
    }

    console.log('effectiveness panel (mileage aggregation, no LLM):');
    try {
      const { store, log, relations } = createCliContainer(baseDir);
      const report = await buildEffectivenessReport(
        { store, log, relations },
        { signals: readSignals(baseDir), runLogText, thresholds, pricing }
      );
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
    } catch (err: unknown) {
      // .wolf не инициализирован — честные n/a; реальную причину не глушим (stderr)
      console.error(`[effectiveness] Warning: ${err instanceof Error ? err.message : String(err)}`);
      console.log('rules: n/a (.wolf not initialized or unreadable)');
      console.log('tools: n/a | economy: n/a [INFO]');
      console.log('delivery: n/a');
      console.log('noise: n/a');
      console.log('documents: n/a');
      console.log('archived: n/a');
      console.log('routing: n/a');
    }
    const note = override !== undefined ? ' (config override)' : '';
    console.log(
      `thresholds: noise ok<${thresholds.noiseOk} warn<=${thresholds.noiseWarn} bad | silent ok<${thresholds.silentOk}${note}`
    );
  });

  return cmd;
}
