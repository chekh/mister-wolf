/** Каноническая команда запуска MCP-сервера Wolf (спека §4). */
export interface McpCommand {
  command: string; // 'wolf' — глобальный бинарь на PATH
  args: string[]; // ['mcp']
}

/** Конфиг платформы как распарсенный JSON-объект; структуру знает адаптер. */
export type PlatformConfig = Record<string, unknown>;

/** Результат writeConfig/removeWolfKeys: action + опциональный reason-канал (§6.1: конфликт default_agent → needs-fix). */
export interface PlatformWriteResult {
  action: 'written' | 'replaced' | 'unchanged' | 'removed' | 'skipped';
  reason?: string;
  /** F6 (спека 2.1.0 §2.4): имя конфиг-файла платформы для честного лога (напр. 'opencode.json'). */
  configFile?: string;
  /** F6 (спека 2.1.0 §2.4): фактические wolf-ключи после записи (напр. ['mcp.wolf', 'default_agent=mr-wolf']). */
  keys?: string[];
}

/**
 * Статус версии платформы относительно диапазона поддержки Wolf:
 * 'v1' — поддержан ≥ порога, 'v2' — поддержан, 'unsupported' — ниже порога,
 * 'absent' — бинарь не найден на PATH, 'unparseable' — вывод не распознан.
 */
export type PlatformVersionStatus = 'v1' | 'v2' | 'unsupported' | 'absent' | 'unparseable';

/** Результат detectVersion: статус + опциональные version/raw/message. */
export interface PlatformVersionInfo {
  status: PlatformVersionStatus;
  version?: string;
  raw?: string;
  message?: string;
}

/**
 * Адаптер платформы: новая платформа = один файл-адаптер, init не меняется (спека §4).
 */
export interface PlatformAdapter {
  id: string; // 'opencode' | 'claude'
  /** Детект платформы по файлам-маркерам в корне проекта. */
  detect(projectRoot: string): boolean;
  /** Текущий конфиг платформы; null — конфиг-файла нет. */
  readConfig(projectRoot: string): Promise<PlatformConfig | null>;
  /**
   * Идемпотентная запись wolf-сервера (ключ идемпотентности — имя MCP-сервера 'wolf'):
   * 'written' — создан, 'replaced' — существующая запись wolf перезаписана (в т.ч. ручная
   * dev-запись), 'unchanged' — уже канонический. Чужие серверы и секции не трогаются.
   * opencode мерджит ещё и default_agent/subagent_depth (§6.1) — глубина живёт в
   * `experimental.subagent_depth` (opencode v2; верхнеуровневый ключ deprecated): конфликт — unchanged + reason.
   */
  writeConfig(projectRoot: string, cmd: McpCommand): Promise<PlatformWriteResult>;
  /** Удалить wolf-запись (для --platform replace-семантики); true если удалил. */
  removeWolf(projectRoot: string): Promise<boolean>;
  /**
   * 2.16.2 (uninstall): удалить ТОЛЬКО wolf-ключи с ТОЧНЫМ нашим значением
   * (mcp.wolf / mcpServers.wolf; default_agent === mr-wolf; experimental.subagent_depth === 2 —
   * пользовательскую повышенную настройку не трогаем). Отсутствующий конфиг —
   * { action: 'skipped', reason }.
   */
  removeWolfKeys?(projectRoot: string): Promise<PlatformWriteResult>;
  /** Детект версии платформы (опционально; init не ломается, если адаптер не умеет). */
  detectVersion?(projectRoot: string): Promise<PlatformVersionInfo>;
}
