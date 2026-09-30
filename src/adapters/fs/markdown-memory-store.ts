import * as fs from 'fs/promises';
import { dirname, join, relative } from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { MemoryStore, ListFilters } from '../../ports/memory-store.port.js';
import type { EventLog } from '../../ports/event-log.port.js';
import { MemoryObject, MemoryObjectSchema } from '../../domain/schemas/memory-object-schema.js';
import {
  type MemoryType,
  type MemoryTypeDeclaration,
  CORE_TAXONOMY,
  DEPRECATED_TYPE_ALIASES,
  getDeclaration,
} from '../../domain/memory-types.js';
import { buildTypeSchema } from '../../domain/type-schema-builder.js';
import { objectsDir, threadsDir, sharedDir, targetPathFor, memoryDir, quarantineDir } from './project-paths.js';
import { loadWolfConfigSync } from './config-file.js';
import { mergeTaxonomy, type WolfConfig } from '../../domain/taxonomy.js';

const STALE_DAYS = 30;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/;

/**
 * P211 §5.4: alias-резолвер — старый frontmatter читается как целевой тип.
 * facet инжектится ТОЛЬКО если его нет в frontmatter; transient-поле
 * alias_origin переживает passthrough в рантайме и стрипается при save().
 */
function resolveTypeAlias(base: MemoryObject): MemoryObject | null {
  const alias = DEPRECATED_TYPE_ALIASES[base.type];
  if (!alias) return null;
  const out = { ...base, type: alias.target, alias_origin: base.type } as MemoryObject;
  if (alias.facet !== undefined && out.facet === undefined) out.facet = alias.facet;
  return out;
}

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
  /** Parse-кэш (T013): mtimeMs+size совпали → отдаём объект мимо read+yaml+zod. */
  private parseCache = new Map<string, { mtimeMs: number; size: number; obj: MemoryObject }>();

  constructor(
    private baseDir: string,
    private onProblem?: (message: string) => void,
    private overwriteLog?: Pick<EventLog, 'append'>
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

  /** Project-типы из config.yaml (с валидацией mergeTaxonomy); при ошибке загрузки — []. */
  private projectDeclarations(): MemoryTypeDeclaration[] {
    try {
      const cfg = loadWolfConfigSync(this.baseDir);
      if (!cfg) return [];
      mergeTaxonomy(cfg);
      return cfg.projectTypes;
    } catch {
      return [];
    }
  }

  async save(object: MemoryObject): Promise<void> {
    const path = targetPathFor(this.baseDir, object, this.projectDeclarations());
    await fs.mkdir(dirname(path), { recursive: true });
    // P211: transient alias_origin не пишется — файл получает каноническую форму
    const { body, alias_origin: _strippedAliasOrigin, ...frontmatter } = object;
    // P300/2.14 §5.2: перезапись всегда со следом — событие ДО записи (краш
    // между событием и записью оставляет след намерения, для аудита безопаснее
    // молчания). Формат — прецедент memory.edited (memory-edit.ts); actor system.
    const prev = await this.parseFileSafe(path);
    if (prev && this.overwriteLog) {
      const now = new Date();
      await this.overwriteLog.append({
        id: `evt_${now.toISOString().slice(0, 19).replace(/[-:T]/g, '')}_${Math.random().toString(16).slice(2, 8)}`,
        type: 'memory.overwritten',
        timestamp: now.toISOString(),
        actor: 'system',
        payload: {
          memory_id: object.id,
          prev_title: prev.title.length > 120 ? prev.title.slice(0, 120) : prev.title,
          prev_status: prev.status,
        },
      });
    }
    await writeFileAtomic(path, `---\n${yaml.dump(frontmatter)}---\n\n${body}`);
  }

  /** Фактический путь файла объекта (alias-объект живёт по старому пути). */
  private async locate(id: string): Promise<{ path: string; obj: MemoryObject } | null> {
    for (const root of this.roots()) {
      const files = await this.walkMarkdownFiles(root);
      for (const path of files) {
        const parsed = await this.parseFileSafe(path);
        if (parsed && parsed.id === id) return { path, obj: parsed };
      }
    }
    return null;
  }

  async get(id: string): Promise<MemoryObject | null> {
    const located = await this.locate(id);
    return located ? located.obj : null;
  }

  /**
   * P211 §5.5: корни сканирования для тип-предфильтрации list({type}) —
   * subdir-корни типа + alias-корни (карта §5.4) + legacy objects/.
   * null → тип без каталогов (или project-тип без subdir) — полный обход.
   */
  private async typeScanRoots(type: string): Promise<string[] | null> {
    const roots = new Set<string>();
    let decl: MemoryTypeDeclaration | null = null;
    try {
      decl = getDeclaration(type, this.projectDeclarations());
    } catch {
      return []; // старый/неизвестный тип фильтра: после alias-резолва совпадений нет
    }
    await this.addDeclRoots(decl.layout === 'work-thread-file', decl.subdirThread, decl.subdirShared, roots);
    for (const [oldType, spec] of Object.entries(DEPRECATED_TYPE_ALIASES)) {
      if (spec.target !== type) continue;
      await this.addDeclRoots(oldType === 'work-thread', spec.subdirThread, spec.subdirShared, roots);
    }
    if (roots.size === 0) return null;
    roots.add(objectsDir(this.baseDir)); // legacy layout v1 — резервный корень чтения
    return [...roots];
  }

  private async addDeclRoots(
    isThreadFileLayout: boolean,
    subdirThread: string | null,
    subdirShared: string | null,
    roots: Set<string>
  ): Promise<void> {
    if (isThreadFileLayout) {
      // спецслучай threads/<tid>/WORK-THREAD.md — walk по threads/
      roots.add(threadsDir(this.baseDir));
      return;
    }
    if (subdirThread) {
      const tRoot = threadsDir(this.baseDir);
      let entries: import('fs').Dirent[];
      try {
        entries = await fs.readdir(tRoot, { withFileTypes: true });
      } catch (err) {
        if (!isEnoent(err)) throw err;
        entries = []; // threads/ нет — thread-корней типа нет, shared-корень ниже всё равно добавляется
      }
      for (const e of entries) {
        if (e.isDirectory()) roots.add(join(tRoot, e.name, subdirThread));
      }
    }
    if (subdirShared) roots.add(join(sharedDir(this.baseDir), subdirShared));
  }

  async list(filters?: ListFilters): Promise<MemoryObject[]> {
    const seen = new Map<string, { obj: MemoryObject; isLegacy: boolean }>();
    let roots = this.roots();
    if (filters?.type) {
      const typeRoots = await this.typeScanRoots(filters.type);
      if (typeRoots !== null) roots = typeRoots;
    }
    for (let ri = 0; ri < roots.length; ri++) {
      const root = roots[ri];
      const isLegacy = ri === roots.length - 1;
      const files = await this.walkMarkdownFiles(root);
      for (const path of files) {
        const parsed = await this.parseFileSafe(path);
        if (!parsed) continue;
        if (filters?.type && parsed.type !== filters.type) continue;
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
    if (filters?.status) results = results.filter((o) => o.status === filters.status);
    if (filters?.stale) results = results.filter((o) => isStale(o));
    // P212 (2.13 §5.3б): фасет — postfilter по frontmatter (alias-резолв уже
    // инжектировал facet старым типам); значение не из словаря → пусто
    if (filters?.facet) results = results.filter((o) => o.facet === filters.facet);
    return results;
  }

  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    const located = await this.locate(id);
    if (!located) throw new Error(`Memory object not found: ${id}`);
    const updated: MemoryObject = { ...located.obj, ...patch, updated_at: new Date().toISOString() };
    // P211: alias-объект при первом update переезжает на канонический путь/тип;
    // transient alias_origin умирает — повторный update идемпотентен
    delete (updated as { alias_origin?: string }).alias_origin;
    await this.save(updated);
    const newPath = targetPathFor(this.baseDir, updated, this.projectDeclarations());
    if (located.path !== newPath) {
      try {
        await fs.unlink(located.path);
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
          const effective = resolveTypeAlias(base) ?? base;
          const schemas = getTypeSchemas(this.baseDir);
          const typeSchema = schemas.get(effective.type as MemoryType);
          if (!typeSchema) throw new Error(`Unknown memory type: ${effective.type}`);
          const result = typeSchema.safeParse(effective);
          if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join(', '));
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
    // T013: stat до чтения — кэш по mtimeMs+size. Внешний edit меняет mtime →
    // перечитает; save() пишет новый mtime → перечитает; удалённый файл
    // исчезает из walk → исчезает из list. ENOENT при stat → null как раньше.
    let stat: { mtimeMs: number; size: number };
    try {
      stat = await fs.stat(path);
    } catch (err) {
      if (isEnoent(err)) {
        this.parseCache.delete(path);
        return null;
      }
      const msg = `Failed to read ${path}: ${formatError(err)}`;
      this.onProblem?.(msg);
      return null;
    }
    const cached = this.parseCache.get(path);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.obj;
    }
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
      const effective = resolveTypeAlias(base) ?? base;
      const schemas = getTypeSchemas(this.baseDir, this.onProblem);
      const typeSchema = schemas.get(effective.type as MemoryType);
      if (!typeSchema) throw new Error(`Unknown memory type: ${effective.type}`);
      const result = typeSchema.safeParse(effective);
      if (!result.success) {
        throw new Error(`Per-type validation: ${result.error.issues.map((i) => i.message).join(', ')}`);
      }
      const obj = result.data as MemoryObject;
      this.parseCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, obj });
      return obj;
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
