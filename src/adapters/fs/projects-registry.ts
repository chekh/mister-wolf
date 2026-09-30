import * as fs from 'fs/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
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
      if (existing.schema_version === schemaVersion) return; // идентичная запись — persist пропускаем (OPT-7; §11.4: mtime не дёргаем)
      existing.schema_version = schemaVersion; // upsert: версию обновляем, initialized_at храним
    } else {
      projects.push({ path, schema_version: schemaVersion, initialized_at: new Date().toISOString() });
    }
    await this.persist(projects);
  }

  /**
   * Самолечение реестра (спека 2.14 §8.2, P331): синхронный upsert — добавляет
   * запись только когда её нет вовсе (версию существующих не трогает — это init's
   * работа). Sync, потому что контейнер CLI синхронный (прецедент loadWolfConfigSync).
   * Best-effort: любая ошибка → false, самолечение не роняет команду.
   */
  registerIfAbsentSync(path: string, schemaVersion: number): boolean {
    try {
      const projects = this.listSync();
      if (projects.some((p) => p.path === path)) return false;
      projects.push({ path, schema_version: schemaVersion, initialized_at: new Date().toISOString() });
      mkdirSync(this.configDir, { recursive: true });
      writeFileSync(this.file, yaml.dump({ projects }, { sortKeys: false, lineWidth: 120 }));
      return true;
    } catch {
      return false;
    }
  }

  private listSync(): RegisteredProject[] {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []; // файла нет
      throw err; // прочие ошибки IO — не заглушать (иначе перезапишем живые данные)
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

  async remove(path: string): Promise<boolean> {
    const projects = await this.list();
    const next = projects.filter((p) => p.path !== path);
    if (next.length === projects.length) return false;
    await this.persist(next);
    return true;
  }

  private async persist(projects: RegisteredProject[]): Promise<void> {
    const body = yaml.dump({ projects }, { sortKeys: false, lineWidth: 120 });
    await fs.mkdir(this.configDir, { recursive: true });
    await writeFileAtomic(this.file, body);
  }
}
