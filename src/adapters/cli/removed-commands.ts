import { MEMORY_TYPES } from '../../domain/memory-types.js';

/**
 * Спека 2.13 §7 (C1–C3, C5, C15, C16) + §6.2 (P222): удалённые команды отвечают
 * ошибкой с подсказкой вместо голой unknown-command (критерий §10.4 — e2e-таблица
 * старых имён). Единая карта для всех уровней команд (top-level и subcommand).
 * Динамика §6.2: `<type> create` (родительский тип — из argv) и топ-уровневые
 * старые имена типов (info-request/blocker/article — карта алиасов §5.4).
 */
export const REMOVED_COMMAND_HINTS: Readonly<Record<string, string>> = {
  run: 'model routing is retired; invoke opencode directly — run-cost analytics now come from session metrics.',
  coord: 'coordination events are no longer recorded.',
  'memory-stage':
    'stage events are written automatically by memory commands (call/brief/get/search); no manual staging.',
  learn: 'the self-learning pipeline was removed by owner decision; write lessons with `add --type lesson`.',
  council: 'council records are read-only history; new notes go via `add --type note`.',
  checkpoint: 'use `session wrap-up` for session history instead.',
  'info-request': 'type "info-request" was absorbed by note — use `add --type note --facet context`.',
  blocker:
    'type "blocker" was absorbed by note — use `add --type note --facet pitfall`; resolving — `transition`/`archive`.',
  article: 'type "article" was absorbed by note — use `add --type note --facet context`.',
};

const removedMessage = (name: string, hint: string): string =>
  `command '${name}' was removed in wolf 2.13 — ${hint} See CHANGELOG (Migration section).`;

/** Подсказка для удалённой команды или null (имя живое/неизвестное). */
export function removedCommandHint(name: string, argv: readonly string[] = []): string | null {
  // §6.2: смерть create (без синонима); родительский type-неймспейс — process.argv[2]
  // (wolf <type> create): exitOverride получает полный process.argv даже когда
  // реальная команда парсит process.argv.slice(3).
  if (name === 'create') {
    const parent = argv[2];
    if (parent && (MEMORY_TYPES as readonly string[]).includes(parent)) {
      return removedMessage(`${parent} create`, `use \`wolf add --type ${parent}\` instead.`);
    }
    return removedMessage('create', 'use `wolf add --type <type>` instead.');
  }
  const hint = REMOVED_COMMAND_HINTS[name];
  return hint ? removedMessage(name, hint) : null;
}
