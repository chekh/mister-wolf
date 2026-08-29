import { describe, it, expect } from 'vitest';
// Плагин — plain ESM JS без d.ts; tsc tests не компилирует (exclude), vitest/esbuild импортирует без тайпчекa.
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
    // Слово из реального вывода `wolf recap` этого репо
    expect(String(injected.text)).toContain('Active rules');
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
