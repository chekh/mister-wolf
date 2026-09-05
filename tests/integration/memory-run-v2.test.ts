import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryRunCommand } from '../../src/adapters/cli/commands/memory-run.js';
import { readSignals } from '../../src/adapters/fs/session-metrics-log.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// команда завязана на process.cwd() (resolveModel/appendRunSignal/config.yaml);
// chdir в vitest-воркерах запрещён — мокаем cwd (восстановление в afterEach)
afterEach(() => {
  vi.restoreAllMocks();
});

describe('wolf run v2 (P1 D3): сигнальный writer v2, run-log прекращён', () => {
  it('roundtrip: v2-поля в run-сигнале, .wolf/run-log.jsonl не пишется', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wolf-run-v2-'));
    const prevPath = process.env.PATH;
    try {
      mkdirSync(join(tmp, '.wolf'), { recursive: true });
      writeFileSync(join(tmp, '.wolf', 'config.yaml'), 'learning:\n  patternThreshold: 3\n');

      // фейковый opencode: одна NDJSON-строка step-finish (формат opencode-run-metrics)
      const binDir = join(tmp, 'bin');
      mkdirSync(binDir);
      writeFileSync(
        join(binDir, 'opencode'),
        '#!/bin/sh\necho \'{"sessionID":"ses_stub","part":{"type":"step-finish","tokens":{"input":100,"output":10,"cache":{"read":50}}}}\'\n'
      );
      chmodSync(join(binDir, 'opencode'), 0o755);
      process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`;
      vi.spyOn(process, 'cwd').mockReturnValue(tmp);

      // commander from:'user' — без ведущего имени команды (прецедент task-eval):
      // иначе 'run' съедается как <prompt>, а реальный промпт дропается молча
      await memoryRunCommand().parseAsync(
        [
          '--agent',
          'build',
          '--title',
          't1',
          '--tool',
          'wolf-search',
          '--tool',
          'bash',
          '--trace-id',
          'trace-xyz',
          '--attempt',
          '2',
          '--task-id',
          'task-9',
          '--',
          'hello prompt',
        ],
        { from: 'user' }
      );

      // (а) legacy run-log больше не пишется
      expect(existsSync(join(tmp, '.wolf', 'run-log.jsonl'))).toBe(false);

      // (б) run-сигнал v2 со всеми identity-полями
      const runs = readSignals(tmp).filter((s) => s.event === 'run');
      expect(runs).toHaveLength(1);
      const rec = runs[0]!;
      expect(rec.schema_version).toBe(2);
      expect(rec.event_id).toMatch(UUID_RE);
      expect(rec.run_id).toMatch(UUID_RE);
      expect(rec.trace_id).toBe('trace-xyz');
      expect(rec.attempt).toBe(2);
      expect(rec.task_id).toBe('task-9');
      expect(rec.config_hash).toMatch(/^[0-9a-f]{12}$/);
      expect(rec.prompt_hash).toMatch(/^[0-9a-f]{12}$/);
      expect(rec.tools).toEqual(['wolf-search', 'bash']);
      expect(rec.experiment).toBeUndefined();
      // P3 D1: без --campaign поле campaign_id не пишется (backward-compat)
      expect(rec.campaign_id).toBeUndefined();
    } finally {
      process.env.PATH = prevPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('P3 D1: --campaign eval-01 → campaign_id в run-сигнале (roundtrip)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wolf-run-campaign-'));
    const prevPath = process.env.PATH;
    try {
      mkdirSync(join(tmp, '.wolf'), { recursive: true });
      writeFileSync(join(tmp, '.wolf', 'config.yaml'), 'learning:\n  patternThreshold: 3\n');

      const binDir = join(tmp, 'bin');
      mkdirSync(binDir);
      writeFileSync(
        join(binDir, 'opencode'),
        '#!/bin/sh\necho \'{"sessionID":"ses_camp","part":{"type":"step-finish","tokens":{"input":10,"output":1,"cache":{"read":5}}}}\'\n'
      );
      chmodSync(join(binDir, 'opencode'), 0o755);
      process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`;
      vi.spyOn(process, 'cwd').mockReturnValue(tmp);

      await memoryRunCommand().parseAsync(
        ['--agent', 'build', '--title', 'camp', '--campaign', 'eval-01', '--', 'prompt'],
        { from: 'user' }
      );

      const runs = readSignals(tmp).filter((s) => s.event === 'run');
      expect(runs).toHaveLength(1);
      expect(runs[0]!.campaign_id).toBe('eval-01');
    } finally {
      process.env.PATH = prevPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
