// tests/unit/adapters/p2-signal-events.test.ts
// P2 D1: memory_stage — writer, detail-схема,
// backward-compat расширенного enum.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  appendMemoryStageSignal,
  MemoryStageDetailSchema,
  readSignals,
  readSignalLog,
  metricsLogPath,
  signalKey,
  SignalEventSchema,
} from '../../../src/adapters/fs/session-metrics-log.js';

describe('P2 D1: appendMemoryStageSignal (writer)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-p2-stage-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('roundtrip: каждая стадия → event/outcome/detail/session_id; schema ok; key=null', () => {
    const stages = ['retrieved', 'injected', 'cited', 'applied'] as const;
    for (const stage of stages) {
      appendMemoryStageSignal(dir, { stage, memoryIds: ['mem_1', 'mem_2'], actor: 'user:cli', sessionId: 'ses_1' });
    }
    appendMemoryStageSignal(dir, { stage: 'cited', memoryIds: ['mem_3'], actor: 'agent:mcp' });
    const events = readSignals(dir).filter((e) => e.event === 'memory_stage');
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.outcome)).toEqual([...stages, 'cited']);
    for (const ev of events.slice(0, 4)) {
      expect(ev.gen_ai).toEqual({ modelID: null, agent: null });
      expect(ev.orchestration).toEqual({ task: null, actor: 'user:cli' });
      expect(ev.session_id).toBe('ses_1');
      expect(ev.detail).toEqual({ stage: ev.outcome, memory_ids: ['mem_1', 'mem_2'] });
      expect(SignalEventSchema.safeParse(ev).success).toBe(true);
      expect(signalKey(ev)).toBeNull();
    }
    expect(events[4]?.session_id).toBeNull();
    expect(events[4]?.orchestration.actor).toBe('agent:mcp');
    expect(events[4]?.detail).toEqual({ stage: 'cited', memory_ids: ['mem_3'] });
    expect(SignalEventSchema.safeParse(events[4]).success).toBe(true);
  });

  it('пустые memory_ids → ZodError (Error), событие НЕ пишется', () => {
    expect(() => appendMemoryStageSignal(dir, { stage: 'injected', memoryIds: [], actor: 'a' })).toThrow();
    expect(readSignals(dir)).toHaveLength(0);
  });
});

describe('P2: detail-схемы MemoryStageDetailSchema', () => {
  it('stage вне enum → safeParse не ok', () => {
    expect(MemoryStageDetailSchema.safeParse({ stage: 'forgotten', memory_ids: ['m1'] }).success).toBe(false);
  });

  it('пустые memory_ids → safeParse не ok', () => {
    expect(MemoryStageDetailSchema.safeParse({ stage: 'retrieved', memory_ids: [] }).success).toBe(false);
  });
});

describe('P2: backward-compat расширенного enum', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-p2-compat-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('v1-строки лога всех прежних типов валидны после расширения enum', () => {
    const base = {
      ts: '2026-09-04T00:00:00.000Z',
      session_id: null,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:cli' },
    };
    const oldEvents = ['run', 'complaint', 'delivery', 'tool_error', 'task_evaluated', 'mcp_call'].map((event) => ({
      ...base,
      event,
      ...(event === 'run' ? { weighted: 100, outcome: 'ok' } : {}),
      ...(event === 'mcp_call' ? { tool_name: 'search', duration_ms: 5, outcome: 'ok' } : {}),
      ...(event === 'tool_error' ? { tool_name: 'opencode', error_class_id: 'tool_not_found', outcome: 'error' } : {}),
    }));
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
    writeFileSync(metricsLogPath(dir), oldEvents.map((e) => JSON.stringify(e)).join('\n') + '\n');
    const stats = readSignalLog(dir);
    expect(stats.malformedLines).toBe(0);
    expect(stats.events.map((e) => e.event)).toEqual([
      'run',
      'complaint',
      'delivery',
      'tool_error',
      'task_evaluated',
      'mcp_call',
    ]);
    // run-запись v1 (без новых полей) валидна как есть
    expect(SignalEventSchema.safeParse(oldEvents[0]).success).toBe(true);
  });
});
