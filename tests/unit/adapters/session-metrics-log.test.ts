import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  appendRunSignal,
  appendComplaintSignal,
  appendDeliverySignal,
  recordToolError,
  readSignals,
  readSignalLog,
  readPatterns,
  metricsLogPath,
  patternsLogPath,
  patternThreshold,
  signalKey,
  DEFAULT_PATTERN_THRESHOLD,
  SignalEventSchema,
  type SignalEvent,
} from '../../../src/adapters/fs/session-metrics-log.js';
import { parseRunLog } from '../../../src/domain/tool-economy.js';

describe("Ф20 (D1.1): session-metrics.jsonl — writer'ы и формат", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-metrics-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function signals(): SignalEvent[] {
    return readSignals(dir);
  }

  it('(а) run: запись с gen_ai.modelID, weighted, agent, session, task-меткой, outcome', () => {
    appendRunSignal(dir, {
      model: 'zai-coding-plan/glm-5.3',
      agent: 'worker-implementer',
      title: 'Ф20 сигнальный лог',
      session: 'ses_abc',
      weighted: 12345,
      outcome: 'ok',
      actor: 'executor-lead',
    });
    const [rec] = signals();
    expect(rec.event).toBe('run');
    expect(rec.gen_ai.modelID).toBe('zai-coding-plan/glm-5.3');
    expect(rec.gen_ai.agent).toBe('worker-implementer');
    expect(rec.session_id).toBe('ses_abc');
    expect(rec.orchestration).toEqual({ task: 'Ф20 сигнальный лог', actor: 'executor-lead' });
    expect(rec.weighted).toBe(12345);
    expect(rec.outcome).toBe('ok');
    expect(typeof rec.ts).toBe('string');
  });

  it('(б) complain: сигнал жалобы с about/text, modelID-ключ присутствует (null = неизвестна)', () => {
    appendComplaintSignal(dir, {
      about: 'skill:apprentice',
      text: 'пропускает шаги',
      actor: 'user:owner',
      objectId: 'mem_x',
    });
    const [rec] = signals();
    expect(rec.event).toBe('complaint');
    expect(rec.gen_ai).toHaveProperty('modelID', null);
    expect(rec.detail).toMatchObject({ about: 'skill:apprentice', text: 'пропускает шаги', object_id: 'mem_x' });
  });

  it('(в) delivery: что/кому/каким механизмом (skill | frame)', () => {
    appendDeliverySignal(dir, {
      name: 'my-tool',
      mechanism: 'skill',
      target: '.opencode/skills/my-tool/SKILL.md',
      actor: 'user:cli',
    });
    appendDeliverySignal(dir, {
      name: 'apprentice',
      mechanism: 'frame',
      target: '.opencode/agents/apprentice.md',
      actor: 'user:cli',
    });
    const [a, b] = signals();
    expect(a.detail).toMatchObject({ name: 'my-tool', mechanism: 'skill' });
    expect(b.detail).toMatchObject({ name: 'apprentice', mechanism: 'frame' });
  });

  it('(г) tool_error: классификация + error_class_id в записи', () => {
    const res = recordToolError(dir, {
      tool_name: 'opencode',
      message: 'spawn opencode ENOENT',
      task: 't',
      agent: 'a',
    });
    expect(res.error_class_id).toBe('tool_not_found');
    const [rec] = signals();
    expect(rec.event).toBe('tool_error');
    expect(rec.tool_name).toBe('opencode');
    expect(rec.error_class_id).toBe('tool_not_found');
  });

  it('append-only: каждая запись — новая строка, порядок сохраняется', () => {
    appendComplaintSignal(dir, { about: 'x', text: '1', actor: 'a', objectId: 'o1' });
    appendComplaintSignal(dir, { about: 'x', text: '2', actor: 'a', objectId: 'o2' });
    const raw = readFileSync(metricsLogPath(dir), 'utf-8');
    expect(raw.trim().split('\n')).toHaveLength(2);
    expect(signals().map((s) => (s.detail as { text: string }).text)).toEqual(['1', '2']);
  });

  it('readSignals пропускает малформ-строки', () => {
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
    writeFileSync(
      metricsLogPath(dir),
      '{битая строка\n' +
        JSON.stringify({
          ts: 'x',
          event: 'complaint',
          session_id: null,
          gen_ai: { modelID: null, agent: null },
          orchestration: { task: null, actor: 'a' },
        }) +
        '\n'
    );
    expect(signals()).toHaveLength(1);
  });

  it('(M1-а) run: опциональные durationMs/tokens/experiment записываются и читаются', () => {
    appendRunSignal(dir, {
      model: 'zai-coding-plan/glm-5.3',
      agent: 'worker-implementer',
      title: 'M1 примитивы',
      session: 'ses_1',
      weighted: 42,
      outcome: 'ok',
      actor: 'executor-lead',
      durationMs: 1234,
      tokens: { input: 10, output: 2, cache_read: 3 },
      experiment: { id: 'exp-1', arm: 'wolf', taskId: 'task-9' },
    });
    const [rec] = signals();
    expect(rec.duration_ms).toBe(1234);
    expect(rec.tokens).toEqual({ input: 10, output: 2, cache_read: 3 });
    expect(rec.experiment).toEqual({ id: 'exp-1', arm: 'wolf', task_id: 'task-9' });
  });

  it('(M1-б) run без опциональных полей — в записи нет ключей duration_ms/tokens/experiment (backward-compat)', () => {
    appendRunSignal(dir, {
      model: 'm',
      agent: 'a',
      title: 't',
      session: null,
      weighted: 1,
      outcome: 'ok',
      actor: 'x',
    });
    const raw = JSON.parse(readFileSync(metricsLogPath(dir), 'utf-8').trim()) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(raw, 'duration_ms')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(raw, 'tokens')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(raw, 'experiment')).toBe(false);
  });

  it('(M1-в) parseRunLog: записи с новыми полями M1 парсятся с сохранением типов', () => {
    const entries = parseRunLog(
      JSON.stringify({
        ts: '2026-09-03T00:00:00.000Z',
        model: 'glm',
        agent: 'a',
        title: 't',
        session: 'ses_1',
        weighted: 100,
        duration_ms: 5000,
        tokens: { input: 10, output: 2, cache_read: 3 },
        experiment: { id: 'exp-1', arm: 'wolf', task_id: 'task-9' },
      })
    );
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(typeof entry?.duration_ms).toBe('number');
    expect(entry?.duration_ms).toBe(5000);
    expect(typeof entry?.tokens).toBe('object');
    expect(entry?.tokens).toEqual({ input: 10, output: 2, cache_read: 3 });
    expect(typeof entry?.experiment).toBe('object');
    expect(entry?.experiment).toEqual({ id: 'exp-1', arm: 'wolf', task_id: 'task-9' });
    expect(typeof entry?.session).toBe('string');
    expect(entry?.session).toBe('ses_1');
  });
});

