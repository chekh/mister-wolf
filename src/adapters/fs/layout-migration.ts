import * as fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import yaml from 'js-yaml';
import { objectsDir, targetPathFor, memoryDir } from './project-paths.js';
import { writeFileAtomic } from './markdown-memory-store.js';
import type { MemoryType } from '../../domain/memory-types.js';

export interface MigrationEntry {
  id: string;
  type: string;
  originalType: string;
  from: string;
  to: string;
  action: 'move' | 'convert-document' | 'conflict';
}

export interface MigrationReport {
  entries: MigrationEntry[];
  conflicts: MigrationEntry[];
  problems: { path: string; error: string }[];
  total: number;
}

/** Экспортировано для переиспользования в doc-id-migration.ts (спека 2.1.0 §2.6). */
export function parseFrontmatter(content: string): { fm: Record<string, any>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  try {
    const fm = yaml.load(match[1]) as Record<string, any>;
    return { fm, body: match[2] };
  } catch {
    return null;
  }
}

/** Экспортировано для переиспользования в doc-id-migration.ts (спека 2.1.0 §2.6). */
export async function walkMd(dir: string): Promise<string[]> {
  const results: string[] = [];
  async function recurse(d: string) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) await recurse(full);
      else if (e.name.endsWith('.md')) results.push(full);
    }
  }
  await recurse(dir);
  return results;
}

export async function planLayoutMigration(baseDir: string): Promise<MigrationReport> {
  const objs = objectsDir(baseDir);
  const files = existsSync(objs) ? await walkMd(objs) : [];
  const entries: MigrationEntry[] = [];
  const conflicts: MigrationEntry[] = [];
  const problems: MigrationReport['problems'] = [];
  const usedTargets = new Map<string, string>(); // to → id

  for (const f of files) {
    const rel = relative(baseDir, f);
    let content: string;
    try {
      content = await fs.readFile(f, 'utf-8');
    } catch (err) {
      problems.push({ path: rel, error: String(err) });
      continue;
    }
    const parsed = parseFrontmatter(content);
    if (!parsed) {
      problems.push({ path: rel, error: 'unparsable frontmatter' });
      continue;
    }
    const { fm, body } = parsed;
    const id: string = fm.id;
    const originalType: string = fm.type;

    let type: string = originalType;
    let action: MigrationEntry['action'] = 'move';

    if (originalType === 'document') {
      type = fm.source?.path ? 'document-ref' : 'document-native';
      action = 'convert-document';
    }

    let to: string;
    try {
      to = relative(baseDir, targetPathFor(baseDir, { type: type as MemoryType, id, thread: fm.thread }));
    } catch {
      problems.push({ path: rel, error: `cannot compute target for type ${type}` });
      continue;
    }

    // conflict: target already on disk for a different id, or two entries share a target
    const existingOwner = usedTargets.get(to);
    if (existingOwner !== undefined && existingOwner !== id) {
      action = 'conflict';
    } else if (existsSync(join(baseDir, to))) {
      const onDisk = readIdFromDisk(join(baseDir, to));
      if (onDisk !== null && onDisk !== id) {
        action = 'conflict';
      }
    }
    usedTargets.set(to, id);

    const entry: MigrationEntry = { id, type, originalType, from: rel, to, action };
    entries.push(entry);
    if (action === 'conflict') conflicts.push(entry);
  }

  const total = entries.filter((e) => e.action !== 'conflict').length;
  return { entries, conflicts, problems, total };
}

/** Quick scan of frontmatter id without full parse — used for conflict detection. */
function readIdFromDisk(absPath: string): string | null {
  try {
    const content = existsSync(absPath) ? readFileSync(absPath, 'utf-8') : '';
    const m = content.match(/^---[\s\S]*?\nid:\s*(\S+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function applyLayoutMigration(baseDir: string): Promise<MigrationReport> {
  const report = await planLayoutMigration(baseDir);
  const memDir = memoryDir(baseDir);

  for (const e of report.entries) {
    if (e.action === 'conflict') continue;
    const absFrom = join(baseDir, e.from);
    const absTo = join(baseDir, e.to);
    await fs.mkdir(dirname(absTo), { recursive: true });

    if (e.action === 'convert-document') {
      const content = await fs.readFile(absFrom, 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed) continue;
      parsed.fm.type = e.type;
      const newContent = `---\n${yaml.dump(parsed.fm).trimEnd()}\n---\n\n${parsed.body}`;
      await writeFileAtomic(absTo, newContent);
      await fs.unlink(absFrom);
    } else {
      await fs.rename(absFrom, absTo);
    }
  }

  // clean up empty dirs inside objects/
  await cleanEmptyDirs(objectsDir(baseDir));

  return report;
}

async function cleanEmptyDirs(dir: string): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      await cleanEmptyDirs(join(dir, e.name));
    }
  }
  // retry — children may have been removed
  try {
    const remaining = await fs.readdir(dir);
    if (remaining.length === 0) await fs.rmdir(dir);
  } catch {
    // ignore
  }
}
