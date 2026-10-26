// 6.2 (аудит 2026-10-25 §6.2): единый реестр ключей конфига opencode, которые пишет Wolf.
// Пути и метки живут только здесь; адаптер, doctor и use-case'ы читают их отсюда.
// Строковые литералы — английские: этот файл под гейтом check-english-surface.

/** Контейнер MCP: плоская v1-мапа `mcp.<name>` и v2 `mcp.servers.<name>`. */
export const MCP_ROOT = 'mcp';
/** v2-контейнер серверов. */
export const MCP_SERVERS = 'servers';
/** Имя wolf-сервера в MCP-конфиге. */
export const MCP_SERVER_NAME = 'wolf';
/** Дефолтный агент Wolf в opencode (§6.1). */
export const DEFAULT_AGENT = 'mr-wolf';
/** Глубина субагентов: executor-lead спавнит worker-* (трёхуровневая схема). */
export const SUBAGENT_DEPTH = 2;

export interface ConfigKeySpec {
  id: 'mcp' | 'default_agent' | 'subagent_depth';
  /** путь, которым Wolf пишет (канонический путь v2) */
  writePath: readonly string[];
  /** канонический путь v2 (== writePath; инвариант тестом) */
  canonicalPath: readonly string[];
  /** легаси/устаревшие пути, которые читаем и снимаем, если значение наше */
  legacyPaths: readonly (readonly string[])[];
  /** 'both' — читаем обе формы, 'native' — только v2 */
  forms: 'both' | 'native';
  /** метка ключа для логов/keys: 'mcp.servers.wolf' | 'default_agent' | 'subagent_depth' */
  label: string;
}

const MCP_PATH = [MCP_ROOT, MCP_SERVERS, MCP_SERVER_NAME] as const;
const LEGACY_MCP_PATH = [MCP_ROOT, MCP_SERVER_NAME] as const;
const DEPTH_PATH = ['experimental', 'subagent_depth'] as const;
const LEGACY_DEPTH_PATH = ['subagent_depth'] as const;

/** MCP-сервер wolf: пишем `mcp.servers.wolf`, читаем/снимаем и `mcp.wolf`. */
export const MCP_KEY: ConfigKeySpec = {
  id: 'mcp',
  writePath: MCP_PATH,
  canonicalPath: MCP_PATH,
  legacyPaths: [LEGACY_MCP_PATH],
  forms: 'both',
  label: MCP_PATH.join('.'),
};

/** `default_agent` — форма одна в обеих ветках opencode. */
export const DEFAULT_AGENT_KEY: ConfigKeySpec = {
  id: 'default_agent',
  writePath: ['default_agent'],
  canonicalPath: ['default_agent'],
  legacyPaths: [],
  forms: 'native',
  label: 'default_agent',
};

/**
 * `experimental.subagent_depth`: действует и в v1 >= 1.18.29 (compat-подъём), и в v2.
 * Верхнеуровневый `subagent_depth` (legacy) читаем только чтобы снять своё значение.
 */
export const SUBAGENT_DEPTH_KEY: ConfigKeySpec = {
  id: 'subagent_depth',
  writePath: DEPTH_PATH,
  canonicalPath: DEPTH_PATH,
  legacyPaths: [LEGACY_DEPTH_PATH],
  forms: 'both',
  label: 'subagent_depth',
};

export const CONFIG_KEYS: readonly ConfigKeySpec[] = [MCP_KEY, DEFAULT_AGENT_KEY, SUBAGENT_DEPTH_KEY];

/** Легаси-путь для чтения/снятия (первый объявленный). */
export function legacyPathOf(key: ConfigKeySpec): readonly string[] | undefined {
  return key.legacyPaths[0];
}

export function getPath(obj: Record<string, unknown>, path: readonly string[]): unknown {
  let cur: unknown = obj;
  for (const segment of path) {
    const record = asRecord(cur);
    if (record === undefined) return undefined;
    cur = record[segment];
  }
  return cur;
}

export function getRecordAt(
  obj: Record<string, unknown>,
  path: readonly string[]
): Record<string, unknown> | undefined {
  return asRecord(getPath(obj, path));
}

/** Пишет значение; отсутствующие промежуточные объекты создаёт, чужое не-объектное не перетирает. */
export function setPath(obj: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    let next = asRecord(cur[segment]);
    if (next === undefined) {
      if (cur[segment] !== undefined) return;
      next = {};
      cur[segment] = next;
    }
    cur = next;
  }
  cur[path[path.length - 1]!] = value;
}

/** true если путь существовал; пустые родительские объекты (mcp.servers, mcp, experimental) удаляются. */
export function deletePath(obj: Record<string, unknown>, path: readonly string[]): boolean {
  const chain: { parent: Record<string, unknown>; segment: string }[] = [];
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    chain.push({ parent: cur, segment });
    const next = asRecord(cur[segment]);
    if (next === undefined) return false;
    cur = next;
  }
  const leaf = path[path.length - 1]!;
  if (!(leaf in cur)) return false;
  delete cur[leaf];
  for (let i = chain.length - 1; i >= 0; i--) {
    const { parent, segment } = chain[i]!;
    const record = asRecord(parent[segment]);
    if (record !== undefined && Object.keys(record).length === 0) delete parent[segment];
  }
  return true;
}

/** Каноническая команда wolf MCP: единственный источник для записи и ownership-проверок. */
export const WOLF_MCP_COMMAND = { command: 'wolf', args: ['mcp'] };

/**
 * Первый сегмент пути, занятый не-объектом (для сообщений): `mcp`, `mcp.servers`,
 * `experimental`. undefined — путь записываем (промежуточные создаются).
 */
