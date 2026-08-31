import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { PlatformAdapter, McpCommand, PlatformConfig } from '../../ports/platform-adapter.port.js';
import { writeFileAtomic } from '../fs/markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

export class ClaudeAdapter implements PlatformAdapter {
  readonly id = 'claude';

  detect(projectRoot: string): boolean {
    return existsSync(join(projectRoot, '.mcp.json')) || existsSync(join(projectRoot, '.claude'));
  }

  private configFile(projectRoot: string): string {
    return join(projectRoot, '.mcp.json');
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
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new UserFacingError(`${file} is not valid JSON: ${err instanceof Error ? err.message : err}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new UserFacingError(`${file} is not a JSON object — refusing to touch it`);
    }
    return parsed as PlatformConfig;
  }

  async writeConfig(projectRoot: string, cmd: McpCommand): Promise<'written' | 'replaced' | 'unchanged'> {
    const file = this.configFile(projectRoot);
    const cfg = (await this.readConfig(projectRoot)) ?? {};
    const mcpServers = asRecord(cfg.mcpServers) ?? {};
    // каноническая проекция McpCommand в формат Claude Code: command + args
    const desired = { command: cmd.command, args: [...cmd.args] };
    if (JSON.stringify(mcpServers.wolf) === JSON.stringify(desired)) return 'unchanged';
    const replaced = mcpServers.wolf !== undefined;
    mcpServers.wolf = desired;
    cfg.mcpServers = mcpServers;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return replaced ? 'replaced' : 'written';
  }

  async removeWolf(projectRoot: string): Promise<boolean> {
    const file = this.configFile(projectRoot);
    const cfg = await this.readConfig(projectRoot);
    if (cfg === null) return false;
    const mcpServers = asRecord(cfg.mcpServers);
    if (mcpServers === undefined || mcpServers.wolf === undefined) return false;
    delete mcpServers.wolf;
    if (Object.keys(mcpServers).length === 0) delete cfg.mcpServers;
    else cfg.mcpServers = mcpServers;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return true;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
