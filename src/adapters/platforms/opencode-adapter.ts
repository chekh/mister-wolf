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
import { parseStamp } from '../render/stamp.js';
import yaml from 'js-yaml';
import {
  ConfigKeySpec,
  DEFAULT_AGENT,
  DEFAULT_AGENT_KEY,
  MCP_KEY,
  MCP_ROOT,
  MCP_SERVERS,
  SUBAGENT_DEPTH,
  SUBAGENT_DEPTH_KEY,
  deletePath,
  getPath,
  getRecordAt,
  isWolfMcpEntry,
  legacyPathOf,
  mcpEntryNative,
  setPath,
} from './opencode-config-keys.js';

export { DEFAULT_AGENT, SUBAGENT_DEPTH };

/** Каноническая команда wolf: removeWolf/configIssues не получают cmd, ownership проверяем ею. */
const WOLF_CMD: McpCommand = { command: 'wolf', args: ['mcp'] };

/** Значение глубины в действующем месте — наше или совместимое (>= SUBAGENT_DEPTH). */
function depthIsOurs(value: unknown): boolean {
  return typeof value === 'number' && value >= SUBAGENT_DEPTH;
}

const dotted = (key: ConfigKeySpec): string => key.writePath.join('.');
const leaf = (key: ConfigKeySpec): string => key.writePath[key.writePath.length - 1]!;

const execFileAsync = promisify(execFile);

/** Минимальная поддержанная v1 (порог диапазона). */
const V1_MIN_MINOR = 18;
const V1_MIN_PATCH = 29;

