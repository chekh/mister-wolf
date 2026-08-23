import * as fs from 'fs/promises';
import type { MemoryEvent } from '../../domain/schemas/memory-event-schema.js';
import type { Relation } from '../../domain/schemas/relation-schema.js';

export interface ScanProblem {
  line: number;
  error: string;
  content: string;
}

export interface ScanResult<T> {
  items: T[];
  problems: ScanProblem[];
}

export async function scanJsonlFile<T>(
  path: string,
  parseItem: (line: string, lineNumber: number) => T
): Promise<ScanResult<T>> {
  let content: string;
  try {
    content = await fs.readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { items: [], problems: [] };
    throw err;
  }
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const items: T[] = [];
  const problems: ScanProblem[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      items.push(parseItem(lines[i], i + 1));
    } catch (err) {
      problems.push({
        line: i + 1,
        error: err instanceof Error ? err.message : String(err),
        content: lines[i],
      });
    }
  }
  return { items, problems };
}
