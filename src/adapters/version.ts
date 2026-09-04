import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

let cached: string | null = null;
/** Runtime-версия Wolf из package.json; одно чтение на процесс (P2 D2). */
export function getWolfVersion(): string {
  if (cached === null) {
    cached = (
      JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf-8')) as {
        version: string;
      }
    ).version;
  }
  return cached;
}
