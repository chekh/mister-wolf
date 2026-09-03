import { describe, it, expect } from 'vitest';
import { runCostUsd, type PricingTable } from '../../../src/domain/pricing.js';

const pricing: PricingTable = {
  'zai-coding-plan/glm-5.3': { input: 0.6, output: 2.2, cache_read: 0.06 },
};

describe('runCostUsd (M3: $-конверсия, D9 — числа не выдумываем)', () => {
  it('стоимость = (input×p.input + output×p.output + cache_read×p.cache_read)/1e6', () => {
    // (1000×0.6 + 200×2.2 + 500×0.06)/1e6 = (600 + 440 + 30)/1e6 = 0.00107
    expect(runCostUsd({ input: 1000, output: 200, cache_read: 500 }, pricing, 'zai-coding-plan/glm-5.3')).toBeCloseTo(
      0.00107,
      10
    );
  });

  it('мегатокены → прайс в $ напрямую', () => {
    // 0.6 + 2.2 + 0.06 = 2.86
    expect(
      runCostUsd({ input: 1_000_000, output: 1_000_000, cache_read: 1_000_000 }, pricing, 'zai-coding-plan/glm-5.3')
    ).toBeCloseTo(2.86, 10);
  });

  it('нет pricing → null', () => {
    expect(runCostUsd({ input: 1, output: 1, cache_read: 1 }, undefined, 'm')).toBeNull();
  });

  it('модели нет в таблице → null', () => {
    expect(runCostUsd({ input: 1, output: 1, cache_read: 1 }, pricing, 'other-model')).toBeNull();
  });

  it('нет токенов → null', () => {
    expect(runCostUsd(null, pricing, 'zai-coding-plan/glm-5.3')).toBeNull();
    expect(runCostUsd(undefined, pricing, 'zai-coding-plan/glm-5.3')).toBeNull();
  });

  it('модель null → null', () => {
    expect(runCostUsd({ input: 1, output: 1, cache_read: 1 }, pricing, null)).toBeNull();
  });
});
