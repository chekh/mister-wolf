/**
 * M2 (Q9): диф последнего снапшота эффективности с предыдущим.
 * flattenReportNumbers обходит поля отчёта вручную (явные пути, НЕ generic-walker):
 * числовые поля всех блоков + routing построчно по model-ключу; null-поля
 * пропускаются (в Map<string, number> null не кладётся — «не знаем» ≠ 0).
 */
import type { EffectivenessReport } from './effectiveness.js';
import type { TotalsBlock } from './effectiveness.js';

export interface DeltaRow {
  path: string;
  prev: number | null;
  curr: number | null;
  diff: number | null;
}

function put(map: Map<string, number>, path: string, value: number | null): void {
  if (value !== null) map.set(path, value);
}

/** Плоская карта «явный путь → число» по всем числовым полям отчёта. */
export function flattenReportNumbers(report: EffectivenessReport): Map<string, number> {
  const flat = new Map<string, number>();
  flat.set('rules.activeRules', report.rules.activeRules);
  put(flat, 'rules.prevented', report.rules.prevented);
  put(flat, 'rules.checked', report.rules.checked);
  flat.set('tools.toolCount', report.tools.toolCount);
  flat.set('tools.totalUsage', report.tools.totalUsage);
  flat.set('tools.economy.toolRuns', report.tools.economy.toolRuns);
  flat.set('tools.economy.totalRuns', report.tools.economy.totalRuns);
  put(flat, 'tools.economy.medianTool', report.tools.economy.medianTool);
  put(flat, 'tools.economy.medianAll', report.tools.economy.medianAll);
  put(flat, 'tools.economy.savingsPct', report.tools.economy.savingsPct);
  flat.set('delivery.deliveryEvents', report.delivery.deliveryEvents);
  flat.set('delivery.triggeredObjects', report.delivery.triggeredObjects);
  flat.set('delivery.activeRules', report.delivery.activeRules);
  flat.set('delivery.silentRules', report.delivery.silentRules);
  flat.set('noise.totalObjects', report.noise.totalObjects);
  flat.set('noise.writeOnly', report.noise.writeOnly);
  put(flat, 'noise.share', report.noise.share);
  flat.set('noise.documents', report.noise.documents);
  flat.set('noise.archived', report.noise.archived);
  for (const r of report.routing) {
    flat.set(`routing.${r.model}.tasks`, r.tasks);
    put(flat, `routing.${r.model}.medianWeighted`, r.medianWeighted);
  }
  flattenTotals(flat, report.totals);
  return flat;
}

/** M3: плоские числа totals для дельты снапшотов (Q9); null-поля не попадают в дельту. */
function flattenTotals(flat: Map<string, number>, t: TotalsBlock): void {
  flat.set('totals.runs', t.runs);
  flat.set('totals.failures', t.failures);
  flat.set('totals.sumWeighted', t.sumWeighted);
  if (t.sumTokens !== null) {
    flat.set('totals.sumTokens.input', t.sumTokens.input);
    flat.set('totals.sumTokens.output', t.sumTokens.output);
    flat.set('totals.sumTokens.cache_read', t.sumTokens.cache_read);
  }
  put(flat, 'totals.cacheHitRatio', t.cacheHitRatio);
  put(flat, 'totals.avgDurationMs', t.avgDurationMs);
  put(flat, 'totals.costUsd', t.costUsd);
  for (const row of t.byModel) {
    flat.set(`totals.byModel.${row.model}.runs`, row.runs);
    flat.set(`totals.byModel.${row.model}.failures`, row.failures);
    flat.set(`totals.byModel.${row.model}.sumWeighted`, row.sumWeighted);
    put(flat, `totals.byModel.${row.model}.avgDurationMs`, row.avgDurationMs);
    put(flat, `totals.byModel.${row.model}.costUsd`, row.costUsd);
    put(flat, `totals.byModel.${row.model}.costPerSuccess`, row.costPerSuccess);
  }
}

/**
 * Дельта = объединение ключей prev|curr; diff = curr − prev,
 * null если хоть одна сторона null (ключа нет в карте).
 * Сортировка по path — детерминированный вывод.
 */
export function computeSnapshotDelta(prev: EffectivenessReport, curr: EffectivenessReport): DeltaRow[] {
  const prevFlat = flattenReportNumbers(prev);
  const currFlat = flattenReportNumbers(curr);
  const rows: DeltaRow[] = [];
  for (const key of new Set([...prevFlat.keys(), ...currFlat.keys()])) {
    const p = prevFlat.get(key) ?? null;
    const c = currFlat.get(key) ?? null;
    rows.push({ path: key, prev: p, curr: c, diff: p !== null && c !== null ? c - p : null });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
