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
  readPatterns,
  metricsLogPath,
  patternsLogPath,
  patternThreshold,
  signalKey,
  DEFAULT_PATTERN_THRESHOLD,
  type SignalEvent,
} from '../../../src/adapters/fs/session-metrics-log.js';

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
