import { McpCommand, PlatformAdapter } from '../../ports/platform-adapter.port.js';
import { OpencodeAdapter } from './opencode-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { WOLF_MCP_COMMAND } from './opencode-config-keys.js';

/** Канонический способ запуска MCP-сервера Wolf: глобальный бинарь, никогда npx (спека §4). */
export const CANONICAL_MCP_COMMAND: McpCommand = WOLF_MCP_COMMAND;

/** Все платформы v1. Новая платформа = адаптер в этот список, init не меняется. */
export const PLATFORM_ADAPTERS: PlatformAdapter[] = [new OpencodeAdapter(), new ClaudeAdapter()];
