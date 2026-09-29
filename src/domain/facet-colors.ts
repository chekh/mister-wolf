/**
 * P212 (2.13 §5.3в): статическая карта facet→ANSI-код — константа, НЕ конфиг:
 * цвет — презентационная деталь CLI, словарь фасетов живёт в таксономии.
 * Домен ничего не импортирует: коды ANSI — просто строки.
 */
const RESET = '\x1b[0m';

const FACET_COLORS: Readonly<Record<string, string>> = {
  howto: '\x1b[32m', // green
  pitfall: '\x1b[31m', // red
  context: '\x1b[34m', // blue
  metric: '\x1b[33m', // yellow
  history: '\x1b[35m', // magenta
  legacy: '\x1b[2m', // gray/dim
  constraint: '\x1b[36m', // cyan
};

/** ANSI-код фасета или null для неизвестного значения (в т.ч. кастомного из конфига). */
export function colorForFacet(facet: string): string | null {
  return FACET_COLORS[facet] ?? null;
}

/** Подсветка значения фасета; enabled=false → плоский текст (pipe/NO_COLOR). */
export function highlightFacet(facet: string, enabled: boolean): string {
  const code = enabled ? colorForFacet(facet) : null;
  return code ? `${code}${facet}${RESET}` : facet;
}

/**
 * Решение о цвете, принимается один раз на вывод: TTY && !NO_COLOR && !WOLF_NO_COLOR.
 * NO_COLOR по спецификации no-color.org — непустое значение.
 */
export function colorsEnabled(stdout: { isTTY?: boolean }, env: Record<string, string | undefined>): boolean {
  const flag = (v: string | undefined) => v !== undefined && v !== '';
  return (stdout.isTTY ?? false) && !flag(env.NO_COLOR) && !flag(env.WOLF_NO_COLOR);
}
