import * as fs from 'fs/promises';
import { dirname, join, relative } from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { MemoryStore, ListFilters } from '../../ports/memory-store.port.js';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import { type MemoryType, CORE_TAXONOMY, getDeclaration } from '../../domain/memory-types.js';
import { buildTypeSchema } from '../../domain/type-schema-builder.js';
import { objectsDir, threadsDir, sharedDir, targetPathFor, memoryDir, quarantineDir } from './project-paths.js';
import { loadWolfConfigSync } from './config-file.js';
import { mergeTaxonomy, type WolfConfig } from '../../domain/taxonomy.js';

const STALE_DAYS = 30;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/;

let typeSchemaCache: Map<MemoryType, z.ZodTypeAny> | null = null;
let configLoadWarned = false;

function getTypeSchemas(baseDir: string, onProblem?: (msg: string) => void): Map<MemoryType, z.ZodTypeAny> {
  if (typeSchemaCache) return typeSchemaCache;
  const cache = new Map<MemoryType, z.ZodTypeAny>();
  try {
    const cfg = loadWolfConfigSync(baseDir);
    const { types } = mergeTaxonomy(cfg);
    for (const decl of types.values()) {
      cache.set(decl.name, buildTypeSchema(decl));
    }
  } catch (err) {
    if (!configLoadWarned) {
      onProblem?.(`Failed to load project config, using core taxonomy: ${err instanceof Error ? err.message : err}`);
      configLoadWarned = true;
    }
    for (const decl of CORE_TAXONOMY) {
      cache.set(decl.name, buildTypeSchema(decl));
    }
  }
  typeSchemaCache = cache;
  return cache;
}

export class MarkdownMemoryStore implements MemoryStore {
  constructor(
    private baseDir: string,
    private onProblem?: (message: string) => void
  ) {}

  private roots(): string[] {
    return [threadsDir(this.baseDir), sharedDir(this.baseDir), objectsDir(this.baseDir)];
  }

  private async walkMarkdownFiles(root: string): Promise<string[]> {
    const results: string[] = [];
    try {
      await this.walkDir(root, results);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    return results;
  }

  private async walkDir(dir: string, results: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDir(full, results);
      } else if (entry.name.endsWith('.md')) {
        results.push(full);
      }
    }
  }

  async save(object: MemoryObject): Promise<void> {
    const path = targetPathFor(this.baseDir, object);
    await fs.mkdir(dirname(path), { recursive: true });
    const { body, ...frontmatter } = object;
    await writeFileAtomic(path, `---\n${yaml.dump(frontmatter)}---\n\n${body}`);
  }

  async get(id: string): Promise<MemoryObject | null> {
    const roots = this.roots();
    for (const root of roots) {
      const files = await this.walkMarkdownFiles(root);
      for (const path of files) {
        const parsed = await this.parseFileSafe(path);
        if (parsed && parsed.id === id) return parsed;
      }
    }
    return null;
  }

  async list(filters?: ListFilters): Promise<MemoryObject[]> {
    const seen = new Map<string, { obj: MemoryObject; isLegacy: boolean }>();
    const roots = this.roots();
    for (let ri = 0; ri < roots.length; ri++) {
      const root = roots[ri];
      const isLegacy = ri === roots.length - 1;
      const files = await this.walkMarkdownFiles(root);
      for (const path of files) {
        const parsed = await this.parseFileSafe(path);
        if (!parsed) continue;
        const existing = seen.get(parsed.id);
        if (!existing) {
          seen.set(parsed.id, { obj: parsed, isLegacy });
        } else if (!isLegacy && existing.isLegacy) {
          this.onProblem?.(`Duplicate id ${parsed.id}: new layout overrides legacy`);
          seen.set(parsed.id, { obj: parsed, isLegacy });
        }
      }
    }
    let results = Array.from(seen.values(), (v) => v.obj);
    if (filters?.type) results = results.filter((o) => o.type === filters.type);
    if (filters?.status) results = results.filter((o) => o.status === filters.status);
    if (filters?.stale) results = results.filter((o) => isStale(o));
    return results;
  }

  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Memory object not found: ${id}`);
    const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
    const oldPath = targetPathFor(this.baseDir, existing);
    await this.save(updated);
    const newPath = targetPathFor(this.baseDir, updated);
    if (oldPath !== newPath) {
      try {
        await fs.unlink(oldPath);
      } catch (err) {
        if (!isEnoent(err)) throw err;
      }
    }
    return updated;
  }

  async scanProblems(): Promise<{ path: string; error: string }[]> {
    const problems: { path: string; error: string }[] = [];
    for (const root of this.roots()) {
      let files: string[];
      try {
        files = await this.walkMarkdownFiles(root);
      } catch (err) {
        if (isEnoent(err)) continue;
        throw err;
      }
      for (const filePath of files) {
        const msgs: string[] = [];
        let content: string | undefined;
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch (err) {
          if (isEnoent(err)) continue;
          msgs.push(formatError(err));
        }
        if (content === undefined) continue;
        try {
          const match = content.match(FRONTMATTER_RE);
          if (!match) throw new Error('Missing or invalid frontmatter delimiter');
          const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
          const body = match[2] || '';
          const base = MemoryObjectSchema.parse({ ...frontmatter, body });
          const schemas = getTypeSchemas(this.baseDir);
          const typeSchema = schemas.get(base.type as MemoryType);
          if (typeSchema) {
            const result = typeSchema.safeParse(base);
            if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join(', '));
          }
        } catch (err) {
          msgs.push(formatError(err));
        }
        for (const msg of msgs) {
          problems.push({ path: filePath, error: msg });
        }
      }
    }
    return problems;
  }

  async quarantineFiles(problems: { path: string; error: string }[]): Promise<void> {
    const qBase = quarantineDir(this.baseDir);
    const memBase = memoryDir(this.baseDir);
    for (const { path: filePath, error } of problems) {
      const rel = relative(memBase, filePath);
      const dest = join(qBase, rel);
      const metaDest = `${dest}.meta.json`;
      await fs.mkdir(dirname(dest), { recursive: true });
      await fs.rename(filePath, dest);
      await fs.writeFile(metaDest, JSON.stringify({ error, quarantined_at: new Date().toISOString() }));
    }
  }

  private async parseFileSafe(path: string): Promise<MemoryObject | null> {
    let content: string;
    try {
      content = await fs.readFile(path, 'utf-8');
    } catch (err) {
      if (isEnoent(err)) return null;
      const msg = `Failed to read ${path}: ${formatError(err)}`;
      this.onProblem?.(msg);
      return null;
    }
    try {
      const match = content.match(FRONTMATTER_RE);
      if (!match) {
        throw new Error('Missing or invalid frontmatter delimiter');
      }
      const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
      const body = match[2] || '';
      const base = MemoryObjectSchema.parse({ ...frontmatter, body });
      const schemas = getTypeSchemas(this.baseDir, this.onProblem);
      const typeSchema = schemas.get(base.type as MemoryType);
      if (typeSchema) {
        const result = typeSchema.safeParse(base);
        if (!result.success) {
          throw new Error(`Per-type validation: ${result.error.issues.map((i) => i.message).join(', ')}`);
        }
        return result.data as MemoryObject;
      }
      return base;
    } catch (err) {
      const msg = `Failed to parse ${path}: ${formatError(err)}`;
      this.onProblem?.(msg);
      return null;
    }
  }
}

export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, path);
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
