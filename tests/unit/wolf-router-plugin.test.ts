import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
// Плагин — plain ESM TS вне tsconfig (tsc tests не компилирует); vitest/esbuild
// импортирует без тайпчека. CLI-спавн замокан (fixture-playbook): тест не зависит
// ни от .wolf/-памяти репо (gitignored, есть только на дев-машине), ни от dist.
const ROUTER_LOG = '/tmp/wolf-router-plugin-test/router.log';
const { execFileMock } = vi.hoisted(() => {
  // WOLF_ROUTER_LOG-шов: лог пишется в tmp-файл, а не в живой .wolf/router.log
  // репо (иначе тесты после мержа в main загрязняли бы dogfood-аналитику владельца).
  process.env.WOLF_ROUTER_LOG = '/tmp/wolf-router-plugin-test/router.log';
  const PLAYBOOK_ID = 'mem_fixture_playbook_v4';
  const PLAYBOOK = {
    id: PLAYBOOK_ID,
    type: 'playbook',
    owner_skill: 'apprentice',
    version: 'v4',
    body: '# Playbook apprentice v4 (lean-формат)\n1. Контекст → 2. План → 3. Проверка',
  };
  // T012: второй канон в моке — worker-hit без fallback
  const WORKER_PLAYBOOK_ID = 'mem_fixture_playbook_worker_v1';
  const WORKER_PLAYBOOK = {
    id: WORKER_PLAYBOOK_ID,
    type: 'playbook',
    owner_skill: 'worker-reviewer',
    version: 'v1',
    body: '# Playbook worker-reviewer v1\nreviewer-canonical-body: зоны обзора',
  };
  // promisify(execFile) без custom-symbol → стандартный callback-контракт.
  const execFileMock = vi.fn((file: unknown, args: string[], opts: unknown, cb?: unknown) => {
    const done = (typeof opts === 'function' ? opts : cb) as
      | ((err: Error | null, res?: { stdout: string }) => void)
      | undefined;
    if (!done) throw new Error('execFile: callback not found');
    const sub = args?.[1];
    if (sub === 'search') {
      const agentId = args[2];
      const stdout =
        agentId === 'apprentice'
          ? `${PLAYBOOK_ID} [playbook] # Apprentice playbook\n`
          : agentId === 'worker-reviewer'
            ? `${WORKER_PLAYBOOK_ID} [playbook] # Worker reviewer playbook\n`
            : '';
      return done(null, { stdout });
    }
    if (sub === 'get' && args[2] === PLAYBOOK_ID) return done(null, { stdout: JSON.stringify(PLAYBOOK) });
    if (sub === 'get' && args[2] === WORKER_PLAYBOOK_ID)
      return done(null, { stdout: JSON.stringify(WORKER_PLAYBOOK) });
    return done(new Error(`unexpected CLI call: ${JSON.stringify(args)}`));
  });
  return { execFileMock };
});
vi.mock('child_process', () => ({ execFile: execFileMock }));

// vi.mock хойстится выше импортов — плагин получит замоканный execFile.
import { WolfPlaybookPlugin } from '../../.opencode/plugins/wolf-router.ts';

const HEADER = '# Актуальный playbook';
const makeSystemOutput = (text: string) => ({ system: [text] });
const playbookParts = (output: { system: string[] }) => output.system.filter((p) => String(p).includes(HEADER));

describe('wolf-router plugin', () => {
  it('injects playbook for agent-id: apprentice', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье. Работай строго по playbook.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(1);
    // Слово из тела fixture-playbook (lean-формат, как в реальном v4)
    expect(playbookParts(output)[0]).toContain('lean');
    // Гвард владельца: get по id из выборки, owner_skill совпал с agent-id
    expect(execFileMock).toHaveBeenCalled();
  });

  it('no marker → nothing injected, CLI not spawned', async () => {
    execFileMock.mockClear();
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('Ты — аналитик. Работай сам, без playbook.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(0);
    expect(output.system).toHaveLength(1);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  // T012: miss канона → инъекция универсального fallback, не пустота
  it('unknown agent-id → fallback playbook injected (no throw)', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: net-takogo-agenta-xyz\n\nТы — кто-то неизвестный.');
    await expect(plugin['experimental.chat.system.transform']({}, output)).resolves.toBeUndefined();

    expect(playbookParts(output)).toHaveLength(1);
    expect(playbookParts(output)[0]).toContain('Универсальный playbook');
    expect(playbookParts(output)[0]).not.toContain('lean'); // canonical-маркер не попал
    expect(output.system).toHaveLength(2);
  });

  // T012: канон приоритетен — fallback не примешивается к canonical-инъекту
  it('canonical (apprentice) → injected WITHOUT fallback body', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(1);
    expect(playbookParts(output)[0]).toContain('lean');
    expect(playbookParts(output)[0]).not.toContain('Универсальный playbook');
  });

  // T012: worker-hit по второму канону в моке — variant=canonical, без fallback
  it('worker-reviewer → canonical hit, no fallback injected', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: worker-reviewer\n\nТы — рецензент.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(1);
    expect(playbookParts(output)[0]).toContain('reviewer-canonical-body');
    expect(playbookParts(output)[0]).not.toContain('Универсальный playbook');

    const lastLine = (readRouterLog().trim().split('\n').at(-1) ?? '').replace(/^\S+ /, '');
    expect(lastLine).toBe(
      'agent-id=worker-reviewer playbook=hit name=mem_fixture_playbook_worker_v1 variant=canonical injected=yes'
    );
  });

  it('two calls in a row → exactly one injected part (idempotent, no double insert)', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.');
    const transform = plugin['experimental.chat.system.transform'];
    await transform({}, output);
    await transform({}, output);

    expect(playbookParts(output)).toHaveLength(1);
  });

  // Волна 0 0.1: router.log при hit различает playbook по имени + вариант canonical
  const readRouterLog = (): string => {
    try {
      return readFileSync(ROUTER_LOG, 'utf-8');
    } catch {
      return '';
    }
  };

  it('hit: router.log line contains playbook=hit name=<id> variant=canonical injected=yes', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.');
    await plugin['experimental.chat.system.transform']({}, output);
    expect(playbookParts(output)).toHaveLength(1);

    const lastLine = (readRouterLog().trim().split('\n').at(-1) ?? '').replace(/^\S+ /, '');
    expect(lastLine).toBe(
      'agent-id=apprentice playbook=hit name=mem_fixture_playbook_v4 variant=canonical injected=yes'
    );
  });

  // T012: miss-ветки больше нет — fallback логируется как hit variant=fallback
  it('fallback: router.log line playbook=hit name=fallback variant=fallback injected=yes', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: net-takogo-2-xyz\n\nТы — неизвестный агент.');
    await plugin['experimental.chat.system.transform']({}, output);

    const lastLine = (readRouterLog().trim().split('\n').at(-1) ?? '').replace(/^\S+ /, '');
    expect(lastLine).toBe('agent-id=net-takogo-2-xyz playbook=hit name=fallback variant=fallback injected=yes');
  });
});
