import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryType } from '../../domain/memory-types.js';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import { objectPath, objectsDir } from './project-paths.js';

export class MarkdownMemoryStore implements MemoryStore {
  constructor(private baseDir: string) {}

  async save(object: MemoryObject): Promise<void> {
    const path = objectPath(this.baseDir, object.type as MemoryType, object.id);
    mkdirSync(dirname(path), { recursive: true });
    const { body, ...frontmatter } = object;
    const content = `---\n${yaml.dump(frontmatter)}---\n\n${body}`;
    writeFileSync(path, content, 'utf-8');
  }

  async get(id: string): Promise<MemoryObject | null> {
    const candidates = this.findFiles(id);
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      const parsed = this.parseFile(path);
      if (parsed && parsed.id === id) return parsed;
    }
    return null;
  }

  async list(filters?: { type?: string; status?: string }): Promise<MemoryObject[]> {
    const root = objectsDir(this.baseDir);
    if (!existsSync(root)) return [];

    const results: MemoryObject[] = [];
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      const files = readdirSync(join(root, dir.name)).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const parsed = this.parseFile(join(root, dir.name, file));
        if (!parsed) continue;
        if (filters?.type && parsed.type !== filters.type) continue;
        if (filters?.status && parsed.status !== filters.status) continue;
        results.push(parsed);
      }
    }
    return results;
  }

  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Memory object not found: ${id}`);
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    await this.save(updated);
    return updated;
  }

  private findFiles(id: string): string[] {
    const root = objectsDir(this.baseDir);
    if (!existsSync(root)) return [];
    const files: string[] = [];
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      files.push(join(root, dir.name, `${id}.md`));
    }
    return files;
  }

  private parseFile(path: string): MemoryObject | null {
    try {
      const content = readFileSync(path, 'utf-8');
      const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
      if (!match) return null;
      const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
      const body = match[2] || '';
      return MemoryObjectSchema.parse({ ...frontmatter, body });
    } catch {
      return null;
    }
  }
}