describe('Ф21 (D1.3): событийный триггер паттерна при записи', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-patterns-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function complain(about: string): { patternFixed: boolean; count: number } {
    return appendComplaintSignal(dir, { about, text: `жалоба ${about}`, actor: 'user:owner', objectId: 'mem_x' });
  }

  it('порог N≥3: паттерн фиксируется ровно на 3-й записи, не раньше и не повторно', () => {
    expect(complain('skill:apprentice').patternFixed).toBe(false);
    expect(complain('skill:apprentice').patternFixed).toBe(false);
    const third = complain('skill:apprentice');
    expect(third.patternFixed).toBe(true);
    expect(third.count).toBe(3);
    // 4-я — паттерн уже зафиксирован, повторной фиксации нет
    expect(complain('skill:apprentice').patternFixed).toBe(false);
    expect(readPatterns(dir)).toHaveLength(1);
    expect(readPatterns(dir)[0]).toMatchObject({
      event: 'pattern',
      key: 'complaint:skill:apprentice',
      count: 3,
      threshold: 3,
    });
  });

  it('разные ключи считаются независимо; run-события не кластеризуются', () => {
    complain('a');
    complain('b');
    complain('a');
    appendRunSignal(dir, { model: 'm', agent: 'a', title: 't', session: null, weighted: 1, outcome: 'ok', actor: 'x' });
    expect(readPatterns(dir)).toHaveLength(0);
    expect(
      signalKey({
        ts: '',
        event: 'run',
        session_id: null,
        gen_ai: { modelID: 'm', agent: null },
        orchestration: { task: null, actor: 'a' },
      })
    ).toBeNull();
  });

  it('tool_error кластеризуется по ключу tool_name:error_class_id', () => {
    for (let i = 0; i < 3; i++) {
      recordToolError(dir, { tool_name: 'opencode', message: 'spawn opencode ENOENT' });
    }
    expect(readPatterns(dir)[0]?.key).toBe('opencode:tool_not_found');
  });

  it('порог — параметр процесса: learning.pattern_threshold из config.yaml', () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), 'learning:\n  pattern_threshold: 2\n');
    expect(patternThreshold(dir)).toBe(2);
    expect(complain('x').patternFixed).toBe(false);
    expect(complain('x').patternFixed).toBe(true);
    expect(readPatterns(dir)[0]).toMatchObject({ count: 2, threshold: 2 });
  });

  it('снижение порога после накопления: кластер фиксируется на следующей записи (§2.2 — порог настраиваем)', () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), 'learning:\n  pattern_threshold: 5\n');
    complain('late');
    complain('late');
    complain('late'); // 3 < 5 — фиксации нет
    expect(readPatterns(dir)).toHaveLength(0);
    writeFileSync(join(dir, '.wolf', 'config.yaml'), 'learning:\n  pattern_threshold: 2\n');
    const res = complain('late'); // 4 >= 2, ключ ещё не фиксирован → фиксация
    expect(res.count).toBe(4);
    expect(res.patternFixed).toBe(true);
    expect(readPatterns(dir)[0]).toMatchObject({ key: 'complaint:late', count: 4, threshold: 2 });
  });

  it('дефолт порога — 3 (спека §16), битый config не роняет', () => {
    expect(patternThreshold(dir)).toBe(DEFAULT_PATTERN_THRESHOLD);
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), 'learning:\n  pattern_threshold: "мусор"\n');
    expect(patternThreshold(dir)).toBe(3);
  });

  it('patterns.jsonl отсутствует до первого пересечения порога', () => {
    complain('y');
    expect(readPatterns(dir)).toHaveLength(0);
    expect(patternsLogPath(dir)).toContain('patterns.jsonl');
  });
});