/**
 * Чистый парсер `opencode --version`. Эмпирика форматов: v1 печатает `1.18.35`,
 * v2 — `opencode v2.0.24`; regex вытаскивает M.m.p из обоих.
 *
 * Нативная форма `mcp.servers.<name>` принимается opencode >= 1.18.29 (v2-compat hoist),
 * а порог v1 в коде — ровно 1.18.29: ветвление по версии для выбора формы не нужно.
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

    // 6.3: пишем нативную форму mcp.servers.wolf, легаси mcp.wolf снимаем только если он наш
    const desired = mcpEntryNative(cmd);
    const nativeEntry = getPath(cfg, MCP_KEY.writePath);
    const mcpOk = JSON.stringify(nativeEntry) === JSON.stringify(desired);
    const legacyMcpPath = legacyPathOf(MCP_KEY)!;
    const legacyMcp = getRecordAt(cfg, legacyMcpPath);
    const legacyMcpOurs = legacyMcp !== undefined && isWolfMcpEntry(legacyMcp, cmd);

    const reasons: string[] = [];

    // §6.1: default_agent и experimental.subagent_depth мерджатся рядом с mcp.servers.wolf
    const da = getPath(cfg, DEFAULT_AGENT_KEY.writePath);
    if (da !== undefined && da !== DEFAULT_AGENT) {
      reasons.push(`${DEFAULT_AGENT_KEY.label}=${da} is taken; ${DEFAULT_AGENT} not assigned`);
    }

    if (legacyMcp !== undefined) {
      if (legacyMcpOurs) {
        reasons.push(`removed deprecated top-level ${legacyMcpPath.join('.')} (migrated to ${MCP_KEY.label})`);
      } else {
        reasons.push(
          `top-level ${legacyMcpPath.join('.')} is deprecated and foreign (command differs); ${MCP_KEY.label} is used`
        );
      }
    }
    const migrateLegacyMcp = legacyMcpOurs;
    const replaced = nativeEntry !== undefined && !mcpOk;
    if (replaced) reasons.push(`replaced non-canonical ${MCP_KEY.label} entry with the canonical Wolf entry`);

    // opencode v2: действует только experimental.subagent_depth. Верхнеуровневый ключ —
    // deprecated: наше точное значение мигрируем, чужое не трогаем и сообщаем.
    const depthPath = SUBAGENT_DEPTH_KEY.writePath;
    const depthLeaf = leaf(SUBAGENT_DEPTH_KEY);
    const depthLabel = dotted(SUBAGENT_DEPTH_KEY);
    const legacyDepthPath = legacyPathOf(SUBAGENT_DEPTH_KEY)!;
    const experimental = getRecordAt(cfg, depthPath.slice(0, -1));
    const expSd = experimental?.[depthLeaf];
    const legacySd = getPath(cfg, legacyDepthPath);
    const depthOk = depthIsOurs(expSd);
    const legacyOurs = legacySd === SUBAGENT_DEPTH;
    let setDepth = false;
    let dropLegacy = false;
    if (getPath(cfg, depthPath.slice(0, -1)) !== undefined && experimental === undefined) {
      reasons.push(
        `experimental is not an object; ${depthLeaf} is not written — set ${depthLabel}: ${SUBAGENT_DEPTH} manually`
      );
    } else if (depthOk) {
      if (legacyOurs) {
        dropLegacy = true; // оба ключа наши: легаси — только шум, убираем
        reasons.push(`removed deprecated top-level ${depthLeaf}=${SUBAGENT_DEPTH} (ignored by opencode v2)`);
      } else if (legacySd !== undefined) {
        reasons.push(
          `top-level ${depthLeaf}=${legacySd} is deprecated and ignored by opencode v2; ${depthLabel} is used`
        );
      }
    } else if (expSd !== undefined) {
      reasons.push(`${depthLabel}=${expSd} is taken; the three-level scheme will not work, set >=2`);
    } else if (legacyOurs) {
      setDepth = true;
      dropLegacy = true;
      reasons.push(`migrated ${depthLeaf} to ${depthLabel}`);
    } else if (legacySd !== undefined) {
      reasons.push(
        `top-level ${depthLeaf}=${legacySd} is taken; the key is deprecated and ignored by opencode v2 — set ${depthLabel} >=${SUBAGENT_DEPTH}`
      );
    } else {
      setDepth = true;
    }
    const reason = reasons.length > 0 ? reasons.join('; ') : undefined;

    // F6 (спека 2.1.0 §2.4): фактические wolf-ключи после ensured — только наши
    // (mcp.servers.wolf каноничен; default_agent/subagent_depth — если ключ наш, не занят чужим значением)
    const ours = (): string[] => {
      const keys = [MCP_KEY.label];
      if (getPath(cfg, DEFAULT_AGENT_KEY.writePath) === DEFAULT_AGENT)
        keys.push(`${DEFAULT_AGENT_KEY.label}=${DEFAULT_AGENT}`);
      const sd = getRecordAt(cfg, depthPath.slice(0, -1))?.[depthLeaf];
      if (depthIsOurs(sd)) keys.push(`${depthLeaf}=${sd}`);
      return keys;
    };

    // unchanged — по ВСЕМ ключам: корректный mcp.servers.wolf не маскирует отсутствие default_agent/subagent_depth;
    // занятое чужим значением место depth тоже settled (не перезаписываем — только reason);
    // наш легаси mcp.wolf — не settled: его надо снять записью.
    if (mcpOk && da !== undefined && !setDepth && !dropLegacy && !migrateLegacyMcp)
      return { action: 'unchanged', reason, configFile: basename(file), keys: ours() };

    setPath(cfg, MCP_KEY.writePath, desired);
    if (migrateLegacyMcp) deletePath(cfg, legacyMcpPath);
    if (da === undefined) setPath(cfg, DEFAULT_AGENT_KEY.writePath, DEFAULT_AGENT); // конфликтный ключ не трогаем
    if (setDepth) setPath(cfg, depthPath, SUBAGENT_DEPTH);
    if (dropLegacy) deletePath(cfg, legacyDepthPath);
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return { action: replaced ? 'replaced' : 'written', reason, configFile: basename(file), keys: ours() };
  }

  async removeWolf(projectRoot: string): Promise<boolean> {
    const file = this.configFile(projectRoot);
    const cfg = await this.readConfig(projectRoot);
    if (cfg === null) return false;
    const legacyMcpPath = legacyPathOf(MCP_KEY)!;
    const nativeEntry = getPath(cfg, MCP_KEY.writePath);
    const legacyEntry = getPath(cfg, legacyMcpPath);
    let removed = false;
    if (nativeEntry !== undefined && isWolfMcpEntry(nativeEntry, WOLF_CMD)) {
      deletePath(cfg, MCP_KEY.writePath);
      removed = true;
    }
    if (legacyEntry !== undefined && isWolfMcpEntry(legacyEntry, WOLF_CMD)) {
      deletePath(cfg, legacyMcpPath);
      removed = true;
    }
    if (!removed) return false;
    await writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n');
    return true;
  }

  /**
   * 2.16.2 (uninstall, F-07): только wolf-ключи с точным нашим значением.
   * Пользовательские default_agent/subagent_depth (не наши точные значения) не трогаем.
   * Глубина: `experimental.subagent_depth === 2` (действующий путь) + легаси верхнеуровневый.
   * 6.3: удаляем обе формы MCP (нативную и легаси) — только если запись наша.
   */
  async removeWolfKeys(projectRoot: string): Promise<PlatformWriteResult> {
    const file = this.configFile(projectRoot);
    const cfg = await this.readConfig(projectRoot).catch(() => null);
    if (cfg === null) return { action: 'skipped', reason: `no ${basename(file)}`, configFile: basename(file) };
    const removed: string[] = [];
    const legacyMcpPath = legacyPathOf(MCP_KEY)!;
    const nativeEntry = getPath(cfg, MCP_KEY.writePath);
    const legacyEntry = getPath(cfg, legacyMcpPath);
    if (nativeEntry !== undefined && isWolfMcpEntry(nativeEntry, WOLF_CMD)) {
      deletePath(cfg, MCP_KEY.writePath);
      removed.push(MCP_KEY.label);
    }
    if (legacyEntry !== undefined && isWolfMcpEntry(legacyEntry, WOLF_CMD)) {
      deletePath(cfg, legacyMcpPath);
      if (!removed.includes(MCP_KEY.label)) removed.push(MCP_KEY.label);
    }
    if (getPath(cfg, DEFAULT_AGENT_KEY.writePath) === DEFAULT_AGENT) {
      deletePath(cfg, DEFAULT_AGENT_KEY.writePath);
      removed.push(`${DEFAULT_AGENT_KEY.label}=${DEFAULT_AGENT}`);
    }
    const depthLeaf = leaf(SUBAGENT_DEPTH_KEY);
    const legacyDepthPath = legacyPathOf(SUBAGENT_DEPTH_KEY)!;
    let depthRemoved = false;
    if (getPath(cfg, SUBAGENT_DEPTH_KEY.writePath) === SUBAGENT_DEPTH) {
      deletePath(cfg, SUBAGENT_DEPTH_KEY.writePath);
      depthRemoved = true;
    }
    if (getPath(cfg, legacyDepthPath) === SUBAGENT_DEPTH) {
      // легаси верхнеуровневый ключ (deprecated в opencode v2) — тоже наш
      deletePath(cfg, legacyDepthPath);
      depthRemoved = true;
    }
    if (depthRemoved) removed.push(`${depthLeaf}=${SUBAGENT_DEPTH}`);
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

  /**
   * 6.1/6.3/6.4: doctor-проверки, которые знает только opencode-адаптер —
   * все ключи, которые Wolf пишет, + смешанный frontmatter managed-агентов.
   * Строки идут в общий `issues` проекта и маскируются doctor'ом как обычно.
   */
  async configIssues(projectRoot: string): Promise<string[]> {
    const cfg = await this.readConfig(projectRoot).catch(() => null);
    if (cfg === null) return [`${this.id}: wolf entry missing — run wolf init`];
    return [
      ...mcpIssues(cfg),
      ...defaultAgentIssues(cfg),
      ...depthIssues(cfg),
      ...(await mixedFrontmatterIssues(projectRoot, this.id)),
    ];
  }
}

