/**
 * Резолвер цели жалобы по актуальному составу агентов действующей интеграции
 * OpenCode (R-13a, релиз two-level-release 3.0.0). Заменяет константный список
 * BASE_AGENT_IDS: состав — union поддержанных источников, каждый вызов команды
 * делает свежий резолв (без кеша и статических списков).
 *
 * Источники (union, существование = найден в любом):
 *  (i)   проектные определения: <baseDir>/.opencode/agents/<name>.md;
 *  (ii)  глобальные: <XDG_CONFIG_HOME || ~/.config>/opencode/agents/<name>.md
 *        (env-резолв инъектится параметром — для тестов без реального $HOME);
 *  (iii) конфигурационные overrides: ключ "agent" в opencode.json|opencode.jsonc
 *        локаций CONFIG_LOCATIONS (корень проекта, .opencode) и в глобальном
 *        конфиге; имена агентов = ключи объекта "agent".
 *
 * Отсутствие каталога/файла — пустой источник; существующий, но нечитаемый или
 * неразбираемый — AgentDiscoveryError (не смешивается с «неизвестной целью» и
 * не пропускается молча). Содержимое агента не исполняется; имя md-файла = имя
 * агента (документированный контракт OpenCode), frontmatter не требуется.
 */
import { join } from 'path';
import { parseJsonc } from '../../platforms/jsonc.js';
import { CONFIG_LOCATIONS } from '../../platforms/opencode-config-keys.js';
import type { FileSystem } from '../../../ports/file-system.port.js';
import type { MemoryStore } from '../../../ports/memory-store.port.js';
import { UserFacingError } from '../../../domain/errors.js';

// Волна 2.14 §6.1: классификация жалоб technical/behavioral; дефолт — по резолву
// цели, флаг --kind переопределяет (владелец/лид всегда прав).
export const COMPLAINT_KINDS = ['technical', 'behavioral'] as const;
export type ComplaintKind = (typeof COMPLAINT_KINDS)[number];

/** Дисcovery-ошибка: источник состава существует, но нечитаем/неразбираем (D-A3). */
export class AgentDiscoveryError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentDiscoveryError';
  }
}

export interface ComplaintTargetDeps {
  fs: FileSystem;
  baseDir: string;
  /** Глобальный каталог конфигов OpenCode (resolveGlobalConfigDir); undefined — глобальные источники недоступны. */
  globalConfigDir?: string;
  store: Pick<MemoryStore, 'get'>;
}

export type ComplaintTargetResolution = { known: true; defaultKind: ComplaintKind } | { known: false };

/**
 * ЕДИНЫЙ резолв цели (D-A5): один вызов даёт и факт существования, и дефолтный
 * kind (D-A6): агент/skill: → behavioral; существующий mem-id → technical.
 */
export async function resolveComplaintTarget(
  about: string,
  deps: ComplaintTargetDeps
): Promise<ComplaintTargetResolution> {
  if (about.startsWith('skill:')) return { known: true, defaultKind: 'behavioral' };
  if (about.startsWith('mem_')) {
    return (await deps.store.get(about)) !== null ? { known: true, defaultKind: 'technical' } : { known: false };
  }
  const agents = await discoverAgentIds(deps);
  return agents.has(about) ? { known: true, defaultKind: 'behavioral' } : { known: false };
}

/** Глобальный каталог конфигов OpenCode; без XDG_CONFIG_HOME и HOME — недоступен. */
export function resolveGlobalConfigDir(env: NodeJS.ProcessEnv): string | undefined {
  if (env.XDG_CONFIG_HOME) return env.XDG_CONFIG_HOME;
  return env.HOME ? join(env.HOME, '.config') : undefined;
}

/** Union имён агентов из всех поддержанных источников (D-A1). */
export async function discoverAgentIds(deps: ComplaintTargetDeps): Promise<Set<string>> {
  const sources: Array<Promise<Set<string>>> = [
    mdAgentNames(deps.fs, join(deps.baseDir, '.opencode', 'agents')),
    ...CONFIG_LOCATIONS.map((location) => configAgentNames(deps.fs, join(deps.baseDir, location.dir))),
  ];
  if (deps.globalConfigDir) {
    const globalDir = join(deps.globalConfigDir, 'opencode');
    sources.push(mdAgentNames(deps.fs, join(globalDir, 'agents')), configAgentNames(deps.fs, globalDir));
  }
  const names = new Set<string>();
  for (const source of sources) {
    for (const name of await source) names.add(name);
  }
  return names;
}

/** Имена агентов каталога: *.md, имя = basename без .md (D-A4). */
async function mdAgentNames(fs: FileSystem, dir: string): Promise<Set<string>> {
  let entries;
  try {
    entries = await fs.listDirectory(dir);
  } catch (err) {
    if (isNoSuchFileError(err)) return new Set(); // отсутствующий каталог — пустой источник
    throw new AgentDiscoveryError(`Agent discovery failed: ${dir}: not readable: ${errorMessage(err)}`);
  }
  const names = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory && entry.name.endsWith('.md')) names.add(entry.name.slice(0, -'.md'.length));
  }
  return names;
}

/** Ключи "agent" конфига каталога: json приоритетен, jsonc — только при отсутствии json (D-A2). */
async function configAgentNames(fs: FileSystem, dir: string): Promise<Set<string>> {
  const rawJson = await readConfigRaw(fs, join(dir, 'opencode.json'));
  if (rawJson !== null) return agentKeysOf(join(dir, 'opencode.json'), rawJson);
  const rawJsonc = await readConfigRaw(fs, join(dir, 'opencode.jsonc'));
  if (rawJsonc !== null) return agentKeysOf(join(dir, 'opencode.jsonc'), rawJsonc);
  return new Set();
}

async function readConfigRaw(fs: FileSystem, file: string): Promise<string | null> {
  try {
    return await fs.readSmallTextFile(file);
  } catch (err) {
    throw new AgentDiscoveryError(`Agent discovery failed: ${file}: not readable: ${errorMessage(err)}`);
  }
}

function agentKeysOf(file: string, raw: string): Set<string> {
  let parsed: unknown;
  try {
    parsed = parseJsonc(raw);
  } catch (err) {
    throw new AgentDiscoveryError(`Agent discovery failed: ${file}: not valid JSONC: ${errorMessage(err)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AgentDiscoveryError(`Agent discovery failed: ${file}: not a JSON object`);
  }
  const agent = (parsed as Record<string, unknown>)['agent'];
  if (agent === undefined) return new Set();
  if (typeof agent !== 'object' || agent === null || Array.isArray(agent)) {
    throw new AgentDiscoveryError(`Agent discovery failed: ${file}: key "agent" is not a JSON object`);
  }
  return new Set(Object.keys(agent));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isNoSuchFileError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}
