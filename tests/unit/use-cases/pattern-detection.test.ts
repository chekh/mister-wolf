import { describe, it, expect } from 'vitest';
import {
  detectPatterns,
  summarizeSignalLog,
  type PatternSummary,
} from '../../../src/app/use-cases/pattern-detection.js';
import type { SignalEvent, SignalEventName } from '../../../src/adapters/fs/session-metrics-log.js';

// Фикстуры-конструкторы: только данные, без fs — detectPatterns чистая функция.
function ev(event: SignalEventName, extra: Partial<SignalEvent> = {}): SignalEvent {
  return {
    ts: '2026-08-30T12:00:00.000Z',
    event,
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:owner' },
    ...extra,
  };
}

function complaint(about: string, ts: string): SignalEvent {
  return ev('complaint', { ts, detail: { about, text: 'текст жалобы' } });
}

function toolError(tool: string, cls: string, ts: string): SignalEvent {
  return ev('tool_error', { ts, tool_name: tool, error_class_id: cls, detail: { message: 'msg' } });
}

function runSignal(ts: string, model: string | null = 'org/model'): SignalEvent {
  return ev('run', { ts, session_id: 'ses_1', gen_ai: { modelID: model, agent: 'worker' } });
}

describe('Ф21: detectPatterns — группировка по signalKey', () => {
  it('3× tool_error один ключ → паттерн есть; 2× → нет', () => {
    const three = [
      toolError('opencode', 'tool_not_found', '2026-08-30T10:00:00.000Z'),
      toolError('opencode', 'tool_not_found', '2026-08-30T11:00:00.000Z'),
      toolError('opencode', 'tool_not_found', '2026-08-30T12:00:00.000Z'),
    ];
    const [p] = detectPatterns(three);
    expect(p).toMatchObject({
      key: 'opencode:tool_not_found',
      count: 3,
      first_ts: '2026-08-30T10:00:00.000Z',
      last_ts: '2026-08-30T12:00:00.000Z',
    });
    expect(detectPatterns(three.slice(0, 2))).toHaveLength(0);
  });

  it('run-события не группируются (signalKey === null)', () => {
    const signals = [runSignal('t1'), runSignal('t2'), runSignal('t3'), runSignal('t4')];
    expect(detectPatterns(signals)).toHaveLength(0);
  });

  it('evidence-ссылки указывают на правильные номера строк (1-based), run не занимает кластер', () => {
    const signals = [
      runSignal('t0'), // строка 1 — run, не кластеризуется
      complaint('skill:demo', 't1'), // строка 2
      complaint('other', 't2'), // строка 3
      complaint('skill:demo', 't3'), // строка 4
      complaint('skill:demo', 't4'), // строка 5
    ];
    const [p] = detectPatterns(signals);
    expect(p!.key).toBe('complaint:skill:demo');
    expect(p!.evidence).toEqual(['session-metrics.jsonl:2', 'session-metrics.jsonl:4', 'session-metrics.jsonl:5']);
  });

  it('сортировка стабильна: count убыв., затем key по возрастанию', () => {
    const signals: SignalEvent[] = [
      complaint('b', 't1'),
      complaint('a', 't2'),
      complaint('a', 't3'),
      complaint('a', 't4'),
      complaint('b', 't5'),
      complaint('b', 't6'),
      complaint('c', 't7'),
      complaint('c', 't8'),
      complaint('c', 't9'),
    ];
    // a=3, b=3, c=3 — одинаковое count → порядок по key
    const keys = detectPatterns(signals).map((p: PatternSummary) => p.key);
    expect(keys).toEqual(['complaint:a', 'complaint:b', 'complaint:c']);
    // теперь c=4 (максимум) — идёт первым
    const ranked = detectPatterns([...signals, complaint('c', 't10')]).map((p) => [p.key, p.count]);
    expect(ranked).toEqual([
      ['complaint:c', 4],
      ['complaint:a', 3],
      ['complaint:b', 3],
    ]);
  });
});

describe('Ф21: summarizeSignalLog — Layer 1–2 meta-metrics', () => {
  const fixture: SignalEvent[] = [
    runSignal('t1', 'org/model'), // model известна, session есть
    runSignal('t2', null), // model неизвестна, session есть
    complaint('skill:demo', 't3'), // orphan (session_id null)
    toolError('opencode', 'uncategorized', 't4'), // ошибка без класса
    toolError('bash', 'timeout', 't5'),
    toolError('bash', 'timeout', 't6'),
    toolError('bash', 'timeout', 't7'), // паттерн bash:timeout (count 3)
  ];

  it('считает объёмы, layer1 и layer2 корректно', () => {
    const s = summarizeSignalLog(fixture);
    expect(s.totalEvents).toBe(7);
    expect(s.byEvent).toEqual({ run: 2, complaint: 1, tool_error: 4 });
    expect(s.lastEvents).toHaveLength(5);
    expect(s.lastEvents[0]).toEqual(fixture[2]); // последние 5 по порядку файла
    expect(s.lastEvents[4]).toEqual(fixture[6]);

    expect(s.layer1.uncategorized_errors).toBe(1);
    expect(s.layer1.uncategorizedShare).toBe(1 / 4); // 1 uncategorized из 4 tool_error
    expect(s.layer1.orphanSignals).toBe(5); // всё, кроме двух run с session_id
    expect(s.layer1.signalCoverage).toBe(1 / 7); // только первый run с modelID

    expect(s.layer2.emergingPatterns).toBe(1); // bash:timeout
    expect(s.layer2.clusterDensity).toBe(3); // средний count единственного паттерна
  });

  it('пустой лог — валидная сводка с null-метриками', () => {
    const s = summarizeSignalLog([]);
    expect(s.totalEvents).toBe(0);
    expect(s.byEvent).toEqual({});
    expect(s.lastEvents).toEqual([]);
    expect(s.layer1.uncategorizedShare).toBeNull();
    expect(s.layer1.signalCoverage).toBeNull();
    expect(s.layer1.orphanSignals).toBe(0);
    expect(s.layer2.clusterDensity).toBeNull();
    expect(s.layer2.emergingPatterns).toBe(0);
  });
});
