import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';
import {
  USAGE_SOURCE_LIMITATIONS,
  signalFromTurn,
  summarizeRuns,
  usageEventId,
  type UsageRun,
  type UsageTurn,
} from '../../../src/app/use-cases/usage-signal.js';

const baseTurn = (over: Partial<UsageTurn> = {}): UsageTurn => ({
  messageId: 'msg_full',
  sessionId: 'ses_1',
  seq: 3,
  createdMs: 1000,
  completedMs: 2500,
  agent: 'executor-lead',
  modelId: 'ds-cp/deepseek-flash',
  providerId: 'company',
  tokens: { input: 100, output: 10, cacheRead: 50 },
  reasoning: 0,
  cacheWrite: 0,
  finish: 'stop',
  attempt: null,
  ...over,
});

const asEvent = (event: SignalEvent | null): SignalEvent => {
  if (!event) throw new Error('ожидалось событие run');
  return event;
};

const runMeta: UsageRun = {
  sessionId: 'ses_1',
  parentSessionId: 'ses_parent',
  agent: 'executor-lead',
  modelId: null,
  providerId: null,
  createdMs: 1000,
  busyMs: 9000,
};

describe('usageEventId', () => {
  it('детерминирован и зависит только от messageId', () => {
    const first = usageEventId('msg_1');
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(usageEventId('msg_1')).toBe(first);
    expect(usageEventId('msg_2')).not.toBe(first);
  });

  it('повтор messageId даёт одинаковый event_id', () => {
    const a = asEvent(signalFromTurn(baseTurn()));
    const b = asEvent(signalFromTurn(baseTurn({ createdMs: 1100, tokens: null })));
    expect(a.event_id).toBe(b.event_id);
  });
});

describe('signalFromTurn', () => {
  it('мапит полный turn в событие run', () => {
    const ev = asEvent(signalFromTurn(baseTurn()));
    expect(ev).toMatchObject({
      ts: new Date(2500).toISOString(),
      event: 'run',
      schema_version: 2,
      session_id: 'ses_1',
      run_id: 'ses_1',
      event_id: usageEventId('msg_full'),
      gen_ai: { modelID: 'company/ds-cp/deepseek-flash', agent: 'executor-lead' },
      orchestration: { task: null, actor: 'agent:executor-lead' },
      tokens: { input: 100, output: 10, cache_read: 50 },
      weighted: 155,
      duration_ms: 1500,
      outcome: 'ok',
    });
    expect(ev.trace_id).toBeUndefined();
    expect(ev.task_id).toBeUndefined();
    expect(ev.attempt).toBeUndefined();
  });

  it('не импортирует незавершённый turn', () => {
    expect(signalFromTurn(baseTurn({ completedMs: null }))).toBeNull();
  });

  it('не импортирует turn без session_id', () => {
    expect(signalFromTurn(baseTurn({ sessionId: '' }))).toBeNull();
  });

  it('без tokens не пишет ни tokens, ни weighted (не нули)', () => {
    const ev = asEvent(signalFromTurn(baseTurn({ tokens: null })));
    expect(ev.tokens).toBeUndefined();
    expect(ev.weighted).toBeUndefined();
  });

  it('reasoning и cache.write не входят в output и weighted', () => {
    const ev = asEvent(signalFromTurn(baseTurn({ reasoning: 900, cacheWrite: 700 })));
    expect(ev.tokens).toEqual({ input: 100, output: 10, cache_read: 50 });
    expect(ev.weighted).toBe(155);
  });

  it('finish: stop/tool-calls → ok, error → error, отсутствие → поле опущено', () => {
    expect(asEvent(signalFromTurn(baseTurn({ finish: 'stop' }))).outcome).toBe('ok');
    expect(asEvent(signalFromTurn(baseTurn({ finish: 'tool-calls' }))).outcome).toBe('ok');
    expect(asEvent(signalFromTurn(baseTurn({ finish: 'error' }))).outcome).toBe('error');
    expect(asEvent(signalFromTurn(baseTurn({ finish: null }))).outcome).toBeUndefined();
  });

  it('attempt берётся из retry, без retry поле опущено', () => {
    expect(asEvent(signalFromTurn(baseTurn({ attempt: 2 }))).attempt).toBe(2);
    expect(asEvent(signalFromTurn(baseTurn({ attempt: null }))).attempt).toBeUndefined();
  });

  it('модель turn приоритетнее модели сессии', () => {
    const ev = asEvent(signalFromTurn(baseTurn(), { sessionModel: { id: 'ses-model', providerID: 'ses-prov' } }));
    expect(ev.gen_ai.modelID).toBe('company/ds-cp/deepseek-flash');
  });

  it('модель: fallback на сессию, без модели — null и actor unknown', () => {
    const known = asEvent(
      signalFromTurn(baseTurn({ modelId: null, providerId: null }), {
        sessionModel: { id: 'ses-model', providerID: 'ses-prov' },
      })
    );
    expect(known.gen_ai.modelID).toBe('ses-prov/ses-model');

    const bare = asEvent(signalFromTurn(baseTurn({ modelId: null, providerId: null, agent: null })));
    expect(bare.gen_ai.modelID).toBeNull();
    expect(bare.orchestration.actor).toBe('opencode:unknown');
  });

  it('trace_id и task_id берутся из контекста', () => {
    const ev = asEvent(signalFromTurn(baseTurn(), { traceId: 'tr_1', taskId: 'A1-1-IMP-1' }));
    expect(ev.trace_id).toBe('tr_1');
    expect(ev.task_id).toBe('A1-1-IMP-1');
  });

  it('duration опускается при неизвестном created или отрицательной разнице', () => {
    expect(asEvent(signalFromTurn(baseTurn({ createdMs: 3000 }))).duration_ms).toBeUndefined();
    expect(asEvent(signalFromTurn(baseTurn({ createdMs: null }))).duration_ms).toBeUndefined();
  });
});

