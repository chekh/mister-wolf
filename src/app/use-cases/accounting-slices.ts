// src/app/use-cases/accounting-slices.ts
import type { SignalEvent } from '../../adapters/fs/session-metrics-log.js';
import { runCostUsd, type PricingTable, type RawTokens } from '../../domain/pricing.js';

/**
 * 3.2.0 T-09 (REQ-11, design §10, S-21/S-22): учётные срезы по уникальным
 * вызовам. Сумма считается ОДИН раз по уникальным вызовам; «learning» и
 * «council» — атрибуты назначения ТЕХ ЖЕ вызовов (срезы), к общей сумме они
 * НЕ прибавляются. Неизвестный тариф — cost basis unknown с причиной: НЕ 0 и
 * НЕ долларовая «экономия» (REQ-11 AC). Стоимость считает существующий
 * runCostUsd — параллельного учёта нет.
 *
 * Атрибут назначения из существующих данных вызова:
 * - learning: агент вызова — стюард (gen_ai.agent / orchestration.actor);
 * - council: сессия создала council-запись (source.session_id council-объекта)
 *   или агент — council-роль. Срезы независимы; каждый — подмножество тех же
 *   уникальных вызовов.
 */

export interface CallSliceView {
  calls: number;
  weighted: number;
  /** null — ни один вызов среза не несёт usage (tokens unknown, не нули). */
  tokens: RawTokens | null;
  /** Сумма только по вызовам среза с известным тарифом; null — нет таких. */
  cost_usd: number | null;
}

export interface CallSlices {
  total_unique_calls: number;
  weighted: number;
  tokens: RawTokens | null;
  cost: {
    basis: 'priced' | 'partial' | 'unknown';
    /** null при basis 'unknown' — стоимость не выдумывается (S-22). */
    total_usd: number | null;
    priced_calls: number;
    unknown_calls: number;
    /** Причины отсутствия $-цифры у части/всех вызовов; пусто при полной оценке. */
    reasons: string[];
  };
  /** Срезы назначения ТЕХ ЖЕ вызовов — в total не прибавляются (S-21). */
  learning: CallSliceView;
  council: CallSliceView;
}

/** Детерминированный ключ уникального вызова: event_id; без него — составной ключ. */
export function uniqueCallKey(ev: SignalEvent): string {
  if (ev.event_id !== undefined) return ev.event_id;
  return `${ev.run_id ?? ev.session_id ?? 'unknown'}|${ev.ts}|${ev.gen_ai.agent ?? ''}`;
}

function agentOf(ev: SignalEvent): string {
  if (typeof ev.gen_ai.agent === 'string' && ev.gen_ai.agent !== '') return ev.gen_ai.agent;
  return ev.orchestration.actor;
}

interface SliceAcc extends CallSliceView {
  pricedUsd: number | null;
}

function emptyAcc(): SliceAcc {
  return { calls: 0, weighted: 0, tokens: null, cost_usd: null, pricedUsd: null };
}

export function buildCallSlices(
  signals: readonly SignalEvent[],
  input: { pricing?: PricingTable; councilSessions?: ReadonlySet<string> } = {}
): CallSlices {
  // Уникальные вызовы: run-события, дедуп по ключу вызова (первая копия остаётся).
  const seen = new Set<string>();
  const calls: SignalEvent[] = [];
  for (const ev of signals) {
    if (ev.event !== 'run') continue;
    const key = uniqueCallKey(ev);
    if (seen.has(key)) continue;
    seen.add(key);
    calls.push(ev);
  }

  const learning = emptyAcc();
  const council = emptyAcc();
  let weighted = 0;
  let tokens: RawTokens | null = null;
  let pricedCalls = 0;
  let pricedSum = 0;
  const reasons = new Set<string>();

  const isCouncilCall = (ev: SignalEvent): boolean => {
    if (typeof ev.gen_ai.agent === 'string' && ev.gen_ai.agent.includes('council')) return true;
    return ev.session_id !== null && (input.councilSessions?.has(ev.session_id) ?? false);
  };

  for (const ev of calls) {
    weighted += ev.weighted ?? 0;
    if (ev.tokens) {
      tokens = tokens ?? { input: 0, output: 0, cache_read: 0 };
      tokens.input += ev.tokens.input;
      tokens.output += ev.tokens.output;
      tokens.cache_read += ev.tokens.cache_read;
    }
    const usd = runCostUsd(ev.tokens, input.pricing, ev.gen_ai.modelID);
    if (usd === null) {
      if (ev.tokens === undefined || ev.tokens === null) reasons.add('usage missing: no token data on the call');
      if (ev.gen_ai.modelID === null || ev.gen_ai.modelID === 'unknown')
        reasons.add('model unknown: no price can be selected');
      if (input.pricing === undefined) reasons.add('no pricing table: tariff unknown (no dollar figures published)');
      else if (
        ev.gen_ai.modelID !== null &&
        ev.gen_ai.modelID !== 'unknown' &&
        input.pricing[ev.gen_ai.modelID] === undefined
      ) {
        reasons.add(`no rate for model: ${ev.gen_ai.modelID}`);
      }
    } else {
      pricedCalls += 1;
      pricedSum += usd;
    }

    // Срезы назначения — те же вызовы, независимые подмножества.
    const agent = agentOf(ev);
    const bump = (acc: SliceAcc): void => {
      acc.calls += 1;
      acc.weighted += ev.weighted ?? 0;
      if (ev.tokens) {
        acc.tokens = acc.tokens ?? { input: 0, output: 0, cache_read: 0 };
        acc.tokens.input += ev.tokens.input;
        acc.tokens.output += ev.tokens.output;
        acc.tokens.cache_read += ev.tokens.cache_read;
      }
      if (usd !== null) acc.pricedUsd = (acc.pricedUsd ?? 0) + usd;
    };
    if (agent.includes('steward')) bump(learning);
    if (isCouncilCall(ev)) bump(council);
  }

  const totalUsd = pricedCalls > 0 ? pricedSum : null;
  const viewOf = (acc: SliceAcc): CallSliceView => ({
    calls: acc.calls,
    weighted: acc.weighted,
    tokens: acc.tokens,
    cost_usd: acc.pricedUsd,
  });

  return {
    total_unique_calls: calls.length,
    weighted,
    tokens,
    cost: {
      basis: calls.length === 0 || pricedCalls === 0 ? 'unknown' : pricedCalls === calls.length ? 'priced' : 'partial',
      total_usd: totalUsd,
      priced_calls: pricedCalls,
      unknown_calls: calls.length - pricedCalls,
      reasons: [...reasons].sort(),
    },
    learning: viewOf(learning),
    council: viewOf(council),
  };
}
