import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { basename, join, relative } from 'path';
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
  ConfigLocation,
  ConfigLocationId,
  CONFIG_LOCATIONS,
  DEFAULT_AGENT,
  DEFAULT_AGENT_KEY,
  MCP_KEY,
  MCP_ROOT,
  MCP_SERVERS,
  SUBAGENT_DEPTH,
  SUBAGENT_DEPTH_KEY,
  WOLF_MCP_COMMAND,
  WRITE_LOCATION,
  WRITE_LOCATION_ID,
  deletePath,
  getPath,
  getRecordAt,
  isWolfMcpEntry,
  legacyPathOf,
  blockedSegment,
  locatePath,
  mcpEntryNative,
  mergeSurface,
  pathWritable,
  relPathOf,
  setPath,
} from './opencode-config-keys.js';

export { DEFAULT_AGENT, SUBAGENT_DEPTH };

/** Каноническая команда wolf: removeWolf/configIssues не получают cmd, ownership проверяем ею. */
const WOLF_CMD: McpCommand = WOLF_MCP_COMMAND;

/**
 * Конфиг одной локации (6.7): корень проекта или .opencode.
 * `rel` — путь относительно корня проекта (для логов и сообщений).
 */
interface LoadedConfig {
  location: ConfigLocationId;
  file: string; // абсолютный путь
  rel: string; // путь относительно корня проекта
  cfg: Record<string, unknown>;
}

/** Битый/нечитаемый конфиг одной локации: файл исключается из поверхности, но называется. */
interface ConfigFileError {
  location: ConfigLocationId;
  file: string; // абсолютный путь
  rel: string; // путь относительно корня проекта
  kind: 'not valid JSONC' | 'not a JSON object' | 'not readable';
  message: string; // текст UserFacingError (те же формулировки, что и раньше)
}

/**
 * Поверхность конфига opencode (6.7): обе локации + эффективный вид.
 * `files` — читаемые конфиги в порядке приоритета чтения (.opencode выше корня);
 * `errors` — битые/нечитаемые файлы (изоляция по файлу, а не по всей поверхности);
 * `effective` — слияние читаемых: корень мержится раньше, .opencode позже.
 */