describe('P0 D6: Zod-валидация сигнального лога + malformed-счётчик', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-metrics-val-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const validEvent = {
    ts: '2026-09-04T00:00:00.000Z',
    event: 'run',
    session_id: null,
    gen_ai: { modelID: 'm', agent: 'a' },
    orchestration: { task: null, actor: 'x' },
  };

  function writeRawLog(lines: string[]): void {
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
    writeFileSync(metricsLogPath(dir), lines.join('\n') + '\n');
  }

  it('garbage-строка: malformedLines+1, пропущена; валидные проходят', () => {
    writeRawLog(['not-json{', JSON.stringify(validEvent)]);
    const stats = readSignalLog(dir);
    expect(stats.malformedLines).toBe(1);
    expect(stats.events).toHaveLength(1);
    expect(stats.events[0]?.event).toBe('run');
    expect(stats.totalLines).toBe(2);
  });

  it('схемно-невалидный JSON: нет ts / event:bogus / orchestration не объект → malformedLines', () => {
    const noTs: Record<string, unknown> = { ...validEvent };
    delete noTs.ts;
    writeRawLog([
      JSON.stringify(noTs),
      JSON.stringify({ ...validEvent, event: 'bogus' }),
      JSON.stringify({ ...validEvent, orchestration: 'oops' }),
      JSON.stringify(validEvent),
    ]);
    const stats = readSignalLog(dir);
    expect(stats.malformedLines).toBe(3);
    expect(stats.events).toHaveLength(1);
    expect(stats.totalLines).toBe(4);
  });

  it('смешанный лог: readSignals возвращает только валидные, totalLines = валидные + malformed', () => {
    writeRawLog([
      JSON.stringify(validEvent),
      '{broken',
      JSON.stringify({ ...validEvent, ts: 42 }),
      JSON.stringify({ ...validEvent, event: 'complaint' }),
    ]);
    const stats = readSignalLog(dir);
    expect(stats.events.map((e) => e.event)).toEqual(['run', 'complaint']);
    expect(stats.totalLines).toBe(stats.events.length + stats.malformedLines);
    expect(readSignals(dir)).toHaveLength(2);
  });

  it('неизвестные поля отбрасываются (strip — дефолт zod-object)', () => {
    writeRawLog([JSON.stringify({ ...validEvent, extra_junk: 'x' })]);
    const stats = readSignalLog(dir);
    expect(stats.events).toHaveLength(1);
    expect(stats.events[0]).not.toHaveProperty('extra_junk');
  });

  it('roundtrip: события всех writer-форм (run/complaint/delivery/tool_error) проходят SignalEventSchema.safeParse', () => {
    appendRunSignal(dir, {
      model: 'm',
      agent: 'a',
      title: 't',
      session: 'ses_1',
      weighted: 5,
      outcome: 'ok',
      actor: 'x',
      durationMs: 100,
      tokens: { input: 1, output: 2, cache_read: 3 },
      experiment: { id: 'exp-1', arm: 'wolf', taskId: 'task-1' },
    });
    appendComplaintSignal(dir, { about: 'a', text: 't', actor: 'x', objectId: 'o' });
    appendDeliverySignal(dir, { name: 'n', mechanism: 'skill', target: 'tgt', actor: 'x' });
    recordToolError(dir, { tool_name: 'opencode', message: 'spawn opencode ENOENT' });
    const events = readSignals(dir);
    expect(events).toHaveLength(4);
    for (const ev of events) {
      expect(SignalEventSchema.safeParse(ev).success).toBe(true);
    }
    expect(readSignalLog(dir)).toMatchObject({ malformedLines: 0, totalLines: 4 });
  });
});

