import { describe, it, expect } from 'vitest';
// Плагин — plain ESM TS вне tsconfig (tsc tests не компилирует); vitest/esbuild
// импортирует без тайпчека. Гоняется против РЕАЛЬНОЙ памяти репо (dist собран).
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
    // Слово из тела реального playbook v4 (lean-формат)
    expect(playbookParts(output)[0]).toContain('lean');
  });

  it('no marker → nothing injected', async () => {
    const plugin = await WolfPlaybookPlugin({});
    const output = makeSystemOutput('Ты — аналитик. Работай сам, без playbook.');
    await plugin['experimental.chat.system.transform']({}, output);

    expect(playbookParts(output)).toHaveLength(0);
    expect(output.system).toHaveLength(1);
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
