// tests/unit/adapters/council-record-adapters.test.ts
// REL-231-A P04/W4 (AC-W4-5/AC-W4-6): тонкие адаптеры над ОДНОЙ доменной
// операцией recordCouncil (W3): CLI `wolf council record` (парсинг/вывод:
// валидный/невалидный вход, отсутствующий файл) и MCP council_record
// (успех/отказ). Паттерны: propose-cli.test.ts (cwd-мок — vitest-воркеры не
// умеют process.chdir; exitOverride рекурсивно для requiredOption) и контейнер
// напрямую (createCliContainer на tmp-каталоге).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { councilCommand } from '../../../src/adapters/cli/commands/council.js';
import { registerMemoryTools } from '../../../src/adapters/mcp/mcp-tools.js';
import { createCliContainer } from '../../../src/bootstrap/container.js';
import { UserFacingError } from '../../../src/domain/errors.js';

const TAG = 'wolf:council-record:v1';

const QUESTION_ENVELOPE = {
  schema_version: 1,
  record_kind: 'question',
  request_key: 'rq-w4-adapters-1',
  task_id: 'T-W4',
  payload: { question: 'Ship council record adapters?', decision_owner: 'user:owner' },
};

describe('wolf council record (CLI adapter, AC-W4-1/AC-W4-5)', () => {
  let dir: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-council-cli-'));
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    cwdMock.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  async function runCouncil(args: string[]): Promise<string> {
    const cmd = councilCommand(dir);
    // exitOverride рекурсивно: requiredOption без своего callback уходит в
    // process.exit — в тесте нужен throw (CommanderError)
    for (const sub of [cmd, ...cmd.commands]) sub.exitOverride();
    logs = [];
    await cmd.parseAsync(args, { from: 'user' });
    return logs.join('\n');
  }

  it('records a question envelope: JSON result + note with the council tag', async () => {
    const file = join(dir, 'question.json');
    writeFileSync(file, JSON.stringify(QUESTION_ENVELOPE));
    const out = await runCouncil(['record', '--input', file]);
    const notes = await createCliContainer(dir).store.list({ type: 'note' });
    expect(notes).toHaveLength(1);
    expect(notes[0].tags).toContain(TAG);
    expect(out).toContain('"memory_id"');
    expect(out).toContain('"created":true');
    expect(out).toContain(notes[0].id);
  });

  it('is idempotent by request_key: second call reports created=false, one note', async () => {
    const file = join(dir, 'question.json');
    writeFileSync(file, JSON.stringify(QUESTION_ENVELOPE));
    await runCouncil(['record', '--input', file]);
    const out2 = await runCouncil(['record', '--input', file]);
    expect(out2).toContain('"created":false');
    const notes = await createCliContainer(dir).store.list({ type: 'note' });
    expect(notes).toHaveLength(1);
  });

  it('missing --input file -> UserFacingError, nothing recorded', async () => {
    await expect(runCouncil(['record', '--input', join(dir, 'nope.json')])).rejects.toThrow(UserFacingError);
    expect(await createCliContainer(dir).store.list({ type: 'note' })).toHaveLength(0);
  });

  it('invalid envelope -> UserFacingError from the domain, nothing recorded', async () => {
    const file = join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify({ ...QUESTION_ENVELOPE, record_kind: 'bogus' }));
    await expect(runCouncil(['record', '--input', file])).rejects.toThrow('Invalid council envelope');
    expect(await createCliContainer(dir).store.list({ type: 'note' })).toHaveLength(0);
  });
});

/** Захват registerTool без SDK: handler'ы дергаются напрямую (валидация
 * envelope — в домене, как и в проде после обёртки схемы). */
class CaptureServer {
  handlers = new Map<string, (input: unknown) => Promise<unknown>>();
  registerTool(name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>): void {
    this.handlers.set(name, handler);
  }
}

describe('MCP council_record (adapter, AC-W4-3/AC-W4-5)', () => {
  let dir: string;
  let container: ReturnType<typeof createCliContainer>;
  let councilRecord: (input: unknown) => Promise<unknown>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-council-mcp-'));
    container = createCliContainer(dir);
    const server = new CaptureServer();
    registerMemoryTools(server as never, container, dir);
    const handler = server.handlers.get('council_record');
    if (!handler) throw new Error('council_record is not registered');
    councilRecord = handler;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records a question envelope with agent:mcp attribution', async () => {
    const result = (await councilRecord({ input: QUESTION_ENVELOPE })) as { content: Array<{ text: string }> };
    const notes = await container.store.list({ type: 'note' });
    expect(notes).toHaveLength(1);
    expect(notes[0].tags).toContain(TAG);
    expect(notes[0].created_by).toBe('agent:mcp');
    expect(result.content[0].text).toContain('Recorded council record');
    expect(result.content[0].text).toContain(notes[0].id);
  });

  it('rejects an invalid envelope with UserFacingError, nothing recorded', async () => {
    await expect(councilRecord({ input: { record_kind: 'bogus' } })).rejects.toThrow('Invalid council envelope');
    expect(await container.store.list({ type: 'note' })).toHaveLength(0);
  });
});