interface ConfigSurface {
  files: LoadedConfig[];
  errors: ConfigFileError[];
  effective: Record<string, unknown>;
}

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

  /**
   * Файл локации: jsonc — только если json отсутствует (правило прежнее),
   * иначе json. Если файла нет — возвращается дефолтный путь (цель записи).
   */
  private locationFile(projectRoot: string, location: ConfigLocation): string {
    const dir = location.dir === '' ? projectRoot : join(projectRoot, location.dir);
    const jsonc = join(dir, `${location.fileBase}.jsonc`);
    const json = join(dir, `${location.fileBase}.json`);
    return existsSync(jsonc) && !existsSync(json) ? jsonc : json;
  }

  /** Корневой конфиг — единственное место, куда wolf пишет свои ключи. */
  private rootFile(projectRoot: string): string {
    return this.locationFile(projectRoot, WRITE_LOCATION);
  }

  /**
   * Поверхность конфига (6.7): обе локации + эффективный (слейдженный) вид.
   * Битый/нечитаемый файл ИЗОЛИРУЕТСЯ: он попадает в `errors`, а остальные локации
   * читаются как обычно (прежнее поведение «всё или ничего» чинило в обратную сторону).
   */
  private async loadSurface(projectRoot: string): Promise<ConfigSurface> {
    const files: LoadedConfig[] = [];
    const errors: ConfigFileError[] = [];
    for (const location of CONFIG_LOCATIONS) {
      const file = this.locationFile(projectRoot, location);
      if (!existsSync(file)) continue;
      const rel = relative(projectRoot, file);
      let raw: string;
      try {
        raw = await fs.readFile(file, 'utf-8');
      } catch (err) {
        errors.push({
          location: location.id,
          file,
          rel,
          kind: 'not readable',
          message: `${file} is not readable: ${err instanceof Error ? err.message : err}`,
        });
        continue;
      }
      let parsed: unknown;
      try {
        parsed = parseJsonc(raw);
      } catch (err) {
        // паритет с ClaudeAdapter: ошибки парсинга — UserFacingError, не сырой SyntaxError
        errors.push({
          location: location.id,
          file,
          rel,
          kind: 'not valid JSONC',
          message: `${file} is not valid JSONC: ${err instanceof Error ? err.message : err}`,
        });
        continue;
      }
      const cfg = asRecord(parsed);
      if (cfg === undefined) {
        errors.push({
          location: location.id,
          file,
          rel,
          kind: 'not a JSON object',
          message: `${file} is not a JSON object — refusing to touch it`,
        });
        continue;
      }
      files.push({ location: location.id, file, rel, cfg });
    }
    return { files, errors, effective: mergeSurface(files) };
  }

  /** Битая/нечитаемая корневая локация (та, куда wolf пишет) — прежний контракт: ошибка наружу. */
  private static rootError(surface: ConfigSurface): ConfigFileError | undefined {
    return surface.errors.find((error) => error.location === WRITE_LOCATION_ID);
  }

  /**
   * Эффективный конфиг обеих локаций; null — конфиг-файлов нет ни в одной локации.
   * Битый корневой файл — UserFacingError (прежний контракт для корня);
   * битый `.opencode` — не мешает: возвращаем вид читаемых файлов.
   */
  async readConfig(projectRoot: string): Promise<PlatformConfig | null> {
    const surface = await this.loadSurface(projectRoot);
    const rootError = OpencodeAdapter.rootError(surface);
    if (rootError !== undefined) throw new UserFacingError(rootError.message);
    if (surface.files.length === 0) return null;
    return surface.effective;
  }

  /**
   * Запись wolf-ключей (6.7): решения принимаются по эффективному виду обеих
   * локаций, запись — только в корневой конфиг (в .opencode wolf не пишет).
   *
   * opts.createFile=false — режим repair-only: файл конфига не создаётся, если его нет
   * (минимальный init чинит существующий конфиг и никогда не создаёт платформенный).
   */
  async writeConfig(
    projectRoot: string,
    cmd: McpCommand,
    opts?: { createFile?: boolean }
  ): Promise<PlatformWriteResult> {
    const surface = await this.loadSurface(projectRoot);
    // битый/нечитаемый корень — прежнее поведение: файл не трогаем, ошибка наружу
    const rootError = OpencodeAdapter.rootError(surface);
    if (rootError !== undefined) throw new UserFacingError(rootError.message);
    const file = this.rootFile(projectRoot);
    const rootExists = surface.files.some((f) => f.location === WRITE_LOCATION_ID);
    if (!rootExists && opts?.createFile === false) {
      // минимальный init: конфига нет — не создаём (документированное обещание)
      const other = surface.files.find((f) => f.location !== WRITE_LOCATION_ID);
      const reason =
        other !== undefined
          ? `no root ${relPathOf(WRITE_LOCATION)} to repair — the project config is ${other.rel}; a minimal init never creates a platform config (use wolf init --platform ${this.id})`
          : `no root ${relPathOf(WRITE_LOCATION)} to repair — a minimal init never creates a platform config (use wolf init --platform ${this.id})`;
      return { action: 'skipped', reason };
    }
    const rootCfg = rootConfigOf(surface);

    // 6.3: пишем нативную форму mcp.servers.wolf, легаси mcp.wolf снимаем только если он наш
    const desired = mcpEntryNative(cmd);
    const legacyMcpPath = legacyPathOf(MCP_KEY)!;
    const nativeAt = locatePath(surface.files, MCP_KEY.writePath);
    const legacyAt = locatePath(surface.files, legacyMcpPath);
    const legacyMcpOurs = legacyAt !== undefined && isWolfMcpEntry(legacyAt.value, cmd);
    const mcpWritable = pathWritable(rootCfg, MCP_KEY.writePath);

    const blockedReasons: string[] = [];
    const agentReasons: string[] = [];
    const depthReasons: string[] = [];

    const mcpBlocked = blockedSegment(rootCfg, MCP_KEY.writePath);
    if (mcpBlocked !== undefined) {
      blockedReasons.push(
        `${mcpBlocked} is not an object; ${MCP_KEY.label} is not written — fix the conflicting key manually`
      );
    }

    // §6.1: default_agent — по эффективному виду (корень + .opencode)
    const da = locatePath(surface.files, DEFAULT_AGENT_KEY.writePath)?.value;
    if (da !== undefined && da !== DEFAULT_AGENT) {
      agentReasons.push(`${DEFAULT_AGENT_KEY.label}=${da} is taken; ${DEFAULT_AGENT} not assigned`);
    }

    // 6.7: объявленное в .opencode не перекрываем вторым ключом в корне
    let writeMcp = false;
    let replaceMcp = false;
    let mcpNativeReason: string | undefined;
    if (nativeAt !== undefined) {
      if (JSON.stringify(nativeAt.value) === JSON.stringify(desired)) {
        // уже канонично — писать нечего
      } else if (nativeAt.location === WRITE_LOCATION_ID) {
        if (mcpWritable) {
          writeMcp = true;
          replaceMcp = true;
          mcpNativeReason = `replaced non-canonical ${MCP_KEY.label} entry with the canonical Wolf entry`;
        }
      } else {
        mcpNativeReason = `${MCP_KEY.label} is declared in ${relOf(surface, nativeAt.location)} — the .opencode value overrides the root one, so a root entry would have no effect; wolf leaves it untouched (wolf writes the root config)`;
      }
    } else if (legacyAt === undefined || !legacyMcpOurs || legacyAt.location === WRITE_LOCATION_ID) {
      writeMcp = mcpWritable;
    }

    // легаси-форма: снимаем только свою и только в корне (писать можно лишь туда)
    let dropLegacyMcp = false;
    let mcpLegacyReason: string | undefined;
    if (legacyAt !== undefined) {
      if (!legacyMcpOurs) {
        mcpLegacyReason = `top-level ${legacyMcpPath.join('.')} is deprecated and foreign (command differs); ${MCP_KEY.label} is used`;
      } else if (legacyAt.location === WRITE_LOCATION_ID) {
        dropLegacyMcp = true;
        mcpLegacyReason = `removed deprecated top-level ${legacyMcpPath.join('.')} (migrated to ${MCP_KEY.label})`;
      } else if (nativeAt === undefined) {
        mcpLegacyReason = `wolf entry is in the deprecated top-level ${legacyMcpPath.join('.')} form in ${relOf(surface, legacyAt.location)} — the .opencode value overrides the root one, so a root entry would have no effect; migrate it to ${MCP_KEY.label} manually`;
      } else {
        mcpLegacyReason = `deprecated top-level ${legacyMcpPath.join('.')} in ${relOf(surface, legacyAt.location)} is ignored by opencode v2 — the .opencode value overrides the root one; remove it manually`;
      }
    }

    // opencode v2: действует только experimental.subagent_depth. Верхнеуровневый ключ —
    // deprecated: наше точное значение мигрируем, чужое не трогаем и сообщаем.
    const depthPath = SUBAGENT_DEPTH_KEY.writePath;
    const depthLeaf = leaf(SUBAGENT_DEPTH_KEY);
    const depthLabel = dotted(SUBAGENT_DEPTH_KEY);
    const legacyDepthPath = legacyPathOf(SUBAGENT_DEPTH_KEY)!;
    const depthAt = locatePath(surface.files, depthPath);
    const legacyDepthAt = locatePath(surface.files, legacyDepthPath);
    const depth = depthAt?.value;
    const legacyDepth = legacyDepthAt?.value;
    const depthOk = depthIsOurs(depth);
    const legacyOurs = legacyDepth === SUBAGENT_DEPTH;
    let setDepth = false;
    let dropLegacy = false;
    const depthWritable = pathWritable(rootCfg, depthPath);
    if (!depthWritable) {
      depthReasons.push(
        `experimental is not an object; ${depthLeaf} is not written — set ${depthLabel}: ${SUBAGENT_DEPTH} manually`
      );
    } else if (depthOk) {
      if (legacyOurs) {
        if (legacyDepthAt!.location === WRITE_LOCATION_ID) {
          dropLegacy = true; // оба ключа наши: легаси — только шум, убираем
          depthReasons.push(`removed deprecated top-level ${depthLeaf}=${SUBAGENT_DEPTH} (ignored by opencode v2)`);
        } else {
          depthReasons.push(
            `top-level ${depthLeaf}=${SUBAGENT_DEPTH} in ${relOf(surface, legacyDepthAt!.location)} is deprecated and ignored by opencode v2 — the .opencode value overrides the root one; remove it manually`
          );
        }
      } else if (legacyDepth !== undefined) {
        depthReasons.push(
          `top-level ${depthLeaf}=${legacyDepth} is deprecated and ignored by opencode v2; ${depthLabel} is used`
        );
      }
    } else if (depth !== undefined) {
      depthReasons.push(`${depthLabel}=${depth} is taken; the three-level scheme will not work, set >=2`);
    } else if (legacyOurs) {
      setDepth = true;
      if (legacyDepthAt!.location === WRITE_LOCATION_ID) {
        dropLegacy = true;
        depthReasons.push(`migrated ${depthLeaf} to ${depthLabel}`);
      } else {
        // легаси в .opencode удалить не можем (wolf пишет только в корень) — но и второй
        // ключ не нужен: каноническую форму wolf записывает в корневой конфиг сам.
        depthReasons.push(
          `top-level ${depthLeaf}=${SUBAGENT_DEPTH} in ${relOf(surface, legacyDepthAt!.location)} is deprecated and ignored by opencode v2 — wolf wrote ${depthLabel}=${SUBAGENT_DEPTH} in the root config; remove the deprecated key manually`
        );
      }
    } else if (legacyDepth !== undefined) {
      depthReasons.push(
        `top-level ${depthLeaf}=${legacyDepth} is taken; the key is deprecated and ignored by opencode v2 — set ${depthLabel} >=${SUBAGENT_DEPTH}`
      );
    } else {
      setDepth = true;
    }

    const reasons = [
      ...blockedReasons,
      ...agentReasons,
      ...(mcpLegacyReason !== undefined ? [mcpLegacyReason] : []),
      ...(mcpNativeReason !== undefined ? [mcpNativeReason] : []),
      ...depthReasons,
      // битая/нечитаемая локация не мешает починке корня — но называем её
      ...surface.errors.map((error) => `skipped: ${error.rel} is ${error.kind}`),
    ];
    const reason = reasons.length > 0 ? reasons.join('; ') : undefined;

    // F6 (спека 2.1.0 §2.4): фактические wolf-ключи после ensured — по эффективному виду
    // (mcp.servers.wolf каноничен; default_agent/subagent_depth — если ключ наш, не занят чужим значением)
    const ours = (): string[] => {
      const effective = effectiveAfter(surface, rootCfg);
      const keys: string[] = [];
      if (isWolfMcpEntry(getPath(effective, MCP_KEY.writePath), cmd)) keys.push(MCP_KEY.label);
      if (getPath(effective, DEFAULT_AGENT_KEY.writePath) === DEFAULT_AGENT)
        keys.push(`${DEFAULT_AGENT_KEY.label}=${DEFAULT_AGENT}`);
      const sd = getPath(effective, depthPath);
      if (depthIsOurs(sd)) keys.push(`${depthLeaf}=${sd}`);
      return keys;
    };

    // F-10: отчёт init называет файл, где реально лежат wolf-ключи (при отсутствии
    // записи — файл, где объявлен эффективный wolf-ключ; иначе — файл записи).
    const wolfKeyFile = (): string | undefined => {
      const mcp = locatePath(surface.files, MCP_KEY.writePath);
      if (mcp !== undefined) return relOf(surface, mcp.location);
      const agent = locatePath(surface.files, DEFAULT_AGENT_KEY.writePath);
      if (agent !== undefined) return relOf(surface, agent.location);
      const depth = locatePath(surface.files, SUBAGENT_DEPTH_KEY.writePath);
      if (depth !== undefined) return relOf(surface, depth.location);
      return undefined;
    };

    // unchanged — по ВСЕМ ключам: корректный mcp.servers.wolf не маскирует отсутствие default_agent/subagent_depth;
    // занятое чужим значением место depth тоже settled (не перезаписываем — только reason);
    // наш легаси mcp.wolf — не settled: его надо снять записью.
    const setAgent = da === undefined;
    if (!writeMcp && !dropLegacyMcp && !setAgent && !setDepth && !dropLegacy)
      return { action: 'unchanged', reason, configFile: wolfKeyFile() ?? basename(file), keys: ours() };

    if (writeMcp) setPath(rootCfg, MCP_KEY.writePath, desired);
    if (dropLegacyMcp) deletePath(rootCfg, legacyMcpPath);
    if (setAgent) setPath(rootCfg, DEFAULT_AGENT_KEY.writePath, DEFAULT_AGENT); // конфликтный ключ не трогаем
    if (setDepth) setPath(rootCfg, depthPath, SUBAGENT_DEPTH);
    if (dropLegacy) deletePath(rootCfg, legacyDepthPath);
    await writeFileAtomic(file, JSON.stringify(rootCfg, null, 2) + '\n');
    return { action: replaceMcp ? 'replaced' : 'written', reason, configFile: basename(file), keys: ours() };
  }

  /**
   * 6.7: wolf-запись MCP (нативная и легаси, только если она наша) удаляется
   * из ВСЕХ локаций, где она реально объявлена.
   */
  async removeWolf(projectRoot: string): Promise<boolean> {
    const surface = await this.loadSurface(projectRoot);
    if (surface.files.length === 0) return false;
    const legacyMcpPath = legacyPathOf(MCP_KEY)!;
    let removed = false;
    for (const file of surface.files) {
      let changed = false;
      const nativeEntry = getPath(file.cfg, MCP_KEY.writePath);
      const legacyEntry = getPath(file.cfg, legacyMcpPath);
      if (nativeEntry !== undefined && isWolfMcpEntry(nativeEntry, WOLF_CMD)) {
        deletePath(file.cfg, MCP_KEY.writePath);
        changed = true;
      }
      if (legacyEntry !== undefined && isWolfMcpEntry(legacyEntry, WOLF_CMD)) {
        deletePath(file.cfg, legacyMcpPath);
        changed = true;
      }
      if (!changed) continue;
      removed = true;
      await writeFileAtomic(file.file, JSON.stringify(file.cfg, null, 2) + '\n');
    }
    return removed;
  }

  /**
   * 2.16.2 (uninstall, F-07): только wolf-ключи с точным нашим значением.
   * Пользовательские default_agent/subagent_depth (не наши точные значения) не трогаем.
   * Глубина: `experimental.subagent_depth === 2` (действующий путь) + легаси верхнеуровневый.
   * 6.3: удаляем обе формы MCP (нативную и легаси) — только если запись наша.
   * 6.7: снимаем ключи из ВСЕХ локаций, где они объявлены; битый файл — в причину.
   */
  async removeWolfKeys(projectRoot: string): Promise<PlatformWriteResult> {
    const file = this.rootFile(projectRoot);
    const surface = await this.loadSurface(projectRoot);
    const broken = surface.errors.map((error) => `skipped: ${error.rel} is ${error.kind}`);
    if (surface.files.length === 0) {
      // «no opencode.json» — только когда конфиг-файлов нет НИ В ОДНОЙ локации
      return {
        action: 'skipped',
        reason: broken.length > 0 ? broken.join('; ') : `no ${basename(file)}`,
        configFile: basename(file),
      };
    }
    let mcpRemoved = false;
    let agentRemoved = false;
    let depthRemoved = false;
    const changed: string[] = [];
    const legacyMcpPath = legacyPathOf(MCP_KEY)!;
    const depthLeaf = leaf(SUBAGENT_DEPTH_KEY);
    const legacyDepthPath = legacyPathOf(SUBAGENT_DEPTH_KEY)!;
    // корень первым — так же, как в configFile списке результата
    for (const file of [...surface.files].reverse()) {
      let touched = false;
      const nativeEntry = getPath(file.cfg, MCP_KEY.writePath);
      const legacyEntry = getPath(file.cfg, legacyMcpPath);
      if (nativeEntry !== undefined && isWolfMcpEntry(nativeEntry, WOLF_CMD)) {
        deletePath(file.cfg, MCP_KEY.writePath);
        mcpRemoved = true;
        touched = true;
      }
      if (legacyEntry !== undefined && isWolfMcpEntry(legacyEntry, WOLF_CMD)) {
        deletePath(file.cfg, legacyMcpPath);
        mcpRemoved = true;
        touched = true;
      }
      if (getPath(file.cfg, DEFAULT_AGENT_KEY.writePath) === DEFAULT_AGENT) {
        deletePath(file.cfg, DEFAULT_AGENT_KEY.writePath);
        agentRemoved = true;
        touched = true;
      }
      if (getPath(file.cfg, SUBAGENT_DEPTH_KEY.writePath) === SUBAGENT_DEPTH) {
        deletePath(file.cfg, SUBAGENT_DEPTH_KEY.writePath);
        depthRemoved = true;
        touched = true;
      }
      if (getPath(file.cfg, legacyDepthPath) === SUBAGENT_DEPTH) {
        // легаси верхнеуровневый ключ (deprecated в opencode v2) — тоже наш
        deletePath(file.cfg, legacyDepthPath);
        depthRemoved = true;
        touched = true;
      }
      if (!touched) continue; // перезаписываем только файлы, из которых сняты наши ключи
      changed.push(file.rel);
      await writeFileAtomic(file.file, JSON.stringify(file.cfg, null, 2) + '\n');
    }
    const removed = [
      ...(mcpRemoved ? [MCP_KEY.label] : []),
      ...(agentRemoved ? [`${DEFAULT_AGENT_KEY.label}=${DEFAULT_AGENT}`] : []),
      ...(depthRemoved ? [`${depthLeaf}=${SUBAGENT_DEPTH}`] : []),
    ];
    if (removed.length === 0) {
      return {
        action: 'unchanged',
        reason: ['no wolf keys with our exact values', ...broken].join('; '),
        configFile: basename(file),
        keys: [],
      };
    }
    return {
      action: 'removed',
      ...(broken.length > 0 ? { reason: broken.join('; ') } : {}),
      configFile: changed.join(', '),
      keys: removed,
    };
  }

  /**
   * 6.1/6.3/6.4: doctor-проверки, которые знает только opencode-адаптер —
   * все ключи, которые Wolf пишет, + смешанный frontmatter managed-агентов.
   * Строки идут в общий `issues` проекта и маскируются doctor'ом как обычно.
   * 6.7: проверки — по эффективному виду обеих локаций; битый файл — свой issue с именем.
   */
  async configIssues(projectRoot: string): Promise<string[]> {
    const surface = await this.loadSurface(projectRoot);
    const issues: string[] = surface.errors.map(
      (error) => `${this.id}: ${error.rel} is ${error.kind} — fix it or remove the file, then run wolf init`
    );
    if (surface.files.length === 0) {
      // «missing» советовал бы init, который честно скипает битый конфиг
      if (issues.length === 0) return [`${this.id}: wolf entry missing — run wolf init`];
      return issues;
    }
    return [
      ...issues,
      ...mcpIssues(surface),
      ...defaultAgentIssues(surface.effective),
      ...depthIssues(surface),
      ...(await mixedFrontmatterIssues(projectRoot, this.id)),
    ];
  }
}

