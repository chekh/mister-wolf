import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { writeFileAtomic } from './markdown-memory-store.js';

export interface RegisteredProject {
  path: string;
  schema_version: number;
  initialized_at: string;
}

/**
 * Реестр инициализированных проектов: `<user-config>/projects.yaml`.
 * Пишет `wolf init`, читает `wolf doctor`, чистит мёртвые записи (спека §3).
 */
export class ProjectsRegistry {
  constructor(private readonly configDir: string) {}

  private get file(): string {
    return join(this.configDir, 'projects.yaml');
  }

  async list(): Promise<RegisteredProject[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, 'utf-8');
    } catch {
      return [];
    }
    let doc: unknown;
    try {
      doc = yaml.load(raw);
    } catch {
      return []; // битый реестр — трактуем как пустой; register перезапишет
    }
    const projects = (doc as { projects?: unknown } | null)?.projects;
    return Array.isArray(projects) ? (projects as RegisteredProject[]) : [];
  }

  async register(path: string, schemaVersion: number): Promise<void> {
    const projects = await this.list();
    const existing = projects.find((p) => p.path === path);
    if (existing) {
      existing.schema_version = schemaVersion; // upsert: версию обновляем, initialized_at храним
    } else {
      projects.push({ path, schema_version: schemaVersion, initialized_at: new Date().toISOString() });
    }
    await this.persist(projects);
  }

  async remove(path: string): Promise<boolean> {
    const projects = await this.list();
    const next = projects.filter((p) => p.path !== path);
    if (next.length === projects.length) return false;
    await this.persist(next);
    return true;
  }

  /** Удаляет записи с несуществующими путями; возвращает удалённые пути (для doctor). */
  async prune(): Promise<string[]> {
    const projects = await this.list();
    const alive: RegisteredProject[] = [];
    const dead: string[] = [];
    for (const p of projects) {
      if (existsSync(p.path)) alive.push(p);
      else dead.push(p.path);
    }
    if (dead.length > 0) await this.persist(alive);
    return dead;
  }

  private async persist(projects: RegisteredProject[]): Promise<void> {
    const body = yaml.dump({ projects }, { sortKeys: false, lineWidth: 120 });
    await fs.mkdir(this.configDir, { recursive: true });
    await writeFileAtomic(this.file, body);
  }
}
