import { describe, it, expect } from 'vitest';
import { classifyScenario } from '../../../src/domain/solve/classify.js';
import { STOP_WORDS } from '../../../src/domain/solve/scenarios.js';

describe('classifyScenario', () => {
  it('classifies deprecated-command symptom as stale-instruction', () => {
    const r = classifyScenario('agent keeps using deprecated get command');
    expect(r.scenarioId).toBe('stale-instruction');
    expect(r.matchedSymptoms.length).toBeGreaterThan(0);
  });

  it('classifies repeated-correction symptom as missing-rule', () => {
    const r = classifyScenario('user repeats the same instruction every session');
    expect(r.scenarioId).toBe('missing-rule');
  });

  it('falls back to generic on unknown symptom', () => {
    expect(classifyScenario('weather is nice today').scenarioId).toBe('generic');
  });

  it('tie breaks by scenario order in registry', () => {
    // 'deprecated' матчит stale-instruction, 'rule' матчит missing-rule — равный вес,
    // реестр начинается со stale-instruction → побеждает он
    expect(classifyScenario('deprecated rule').scenarioId).toBe('stale-instruction');
  });

  it('pins STOP_WORDS composition (refine r1 tail)', () => {
    for (const w of [
      'the',
      'a',
      'an',
      'is',
      'are',
      'to',
      'of',
      'and',
      'or',
      'in',
      'on',
      'with',
      'for',
      'keeps',
      'keep',
      'agent',
    ]) {
      expect(STOP_WORDS).toContain(w);
    }
    for (const w of ['и', 'в', 'на', 'с', 'по', 'для', 'не', 'что', 'это']) {
      expect(STOP_WORDS).toContain(w);
    }
    expect(classifyScenario('agent keeps using deprecated get command').matchedSymptoms).not.toContain('agent');
  });
});
