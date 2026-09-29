/**
 * Спека 2.13 §7 (C1–C3, C5, C15, C16): удалённые команды отвечают ошибкой
 * с подсказкой вместо голой unknown-command (критерий §10.4 — e2e-таблица
 * старых имён). Единая карта для всех уровней команд (top-level и
 * subcommand) — точка расширения потока B (create-семейство, P222).
 */
export const REMOVED_COMMAND_HINTS: Readonly<Record<string, string>> = {
  run: 'model routing is retired; invoke opencode directly — run-cost analytics now come from session metrics.',
  coord: 'coordination events are no longer recorded.',
  'memory-stage':
    'stage events are written automatically by memory commands (call/brief/get/search); no manual staging.',
  learn: 'the self-learning pipeline was removed by owner decision; write lessons with `add --type lesson`.',
  council: 'council records are read-only history; new notes go via `add --type note`.',
  checkpoint: 'use `session wrap-up` for session history instead.',
};

/** Подсказка для удалённой команды или null (имя живое/неизвестное). */
export function removedCommandHint(name: string): string | null {
  const hint = REMOVED_COMMAND_HINTS[name];
  return hint ? `command '${name}' was removed in wolf 2.13 — ${hint} See CHANGELOG (Migration section).` : null;
}
