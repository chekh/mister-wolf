import { describe, it, expect } from 'vitest';
import { mechanicalAdviceFor, MECHANICAL_ADVICE } from '../../../src/domain/mechanical-advice.js';
import { DEFAULT_ERROR_CLASS_RULES, UNCATEGORIZED_ERROR_CLASS } from '../../../src/domain/error-class.js';

describe('mechanicalAdviceFor (Ф22 D2.1)', () => {
  it('возвращает непустой совет для каждого класса дефолтной таблицы', () => {
    for (const rule of DEFAULT_ERROR_CLASS_RULES) {
      const advice = mechanicalAdviceFor(rule.id);
      expect(advice, `нет совета для класса ${rule.id}`).not.toBeNull();
      expect(advice!.length, `пустой совет для класса ${rule.id}`).toBeGreaterThan(10);
    }
  });

  it('возвращает совет для uncategorized (резерв классификатора)', () => {
    expect(mechanicalAdviceFor(UNCATEGORIZED_ERROR_CLASS)).toBe(MECHANICAL_ADVICE.uncategorized);
  });

  it('null для неизвестного класса', () => {
    expect(mechanicalAdviceFor('no_such_class')).toBeNull();
  });
});
