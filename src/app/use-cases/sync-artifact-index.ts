import { join } from 'path';
import { parseArtifactFrontMatter } from './artifact-front-matter.js';

export interface ArtifactIndexFs {
  exists: (p: string) => Promise<boolean>;
  readFile: (p: string) => Promise<string | null>;
  writeFile: (p: string, c: string) => Promise<void>;
  /** Имена записей каталога (файлы и папки, без «.»-записей). */
  listDir: (p: string) => Promise<string[]>;
  /** .md-файлы каталога рекурсивно, относительные пути. */
  listFiles: (p: string) => Promise<string[]>;
}

export interface SyncArtifactIndexDeps {
  fs: ArtifactIndexFs;
  baseDir: string;
}

export type SyncArtifactIndexAction = 'written' | 'unchanged' | 'skipped';

const INDEX_HEADER =
  '<!-- wolf:generated docs/dev/INDEX.md — regenerates on wolf sync; hand edits are overwritten -->\n\n' +
  '# Артефакты — docs/dev\n\n';

/** Спека §4-A2: таблица слаг/дата/title/status/профиль; §4-A4: _index.md частей.
 * Идемпотентность — по прецеденту штампов: identical → не пишем. */
export async function syncArtifactIndex(deps: SyncArtifactIndexDeps): Promise<{ action: SyncArtifactIndexAction }> {
  const devDir = join(deps.baseDir, 'docs', 'dev');
  if (!(await deps.fs.exists(devDir))) return { action: 'skipped' };

  const writes = new Map<string, string>();
  const rows: string[] = [];
  const waves: string[] = [];
  const folders: string[] = [];

  for (const name of (await deps.fs.listDir(devDir)).sort()) {
    if (name === 'INDEX.md') continue; // сам индекс не индексируем — иначе повторный sync не идемпотентен
    const p = join(devDir, name);
    if (name.endsWith('.md')) {
      const raw = await deps.fs.readFile(p);
      if (raw) {
        const meta = parseArtifactFrontMatter(raw);
        waves.push(`- ${name} — ${meta.title ?? name} (${meta.status ?? 'draft'})`);
      }
      continue;
    }
    const reqRaw = await deps.fs.readFile(join(p, 'requirements.md'));
    if (!reqRaw) continue;
    const meta = parseArtifactFrontMatter(reqRaw);
    if (!meta.slug) continue;
    const files = await deps.fs.listFiles(p);
    const profile = files.includes('design.md') && files.includes('test-plan.md') ? 'full' : 'fix';
    folders.push(name);
    rows.push(
      `| ${meta.slug} | ${meta.created ?? ''} | ${meta.title ?? meta.slug} | ${meta.status ?? 'draft'} | ${profile} |`
    );
  }

  let out = INDEX_HEADER;
  out += '| Слаг | Дата | Title | Статус | Профиль |\n| ---- | ---- | ----- | ------ | ------- |\n';
  out += rows.length > 0 ? rows.join('\n') + '\n' : '(пока нет папок фич)\n';
  if (waves.length > 0) out += '\n## Волны\n\n' + waves.join('\n') + '\n';

  // Части (спека §4-A4): подпапки design/ и plan/ с файлами-частями получают _index.md.
  for (const folder of folders) {
    for (const sub of ['design', 'plan']) {
      const subDir = join(devDir, folder, sub);
      if (!(await deps.fs.exists(subDir))) continue;
      const parts = (await deps.fs.listFiles(subDir)).filter((f) => f.endsWith('.md') && f !== '_index.md').sort();
      if (parts.length === 0) continue;
      writes.set(
        join(subDir, '_index.md'),
        ['<!-- wolf:generated parts index -->', '', `# ${sub} — части`, '', ...parts.map((f) => `- ${f}`), ''].join(
          '\n'
        )
      );
    }
  }

  const indexPath = join(devDir, 'INDEX.md');
  const existingIndex = await deps.fs.readFile(indexPath);
  const allIdentical =
    existingIndex === out &&
    (await Promise.all([...writes].map(async ([p, c]) => (await deps.fs.readFile(p)) === c))).every(Boolean);
  if (allIdentical) return { action: 'unchanged' };

  await deps.fs.writeFile(indexPath, out);
  for (const [p, c] of writes) {
    if ((await deps.fs.readFile(p)) !== c) await deps.fs.writeFile(p, c);
  }
  return { action: 'written' };
}