describe('summarizeRuns', () => {
  it('пустой набор событий помечает неизвестность, а не 0 расхода', () => {
    const rows = summarizeRuns([], [runMeta]);
    expect(rows).toHaveLength(1);
    expect(rows).toMatchObject([{ runId: 'ses_1', events: 0, tokens: null, generationMs: null }]);
    expect(rows.some((row) => row.unknowns.includes('no-events'))).toBe(true);
    expect(rows.some((row) => row.unknowns.includes('tokens-unknown'))).toBe(true);
    expect(summarizeRuns([], [])).toEqual([]);
  });

  it('агрегирует события одного run', () => {
    const events = [
      asEvent(signalFromTurn(baseTurn({ messageId: 'm1', createdMs: 1000, completedMs: 2000 }))),
      asEvent(
        signalFromTurn(
          baseTurn({
            messageId: 'm2',
            createdMs: 4000,
            completedMs: 5000,
            tokens: { input: 10, output: 2, cacheRead: 0 },
            finish: 'error',
          })
        )
      ),
    ];
    const rows = summarizeRuns(events, [runMeta]);
    expect(rows).toMatchObject([
      {
        runId: 'ses_1',
        sessionId: 'ses_1',
        traceId: null,
        taskId: null,
        attempts: null,
        model: 'company/ds-cp/deepseek-flash',
        agent: 'executor-lead',
        tokens: { input: 110, output: 12, cacheRead: 50 },
        generationMs: 2000,
        busyMs: 9000,
        events: 2,
        outcomes: { ok: 1, error: 1, unknown: 0 },
      },
    ]);
    expect(rows.every((row) => row.unknowns.includes('attempt-unknown'))).toBe(true);
    expect(rows.every((row) => row.unknowns.includes('task-unknown'))).toBe(true);
    expect(rows.every((row) => !row.unknowns.includes('tokens-unknown'))).toBe(true);
  });

  it('два run с attempt=1 (разные session_id) дают две строки', () => {
    const events = [
      asEvent(signalFromTurn(baseTurn({ messageId: 'r1', sessionId: 'ses_a', attempt: 1 }))),
      asEvent(signalFromTurn(baseTurn({ messageId: 'r2', sessionId: 'ses_b', attempt: 1 }))),
    ];
    const rows = summarizeRuns(events, []);
    expect(rows.map((row) => row.runId)).toEqual(['ses_a', 'ses_b']);
    expect(rows.map((row) => row.attempts)).toEqual([[1], [1]]);
    expect(rows.map((row) => row.events)).toEqual([1, 1]);
  });

  it('task_id из контекста: общий раскрывается, разные — unknown', () => {
    const same = [
      asEvent(signalFromTurn(baseTurn({ messageId: 't1' }), { taskId: 'T1' })),
      asEvent(signalFromTurn(baseTurn({ messageId: 't2' }), { taskId: 'T1' })),
    ];
    expect(summarizeRuns(same, []).map((row) => row.taskId)).toEqual(['T1']);

    const mixed = [
      asEvent(signalFromTurn(baseTurn({ messageId: 't3' }), { taskId: 'T1' })),
      asEvent(signalFromTurn(baseTurn({ messageId: 't4' }), { taskId: 'T2' })),
    ];
    const rows = summarizeRuns(mixed, []);
    expect(rows.map((row) => row.taskId)).toEqual([null]);
    expect(rows.some((row) => row.unknowns.includes('task-unknown'))).toBe(true);
  });

  it('события без tokens дают tokens: null и tokens-unknown', () => {
    const rows = summarizeRuns([asEvent(signalFromTurn(baseTurn({ tokens: null })))], []);
    expect(rows.map((row) => row.tokens)).toEqual([null]);
    expect(rows.some((row) => row.unknowns.includes('tokens-unknown'))).toBe(true);
  });
});

describe('USAGE_SOURCE_LIMITATIONS', () => {
  it('непустой список ограничений источника', () => {
    expect(USAGE_SOURCE_LIMITATIONS.length).toBeGreaterThanOrEqual(5);
    const text = USAGE_SOURCE_LIMITATIONS.join(' ');
    expect(text).toMatch(/variant/);
    expect(text).toMatch(/cost/);
    expect(text).toMatch(/reasoning/);
  });
});

describe('fixture usage-turns.json', () => {
  const raw = readFileSync(join(process.cwd(), 'tests/fixtures/usage-turns.json'), 'utf8');
  const fixture = JSON.parse(raw) as {
    _comment: string;
    turns: Array<Record<string, any>>;
  };

  it('содержит 3–5 записей источника без текста сообщений', () => {
    expect(fixture._comment.length).toBeGreaterThan(0);
    expect(fixture.turns.length).toBeGreaterThanOrEqual(3);
    expect(fixture.turns.length).toBeLessThanOrEqual(5);
    expect(raw).not.toMatch(/"(text|content|parts)"/);
  });

  it('поля совпадают с источником session_message', () => {
    for (const turn of fixture.turns) {
      expect(typeof turn.id).toBe('string');
      expect(typeof turn.session_id).toBe('string');
      expect(typeof turn.data.time.created).toBe('number');
      expect(typeof turn.data.tokens.input).toBe('number');
      expect(typeof turn.data.tokens.cache.read).toBe('number');
      expect(typeof turn.data.model.id).toBe('string');
      expect(typeof turn.data.model.providerID).toBe('string');
    }
    expect(fixture.turns.some((turn) => turn.data.finish === 'error')).toBe(true);
    expect(fixture.turns.some((turn) => typeof turn.data.retry?.attempt === 'number')).toBe(true);
  });
});