/** 6.3: wolf-сервер отсутствует в обеих формах / легаси-форма подлежит миграции. */
function mcpIssues(cfg: PlatformConfig): string[] {
  const legacyPath = legacyPathOf(MCP_KEY)!;
  const native = getPath(cfg, MCP_KEY.writePath);
  const legacy = getPath(cfg, legacyPath);
  if (native === undefined && legacy === undefined) return [`opencode: wolf entry missing — run wolf init`];
  if (legacy === undefined) return [];
  return [
    isWolfMcpEntry(legacy, WOLF_CMD)
      ? `opencode: wolf entry is in the deprecated top-level ${legacyPath.join('.')} form — run wolf init to migrate it to ${MCP_KEY.label}`
      : `opencode: top-level ${legacyPath.join('.')} is foreign and deprecated (opencode v2 reads ${MCP_ROOT}.${MCP_SERVERS}) — wolf leaves it untouched`,
  ];
}

/** 6.1: default_agent === mr-wolf, иначе L0 стартует не тем агентом. */
function defaultAgentIssues(cfg: PlatformConfig): string[] {
  const da = getPath(cfg, DEFAULT_AGENT_KEY.writePath);
  if (da === undefined)
    return [
      `opencode: ${DEFAULT_AGENT_KEY.label} is not set — ${DEFAULT_AGENT} is not the default agent; run wolf init`,
    ];
  if (da !== DEFAULT_AGENT)
    return [
      `opencode: ${DEFAULT_AGENT_KEY.label}=${String(da)} is taken; ${DEFAULT_AGENT} is not assigned (foreign value is never overwritten)`,
    ];
  return [];
}

