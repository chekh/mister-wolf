import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryLearnCommand } from '../../../src/adapters/cli/commands/memory-learn.js';
import { appendComplaintSignal, recordToolError } from '../../../src/adapters/fs/session-metrics-log.js';

// Команда зовётся напрямую через parseAsync (без регистрации в cli-entry),
// baseDir инъектится tmp-каталогом — в .wolf репозитория ничего не пишется.
describe('wolf learn (Ф21)', () => {
  let dir: string;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-learn-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args: string[]): Promise<void> {
    // from:'user' — argv содержит только аргументы пользователя, без префикса node/script
    return memoryLearnCommand(dir).parseAsync(args, { from: 'user' });
  }

  it('пустой лог: digest и status завершаются без ошибок и честно сообщают о пустоте', async () => {
    await run(['digest']);
    expect(logs.some((l) => l.includes('no active patterns'))).toBe(true);

    await run(['status']);
    expect(logs.some((l) => l.includes('events: 0'))).toBe(true);
    expect(logs.some((l) => l.includes('threshold: 3'))).toBe(true);
  });

  it('после 3 жалоб digest печатает ключ complaint:<about> и count 3', async () => {
    for (let i = 1; i <= 3; i++) {
      appendComplaintSignal(dir, {
        about: 'skill:demo',
        text: `жалоба ${i}`,
        actor: 'user:owner',
        objectId: 'mem_x',
      });
    }
    await run(['digest']);
    const line = logs.find((l) => l.startsWith('complaint:skill:demo:'));
    expect(line).toBeDefined();
    expect(line!).toContain('count 3');
    expect(logs.some((l) => l.includes('evidence: session-metrics.jsonl:1'))).toBe(true);

    await run(['status']);
    expect(logs.some((l) => l.includes('events: 3'))).toBe(true);
    expect(logs.some((l) => l.includes('complaint: 3'))).toBe(true);
  });

  it('propose → validate → activate: CLI-интеграция propose/validate/activate/digest', async () => {
    // 3 tool_error bash:timeout через writer Ф20 → живой паттерн
    for (let i = 1; i <= 3; i++) {
      recordToolError(dir, { tool_name: 'bash', message: 'Command timed out' });
    }

    await run(['propose', 'bash:timeout']);
    const created = logs.find((l) => l.startsWith('Draft created: '));
    expect(created).toBeDefined();
    const id = created!.slice('Draft created: '.length);
    expect(logs.some((l) => l.includes('type: lesson') && l.includes('mechanical: yes'))).toBe(true);
    expect(logs.some((l) => l.includes('evidence: session-metrics.jsonl:1'))).toBe(true);

    // holdout пуст (все события старее draft) → fail; команда при этом успешна
    await run(['validate', id]);
    expect(logs.some((l) => l.startsWith('verdict: fail'))).toBe(true);

    // гейт §2.5: после fail-вердикта активация блокируется (UserFacingError → parseAsync reject)
    await expect(run(['activate', id])).rejects.toThrow('activation blocked: holdout fail');

    // пост-аудит: draft виден в digest
    await run(['digest']);
    expect(logs.some((l) => l.includes('drafts (post-audit):'))).toBe(true);
    expect(logs.some((l) => l.includes(id))).toBe(true);
  });
});
