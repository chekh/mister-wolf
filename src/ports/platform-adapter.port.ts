/** Каноническая команда запуска MCP-сервера Wolf (спека §4). */
export interface McpCommand {
  command: string; // 'wolf' — глобальный бинарь на PATH
  args: string[]; // ['mcp']
}

/** Конфиг платформы как распарсенный JSON-объект; структуру знает адаптер. */
export type PlatformConfig = Record<string, unknown>;

/** Результат writeConfig: action + опциональный reason-канал (§6.1: конфликт default_agent → needs-fix). */
export interface PlatformWriteResult {
  action: 'written' | 'replaced' | 'unchanged';
  reason?: string;
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
   * opencode мерджит ещё и default_agent (§6.1): конфликт — unchanged + reason.
   */
  writeConfig(projectRoot: string, cmd: McpCommand): Promise<PlatformWriteResult>;
  /** Удалить wolf-запись (для --platform replace-семантики); true если удалил. */
  removeWolf(projectRoot: string): Promise<boolean>;
}
