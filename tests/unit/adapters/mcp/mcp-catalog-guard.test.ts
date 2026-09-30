import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { MCP_TOOL_NAMES } from '../../../../src/adapters/mcp/mcp-tools.js';

const doc = readFileSync(fileURLToPath(new URL('../../../../docs/site/guide/mcp.md', import.meta.url)), 'utf-8');

/**
 * Имена `mr-wolf_<name>` со ВСЕЙ страницы (таблица + текст): любое упоминание
 * удалённого тула в доке — рассинхрон с регистром.
 */
function docToolNames(): string[] {
  const names: string[] = [];
  for (const match of doc.matchAll(/`mr-wolf_([a-z_]+)`/g)) names.push(match[1]);
  return [...new Set(names)].sort();
}

// P223 (спека 2.13 §6.2/§7 C11): каталог MCP после диеты = 7 тулов ≤ 12;
// ping — health-check поверх каталога, регистрируется в mcp-server.ts.
describe('MCP catalog guard: registry == docs/site/guide/mcp.md', () => {
  it('catalog is exactly the 7 diet survivors, <= 12', () => {
    expect([...MCP_TOOL_NAMES].sort()).toEqual(['add', 'brief', 'get', 'list', 'recap', 'search', 'transition']);
    expect(MCP_TOOL_NAMES.length).toBeLessThanOrEqual(12);
  });

  it('every mr-wolf_<tool> mentioned in the guide is live, and every live tool is mentioned', () => {
    expect(docToolNames()).toEqual([...MCP_TOOL_NAMES, 'ping'].sort());
  });
});
