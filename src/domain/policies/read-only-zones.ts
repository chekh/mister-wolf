/**
 * Ф23 (D3.1): read-only зоны контура самообучения (спека §5, M23-01 / AHE).
 * Ни Стюард, ни Analyzer-Worker, ни спавннутые агенты не меняют: код гейтов,
 * логи контура, скелет платформы. Нарушение отклоняется механически, без LLM.
 *
 * Исключение (спека §3 L0 / §9 инвариант 2): op='append-signal' разрешён
 * ТОЛЬКО для сигнальных логов session-metrics/patterns — это наблюдение,
 * не адаптация. events.jsonl / relations.jsonl append идёт через штатные
 * writer'ы (event-log / relation-log) вне этого guard'а — здесь тоже запрещён.
 *
 * Чистая политика: без IO; матчинг — нормализованный posix-relpath,
 * каталоги (trailing '/') — префикс-матчем.
 *
 * ponytail: guard встроен в stop-gate (zoneProbe) и точки записи контура
 * (template-evolve); общий write-путь контура через единый враппер — если
 * у контура появятся новые file-writer'ы, оберни их здесь же.
 */
import { UserFacingError } from '../errors.js';

export interface ReadOnlyZone {
  /** posix relpath от корня проекта; trailing '/' — каталог (префикс-матч). */
  path: string;
  /** Происхождение защиты — спека §5 / §13. */
  reason: string;
}

export const READ_ONLY_ZONES: readonly ReadOnlyZone[] = [
  { path: '.wolf/events.jsonl', reason: 'аудит-лог контура (спека §5: read-only зоны)' },
  { path: '.wolf/relations.jsonl', reason: 'граф связей контура (спека §5)' },
  { path: '.wolf/memory/events.jsonl', reason: 'аудит-лог контура, фактический путь layout (спека §5)' },
  { path: '.wolf/memory/relations.jsonl', reason: 'граф связей контура, фактический путь layout (спека §5)' },
  { path: '.wolf/metrics/session-metrics.jsonl', reason: 'сигнальный лог контура (спека §5)' },
  { path: '.wolf/metrics/patterns.jsonl', reason: 'журнал паттернов контура (спека §5)' },
  { path: 'src/domain/gates/', reason: 'код гейтов — контур не меняет свои гейты (спека §5)' },
  { path: 'src/domain/policies/', reason: 'код валидаторов/политик (спека §5)' },
  { path: '.opencode/', reason: 'скелет/рамки платформы (спека §13)' },
  { path: 'AGENTS.md', reason: 'рамка AGENTS.md (спека §13)' },
];

/** Сигнальные логи: append разрешён (наблюдение, не адаптация — §3, §9). */
const SIGNAL_APPEND_ALLOWED: ReadonlySet<string> = new Set([
  '.wolf/metrics/session-metrics.jsonl',
  '.wolf/metrics/patterns.jsonl',
]);

/** Нормализация в posix-relpath: разделители \\ и /, пустые и '.' сегменты долой. */
function normalizeRelPath(relPath: string): string {
  return relPath
    .split(/[\\/]+/)
    .filter((seg) => seg !== '' && seg !== '.')
    .join('/');
}

function matchZone(normalized: string): ReadOnlyZone | null {
  for (const zone of READ_ONLY_ZONES) {
    if (zone.path.endsWith('/')) {
      if (normalized === zone.path.slice(0, -1) || normalized.startsWith(zone.path)) return zone;
    } else if (normalized === zone.path) {
      return zone;
    }
  }
  return null;
}

/**
 * Guard записи контура: бросает UserFacingError, если операция мутирует
 * read-only зону. append-signal допустим только сигнальным логам.
 */
export function assertLearnWriteAllowed(relPath: string, op: 'write' | 'rewrite' | 'unlink' | 'append-signal'): void {
  const normalized = normalizeRelPath(relPath);
  const zone = matchZone(normalized);
  if (zone === null) return;
  if (op === 'append-signal' && SIGNAL_APPEND_ALLOWED.has(normalized)) return;
  if (op === 'append-signal') {
    throw new UserFacingError(
      `read-only зона контура: ${relPath} (${zone.reason}); append-сигнал разрешён только ` +
        `сигнальным логам (.wolf/metrics/session-metrics.jsonl, .wolf/metrics/patterns.jsonl)`
    );
  }
  throw new UserFacingError(`read-only зона контура: ${relPath} (${zone.reason})`);
}
