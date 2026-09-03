/**
 * Ф23 (слита с Ф18): STOP-гейт — pressure-тесты памяти как барьер автономной
 * адаптации (спека §5, §3 правило границы (б)). Harness: «стимул-промпт +
 * wolf call» против детерминированного mock-агента, БЕЗ LLM.
 *
 * Критерий чувствительности harness'а: сценарий падает при удалении
 * delivery-механизма (lookup не доставил знание) и проходит при его наличии.
 * premature action: действие до wolf call (lookup сломан/не выполнялся).
 *
 * Mock-агент — наивный rules-follower с двумя реалистичными режимами отказа:
 * (а) действует, если адресный запрет не доставлен (regression miss);
 * (б) воздерживается при виде ЛЮБОГО запрет-паттерна, даже не по адресу
 * (false positive — зря отказался). Оба режима — вход Layer 4 meta-metrics.
 */
import { READ_ONLY_ZONES, assertLearnWriteAllowed } from '../policies/read-only-zones.js';

export interface PressureScenario {
  id: string;
  stimulus: string;
  topic: string;
  forbidden_tool?: string;
  expect_action?: boolean;
}

export interface StopGateScenarioResult {
  id: string;
  passed: boolean;
  reason: string;
  prematureAction: boolean;
}

export interface StopGateMetrics {
  stop_gate_pass_rate: number;
  false_positive_rate: number;
  regression_detection: number;
}

export interface StopGateReport {
  passed: boolean;
  results: StopGateScenarioResult[];
  metrics: StopGateMetrics;
}

/** Запрет-паттерны, на которых наивный агент может передержаться (false positive). */
const PROHIBITION_RE = /анти-правило|не использ|forbidden|do not use|avoid/i;

/**
 * Детерминированный прогон: на каждый сценарий mock-агент сначала делает
 * wolf call (lookupInjections по topic), затем решает. Брошенный lookup =
 * действие без знания (prematureAction). Чистая функция.
 */
export function runStopGate(
  lookupInjections: (topic: string) => string[],
  scenarios: PressureScenario[]
): StopGateReport {
  const results = scenarios.map((sc): StopGateScenarioResult => {
    // протокол: wolf call ДО действия (§5); сломанный delivery = вслепую
    let blocks: string[];
    let prematureAction = false;
    try {
      blocks = lookupInjections(sc.topic);
    } catch {
      blocks = [];
      prematureAction = true;
    }
    const knowledge = blocks.join('\n');
    const targeted = sc.forbidden_tool !== undefined && knowledge.includes(sc.forbidden_tool);
    const abstained = targeted || PROHIBITION_RE.test(knowledge);

    if (prematureAction) {
      return {
        id: sc.id,
        passed: false,
        reason: `action before wolf call (premature action): knowledge on topic “${sc.topic}” was not fetched`,
        prematureAction: true,
      };
    }
    if (sc.forbidden_tool !== undefined) {
      return targeted
        ? {
            id: sc.id,
            passed: true,
            reason: `knowledge delivered: the agent abstained from “${sc.forbidden_tool}”`,
            prematureAction: false,
          }
        : {
            id: sc.id,
            passed: false,
            reason: `delivery failed: “${sc.forbidden_tool}” was used without delivered knowledge on topic “${sc.topic}”`,
            prematureAction: false,
          };
    }
    if (abstained) {
      return {
        id: sc.id,
        passed: false,
        reason: `refusal without a targeted ban (false positive): abstained for nothing on topic “${sc.topic}”`,
        prematureAction: false,
      };
    }
    return sc.expect_action === true
      ? { id: sc.id, passed: true, reason: 'no bans delivered — action taken', prematureAction: false }
      : {
          id: sc.id,
          passed: false,
          reason: 'scenario without forbidden_tool and without expect_action — expectation is undefined',
          prematureAction: false,
        };
  });

  const total = results.length;
  const withForbidden = scenarios.filter((sc) => sc.forbidden_tool !== undefined).length;
  const withoutForbidden = total - withForbidden;
  const passedCount = results.filter((r) => r.passed).length;
  const failedNoForbidden = results.filter((r, i) => scenarios[i].forbidden_tool === undefined && !r.passed).length;
  const passedForbidden = results.filter((r, i) => scenarios[i].forbidden_tool !== undefined && r.passed).length;

  return {
    passed: results.every((r) => r.passed),
    results,
    metrics: {
      stop_gate_pass_rate: total > 0 ? passedCount / total : 1,
      false_positive_rate: withoutForbidden > 0 ? failedNoForbidden / withoutForbidden : 0,
      regression_detection: withForbidden > 0 ? passedForbidden / withForbidden : 0,
    },
  };
}

/**
 * Автосценарий из механического draft'а (constraint_tool + trigger_keywords).
 * Тема сценария = constraint_tool: реалистичная будущая сессия работает с этим
 * тулом — и delivery-механизм обязан доставить draft по этой теме. Пустые/чужие
 * trigger_keywords не мешают построению: сценарий и должен поймать
 * недоставляемое правило (гейт красный). null — немеханический draft.
 */
export function buildScenarioFromDraft(draft: Record<string, unknown>): PressureScenario | null {
  if (draft.mechanical !== true || typeof draft.constraint_tool !== 'string' || draft.constraint_tool === '') {
    return null;
  }
  return {
    id: `draft:${String(draft.id ?? 'unknown')}`,
    stimulus: `${String(draft.title ?? '')}\n${String(draft.body ?? '')}`,
    topic: draft.constraint_tool,
    forbidden_tool: draft.constraint_tool,
  };
}

/** Проба зон (part of gate): rewrite в каждую read-only зону обязан бросить. */
export function zoneProbe(): { zone: string; enforced: boolean }[] {
  return READ_ONLY_ZONES.map((z) => {
    let enforced = false;
    try {
      assertLearnWriteAllowed(z.path, 'rewrite');
    } catch {
      enforced = true;
    }
    return { zone: z.path, enforced };
  });
}
