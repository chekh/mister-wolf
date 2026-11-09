import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryComplainCommand } from '../../../src/adapters/cli/commands/memory-complain.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';

// R-13a (релиз 3.0.0, критерий 5.9): wolf complain резолвит --about по актуальному
// составу агентов интеграции OpenCode; существование цели и kind — из одного резолва.
// 9 минимальных сценариев состава (мем R-13). env инъектится пустым — без реального $HOME.
describe('wolf complain: адаптивная адресация (R-13a)', () => {
  let dir: string;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-complain-adaptive-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function writeAgent(name: string, base: string = dir): void {
    mkdirSync(join(base, '.opencode', 'agents'), { recursive: true });
    writeFileSync(join(base, '.opencode', 'agents', `${name}.md`), `---\nname: ${name}\n---\nBody.\n`);
  }

  function run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<void> {
    // env инъекция вместо реального process.env — глобальные источники изолированы от $HOME
    return memoryComplainCommand(dir, env).parseAsync(args, { from: 'user' });
  }

  function recordedId(): string {
    const lines = logs.filter((l) => l.startsWith('Complaint recorded:'));
    expect(lines.length).toBeGreaterThan(0);
    return lines[lines.length - 1].split(': ')[1];
  }

  function recordedKind(): string {
    const lines = logs.filter((l) => l.startsWith('Complaint kind:'));
    expect(lines.length).toBeGreaterThan(0);
    return lines[lines.length - 1].split(': ')[1];
  }

  const ARGS = ['--rule', 'r', '--evidence', 'e', '--proposal', 'p'];

  it('1) штатный wolf-developer (проектный .opencode/agents) — жалоба проходит, kind behavioral по умолчанию', async () => {
    writeAgent('wolf-developer');
    await run(['--about', 'wolf-developer', ...ARGS]);
    const obj = await new MarkdownMemoryStore(dir).get(recordedId());
    expect(obj).not.toBeNull();
    expect((obj as Record<string, unknown>)['about']).toBe('wolf-developer');
    expect(recordedKind()).toBe('behavioral');
  });

  it('2) проектный my-auditor без wolf-префикса — проходит', async () => {
    writeAgent('my-auditor');
    await run(['--about', 'my-auditor', ...ARGS]);
    expect((await new MarkdownMemoryStore(dir).get(recordedId()))?.type).toBe('complaint');
  });

  it('3) агент из поддержанной конфигурации: ключ "agent" в opencode.json — проходит (и jsonc-вариант)', async () => {
    writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ agent: { 'cfg-agent': { model: 'x' } } }));
    await run(['--about', 'cfg-agent', ...ARGS]);
    expect((await new MarkdownMemoryStore(dir).get(recordedId()))?.type).toBe('complaint');

    // jsonc-вариант в чистом проекте
    const dir2 = mkdtempSync(join(tmpdir(), 'wolf-complain-adaptive-'));
    try {
      writeFileSync(join(dir2, 'opencode.jsonc'), '{ "agent": { "jsonc-agent": {} } }');
      await memoryComplainCommand(dir2, {}).parseAsync(['--about', 'jsonc-agent', ...ARGS], { from: 'user' });
      const logs2 = logs.filter((l) => l.startsWith('Complaint recorded:'));
      expect(logs2.length).toBe(2);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('4) состав изменился между запусками CLI — второй вызов видит добавленного агента (без кеша)', async () => {
    await expect(run(['--about', 'late-agent', ...ARGS])).rejects.toThrow(/Unknown --about/);
    writeAgent('late-agent'); // состав интеграции изменился ПОСЛЕ первого вызова
    await run(['--about', 'late-agent', ...ARGS]); // новый вызов — новый резолв
    expect((await new MarkdownMemoryStore(dir).get(recordedId()))?.type).toBe('complaint');
  });

  it('5) kind: агент → behavioral; skill:x → behavioral; mem-id → technical; --kind technical переопределяет', async () => {
    writeAgent('kind-agent');
    await run(['--about', 'kind-agent', ...ARGS]);
    expect(recordedKind()).toBe('behavioral');

    await run(['--about', 'skill:foo', ...ARGS]);
    expect(recordedKind()).toBe('behavioral');

    const memId = recordedId(); // существующий mem-id (записанная жалоба)
    await run(['--about', memId, ...ARGS]);
    expect(recordedKind()).toBe('technical');

    await run(['--about', 'kind-agent', '--kind', 'technical', ...ARGS]);
    expect(recordedKind()).toBe('technical');
  });

  it('6) неизвестная цель: UserFacingError называет источники; объект памяти НЕ создаётся', async () => {
    await expect(run(['--about', 'совсем-не-агент', ...ARGS])).rejects.toThrow(
      /Unknown --about target "совсем-не-агент"[\s\S]*agents[\s\S]*skill:[\s\S]*mem-id/
    );
    const store = new MarkdownMemoryStore(dir);
    expect(await store.list({ type: 'complaint' })).toHaveLength(0);
    expect(existsSync(join(dir, '.wolf', 'memory', 'relations.jsonl'))).toBe(false);
  });

  it('7) discovery-ошибка (битый конфиг) отличима от unknown и не глотается', async () => {
    writeFileSync(join(dir, 'opencode.json'), '{ agent: [[[');
    await expect(run(['--about', 'any-agent', ...ARGS])).rejects.toThrow(/Agent discovery failed/);
    await expect(run(['--about', 'any-agent', ...ARGS])).rejects.not.toThrow(/Unknown --about/);
  });

  it('8) прежняя жалоба на старое имя: объект читается store.get и остаётся валидным после удаления агента', async () => {
    writeAgent('gone-agent');
    await run(['--about', 'gone-agent', ...ARGS]);
    const id = recordedId();
    rmSync(join(dir, '.opencode', 'agents', 'gone-agent.md')); // агент удалён/переименован

    const obj = await new MarkdownMemoryStore(dir).get(id);
    expect(obj).not.toBeNull();
    expect((obj as Record<string, unknown>)['about']).toBe('gone-agent');
    // чтение не валидирует состав: новый резолв не роняет запись по mem-id удалённого агента
    await run(['--about', id, ...ARGS]);
    expect((await new MarkdownMemoryStore(dir).get(recordedId()))?.type).toBe('complaint');
  });

  it('9) сохранённые skill:/memory-цели: skill:foo и существующий mem-id проходят как прежде', async () => {
    await run(['--about', 'skill:foo', ...ARGS]);
    expect(recordedKind()).toBe('behavioral');
    const memId = recordedId();
    await run(['--about', memId, ...ARGS]);
    expect(recordedKind()).toBe('technical');
    const store = new MarkdownMemoryStore(dir);
    expect(await store.list({ type: 'complaint' })).toHaveLength(2);
  });
});
