import * as fs from 'fs/promises';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { MemoryStore, ListFilters } from '../../ports/memory-store.port.js';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import { objectPath, objectsDir } from './project-paths.js';

const STALE_DAYS = 30;

export class MarkdownMemoryStore implements MemoryStore {
  constructor(private baseDir: string) {}

  async save(object: MemoryObject): Promise<void> {
    const path = objectPath(this.baseDir, object.type, object.id);
    await fs.mkdir(dirname(path), { recursive: true });
    const { body, ...frontmatter } = object;
    const content = `---\n${yaml.dump(frontmatter)}---\n\n${body}`;
    await fs.writeFile(path, content, 'utf-8');
  }

  async get(id: string): Promise<MemoryObject | null> {
    const candidates = await this.findFiles(id);
    for (const path of candidates) {
      const parsed = await this.parseFile(path);
      if (parsed && parsed.id === id) return parsed;
    }
    return null;
  }

  async list(filters?: ListFilters): Promise<MemoryObject[]> {
    const root = objectsDir(this.baseDir);
    const results: MemoryObject[] = [];
    const dirs = await this.readDirs(root);
    for (const dir of dirs) {
      const files = await this.readFiles(join(root, dir));
      for (const file of files) {
        const parsed = await this.parseFile(join(root, dir, file));
        if (!parsed) continue;
        if (filters?.type && parsed.type !== filters.type) continue;
        if (filters?.status && parsed.status !== filters.status) continue;
        if (filters?.stale && !isStale(parsed)) continue;
        results.push(parsed);
      }
    }
    return results;
  }

  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Memory object not found: ${id}`);
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    const oldPath = objectPath(this.baseDir, existing.type, existing.id);
    await this.save(updated);
    const newPath = objectPath(this.baseDir, updated.type, updated.id);
    if (oldPath !== newPath) {
      try {
        await fs.unlink(oldPath);
      } catch (err) {
        if (!isEnoent(err)) throw err;
      }
    }
    return updated;
  }

  private async readDirs(root: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      return entries.filter((d) => d.isDirectory()).map((d) => d.name);
    } catch (err) {
      if (isEnoent(err)) return [];
      throw err;
    }
  }

  private async readFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir);
      return entries.filter((f) => f.endsWith('.md'));
    } catch (err) {
      if (isEnoent(err)) return [];
      throw err;
    }
  }

  private async findFiles(id: string): Promise<string[]> {
    const root = objectsDir(this.baseDir);
    const dirs = await this.readDirs(root);
    return dirs.map((dir) => join(root, dir, `${id}.md`));
  }

  private async parseFile(path: string): Promise<MemoryObject | null> {
    let content: string;
    try {
      content = await fs.readFile(path, 'utf-8');
    } catch (err) {
      if (isEnoent(err)) return null;
      throw new Error(`Failed to read memory file ${path}: ${formatError(err)}`);
    }
    try {
      const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
      if (!match) {
        throw new Error('Missing or invalid frontmatter delimiter');
      }
      const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
      const body = match[2] || '';
      return MemoryObjectSchema.parse({ ...frontmatter, body });
    } catch (err) {
      throw new Error(`Failed to parse memory file ${path}: ${formatError(err)}`);
    }
  }
}

function isStale(object: MemoryObject): boolean {
  const updated = new Date(object.updated_at).getTime();
  const ageMs = Date.now() - updated;
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'ENOENT';
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
