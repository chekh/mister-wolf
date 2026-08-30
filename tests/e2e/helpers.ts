import { spawnSync, execSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const cliPath = join(repoRoot, 'dist/bootstrap/cli.js');

export function ensureBuilt(): void {
  try {
    execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });
  } catch {
    // ponytail: build failed — test will fail on first CLI call anyway
  }
}

export function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf-8', timeout: 30_000 });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status };
}

export function tmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-e2e-'));
  // маркер корня проекта: init вне проекта честно отказывает (спека §6 дистрибуции)
  writeFileSync(join(dir, 'package.json'), '{ "name": "wolf-e2e" }');
  return dir;
}
