import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { initProjectMemory } from '../../src/app/use-cases/init-project-memory.js';
import { FsProjectInitializer } from '../../src/adapters/fs/fs-project-initializer.js';
import { createBlocker } from '../../src/app/use-cases/create-blocker.js';
import { resolveBlocker } from '../../src/app/use-cases/resolve-blocker.js';
import { MarkdownMemoryStore } from '../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../src/adapters/fs/project-paths.js';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');

function runCli(args: string, cwd: string): { stdout: string; stderr: string } {
  const parsed = args.match(/(?:"[^"]*"|'[^']*'|\S+)/g) ?? [];
  const argv = parsed.map((arg) => arg.replace(/^["']|["']$/g, ''));
  const result = spawnSync('node', [cliPath, ...argv], {
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

  it('auto-creates a session-summary after resolving a blocker', async () => {
    await initProjectMemory(new FsProjectInitializer(), dir);
    const store = new MarkdownMemoryStore(dir);
    const log = new JsonlEventLog(eventsPath(dir));
    const clock = new SystemClock();
    const idGen = new HashIdGenerator();

    const { object: blocker } = await createBlocker(
      { store, log, clock, idGen },
      { title: 'CI timeout', impact: 'Build fails', createdBy: 'user:demo' }
    );

    await resolveBlocker({ store, log, clock, idGen }, blocker.id);

    const summaries = (await store.list()).filter((obj) => obj.type === 'session-summary');
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries[0].body).toContain(blocker.id);
  });
});