export function blockedSegment(obj: Record<string, unknown>, path: readonly string[]): string | undefined {
  let cur: unknown = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const record = asRecord(cur);
    if (record === undefined) return path.slice(0, i).join('.');
    const next = record[path[i]!];
    if (next === undefined) return undefined; // дальше создаём новые объекты
    cur = next;
  }
  return asRecord(cur) === undefined ? path.slice(0, -1).join('.') : undefined;
}

/**
 * true, если путь можно записать: каждый промежуточный сегмент либо отсутствует,
 * либо объект. Занятый чужим не-объектом сегмент — конфликт, а не молчаливый no-op.
 */
export function pathWritable(obj: Record<string, unknown>, path: readonly string[]): boolean {
  return blockedSegment(obj, path) === undefined;
}

/** Нативная запись MCP: { type: 'local', command: [cmd.command, ...cmd.args], disabled: false }. Без codemode. */
export function mcpEntryNative(cmd: { command: string; args: string[] }): Record<string, unknown> {
  return { type: 'local', command: [cmd.command, ...cmd.args], disabled: false };
}

/** «Наше» значение: type local + command совпадает с канонической командой wolf (лишние поля допустимы). */
export function isWolfMcpEntry(value: unknown, cmd: { command: string; args: string[] }): boolean {
  const entry = asRecord(value);
  if (entry === undefined || entry.type !== 'local' || !Array.isArray(entry.command)) return false;
  const command: unknown[] = entry.command;
  const expected = [cmd.command, ...cmd.args];
  return command.length === expected.length && expected.every((part, i) => command[i] === part);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/* ------------------------------------------------------------------ 6.7: локации конфига */

/** Локации конфига opencode (6.7): корень проекта и .opencode. */
export type ConfigLocationId = 'dot-opencode' | 'root';

export interface ConfigLocation {
  id: ConfigLocationId;
  /** каталог локации относительно корня проекта ('' — сам корень) */
  dir: string;
  /** базовое имя файла конфига */
  fileBase: string;
}

/** id корневой локации. */
export const ROOT_LOCATION_ID: ConfigLocationId = 'root';
/** id локации .opencode. */
export const DOT_OPENCODE_LOCATION_ID: ConfigLocationId = 'dot-opencode';

/** Локации в порядке приоритета чтения: .opencode перекрывает корень (opencode v2: root → .opencode). */
export const CONFIG_LOCATIONS: readonly ConfigLocation[] = [
  { id: DOT_OPENCODE_LOCATION_ID, dir: '.opencode', fileBase: 'opencode' },
  { id: ROOT_LOCATION_ID, dir: '', fileBase: 'opencode' },
];

/** Локация, куда wolf пишет свои ключи: корневой конфиг (текущее поведение). */
export const WRITE_LOCATION_ID: ConfigLocationId = ROOT_LOCATION_ID;

/** Локация записи wolf-ключей (корень проекта) — из реестра, без литералов путей в адаптере. */
export const WRITE_LOCATION: ConfigLocation = CONFIG_LOCATIONS.find((location) => location.id === WRITE_LOCATION_ID)!;

/** Канонический путь конфига локации относительно корня проекта: 'opencode.json' | '.opencode/opencode.json'. */
export function relPathOf(location: ConfigLocation): string {
  return location.dir === '' ? `${location.fileBase}.json` : `${location.dir}/${location.fileBase}.json`;
}

/** Пара «локация + разобранный конфиг» — вход для просмотра поверхности. */
export interface ConfigFileRef {
  location: ConfigLocationId;
  cfg: Record<string, unknown>;
}

/**
 * Эффективное значение пути: первая локация (по приоритету CONFIG_LOCATIONS),
 * где путь определён. undefined — путь не объявлен ни в одной локации.
 */
export function locatePath(
  files: readonly ConfigFileRef[],
  path: readonly string[]
): { location: ConfigLocationId; value: unknown } | undefined {
  for (const location of CONFIG_LOCATIONS) {
    for (const file of files) {
      if (file.location !== location.id) continue;
      const value = getPath(file.cfg, path);
      if (value !== undefined) return { location: location.id, value };
    }
  }
  return undefined;
}

/** Глубокое слияние конфигов: побеждает high (оба ключа — объекты → слияние рекурсивно). */
export function mergeConfigs(low: Record<string, unknown>, high: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...low };
  for (const [key, highValue] of Object.entries(high)) {
    const lowRecord = asRecord(out[key]);
    const highRecord = asRecord(highValue);
    out[key] = lowRecord !== undefined && highRecord !== undefined ? mergeConfigs(lowRecord, highRecord) : highValue;
  }
  return out;
}

/**
 * Слияние поверхности конфигов — единственное место, где задан порядок (6.7).
 * Файлы перечислены в порядке приоритета чтения (.opencode выше корня), но
 * мержимся мы от низкого приоритета к высокому: корень раньше, .opencode позже.
 * `override` — конфиг локации, который заменил файл (обновлённый после записи).
 */
export function mergeSurface(files: readonly ConfigFileRef[], override?: ConfigFileRef): Record<string, unknown> {
  const byLocation = new Map<ConfigLocationId, ConfigFileRef>();
  for (const file of files) byLocation.set(file.location, file);
  if (override !== undefined) byLocation.set(override.location, override);
  let effective: Record<string, unknown> = {};
  for (const location of [...CONFIG_LOCATIONS].reverse()) {
    const file = byLocation.get(location.id);
    if (file === undefined) continue;
    effective = mergeConfigs(effective, file.cfg);
  }
  return effective;
}
