// src/adapters/fs/artifact-fs.ts
import { existsSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { ArtifactIndexFs } from '../../app/use-cases/sync-artifact-index.js';

/** Общий fs-адаптер артефактов: sync (генерация индексов, A2) и doctor (линт, A3). */
export function artifactFs(): ArtifactIndexFs {
  return {
    exists: (p: string) => Promise.resolve(existsSync(p)),
    readFile: async (p: string) => readFile(p, 'utf-8').catch(() => null),
    writeFile: (p: string, c: string) => writeFile(p, c, 'utf-8'),
    listDir: async (p: string) => (existsSync(p) ? (await readdir(p)).filter((f) => !f.startsWith('.')) : []),
    listFiles: async (p: string): Promise<string[]> => {
      const out: string[] = [];
      if (!existsSync(p)) return out;
      const walk = async (dir: string, prefix: string): Promise<void> => {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          if (e.isDirectory()) await walk(join(dir, e.name), `${prefix}${e.name}/`);
          else if (e.name.endsWith('.md')) out.push(`${prefix}${e.name}`);
        }
      };
      await walk(p, '');
      return out;
    },
  };
}
