import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { basename, join } from 'path';
import {
  PlatformAdapter,
  McpCommand,
  PlatformConfig,
  PlatformWriteResult,
  PlatformVersionInfo,
} from '../../ports/platform-adapter.port.js';
import { parseJsonc } from './jsonc.js';
import { writeFileAtomic } from '../fs/markdown-memory-store.js';
import { UserFacingError } from '../../domain/errors.js';

/** Дефолтный агент Wolf в opencode (§6.1). */
export const DEFAULT_AGENT = 'mr-wolf';

/** Глубина субагентов: executor-lead спавнит worker-* (трёхуровневая схема). */
export const SUBAGENT_DEPTH = 2;

/**
 * opencode v2 (схема https://opencode.ai/config.json): действующий путь —
 * `experimental.subagent_depth`; верхнеуровневый `subagent_depth` помечен
 * deprecated и платформой игнорируется (эффективный дефолт — 1).
 */
const SD_KEY = 'subagent_depth';

/** Значение глубины в действующем месте — наше или совместимое (>= SUBAGENT_DEPTH). */
function depthIsOurs(value: unknown): boolean {
  return typeof value === 'number' && value >= SUBAGENT_DEPTH;
}

const execFileAsync = promisify(execFile);

/** Минимальная поддержанная v1 (порог диапазона). */
const V1_MIN_MINOR = 18;
const V1_MIN_PATCH = 29;

/**
 * Чистый парсер `opencode --version`. Эмпирика форматов: v1 печатает `1.18.35`,
 * v2 — `opencode v2.0.24`; regex вытаскивает M.m.p из обоих.
 */