/** Собственный конфиг корневой локации (не слейдженный): в него wolf пишет. */
function rootConfigOf(surface: ConfigSurface): Record<string, unknown> {
  return surface.files.find((f) => f.location === WRITE_LOCATION_ID)?.cfg ?? {};
}

/** Путь файла локации относительно корня проекта (для сообщений). */
function relOf(surface: ConfigSurface, location: ConfigLocationId): string {
  return surface.files.find((f) => f.location === location)?.rel ?? '';
}

/** Эффективный вид после записи: обновлённый корень + .opencode (порядок — в mergeSurface). */
function effectiveAfter(surface: ConfigSurface, rootCfg: Record<string, unknown>): Record<string, unknown> {
  return mergeSurface(surface.files, { location: WRITE_LOCATION_ID, cfg: rootCfg });
}

/** 6.3/6.7: wolf-сервер отсутствует в обеих формах / легаси-форма подлежит миграции. */
function mcpIssues(surface: ConfigSurface): string[] {
  const cfg = surface.effective;
  // запись невозможна: init не вылечит такой конфиг — не советуем его
  const blocked = blockedSegment(cfg, MCP_KEY.writePath);
  if (blocked !== undefined)
    return [`opencode: ${blocked} is not an object — ${MCP_KEY.label} is not written; fix it manually`];
  const legacyPath = legacyPathOf(MCP_KEY)!;
  const nativeAt = locatePath(surface.files, MCP_KEY.writePath);
  const legacyAt = locatePath(surface.files, legacyPath);
  // сервер не объявлен НИ В ОДНОЙ локации — только тогда «wolf entry missing»
  if (nativeAt === undefined && legacyAt === undefined) return [`opencode: wolf entry missing — run wolf init`];
  if (legacyAt === undefined) return [];
  const ours = isWolfMcpEntry(legacyAt.value, WOLF_CMD);
  // легаси в .opencode: init туда не пишет — советуем ручную миграцию с именем файла
  if (legacyAt.location === WRITE_LOCATION_ID) {
    return [
      ours
        ? `opencode: wolf entry is in the deprecated top-level ${legacyPath.join('.')} form — run wolf init to migrate it to ${MCP_KEY.label}`
        : `opencode: top-level ${legacyPath.join('.')} is foreign and deprecated (opencode v2 reads ${MCP_ROOT}.${MCP_SERVERS}) — wolf leaves it untouched`,
    ];
  }
  const rel = relOf(surface, legacyAt.location);
  return [
    ours
      ? `opencode: wolf entry is in the deprecated top-level ${legacyPath.join('.')} form in ${rel} — migrate it to ${MCP_KEY.label} manually`
      : `opencode: top-level ${legacyPath.join('.')} in ${rel} is foreign and deprecated (opencode v2 reads ${MCP_ROOT}.${MCP_SERVERS}) — wolf leaves it untouched`,
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

/** 6.1/6.7: experimental.subagent_depth >= 2 + deprecated верхнеуровневый ключ (по эффективному виду). */
function depthIssues(surface: ConfigSurface): string[] {
  const cfg = surface.effective;
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
  const legacyAt = locatePath(surface.files, legacyPath);
  if (legacyAt !== undefined) {
    const legacy = legacyAt.value;
    // легаси в .opencode: init туда не пишет — миграция ручная, с именем файла
    if (legacyAt.location === WRITE_LOCATION_ID) {
      out.push(
        legacy === SUBAGENT_DEPTH
          ? `opencode: top-level ${legacyPath.join('.')}=${SUBAGENT_DEPTH} is deprecated and ignored by opencode v2 — run wolf init to migrate it to ${depthLabel}`
          : `opencode: top-level ${legacyPath.join('.')}=${String(legacy)} is deprecated and ignored by opencode v2 — foreign value, set ${depthLabel} >=${SUBAGENT_DEPTH} manually`
      );
    } else {
      const rel = relOf(surface, legacyAt.location);
      out.push(
        legacy === SUBAGENT_DEPTH
          ? `opencode: top-level ${legacyPath.join('.')}=${SUBAGENT_DEPTH} in ${rel} is deprecated and ignored by opencode v2 — migrate it to ${depthLabel} manually`
          : `opencode: top-level ${legacyPath.join('.')}=${String(legacy)} in ${rel} is deprecated and ignored by opencode v2 — foreign value, set ${depthLabel} >=${SUBAGENT_DEPTH} manually`
      );
    }
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
