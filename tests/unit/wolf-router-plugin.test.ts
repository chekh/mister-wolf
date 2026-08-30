import { describe, it, expect, vi } from 'vitest';
// Плагин — plain ESM TS вне tsconfig (tsc tests не компилирует); vitest/esbuild
// импортирует без тайпчека. CLI-спавн замокан (fixture-playbook): тест не зависит
// ни от .wolf/-памяти репо (gitignored, есть только на дев-машине), ни от dist.
const { execFileMock } = vi.hoisted(() => {
  const PLAYBOOK_ID = 'mem_fixture_playbook_v4';
  const PLAYBOOK = {
    id: PLAYBOOK_ID,
    type: 'playbook',
    owner_skill: 'apprentice',
    version: 'v4',
    body: '# Playbook apprentice v4 (lean-формат)\n1. Контекст → 2. План → 3. Проверка',
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
      const stdout = agentId === 'apprentice' ? `${PLAYBOOK_ID} [playbook] # Apprentice playbook\n` : '';
      return done(null, { stdout });
    }
    if (sub === 'get' && args[2] === PLAYBOOK_ID) return done(null, { stdout: JSON.stringify(PLAYBOOK) });
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

  it('unknown agent-id → nothing injected, no throw (fallback-ветка)', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: net-takogo-agenta-xyz\n\nТы — кто-то неизвестный.');
    await expect(plugin['experimental.chat.system.transform']({}, output)).resolves.toBeUndefined();

    expect(playbookParts(output)).toHaveLength(0);
    expect(output.system).toHaveLength(1);
  });

  it('two calls in a row → exactly one injected part (idempotent, no double insert)', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('agent-id: apprentice\n\nТы — аналитик-подмастерье.');
    const transform = plugin['experimental.chat.system.transform'];
    await transform({}, output);
    await transform({}, output);

    expect(playbookParts(output)).toHaveLength(1);
  });
});
