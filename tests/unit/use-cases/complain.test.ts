import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryComplainCommand } from '../../../src/adapters/cli/commands/memory-complain.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { relationsPath } from '../../../src/adapters/fs/project-paths.js';

// Команда зовётся напрямую через parseAsync (без регистрации в cli-entry),
// baseDir инъектится tmp-каталогом — в .wolf/memory репозитория ничего не пишется.
describe('wolf complain (B3)', () => {
  let dir: string;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-complain-'));
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
    return memoryComplainCommand(dir).parseAsync(args, { from: 'user' });
  }

  function recordedId(): string {
    const line = logs.find((l) => l.startsWith('Complaint recorded:'));
    expect(line).toBeDefined();
    return line!.split(': ')[1];
  }

  it('создаёт observation с about/complaint/trigger и relation complain (skill-адресат)', async () => {
    await run(['--about', 'skill:apprentice', '--text', 'агент пропускает шаги плана']);

    const id = recordedId();
    expect(logs.some((l) => l.includes('-complain-> skill:apprentice'))).toBe(true);

    const obj = await new MarkdownMemoryStore(dir).get(id);
    expect(obj).not.toBeNull();
    expect(obj!.type).toBe('observation');
    expect(obj!.body).toBe('агент пропускает шаги плана');
    expect(obj!.tags).toContain('complaint');
    expect((obj as Record<string, unknown>)['about']).toBe('skill:apprentice');
    expect((obj as Record<string, unknown>)['complaint']).toBe('агент пропускает шаги плана');
    expect((obj as Record<string, unknown>)['semantic']).toBe('жалоба на поведение агента/методики');
    expect((obj as Record<string, unknown>)['trigger']).toBe(true);

    const relationLog = new JsonlRelationLog(relationsPath(dir));
    const rels = await relationLog.list({ subject: id });
    expect(rels.map((r) => r.predicate)).toContain('complain');
    expect(rels.map((r) => r.object)).toContain('skill:apprentice');
    // обратная связь для адресата
    const back = await relationLog.list({ subject: 'skill:apprentice' });
    expect(back.map((r) => r.predicate)).toContain('complained_by');
    expect(back.map((r) => r.object)).toContain(id);
  });

  it('mem-id адресат записывается как есть; --created-by резолвится', async () => {
    const targetId = 'mem_20260829_apprentice_playbook_v2_analiz_bf6d15';
    await run(['--about', targetId, '--text', 'шаг 3 плана ведёт в тупик', '--created-by', 'user:owner']);

    const id = recordedId();
    const obj = await new MarkdownMemoryStore(dir).get(id);
    expect(obj!.created_by).toBe('user:owner');
    expect((obj as Record<string, unknown>)['about']).toBe(targetId);

    const rels = await new JsonlRelationLog(relationsPath(dir)).list({ subject: id });
    expect(rels.map((r) => r.object)).toContain(targetId);
  });
});
