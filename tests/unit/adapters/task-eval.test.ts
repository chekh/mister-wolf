// tests/unit/adapters/task-eval.test.ts
// P0 D2+D3: `wolf task-eval` — roundtrip события task_evaluated в сигнальный лог
// + writer-юнит appendTaskEvaluatedSignal. exitOverride — commander-ошибки
// (невалидный choice) падают reject'ом, а не process.exit.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { taskEvalCommand } from '../../../src/adapters/cli/commands/task-eval.js';
import {
  appendTaskEvaluatedSignal,
  readSignals,
  metricsLogPath,
  signalKey,
  SignalEventSchema,
} from '../../../src/adapters/fs/session-metrics-log.js';

describe('D3: `wolf task-eval` — roundtrip в сигнальный лог', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-task-eval-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('roundtrip: parseAsync → событие в логе, сырая строка проходит SignalEventSchema', async () => {
    await taskEvalCommand(dir)
      .exitOverride()
      .parseAsync(['--verdict', 'accepted', '--session', 's1', '--criteria-passed', '2', '--criteria-total', '3'], {
        from: 'user',
      });
    const events = readSignals(dir);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('task_evaluated');
    expect(events[0].session_id).toBe('s1');
    expect(events[0].detail?.verdict).toBe('accepted');
    expect(events[0].detail?.scorer).toBe('human');
    expect(events[0].detail?.criteria_passed).toBe(2);
    expect(events[0].detail?.criteria_total).toBe(3);
    // schema-check сырой строки файла (readSignals уже strip-ит — проверяем как записано)
    const rawLine = JSON.parse(readFileSync(metricsLogPath(dir), 'utf-8').trim()) as unknown;
    expect(SignalEventSchema.safeParse(rawLine).success).toBe(true);
  });

  it('невалидный verdict — commander-ошибка со списком допустимых', async () => {
    await expect(
      taskEvalCommand(dir).exitOverride().parseAsync(['--verdict', 'bogus'], { from: 'user' })
    ).rejects.toThrow(/is invalid\. allowed choices are accepted, rejected, partial, inconclusive/i);
  });

  it('невалидный scorer — commander-ошибка со списком допустимых', async () => {
    await expect(
      taskEvalCommand(dir).exitOverride().parseAsync(['--verdict', 'accepted', '--scorer', 'oracle'], { from: 'user' })
    ).rejects.toThrow(/is invalid\. allowed choices are human, deterministic, llm_judge, hidden_tests/i);
  });

  it('дефолты: без --scorer → human; critical_failure только с флагом', async () => {
    await taskEvalCommand(dir).exitOverride().parseAsync(['--verdict', 'partial'], { from: 'user' });
    expect(readSignals(dir)[0].detail?.scorer).toBe('human');
    expect('critical_failure' in (readSignals(dir)[0].detail ?? {})).toBe(false);

    await taskEvalCommand(dir)
      .exitOverride()
      .parseAsync(['--verdict', 'rejected', '--critical-failure'], { from: 'user' });
    expect(readSignals(dir)[1].detail?.critical_failure).toBe(true);
  });

  // P3 D1: --campaign → detail.campaign_id; без флага поля нет
  it('P3 D1: --campaign eval-01 → detail.campaign_id; без флага поля нет', async () => {
    await taskEvalCommand(dir)
      .exitOverride()
      .parseAsync(['--verdict', 'accepted', '--session', 's1', '--campaign', 'eval-01'], { from: 'user' });
    expect(readSignals(dir)[0].detail?.campaign_id).toBe('eval-01');

    await taskEvalCommand(dir).exitOverride().parseAsync(['--verdict', 'accepted'], { from: 'user' });
    expect('campaign_id' in (readSignals(dir)[1].detail ?? {})).toBe(false);
  });
});

describe('D2: appendTaskEvaluatedSignal (writer)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-task-eval-writer-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('пишет verdict/scorer/task_id/note как задано; контекст-событие (key=null)', () => {
    const res = appendTaskEvaluatedSignal(dir, {
      verdict: 'rejected',
      scorer: 'hidden_tests',
      taskId: 't-42',
      note: 'spec mismatch',
    });
    expect(res).toEqual({ key: null, count: 0, patternFixed: false });
    const [ev] = readSignals(dir);
    expect(ev.event).toBe('task_evaluated');
    expect(ev.session_id).toBeNull();
    expect(ev.outcome).toBe('evaluated');
    expect(ev.orchestration).toEqual({ task: null, actor: 'user:cli' });
    expect(ev.detail?.verdict).toBe('rejected');
    expect(ev.detail?.scorer).toBe('hidden_tests');
    expect(ev.detail?.task_id).toBe('t-42');
    expect(ev.detail?.note).toBe('spec mismatch');
    expect(signalKey(ev)).toBeNull();
  });
});