export function parseOpencodeVersion(raw: string): PlatformVersionInfo {
  const trimmed = raw.trim();
  const m = trimmed.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return { status: 'unparseable', raw: trimmed };
  const version = `${m[1]}.${m[2]}.${m[3]}`;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (major >= 2) return { status: 'v2', version, raw: trimmed };
  if (major === 1 && (minor > V1_MIN_MINOR || (minor === V1_MIN_MINOR && patch >= V1_MIN_PATCH)))
    return { status: 'v1', version, raw: trimmed };
  return { status: 'unsupported', version, raw: trimmed };
}

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

  /** `opencode --version`; бинарь недоступен/ошибка запуска → absent (не бросаем). */
  async detectVersion(projectRoot: string): Promise<PlatformVersionInfo> {
    try {
      const { stdout } = await execFileAsync('opencode', ['--version'], { cwd: projectRoot, timeout: 5000 });
      return parseOpencodeVersion(stdout);
    } catch (err) {
      return { status: 'absent', message: err instanceof Error ? err.message : String(err) };
    }
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

  async writeConfig(projectRoot: string, cmd: McpCommand): Promise<PlatformWriteResult> {
    const file = this.configFile(projectRoot);
    const cfg = (await this.readConfig(projectRoot)) ?? {};
    const mcp = asRecord(cfg.mcp) ?? {};
    // каноническая проекция McpCommand в формат opencode: command — массив
    const desired = { type: 'local', command: [cmd.command, ...cmd.args], enabled: true };
    const mcpOk = JSON.stringify(mcp.wolf) === JSON.stringify(desired);

    // §6.1: default_agent и experimental.subagent_depth мерджатся рядом с mcp.wolf
    const da = cfg.default_agent;
    const reasons: string[] = [];
    if (da !== undefined && da !== DEFAULT_AGENT) {
      reasons.push(`default_agent=${da} is taken; mr-wolf not assigned`);
    }

    // opencode v2: действует только experimental.subagent_depth. Верхнеуровневый ключ —
    // deprecated: наше точное значение мигрируем, чужое не трогаем и сообщаем.
    const experimental = asRecord(cfg.experimental);
    const expSd = experimental?.[SD_KEY];
    const legacySd = cfg[SD_KEY];
    const depthOk = depthIsOurs(expSd);
    const legacyOurs = legacySd === SUBAGENT_DEPTH;
    let setDepth = false;
    let dropLegacy = false;
    if (cfg.experimental !== undefined && experimental === undefined) {
      reasons.push(
        `experimental is not an object; ${SD_KEY} is not written — set experimental.${SD_KEY}: ${SUBAGENT_DEPTH} manually`
      );
    } else if (depthOk) {
      if (legacyOurs) {
        dropLegacy = true; // оба ключа наши: легаси — только шум, убираем
        reasons.push(`removed deprecated top-level ${SD_KEY}=${SUBAGENT_DEPTH} (ignored by opencode v2)`);
      } else if (legacySd !== undefined) {
        reasons.push(
          `top-level ${SD_KEY}=${legacySd} is deprecated and ignored by opencode v2; experimental.${SD_KEY} is used`
        );
      }
    } else if (expSd !== undefined) {
      reasons.push(`experimental.${SD_KEY}=${expSd} is taken; the three-level scheme will not work, set >=2`);
    } else if (legacyOurs) {
      setDepth = true;
      dropLegacy = true;
      reasons.push(`migrated ${SD_KEY} to experimental.${SD_KEY}`);
    } else if (legacySd !== undefined) {
      reasons.push(
        `top-level ${SD_KEY}=${legacySd} is taken; the key is deprecated and ignored by opencode v2 — set experimental.${SD_KEY} >=${SUBAGENT_DEPTH}`
      );
    } else {
      setDepth = true;
    }
    const reason = reasons.length > 0 ? reasons.join('; ') : undefined;

    // F6 (спека 2.1.0 §2.4): фактические wolf-ключи после ensured — только наши
    // (mcp.wolf в обоих ветках ниже каноничен; default_agent/subagent_depth — если ключ наш, не занят чужим значением)
    const ours = (): string[] => {
      const keys = ['mcp.wolf'];
      if (cfg.default_agent === DEFAULT_AGENT) keys.push(`default_agent=${DEFAULT_AGENT}`);
      const sd = asRecord(cfg.experimental)?.[SD_KEY];
      if (depthIsOurs(sd)) keys.push(`${SD_KEY}=${sd}`);
      return keys;
    };

    // unchanged — по ВСЕМ ключам: корректный mcp.wolf не маскирует отсутствие default_agent/subagent_depth;
    // занятое чужим значением место depth тоже settled (не перезаписываем — только reason)
    if (mcpOk && da !== undefined && !setDepth && !dropLegacy)
      return { action: 'unchanged', reason, configFile: basename(file), keys: ours() };

    const replaced = mcp.wolf !== undefined && !mcpOk;
    mcp.wolf = desired;
    cfg.mcp = mcp;
    if (da === undefined) cfg.default_agent = DEFAULT_AGENT; // конфликтный ключ не трогаем
    if (setDepth) {
      const exp = experimental ?? {};
      exp[SD_KEY] = SUBAGENT_DEPTH;
      cfg.experimental = exp;
    }
    if (dropLegacy) delete cfg[SD_KEY];
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return { action: replaced ? 'replaced' : 'written', reason, configFile: basename(file), keys: ours() };
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

  /**
   * 2.16.2 (uninstall, F-07): только wolf-ключи с точным нашим значением.
   * Пользовательские default_agent/subagent_depth (не наши точные значения) не трогаем.
   * Глубина: `experimental.subagent_depth === 2` (действующий путь) + легаси верхнеуровневый.
   */
  async removeWolfKeys(projectRoot: string): Promise<PlatformWriteResult> {
    const file = this.configFile(projectRoot);
    const cfg = await this.readConfig(projectRoot).catch(() => null);
    if (cfg === null) return { action: 'skipped', reason: `no ${basename(file)}`, configFile: basename(file) };
    const removed: string[] = [];
    const mcp = asRecord(cfg.mcp);
    if (mcp !== undefined && mcp.wolf !== undefined) {
      delete mcp.wolf;
      if (Object.keys(mcp).length === 0) delete cfg.mcp;
      else cfg.mcp = mcp;
      removed.push('mcp.wolf');
    }
    if (cfg.default_agent === DEFAULT_AGENT) {
      delete cfg.default_agent;
      removed.push(`default_agent=${DEFAULT_AGENT}`);
    }
    let depthRemoved = false;
    const exp = asRecord(cfg.experimental);
    if (exp !== undefined && exp[SD_KEY] === SUBAGENT_DEPTH) {
      delete exp[SD_KEY];
      if (Object.keys(exp).length === 0) delete cfg.experimental;
      else cfg.experimental = exp;
      depthRemoved = true;
    }
    if (cfg[SD_KEY] === SUBAGENT_DEPTH) {
      // легаси верхнеуровневый ключ (deprecated в opencode v2) — тоже наш
      delete cfg[SD_KEY];
      depthRemoved = true;
    }
    if (depthRemoved) removed.push(`${SD_KEY}=${SUBAGENT_DEPTH}`);
    if (removed.length === 0) {
      return {
        action: 'unchanged',
        reason: 'no wolf keys with our exact values',
        configFile: basename(file),
        keys: [],
      };
    }
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return { action: 'removed', configFile: basename(file), keys: removed };
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
