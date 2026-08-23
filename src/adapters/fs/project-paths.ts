import { join } from 'path';
import { getDeclaration, type MemoryType } from '../../domain/memory-types.js';

export function memoryDir(baseDir: string): string {
  return join(baseDir, '.wolf', 'memory');
}

export function objectsDir(baseDir: string): string {
  return join(memoryDir(baseDir), 'objects');
}

export function objectDirForType(baseDir: string, type: MemoryType): string {
  const mapping: Record<MemoryType, string> = {
    decision: 'decisions',
    lesson: 'lessons',
    observation: 'observations',
    'session-summary': 'sessions',
    document: 'documents',
    'open-question': 'questions',
    context: 'context',
    'work-thread': 'threads',
    'info-request': 'info-requests',
    article: 'articles',
    blocker: 'blockers',
    'session-checkpoint': 'checkpoints',
    rule: 'rules',
    // --- Phase 8 types (legacy objects/ layout; full layout v2 lands in Task 4) ---
    'document-ref': 'documents',
    'document-native': 'documents',
    'task-brief': 'tasks',
    report: 'tasks',
    'council-question': 'councils',
    'council-opinion': 'councils',
    synthesis: 'councils',
    escalation: 'escalations',
    'decision-request': 'escalations',
  };
  if (!(type in mapping)) {
    throw new Error(`Unknown memory type: ${type}`);
  }
  return join(objectsDir(baseDir), mapping[type]);
}

export function objectPath(baseDir: string, type: MemoryType, id: string): string {
  return join(objectDirForType(baseDir, type), `${id}.md`);
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

/** Целевой путь объекта в layout v2. */
export function targetPathFor(baseDir: string, obj: { type: MemoryType; id: string; thread?: string }): string {
  const decl = getDeclaration(obj.type);
  if (decl.layout === 'work-thread-file') {
    return join(threadsDir(baseDir), obj.id, 'WORK-THREAD.md');
  }
  const fileName = `${obj.id}.md`;
  if (obj.thread && decl.subdirThread) return join(threadsDir(baseDir), obj.thread, decl.subdirThread, fileName);
  const sharedSub = decl.subdirShared ?? decl.subdirThread;
  if (!sharedSub) throw new Error(`Type ${obj.type} has no storage directory for this scope`);
  return join(sharedDir(baseDir), sharedSub, fileName);
}
