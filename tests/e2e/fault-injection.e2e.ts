import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// Волна 0 (0.1, приёмка): fault-injection для error-полей mcp_call + обратная
// совместимость старых jsonl-строк. Add с кривым полем (rule без обязательного
// scope) → CLI завершается ошибкой, mcp_call-сигнал несёт outcome=error,
// detail.error.message и detail.error_class_id (classifyError). Старая v1-строка
// (без detail/новых полей) читается без ошибок — malformedLines = 0.

interface McpCallSignal {
  ts: string;
  event: string;
  outcome: string;
  tool_name: string;
  detail: Record<string, unknown>;
}

function readMcpCalls(dir: string): McpCallSignal[] {
  const path = join(dir, '.wolf', 'metrics', 'session-metrics.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as McpCallSignal)
    .filter((s) => s.event === 'mcp_call');
}

describe('fault-injection: mcp_call error-поля + старые jsonl-строки (волна 0 0.1)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('add с кривым полем (rule без scope) → error-поля заполнены, exit != 0', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init'], dir).status).toBe(0);

    // rule без обязательного scope: input-схему проходит, домен бросает
    // UserFacingError «Type validation failed: scope ...» внутри action
    const result = runCli(['add', '--type', 'rule', '--title', 'broken rule'], dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/scope/);

    const errors = readMcpCalls(dir).filter((s) => s.tool_name === 'add' && s.outcome === 'error');
    expect(errors).toHaveLength(1);
    const detail = errors[0].detail;
    // args_summary присутствует и не несёт body
    const args = detail.args_summary as Record<string, unknown>;
    expect(args.type).toBe('rule');
    expect(args.title).toBe('broken rule');
    expect('body' in args).toBe(false);
    // error-поля волны 0: message + классификация
    const err = detail.error as Record<string, unknown>;
    expect(String(err.message)).toMatch(/scope/);
    expect(typeof detail.error_class_id).toBe('string');
    expect(detail.error_class_id).not.toBe('');
  });

  it('старые jsonl-строки (v1, без новых полей) читаются без ошибок', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init'], dir).status).toBe(0);

    // до-волновая v1-строка mcp_call: только поля ранних версий
    const metricsDir = join(dir, '.wolf', 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    const legacyLine = JSON.stringify({
      ts: '2026-09-01T00:00:00.000Z',
      event: 'mcp_call',
      session_id: null,
      gen_ai: { modelID: null, agent: null },
      orchestration: { task: null, actor: 'system:wolf' },
      outcome: 'ok',
      tool_name: 'list',
      duration_ms: 5,
      detail: { method: 'list' },
    });
    writeFileSync(join(metricsDir, 'session-metrics.jsonl'), legacyLine + '\n');

    // новый вызов дописывает свежие сигналы; затем аналитика читает весь лог
    expect(runCli(['list'], dir).status).toBe(0);
    const out = runCli(['analytics', '--view', 'acceptance', '--json'], dir);
    expect(out.status).toBe(0);
    const payload = JSON.parse(out.stdout) as {
      acceptance: { dataQuality: { malformedLines: number }; toolCalls: { tool: string; calls: number }[] };
    };
    expect(payload.acceptance.dataQuality.malformedLines).toBe(0);
    // legacy-строка попала в агрегат (list: 1 старый + 1 новый вызов)
    const listRow = payload.acceptance.toolCalls.find((t) => t.tool === 'list');
    expect(listRow?.calls).toBeGreaterThanOrEqual(2);
  });
});
