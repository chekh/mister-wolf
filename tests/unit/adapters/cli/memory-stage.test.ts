// tests/unit/adapters/cli/memory-stage.test.ts
// P2 D1: `wolf memory-stage` — roundtrip события memory_stage в сигнальный лог.
// exitOverride — commander-ошибки (невалидный choice) падают reject'ом.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryStageCommand } from '../../../../src/adapters/cli/commands/memory-stage.js';
import { readSignals, metricsLogPath, SignalEventSchema } from '../../../../src/adapters/fs/session-metrics-log.js';
import { UserFacingError } from '../../../../src/domain/errors.js';

describe('P2 D1: `wolf memory-stage` — roundtrip в сигнальный лог', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-memory-stage-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('валидная запись: лог содержит memory_stage с ids/stage/session; строка проходит схему', async () => {
    await memoryStageCommand(dir)
      .exitOverride()
      .parseAsync(['--stage', 'injected', '--ids', 'mem_1, mem_2', '--session', 'ses_9'], { from: 'user' });
    const events = readSignals(dir);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('memory_stage');
    expect(events[0].session_id).toBe('ses_9');
    expect(events[0].outcome).toBe('injected');
    expect(events[0].detail).toEqual({ stage: 'injected', memory_ids: ['mem_1', 'mem_2'] });
    const rawLine = JSON.parse(readFileSync(metricsLogPath(dir), 'utf-8').trim()) as unknown;
    expect(SignalEventSchema.safeParse(rawLine).success).toBe(true);
  });

  it('невалидная стадия — commander-ошибка со списком допустимых', async () => {
    await expect(
      memoryStageCommand(dir).exitOverride().parseAsync(['--stage', 'bogus', '--ids', 'mem_1'], { from: 'user' })
    ).rejects.toThrow(/is invalid\. allowed choices are retrieved, injected, cited, applied/i);
    expect(readSignals(dir)).toHaveLength(0);
  });

  it('--ids " , " → UserFacingError, событие не пишется', async () => {
    await expect(
      memoryStageCommand(dir).exitOverride().parseAsync(['--stage', 'cited', '--ids', ' , '], { from: 'user' })
    ).rejects.toThrow(UserFacingError);
    await expect(
      memoryStageCommand(dir).exitOverride().parseAsync(['--stage', 'cited', '--ids', ' , '], { from: 'user' })
    ).rejects.toThrow(/no memory ids provided: --ids <id,\.\.\.>/);
    expect(readSignals(dir)).toHaveLength(0);
  });

  it('без --stage — commander-ошибка (mandatory)', async () => {
    await expect(
      memoryStageCommand(dir).exitOverride().parseAsync(['--ids', 'mem_1'], { from: 'user' })
    ).rejects.toThrow(/required option '--stage <stage>' not specified/i);
  });
});
