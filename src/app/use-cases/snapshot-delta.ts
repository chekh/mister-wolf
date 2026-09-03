/**
 * M2 (Q9): диф последнего снапшота эффективности с предыдущим.
 * flattenReportNumbers обходит поля отчёта вручную (явные пути, НЕ generic-walker):
 * числовые поля всех блоков + routing построчно по model-ключу; null-поля
 * пропускаются (в Map<string, number> null не кладётся — «не знаем» ≠ 0).
 */
import type { EffectivenessReport } from './effectiveness.js';

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
  return flat;
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
