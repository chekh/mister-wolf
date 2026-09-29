import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  appendComplaintSignal,
  appendDeliverySignal,
  appendMcpCallSignal,
  addArgsSummary,
  countSessions,
  readSignals,
  readSignalLog,
  metricsLogPath,
  signalCountsPath,
  signalKey,
  SignalEventSchema,
  type SignalEvent,
} from '../../../src/adapters/fs/session-metrics-log.js';
import { parseRunLog } from '../../../src/domain/tool-economy.js';

// P104 (д): счётчик readFileSync — полная делегация реальному fs, поведение не меняется.
const fsReadFiles = vi.hoisted(() => [] as string[]);
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: ((...args: Parameters<typeof actual.readFileSync>) => {
      fsReadFiles.push(String(args[0]));
      return actual.readFileSync(...args);
    }) as typeof actual.readFileSync,
  };
});

describe("Ф20 (D1.1): session-metrics.jsonl — writer'ы и формат", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-metrics-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function signals(): SignalEvent[] {
    return readSignals(dir);
  }

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

describe('Ф21 (D1.3): signalKey и порог из config', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-patterns-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('run-события не кластеризуются (signalKey → null)', () => {
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
});

describe('silent-rules: countSessions', () => {
  it('упорядоченные уникальные session_id из run-событий', () => {
    const run = (sid: string, ts: string): SignalEvent => ({
      ts,
      event: 'run',
      session_id: sid,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:owner' },
    });
    const complaint: SignalEvent = {
      ts: '2026-01-01T00:00:03.000Z',
      event: 'complaint',
      session_id: 'cx',
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'user:owner' },
    };
    const sig = [
      run('s1', '2026-01-01T00:00:00.000Z'),
      run('s2', '2026-01-01T00:00:01.000Z'),
      run('s3', '2026-01-01T00:00:02.000Z'),
      run('s1', '2026-01-01T00:00:05.000Z'), // дубль — уже виделен
      complaint, // не run — игнорируется
    ];
    expect(countSessions(sig)).toEqual(['s1', 's2', 's3']);
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

  it('roundtrip: события всех writer-форм (complaint/delivery/mcp_call) проходят SignalEventSchema.safeParse', () => {
    appendComplaintSignal(dir, { about: 'a', text: 't', actor: 'x', objectId: 'o' });
    appendDeliverySignal(dir, { name: 'n', mechanism: 'skill', target: 'tgt', actor: 'x' });
    appendMcpCallSignal(dir, { tool: 'search', outcome: 'ok', durationMs: 1 });
    const events = readSignals(dir);
    expect(events).toHaveLength(3);
    for (const ev of events) {
      expect(SignalEventSchema.safeParse(ev).success).toBe(true);
    }
    expect(readSignalLog(dir)).toMatchObject({ malformedLines: 0, totalLines: 3 });
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

describe('волна 0: поля в detail (dogfooding-hardening §4 0.1)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-metrics-w0-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('appendMcpCallSignal ok: tool_name/outcome/duration_ms/detail.method; дефолты session_id=null, actor=system:wolf', () => {
    appendMcpCallSignal(dir, {
      tool: 'search',
      outcome: 'ok',
      durationMs: 42,
      detail: { method: 'search' },
    });
    const [rec] = readSignals(dir);
    expect(rec.event).toBe('mcp_call');
    expect(rec.tool_name).toBe('search');
    expect(rec.outcome).toBe('ok');
    expect(rec.duration_ms).toBe(42);
    expect(rec.detail?.method).toBe('search');
    expect(rec.detail).not.toHaveProperty('wolf_version'); // wolf_version кладёт вызывающий
    expect(rec.session_id).toBeNull();
    expect(rec.orchestration.actor).toBe('system:wolf');
  });

  it('appendMcpCallSignal ok: actor/sessionId переопределяют дефолты', () => {
    appendMcpCallSignal(dir, {
      tool: 'call',
      outcome: 'ok',
      durationMs: 1,
      actor: 'user:cli',
      sessionId: 'ses_1',
      detail: { cli_command: 'call' },
    });
    const [rec] = readSignals(dir);
    expect(rec.session_id).toBe('ses_1');
    expect(rec.orchestration.actor).toBe('user:cli');
    expect(rec.detail?.cli_command).toBe('call');
  });

  it('appendMcpCallSignal error: detail.error.message обрезан до 200, error_class_id классифицирован, code прокинут', () => {
    appendMcpCallSignal(dir, {
      tool: 'add',
      outcome: 'error',
      durationMs: 5,
      error: { message: `${'x'.repeat(250)} Type validation failed: scope`, code: 'EINVAL' },
    });
    const [rec] = readSignals(dir);
    expect(rec.outcome).toBe('error');
    const err = rec.detail?.error as { message: string; code?: string };
    expect(err.message).toHaveLength(200);
    expect(err.message).toBe(`${'x'.repeat(200)}`);
    expect(err.code).toBe('EINVAL');
    expect(rec.detail?.error_class_id).toBe('invalid_input'); // 'validation' в DEFAULT_ERROR_CLASS_RULES
  });

  it('appendDeliverySignal: target обрезан до 200 симв, sessionId/injectionBytes пишутся', () => {
    appendDeliverySignal(dir, {
      name: 'mem_1',
      mechanism: 'call',
      target: 'т'.repeat(250),
      actor: 'user:cli',
      sessionId: 's1',
      injectionBytes: 123,
    });
    const [rec] = readSignals(dir);
    expect(rec.session_id).toBe('s1');
    expect((rec.detail?.target as string).length).toBe(200);
    expect(rec.detail?.injection_bytes).toBe(123);
  });

  it('appendDeliverySignal: без sessionId → null; без injectionBytes → ключа нет (backward-compat)', () => {
    appendDeliverySignal(dir, { name: 'mem_2', mechanism: 'call', target: 't', actor: 'user:cli' });
    const [rec] = readSignals(dir);
    expect(rec.session_id).toBeNull();
    expect(rec.detail).not.toHaveProperty('injection_bytes');
  });

  it('addArgsSummary: type≤40, title≤80, extra_keys — только ключи, body не попадает', () => {
    const summary = addArgsSummary({
      type: 't'.repeat(60),
      title: 'j'.repeat(100),
      extra: { scope: 'project', answer: ['a'] },
    });
    expect(summary).toEqual({
      type: 't'.repeat(40),
      title: 'j'.repeat(80),
      extra_keys: ['scope', 'answer'],
    });
    expect(JSON.stringify(summary)).not.toContain('body');
  });

  it('addArgsSummary: undefined type/title → пустые строки', () => {
    expect(addArgsSummary({})).toEqual({ type: '', title: '', extra_keys: [] });
  });
});

describe('P104 (A1/A6): сайдкар signal-counts.json + конфиг только в error-ветке', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-p104-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function delivery(name: string): { count: number } {
    return appendDeliverySignal(dir, { name, mechanism: 'skill', actor: 'user:cli' });
  }

  it('(а) производительность: t(10k строк) < 500 мс — запись не линейна по длине лога', () => {
    // базовый замер на пустом логе
    const baseStart = performance.now();
    delivery('base');
    const baseMs = performance.now() - baseStart;
    // синтетика: +10k валидных delivery-строк другого ключа
    const synth = JSON.stringify({
      ts: '2026-09-29T00:00:00.000Z',
      event: 'delivery',
      session_id: null,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'synth' },
      outcome: 'delivered',
      detail: { name: 'bulk', mechanism: 'skill' },
    });
    mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
    writeFileSync(metricsLogPath(dir), Array.from({ length: 10_000 }, () => synth).join('\n') + '\n');
    delivery('warm'); // холодный старт: один rebuild-scan лога (сайдкара нет)
    const start = performance.now();
    const res = delivery('fast');
    const ms = performance.now() - start;
    expect(res.count).toBe(1);
    // старый O(n)-пересчёт с Zod-парсом на 10k строк уходил в секунды; новый — O(1)
    expect(ms).toBeLessThan(500);
    expect(ms).toBeLessThan(baseMs + 450); // в пределах шума от базового (пустой лог)
  });

  it('(б) битый/отсутствующий сайдкар → rebuild-scan восстанавливает счётчик', () => {
    expect(delivery('r').count).toBe(1);
    expect(delivery('r').count).toBe(2);
    writeFileSync(signalCountsPath(dir), '{битый json');
    expect(delivery('r').count).toBe(3); // мусор в сайдкаре → полный пересчёт лога
    expect(JSON.parse(readFileSync(signalCountsPath(dir), 'utf-8'))).toEqual({ 'delivery:r': 3 });
    rmSync(signalCountsPath(dir));
    expect(delivery('r').count).toBe(4); // отсутствие сайдкара → rebuild-scan
  });

  it('(г) счётчик корректен: серия N записей одного ключа → count последовательно 1..N', () => {
    for (let i = 1; i <= 5; i++) expect(delivery('serial').count).toBe(i);
    expect(delivery('other').count).toBe(1); // другой ключ — независимый счёт
  });

  it('(д) ok-вызов appendMcpCallSignal не читает config.yaml; error-вызов применяет проектную таксономию', () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(
      join(dir, '.wolf', 'config.yaml'),
      'error_class_taxonomy:\n  - id: custom_boom\n    match:\n      - boom_marker\n'
    );
    const configReads = () => fsReadFiles.filter((p) => p === join(dir, '.wolf', 'config.yaml')).length;
    const before = configReads();
    appendMcpCallSignal(dir, { tool: 'search', outcome: 'ok', durationMs: 1, detail: { method: 'search' } });
    expect(configReads()).toBe(before); // ок-путь: ни одного чтения конфига
    appendMcpCallSignal(dir, {
      tool: 'add',
      outcome: 'error',
      durationMs: 1,
      error: { message: 'boom_marker failure' }, // classifyError ловит haystack в lowercase
    });
    expect(configReads()).toBe(before + 1); // error-путь: конфиг прочитан (ровно один раз)
    const errRec = readSignals(dir).find((e) => e.outcome === 'error');
    expect(errRec?.detail?.error_class_id).toBe('custom_boom');
  });
});