/** 6.1: experimental.subagent_depth >= 2 + deprecated верхнеуровневый ключ. */
function depthIssues(cfg: PlatformConfig): string[] {
  const out: string[] = [];
  const depthPath = SUBAGENT_DEPTH_KEY.writePath;
  const parentPath = depthPath.slice(0, -1);
  const depthLabel = depthPath.join('.');
  const depthLeaf = depthPath[depthPath.length - 1]!;
  const parentRaw = getPath(cfg, parentPath);
  const experimental = getRecordAt(cfg, parentPath);
  const depth = experimental?.[depthLeaf];
  if (parentRaw !== undefined && experimental === undefined) {
    out.push(
      `opencode: ${parentPath.join('.')} is not an object — ${depthLabel} is not set; set it to ${SUBAGENT_DEPTH} manually`
    );
  } else if (depth === undefined) {
    out.push(`opencode: ${depthLabel} is not set — the three-level scheme needs >=${SUBAGENT_DEPTH}; run wolf init`);
  } else if (typeof depth !== 'number' || depth < SUBAGENT_DEPTH) {
    out.push(
      `opencode: ${depthLabel}=${String(depth)} — the three-level scheme needs >=${SUBAGENT_DEPTH}; foreign value is never overwritten`
    );
  }
  const legacyPath = legacyPathOf(SUBAGENT_DEPTH_KEY)!;
  const legacy = getPath(cfg, legacyPath);
  if (legacy !== undefined) {
    out.push(
      legacy === SUBAGENT_DEPTH
        ? `opencode: top-level ${legacyPath.join('.')}=${SUBAGENT_DEPTH} is deprecated and ignored by opencode v2 — run wolf init to migrate it to ${depthLabel}`
        : `opencode: top-level ${legacyPath.join('.')}=${String(legacy)} is deprecated and ignored by opencode v2 — foreign value, set ${depthLabel} >=${SUBAGENT_DEPTH} manually`
    );
  }
  return out;
}

/** v2-поля агента: их появление включает чтение файла по схеме V2. */
const V2_AGENT_FIELDS = ['permissions', 'request', 'system', 'disabled'] as const;
/** v1-поля агента: в V2-режиме молча игнорируются (6.4). */
const V1_AGENT_FIELDS = ['permission', 'temperature', 'mode'] as const;

/**
 * 6.4: managed-агент (есть штамп Wolf) со смешанным frontmatter читается как V2,
 * и v1-правила (`permission.task: deny`) исчезают — предупреждаем, не правим файл.
 */
async function mixedFrontmatterIssues(projectRoot: string, platformId: string): Promise<string[]> {
  const dir = join(projectRoot, '.opencode', 'agents');
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const out: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.md')) continue;
    const raw = await fs.readFile(join(dir, name), 'utf-8').catch(() => null);
    if (raw === null || parseStamp(raw) === null) continue; // чужой файл — не наш scope
    const front = frontmatterOf(raw);
    if (front === undefined) continue;
    const v2 = V2_AGENT_FIELDS.filter((field) => front[field] !== undefined);
    const v1 = V1_AGENT_FIELDS.filter((field) => front[field] !== undefined);
    if (v2.length === 0 || v1.length === 0) continue;
    out.push(
      `${platformId}: ${join('.opencode', 'agents', name)} mixes v2 (${v2.join(', ')}) and v1 (${v1.join(', ')}) frontmatter — the file is read as V2 and v1 fields are ignored; do not mix formats in one file`
    );
  }
  return out;
}

/** YAML-frontmatter файла агента; нет блока/битый YAML — undefined. */
function frontmatterOf(raw: string): Record<string, unknown> | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (match === null) return undefined;
  try {
    const parsed = yaml.load(match[1]!);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function asConfig(value: unknown, file: string): PlatformConfig {
  const cfg = asRecord(value);
  if (cfg === undefined) {
    throw new UserFacingError(`${file} is not a JSON object — refusing to touch it`);
  }
  return cfg;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
