import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractModel, parseRunMetrics } from '../../../src/adapters/cli/opencode-run-metrics.js';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/poc4-A1.json');
const fixture = readFileSync(fixturePath, 'utf-8');

const V2_BODY =
  'wolf-router routing v2 (класс: параметры). Целевая модель по умолчанию: ' +
  'zai-coding-plan/glm-5.2 (providerID=zai-coding-plan, modelID=glm-5.2). ' +
  'Смена с v1 (glm-5.3-flash) посреди PoC-сессии ses_fb301ed10ffetaXfRqjEuhJ91E.';

function stepFinish(input: number, output: number, cacheRead: number, session: string): string {
  return JSON.stringify({
    type: 'step_finish',
    sessionID: session,
    part: {
      type: 'step-finish',
      sessionID: session,
      tokens: { input, output, cache: { write: 0, read: cacheRead } },
    },
  });
}

describe('parseRunMetrics', () => {
  it('parses the PoC fixture: weighted 21694, session, one step-finish', () => {
    const metrics = parseRunMetrics(fixture);
    expect(metrics.weighted).toBe(21694); // 21679 + 0.1×0 + 5×3
    expect(metrics.session).toBe('ses_fb301ed10ffetaXfRqjEuhJ91E');
    expect(metrics.stepFinishes).toBe(1);
  });

  it('sums two step-finish events and applies the 0.1 cache.read weight', () => {
    const ndjson = [
      stepFinish(21679, 3, 0, 'ses_a'), // 21679 + 0 + 15 = 21694
      stepFinish(1000, 20, 500, 'ses_a'), // 1000 + 50 + 100 = 1150
    ].join('\n');
    const metrics = parseRunMetrics(ndjson);
    expect(metrics.stepFinishes).toBe(2);
    expect(metrics.session).toBe('ses_a');
    expect(metrics.weighted).toBeCloseTo(22844, 9); // 21694 + 1150
  });

  it('weights cache.read by 0.1 alone (non-zero cache)', () => {
    const metrics = parseRunMetrics(stepFinish(0, 0, 10, 'ses_b'));
    expect(metrics.weighted).toBeCloseTo(1, 9); // 0 + 0.1×10 + 0
  });

  it('raw token sums alongside weighted (M1: Σ tokens по step-finish)', () => {
    const ndjson = [stepFinish(21679, 3, 0, 'ses_a'), stepFinish(1000, 20, 500, 'ses_a')].join('\n');
    const metrics = parseRunMetrics(ndjson);
    expect(metrics.tokensIn).toBe(22679); // 21679 + 1000
    expect(metrics.tokensOut).toBe(23); // 3 + 20
    expect(metrics.cacheRead).toBe(500); // 0 + 500
    expect(metrics.weighted).toBeCloseTo(22844, 9); // старая формула не изменилась: 21694 + 1150
  });

  it('returns zeroes on empty and garbage input without throwing', () => {
    expect(parseRunMetrics('')).toEqual({
      session: null,
      weighted: 0,
      stepFinishes: 0,
      tokensIn: 0,
      tokensOut: 0,
      cacheRead: 0,
    });
    const garbage = parseRunMetrics('not json\n{"broken":\n\n{"type":"text","part":{"type":"text"}}');
    expect(garbage.weighted).toBe(0);
    expect(garbage.stepFinishes).toBe(0);
    expect(garbage.session).toBeNull();
  });
});

describe('extractModel', () => {
  it('extracts the model from the real v2 routing body', () => {
    expect(extractModel(V2_BODY)).toBe('zai-coding-plan/glm-5.2');
  });

  it('returns null when no model pattern is present', () => {
    expect(extractModel('никакой модели тут нет')).toBeNull();
    expect(extractModel('org/model (что-то другое, не providerID)')).toBeNull();
    expect(extractModel('')).toBeNull();
  });
});
