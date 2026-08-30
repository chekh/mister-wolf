import { describe, it, expect, vi } from 'vitest';
// Плагин — plain ESM JS без d.ts; tsc tests не компилирует (exclude), vitest/esbuild импортирует без тайпчекa.
// CLI-спавн замокан (fixture-recap): тест не зависит ни от .wolf/-памяти репо
// (gitignored, есть только на дев-машине), ни от собранного dist.
const { execFileMock } = vi.hoisted(() => {
  const RECAP_STDOUT = 'Recap\n\n## Active rules\n- mem_fixture_rule [rule] fixture-правило проекта\n';
  const execFileMock = vi.fn((_file: unknown, args: string[], opts: unknown, cb?: unknown) => {
    const done = (typeof opts === 'function' ? opts : cb) as
      | ((err: Error | null, res?: { stdout: string }) => void)
      | undefined;
    if (!done) throw new Error('execFile: callback not found');
    if (args?.[1] === 'recap') return done(null, { stdout: RECAP_STDOUT });
    if (args?.[1] === 'call') return done(null, { stdout: '' }); // без активных инъекций
    return done(new Error(`unexpected CLI call: ${JSON.stringify(args)}`));
  });
  return { execFileMock };
});
vi.mock('child_process', () => ({ execFile: execFileMock }));

import { WolfSessionStartPlugin } from '../../.opencode/plugins/wolf-session-start.js';

const makeSessionOutput = (text: string) => ({
  messages: [{ info: { role: 'user' }, parts: [{ type: 'text', text }] }],
});

describe('wolf-session-start plugin', () => {
  it('injects recap into the first user message', async () => {
    const plugin = await WolfSessionStartPlugin({});
    const output = makeSessionOutput('Сделай плагин старта сессии для opencode');
    await plugin['experimental.chat.messages.transform']({}, output);

    const injected = output.messages[0].parts[0];
    expect(injected.type).toBe('text');
    expect(String(injected.text)).toContain('Mr.Wolf session recap');
    // Раздел из fixture-вывода `wolf recap` (как в реальном выводе)
    expect(String(injected.text)).toContain('Active rules');
    expect(execFileMock).toHaveBeenCalled();
  });

  it('injects only once (marker guard)', async () => {
    const plugin = await WolfSessionStartPlugin({});
    const output = makeSessionOutput('Повторное сообщение той же сессии');
    const transform = plugin['experimental.chat.messages.transform'];
    await transform({}, output);
    await transform({}, output);

    const markerParts = output.messages[0].parts.filter(
      (p) => p.type === 'text' && String(p.text ?? '').includes('Mr.Wolf session recap')
    );
    expect(markerParts).toHaveLength(1);
  });
});
