/**
 * M3 (D4/D9): $-конверсия токенов прогона по таблице прайсов из config.yaml.
 * Прайсы — $ за мегатокен ($/Mtok). null при отсутствии прайса/модели/токенов —
 * числа не выдумываем (прецедент EconomyResult.sufficient).
 */
export interface ModelPricing {
  input: number;
  output: number;
  cache_read: number;
}

/** modelID → прайс ($/Mtok); ключи — полные имена моделей (напр. 'zai-coding-plan/glm-5.3'). */
export type PricingTable = Record<string, ModelPricing>;

export interface RawTokens {
  input: number;
  output: number;
  cache_read: number;
}

/** Стоимость прогона в $; null при отсутствии прайса/модели/токенов — числа не выдумываем (D9). */
export function runCostUsd(
  tokens: RawTokens | null | undefined,
  pricing: PricingTable | undefined,
  model: string | null
): number | null {
  if (tokens === null || tokens === undefined) return null;
  if (model === null || pricing === undefined) return null;
  const p = pricing[model];
  if (p === undefined) return null;
  return (tokens.input * p.input + tokens.output * p.output + tokens.cache_read * p.cache_read) / 1e6;
}
