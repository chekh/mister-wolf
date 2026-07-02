import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { initProjectMemory } from '../../src/app/use-cases/init-project-memory.js';
import { FsProjectInitializer } from '../../src/adapters/fs/fs-project-initializer.js';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');

function runCli(args: string, cwd: string): { stdout: string; stderr: string } {
  const result = spawnSync('node', [cliPath, ...args.split(' ')], {
    cwd,
    encoding: 'utf-8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`CLI exited with status ${result.status}: ${result.stderr}`);
  }
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('memory session wrap-up CLI', () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-cli-wrap-'));
    await initProjectMemory(new FsProjectInitializer(), dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a session-summary object', () => {
    const out = runCli('session wrap-up --title "Manual wrap-up" --tags manual', dir);
    expect(out.stdout).toContain('Created session-summary');
  });
});
