import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * REL-2.22.1: docs/site/guide/cli/command-reference.md (+ RU-зеркало) обязан
 * быть побитово равен свежесгенерированному из реестра commander выводу
 * scripts/generate-cli-site-page.mjs, а полное покрытие путей справочника
 * (docs/reference/cli.md) — проверяться множеством, не глазами.
 */
const EN = 'docs/site/guide/cli/command-reference.md';
const RU = 'docs/site/ru/guide/cli/command-reference.md';

/** Полные пути: `wolf x y` из заголовков справочника и из строк таблицы сайта. */
function commandPaths(text: string): Set<string> {
  const paths = new Set<string>();
  for (const line of text.split('\n')) {
    const heading = line.match(/^#{2,6}\s+wolf\s+(.+?)\s*$/);
    if (heading) {
      paths.add(heading[1].replace(/\s*\(hidden\)$/, ''));
      continue;
    }
    const row = line.match(/^\|\s*`wolf\s+([a-z0-9 -]+?)`/);
    if (row) paths.add(row[1]);
  }
  return paths;
}

describe('guard: site command reference is generated from the CLI registry (REL-2.22.1)', () => {
  // Генерация грузит полный реестр commander (~47s) — как в cli-reference-guard.
  it('files on disk equal regenerated pages (idempotent)', { timeout: 180_000 }, async () => {
    const { generateSitePages } = await import('../../scripts/generate-cli-site-page.mjs');
    const expected = await generateSitePages();
    expect(readFileSync(join(process.cwd(), EN), 'utf8'), `drift — run: node scripts/generate-cli-site-page.mjs`).toBe(
      expected.en
    );
    expect(readFileSync(join(process.cwd(), RU), 'utf8'), `drift — run: node scripts/generate-cli-site-page.mjs`).toBe(
      expected.ru
    );
  });

  it('every reference path is present on the site page', () => {
    const reference = commandPaths(readFileSync(join(process.cwd(), 'docs/reference/cli.md'), 'utf8'));
    const en = commandPaths(readFileSync(join(process.cwd(), EN), 'utf8'));
    const ru = commandPaths(readFileSync(join(process.cwd(), RU), 'utf8'));
    const uncovered = [...reference].filter((path) => !en.has(path));
    const uncoveredRu = [...reference].filter((path) => !ru.has(path));
    // eslint-disable-next-line no-console
    console.log(
      `coverage: reference=${reference.size} en=${en.size} ru=${ru.size} uncovered=${uncovered.length}/${uncoveredRu.length}`
    );
    expect(uncovered, 'reference paths missing on the site page').toEqual([]);
    expect(uncoveredRu, 'reference paths missing on the RU site page').toEqual([]);
  });
});
