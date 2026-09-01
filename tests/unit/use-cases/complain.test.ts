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
// Жалобный контур v2 (спека 2026-09-01 §4.2, §7.2): объект типа complaint
// со статусом open, required-поля about/rule/evidence/proposal.
describe('wolf complain (complaint-v2)', () => {
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
    const lines = logs.filter((l) => l.startsWith('Complaint recorded:'));
    expect(lines.length).toBeGreaterThan(0);
    return lines[lines.length - 1].split(': ')[1];
  }

  const V2_ARGS = [
    '--about',
    'worker-implementer',
    '--rule',
    'п.2 МЕТОДИКИ playbook v1 требует читать файлы до правки',
    '--evidence',
    'бриф запретил чтение — следование обоим невозможно',
    '--proposal',
    'добавить исключение для allowlist-замен',
  ];

  it('создаёт complaint/open с about/rule/evidence/proposal, relation и hot-signal', async () => {
    await run([...V2_ARGS, '--created-by', 'worker:ses1']);

    const id = recordedId();
    const obj = await new MarkdownMemoryStore(dir).get(id);
    expect(obj).not.toBeNull();
    expect(obj!.type).toBe('complaint');
    expect(obj!.status).toBe('open');
    expect(obj!.body).toBe('бриф запретил чтение — следование обоим невозможно');
    expect(obj!.tags).toContain('complaint');
    const rec = obj as Record<string, unknown>;
    expect(rec['about']).toBe('worker-implementer');
    expect(rec['rule']).toBe('п.2 МЕТОДИКИ playbook v1 требует читать файлы до правки');
    expect(rec['evidence']).toBe('бриф запретил чтение — следование обоим невозможно');
    expect(rec['proposal']).toBe('добавить исключение для allowlist-замен');
    // счётчики SLA/дедупа — дефолты декларации материализуются при чтении
    expect(rec['dispatch_ages']).toBe(0);
    expect(rec['corroborations']).toBe(1);

    const rels = await new JsonlRelationLog(relationsPath(dir)).list({ subject: id });
    expect(rels.map((r) => r.predicate)).toContain('complain');
    expect(rels.map((r) => r.object)).toContain('worker-implementer');
    const back = await new JsonlRelationLog(relationsPath(dir)).list({ subject: 'worker-implementer' });
    expect(back.map((r) => r.predicate)).toContain('complained_by');
  });

  it('title — Complaint about <about>: <rule ≤60>', async () => {
    await run(V2_ARGS);
    const obj = await new MarkdownMemoryStore(dir).get(recordedId());
    expect(obj!.title).toBe(
      'Complaint about worker-implementer: п.2 МЕТОДИКИ playbook v1 требует читать файлы до правки'
    );
  });

  it('обрезает длинный rule в title до 60 символов', async () => {
    const longRule = 'д'.repeat(80);
    await run([
      ...V2_ARGS.slice(0, 2),
      '--about',
      'worker-implementer',
      '--rule',
      longRule,
      '--evidence',
      'e',
      '--proposal',
      'p',
    ]);
    const obj = await new MarkdownMemoryStore(dir).get(recordedId());
    expect(obj!.title).toBe(`Complaint about worker-implementer: ${'д'.repeat(60)}…`);
  });

  it('валидирует about: известный agent-id, skill:<имя>, существующий mem-id — ок; мусор — ошибка', async () => {
    await run([...V2_ARGS.slice(0, 2), '--about', 'steward', '--rule', 'r', '--evidence', 'e', '--proposal', 'p']);
    const first = await new MarkdownMemoryStore(dir).get(recordedId());
    expect((first as Record<string, unknown>)['about']).toBe('steward');

    await run([
      ...V2_ARGS.slice(0, 2),
      '--about',
      'skill:apprentice',
      '--rule',
      'r',
      '--evidence',
      'e',
      '--proposal',
      'p',
    ]);
    const second = await new MarkdownMemoryStore(dir).get(recordedId());
    expect((second as Record<string, unknown>)['about']).toBe('skill:apprentice');

    await run([...V2_ARGS.slice(0, 2), '--about', first!.id, '--rule', 'r', '--evidence', 'e', '--proposal', 'p']);

    await expect(
      run([...V2_ARGS.slice(0, 2), '--about', 'не-существует', '--rule', 'r', '--evidence', 'e', '--proposal', 'p'])
    ).rejects.toThrow(/Unknown --about/);
  });

  it('--text — deprecated-alias на --evidence', async () => {
    await run(['--about', 'worker-implementer', '--rule', 'r', '--text', 'старый интерфейс', '--proposal', 'p']);
    const obj = await new MarkdownMemoryStore(dir).get(recordedId());
    expect((obj as Record<string, unknown>)['evidence']).toBe('старый интерфейс');
  });

  it('без evidence (и без --text) — ошибка required', async () => {
    await expect(run(['--about', 'worker-implementer', '--rule', 'r', '--proposal', 'p'])).rejects.toThrow(
      /--evidence/
    );
  });
});
