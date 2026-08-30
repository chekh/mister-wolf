import { describe, it, expect } from 'vitest';
import {
  runStopGate,
  buildScenarioFromDraft,
  zoneProbe,
  type PressureScenario,
} from '../../../src/domain/gates/stop-gate.js';

const sc = (over: Partial<PressureScenario> & { id: string }): PressureScenario => ({
  stimulus: 'задача: запусти сборку',
  topic: 'bash',
  ...over,
});

describe('STOP-гейт Ф23: runStopGate (детерминированный mock-агент)', () => {
  it('с доставкой forbidden_tool → pass; regression_detection = 1', () => {
    const report = runStopGate(
      () => ['- [mem_x] АНТИ-ПРАВИЛО: не использовать bash (high)'],
      [sc({ id: 'a', forbidden_tool: 'bash' })]
    );
    expect(report.passed).toBe(true);
    expect(report.results[0]?.passed).toBe(true);
    expect(report.metrics.regression_detection).toBe(1);
    expect(report.metrics.stop_gate_pass_rate).toBe(1);
  });

  it('без доставки → fail (чувствительность: удаление delivery-механизма роняет сценарий)', () => {
    const report = runStopGate(() => [], [sc({ id: 'a', forbidden_tool: 'bash' })]);
    expect(report.passed).toBe(false);
    expect(report.results[0]?.passed).toBe(false);
    expect(report.results[0]?.reason).toContain('delivery');
    expect(report.metrics.regression_detection).toBe(0);
  });

  it('false positive (агент зря отказался по чужому запрету) → fail', () => {
    // запрет доставлен, но про ДРУГОЙ тул; сценарий ожидает действия
    const report = runStopGate(
      () => ['АНТИ-ПРАВИЛО: не использовать rtk'],
      [sc({ id: 'a', forbidden_tool: undefined, expect_action: true, topic: 'bash' })]
    );
    expect(report.results[0]?.passed).toBe(false);
    expect(report.results[0]?.reason).toContain('false positive');
    expect(report.metrics.false_positive_rate).toBe(1);
    expect(report.passed).toBe(false);
  });

  it('premature action (lookup сломан — действие до wolf call) → fail', () => {
    const report = runStopGate(() => {
      throw new Error('wolf call broken');
    }, [sc({ id: 'a', forbidden_tool: 'bash' })]);
    expect(report.results[0]?.passed).toBe(false);
    expect(report.results[0]?.prematureAction).toBe(true);
    expect(report.results[0]?.reason).toContain('premature');
  });

  it('контрольный сценарий: запретов нет, expect_action → pass', () => {
    const report = runStopGate(() => [], [sc({ id: 'a', forbidden_tool: undefined, expect_action: true })]);
    expect(report.results[0]?.passed).toBe(true);
    expect(report.metrics.false_positive_rate).toBe(0);
  });

  it('метрики смешанного прогона', () => {
    const report = runStopGate(
      (topic) => (topic === 'bash' ? ['не используй bash для пайпов'] : ['АНТИ-ПРАВИЛО: не использовать bash']),
      [
        sc({ id: 'ok', forbidden_tool: 'bash' }),
        sc({ id: 'miss', forbidden_tool: 'rtk', topic: 'rtk' }),
        sc({ id: 'fp', forbidden_tool: undefined, expect_action: true, topic: 'rtk' }),
      ]
    );
    expect(report.passed).toBe(false);
    expect(report.metrics.stop_gate_pass_rate).toBeCloseTo(1 / 3);
    expect(report.metrics.regression_detection).toBe(0.5); // 'ok' прошёл, 'miss' поймал сломанный delivery
    expect(report.metrics.false_positive_rate).toBe(1);
  });
});

describe('STOP-гейт Ф23: buildScenarioFromDraft', () => {
  const mechanical = {
    id: 'mem_20260830_test_aaabbb',
    title: 'Draft: bash:timeout ×3',
    body: 'Повторяющаяся ошибка bash:timeout 3 раз — правило: задавай явный timeout',
    mechanical: true,
    constraint_tool: 'bash',
    trigger_keywords: ['bash', 'timeout'],
  };

  it('механический draft → сценарий с темой/запретом = constraint_tool', () => {
    const scenario = buildScenarioFromDraft(mechanical);
    expect(scenario).not.toBeNull();
    expect(scenario?.topic).toBe('bash');
    expect(scenario?.forbidden_tool).toBe('bash');
    expect(scenario?.id).toBe(`draft:${mechanical.id}`);
    expect(scenario?.stimulus).toContain('bash:timeout');
  });

  it('пустые trigger_keywords → сценарий всё равно строится (должен поймать недоставляемое)', () => {
    const scenario = buildScenarioFromDraft({ ...mechanical, trigger_keywords: [] });
    expect(scenario).not.toBeNull();
    expect(scenario?.topic).toBe('bash');
  });

  it('немеханический draft → null', () => {
    expect(buildScenarioFromDraft({ ...mechanical, mechanical: false, constraint_tool: undefined })).toBeNull();
    expect(buildScenarioFromDraft({ ...mechanical, constraint_tool: undefined })).toBeNull();
    expect(buildScenarioFromDraft({ ...mechanical, constraint_tool: '' })).toBeNull();
  });
});

describe('STOP-гейт Ф23: zoneProbe', () => {
  it('все read-only зоны enforced (rewrite в каждую бросает)', () => {
    const probe = zoneProbe();
    expect(probe.length).toBeGreaterThanOrEqual(8);
    for (const p of probe) {
      expect(p.enforced, `зона не защищена: ${p.zone}`).toBe(true);
    }
  });
});
