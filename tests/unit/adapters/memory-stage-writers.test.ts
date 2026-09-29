import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildMcpServer } from '../../../src/adapters/mcp/mcp-server.js';
import { readSignals } from '../../../src/adapters/fs/session-metrics-log.js';

type Tools = Record<string, { handler: (args: unknown) => Promise<unknown> }>;

function toolsOf(dir: string): Tools {
  const server = buildMcpServer(dir);
  return (server as unknown as { _registeredTools: Tools })._registeredTools;
}

/** P2 D1: авто-писатели memory_stage в MCP search/get/brief (критерий приёмки §4.1). */
describe('memory_stage auto-writers (MCP)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mcp-stage-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function stageEvents() {
    return readSignals(dir).filter((e) => e.event === 'memory_stage');
  }

  it('search: непустая выдача → retrieved с ids выдачи; пустая → нет события', async () => {
    const tools = toolsOf(dir);
    const added = (await tools.add.handler({
      type: 'lesson',
      title: 'Stage writer probe',
      body: 'probe content',
      createdBy: 'agent:mcp-test',
    })) as { content: Array<{ text: string }> };
    const id = /Created memory object: (\S+)/.exec(added.content[0]!.text)![1]!;

    await tools.search.handler({ query: 'Stage writer' });
    const events = stageEvents().filter((e) => e.detail?.stage === 'retrieved');
    expect(events).toHaveLength(1);
    expect(events[0]!.detail?.memory_ids).toContain(id);
    expect(events[0]!.orchestration.actor).toBe('system:wolf');

    const before = stageEvents().length;
    await tools.search.handler({ query: 'zzz-no-such-thing-xyz' });
    expect(stageEvents().length).toBe(before); // пустая выдача → события нет
  });

  it('get: найден → retrieved [id]; не найден → нет события', async () => {
    const tools = toolsOf(dir);
    const added = (await tools.add.handler({
      type: 'lesson',
      title: 'Get stage probe',
      body: 'probe',
      createdBy: 'agent:mcp-test',
    })) as { content: Array<{ text: string }> };
    const id = /Created memory object: (\S+)/.exec(added.content[0]!.text)![1]!;

    await tools.get.handler({ id });
    const events = stageEvents().filter((e) => e.detail?.stage === 'retrieved');
    expect(events).toHaveLength(1);
    expect(events[0]!.detail?.memory_ids).toEqual([id]);

    const before = stageEvents().length;
    await tools.get.handler({ id: 'mem_does_not_exist' });
    expect(stageEvents().length).toBe(before); // not found → события нет
  });

  it('brief: injected с ids всех секций брифа; пустая память → нет события', async () => {
    // пустая память → brief без injectedIds → события нет
    const empty = toolsOf(dir);
    await empty.brief.handler({});
    expect(stageEvents().filter((e) => e.detail?.stage === 'injected')).toHaveLength(0);

    // accepted-объект появляется в brief → injected (agent:* → proposed, в brief не попадает)
    const tools = toolsOf(dir);
    await tools.add.handler({
      type: 'decision',
      title: 'Brief stage probe',
      body: 'probe',
      createdBy: 'user:mcp-test',
    });
    const brief = (await tools.brief.handler({})) as { content: Array<{ text: string }> };
    expect(brief.content[0]!.text).toContain('Agent Brief');
    const injected = stageEvents().filter((e) => e.detail?.stage === 'injected');
    expect(injected).toHaveLength(1);
    expect(Array.isArray(injected[0]!.detail?.memory_ids)).toBe(true);
    expect((injected[0]!.detail!.memory_ids as string[]).length).toBeGreaterThan(0);
    expect(injected[0]!.orchestration.actor).toBe('system:wolf');
  });
});

/** P2 D1: CLI-писатель `wolf call` — injected по deliveredIds (критерий §4.1, CLI-точка). */
describe('memory_stage auto-writers (CLI call)', () => {
  let dir: string;
  let cwdMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-cli-stage-'));
    // vitest-воркеры не поддерживают process.chdir — мокаем cwd (паттерн D12/Q11)
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  afterEach(() => {
    cwdMock.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * wave13-a (§5.4): call-injection — deprecated-тип, add больше не принимает;
   * пул доставок читает сырые legacy-файлы (alias-слой → note+alias_origin).
   * Сеем файл руками в alias-корень shared/calls/.
   */
  function seedCallInjection(id: string, keywords: string[]): string {
    const callsDir = join(dir, '.wolf', 'memory', 'shared', 'calls');
    mkdirSync(callsDir, { recursive: true });
    const fm = [
      `id: ${id}`,
      'type: call-injection',
      `title: Injection ${id}`,
      'status: active',
      'review_state: accepted',
      'confidence: medium',
      'importance: 0.5',
      // даты ОБЯЗАТЕЛЬНО квоченные: js-yaml парсит голый ISO в Date,
      // zod z.string().datetime() отвергает → файл молча выпадает из store
      "created_at: '2026-09-29T10:00:00Z'",
      "updated_at: '2026-09-29T10:00:00Z'",
      'created_by: user:unit-test',
      'schema_version: 1',
      'source: { kind: manual }',
      'related: { files: [], docs: [], decisions: [] }',
      'tags: []',
      'superseded_by: null',
      `trigger_keywords: [${keywords.map((k) => `"${k}"`).join(', ')}]`,
    ].join('\n');
    writeFileSync(join(callsDir, `${id}.md`), `---\n${fm}\n---\n\nprobe content`);
    return id;
  }

  it('call: инъекции есть → injected с deliveredIds; нет инъекций → нет события', async () => {
    // посев активного call-injection в store каталога (alias-чтение, wave13-a)
    const injectedId = seedCallInjection('cli_stage_inj_1', ['stageprobe']);

    const { memoryCallCommand } = await import('../../../src/adapters/cli/commands/memory-call.js');
    await memoryCallCommand().parseAsync(['call', '--for', 'stageprobe'], { from: 'user' });
    const injected = readSignals(dir).filter((e) => e.event === 'memory_stage' && e.detail?.stage === 'injected');
    expect(injected).toHaveLength(1);
    expect(injected[0]!.detail?.memory_ids).toContain(injectedId);
    // Ф26 delivery-сигналы не тронуты: по одному на delivered id
    const deliveries = readSignals(dir).filter((e) => e.event === 'delivery');
    expect(deliveries.length).toBeGreaterThanOrEqual(1);

    // no-injection → no-event: unmatched topic без fallback-правил не доставляет блоков
    const before = readSignals(dir).filter((e) => e.event === 'memory_stage').length;
    await memoryCallCommand().parseAsync(['call', '--for', 'zzz-no-match-xyz'], { from: 'user' });
    expect(readSignals(dir).filter((e) => e.event === 'memory_stage').length).toBe(before);
  });

  it('WOLF_SESSION: авто-писатель call связывает injected с session_id (P2 D4)', async () => {
    seedCallInjection('cli_stage_inj_2', ['sesprobe']);
    vi.stubEnv('WOLF_SESSION', 'ses_e2e');
    try {
      const { memoryCallCommand } = await import('../../../src/adapters/cli/commands/memory-call.js');
      await memoryCallCommand().parseAsync(['call', '--for', 'sesprobe'], { from: 'user' });
    } finally {
      vi.unstubAllEnvs();
    }
    const injected = readSignals(dir).filter((e) => e.event === 'memory_stage' && e.detail?.stage === 'injected');
    expect(injected).toHaveLength(1);
    expect(injected[0]!.session_id).toBe('ses_e2e');
  });
});
