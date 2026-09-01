// src/adapters/render/templates-root.ts
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

let cachedRoot: string | null = null;

export function packageRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      cachedRoot = dir;
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error(`package.json not found upward from ${fileURLToPath(import.meta.url)}`);
}

export function templatesRoot(): string {
  return join(packageRoot(), 'templates', 'base');
}

/** Harness-специфичные шаблоны (плагины) — вне нейтрального base (M6, спека §7.3). */
export function harnessTemplatesRoot(harnessId: string): string {
  return join(packageRoot(), 'templates', harnessId);
}

export function wolfVersion(): string {
  const pkg = JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf-8')) as { version: string };
  return pkg.version;
}
