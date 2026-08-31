import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readSignals } from '../../../adapters/fs/session-metrics-log.js';
import { loadWolfConfigSync } from '../../../adapters/fs/config-file.js';
import {
  buildEffectivenessReport,
  resolveThresholds,
  type EffectivenessReport,
  type EffectivenessThresholds,
} from '../../../app/use-cases/effectiveness.js';
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
      ? 'n/a (мало пробега)'
      : `${r.rules.prevented}/${r.rules.checked}`;
  console.log(`rules: active=${r.rules.activeRules} | prevented/checked: ${holdout}`);

  const e = r.tools.economy;
  const economy = e.sufficient
    ? `medianTool=${e.medianTool} medianAll=${e.medianAll} savings=${e.savingsPct !== null ? fmtPct(e.savingsPct) + '%' : 'n/a'}`
    : `n/a: ${e.reason ?? 'мало данных'}`;
  console.log(`tools: count=${r.tools.toolCount} | usage=${r.tools.totalUsage} | economy: ${economy} [INFO]`);

  const silent =
    r.delivery.silentShare === null
      ? !r.delivery.enoughDeliveryData
        ? 'мало delivery-данных'
        : 'нет активных правил'
      : `${fmtPct(r.delivery.silentShare)}% [${r.silentStatus}]`;
  console.log(
    `delivery: events=${r.delivery.deliveryEvents} | triggered=${r.delivery.triggeredObjects}` +
      ` | silentRules=${r.delivery.silentRules} (${silent})`
  );

  const noise =
    r.noise.share === null
      ? 'n/a (память пуста)'
      : `${r.noise.writeOnly}/${r.noise.totalObjects} = ${fmtPct(r.noise.share)}% [${r.noiseStatus}]`;
  console.log(`noise: ${noise}`);
  console.log(`documents: ${r.noise.documents} (registered refs, не участвуют в метрике шума) [INFO]`);
  console.log(`archived: ${r.noise.archived} (вне метрики шума) [INFO]`);

  const routing =
    r.routing.length === 0
      ? 'n/a (run-log пуст)'
      : r.routing.map((row) => `${row.model}: tasks=${row.tasks} median=${row.medianWeighted}`).join(' | ');
  console.log(`routing: ${routing}`);
}

export function memoryEffectivenessCommand(baseDir: string = process.cwd()): Command {
  const cmd = new Command('effectiveness').description(
    'Memory effectiveness panel: rules holdout, tool economy, delivery, noise, routing (aggregation only, no LLM)'
  );

  cmd.action(async () => {
    // пороги: override из config поверх дефолтов (битый конфиг → дефолты)
    let override: Partial<EffectivenessThresholds> | undefined;
    try {
      override = loadWolfConfigSync(baseDir)?.learning?.effectivenessThresholds;
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

    console.log('effectiveness panel (агрегация пробега, без LLM):');
    try {
      const { store, log, relations } = createCliContainer(baseDir);
      const report = await buildEffectivenessReport(
        { store, log, relations },
        { signals: readSignals(baseDir), runLogText, thresholds }
      );
      printReport(report);
    } catch (err: unknown) {
      // .wolf не инициализирован — честные n/a; реальную причину не глушим (stderr)
      console.error(`[effectiveness] Warning: ${err instanceof Error ? err.message : String(err)}`);
      console.log('rules: n/a (.wolf не инициализирован или не читается)');
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