describe('P1 D1+D2: SignalEventSchema v2 identity-поля + upcast-совместимость', () => {
  const v1Event = {
    ts: '2026-09-04T00:00:00.000Z',
    event: 'run',
    session_id: null,
    gen_ai: { modelID: 'm', agent: 'a' },
    orchestration: { task: 't', actor: 'x' },
    weighted: 100,
  };

  it('v1-запись без новых полей: parse ok, новые поля undefined (D2 upcast)', () => {
    const res = SignalEventSchema.safeParse(v1Event);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.event).toBe('run');
    expect(res.data.event_id).toBeUndefined();
    expect(res.data.schema_version).toBeUndefined();
    expect(res.data.run_id).toBeUndefined();
    expect(res.data.trace_id).toBeUndefined();
    expect(res.data.parent_span_id).toBeUndefined();
    expect(res.data.role_level).toBeUndefined();
    expect(res.data.attempt).toBeUndefined();
    expect(res.data.task_id).toBeUndefined();
    expect(res.data.config_hash).toBeUndefined();
    expect(res.data.prompt_hash).toBeUndefined();
    expect(res.data.tools).toBeUndefined();
  });

  it('v2-запись со всеми identity-полями: parse ok, все поля на месте', () => {
    const res = SignalEventSchema.safeParse({
      ...v1Event,
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      schema_version: 2,
      run_id: '11111111-2222-3333-4444-555555555555',
      trace_id: '99999999-8888-7777-6666-555555555555',
      parent_span_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      role_level: 'L1',
      attempt: 2,
      task_id: 'task-42',
      config_hash: 'a1b2c3d4e5f6',
      prompt_hash: 'f6e5d4c3b2a1',
      tools: ['wolf-search'],
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toMatchObject({
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      schema_version: 2,
      run_id: '11111111-2222-3333-4444-555555555555',
      trace_id: '99999999-8888-7777-6666-555555555555',
      parent_span_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      role_level: 'L1',
      attempt: 2,
      task_id: 'task-42',
      config_hash: 'a1b2c3d4e5f6',
      prompt_hash: 'f6e5d4c3b2a1',
      tools: ['wolf-search'],
    });
  });

  it('v1-запись с неизвестным полем: strip — поле в результате отсутствует', () => {
    const res = SignalEventSchema.safeParse({ ...v1Event, foo: 1 });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).not.toHaveProperty('foo');
  });

  it('schema_version: 3 → parse не ok (literal(2))', () => {
    expect(SignalEventSchema.safeParse({ ...v1Event, schema_version: 3 }).success).toBe(false);
  });

  it("role_level: 'L9' → parse не ok (enum L0/L1/L2)", () => {
    expect(SignalEventSchema.safeParse({ ...v1Event, role_level: 'L9' }).success).toBe(false);
  });
});
