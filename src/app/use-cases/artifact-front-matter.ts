/** Tolerant-парсинг YAML front-matter артефактов (прецедент parseFrontmatter
 * seed-base-playbooks.ts:38-47; риск спеки §9 «линт хрупок к формату»:
 * нечитаемый файл → пустая карта, не исключение). */
export function parseArtifactFrontMatter(raw: string): Record<string, string> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return {};
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return meta;
}
