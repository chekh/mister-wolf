import { join } from 'path';
import { getDeclaration, type MemoryTypeDeclaration } from '../../domain/memory-types.js';

export function memoryDir(baseDir: string): string {
  return join(baseDir, '.wolf', 'memory');
}

/** @deprecated layout v1, используется только migration */
export function objectsDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'objects');
}

export function eventsPath(baseDir: string): string {
  return join(memoryDir(baseDir), 'events.jsonl');
}

export function cacheDir(baseDir: string): string {
  return join(baseDir, '.wolf', 'cache');
}

export function indexPath(baseDir: string): string {
  return join(cacheDir(baseDir), 'index.sqlite');
}

export function thinkingDir(baseDir: string): string {
  return join(baseDir, '.wolf', 'thinking');
}

export function briefsDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'briefs');
}

export function relationsPath(baseDir: string): string {
  return join(memoryDir(baseDir), 'relations.jsonl');
}

export function configPath(baseDir: string): string {
  return join(baseDir, '.wolf', 'config.yaml');
}

export function threadsDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'threads');
}

export function sharedDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'shared');
}

export function quarantineDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'quarantine');
}

/** Целевой путь объекта в layout v2; extraDeclarations — project-типы из config.yaml. */
export function targetPathFor(
  baseDir: string,
  obj: { type: string; id: string; thread?: string },
  extraDeclarations?: readonly MemoryTypeDeclaration[]
): string {
  const decl = getDeclaration(obj.type, extraDeclarations);
  if (decl.layout === 'work-thread-file') {
    return join(threadsDir(baseDir), obj.id, 'WORK-THREAD.md');
  }
  const fileName = `${obj.id}.md`;
  if (obj.thread && decl.subdirThread) return join(threadsDir(baseDir), obj.thread, decl.subdirThread, fileName);
  const sharedSub = decl.subdirShared ?? decl.subdirThread;
  if (!sharedSub) throw new Error(`Type ${obj.type} has no storage directory for this scope`);
  return join(sharedDir(baseDir), sharedSub, fileName);
}
