import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { PlatformAdapter, McpCommand, PlatformConfig } from '../../ports/platform-adapter.port.js';
import { parseJsonc } from './jsonc.js';
import { writeFileAtomic } from '../fs/markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

// ponytail: комментарии в opencode.jsonc теряются при rewrite (plain JSON валиден как JSONC);
// сохранение комментариев = AST-редактор, YAGNI до запроса.
export class OpencodeAdapter implements PlatformAdapter {
  readonly id = 'opencode';

  detect(projectRoot: string): boolean {
    return (
      existsSync(join(projectRoot, 'opencode.json')) ||
      existsSync(join(projectRoot, 'opencode.jsonc')) ||
      existsSync(join(projectRoot, '.opencode'))
    );
  }

  /** Существующий конфиг (jsonc — только если нет json); для новой установки — opencode.json. */
  private configFile(projectRoot: string): string {
    if (existsSync(join(projectRoot, 'opencode.jsonc')) && !existsSync(join(projectRoot, 'opencode.json'))) {
      return join(projectRoot, 'opencode.jsonc');
    }
    return join(projectRoot, 'opencode.json');
  }

  async readConfig(projectRoot: string): Promise<PlatformConfig | null> {
    const file = this.configFile(projectRoot);
    let raw: string | null = null;
    try {
      raw = await fs.readFile(file, 'utf-8');
    } catch {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = parseJsonc(raw);
    } catch (err) {
      // паритет с ClaudeAdapter: ошибки парсинга — UserFacingError, не сырой SyntaxError
      throw new UserFacingError(`${file} is not valid JSONC: ${err instanceof Error ? err.message : err}`);
    }
    return asConfig(parsed, file);
  }

  async writeConfig(projectRoot: string, cmd: McpCommand): Promise<'written' | 'replaced' | 'unchanged'> {
    const file = this.configFile(projectRoot);
    const cfg = (await this.readConfig(projectRoot)) ?? {};
    const mcp = asRecord(cfg.mcp) ?? {};
    // каноническая проекция McpCommand в формат opencode: command — массив
    const desired = { type: 'local', command: [cmd.command, ...cmd.args], enabled: true };
    if (JSON.stringify(mcp.wolf) === JSON.stringify(desired)) return 'unchanged';
    const replaced = mcp.wolf !== undefined;
    mcp.wolf = desired;
    cfg.mcp = mcp;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return replaced ? 'replaced' : 'written';
  }

  async removeWolf(projectRoot: string): Promise<boolean> {
    const file = this.configFile(projectRoot);
    const cfg = await this.readConfig(projectRoot);
    if (cfg === null) return false;
    const mcp = asRecord(cfg.mcp);
    if (mcp === undefined || mcp.wolf === undefined) return false;
    delete mcp.wolf;
    if (Object.keys(mcp).length === 0) delete cfg.mcp;
    else cfg.mcp = mcp;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return true;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asConfig(value: unknown, file: string): PlatformConfig {
  const cfg = asRecord(value);
  if (cfg === undefined) {
    throw new UserFacingError(`${file} is not a JSON object — refusing to touch it`);
  }
  return cfg;
}
