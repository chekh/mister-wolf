import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

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

describe('Thread / Info Request / Article workflow', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-tia-'));
    // маркер корня проекта: init вне проекта честно отказывает (спека §6 дистрибуции)
    writeFileSync(join(dir, 'package.json'), '{ "name": "wolf-tia" }');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates thread, request, article, and brief end-to-end', () => {
    runCli('init --model zai-coding-plan/glm-5.3', dir);

    const threadOut = runCli('thread create --title MemoryHarness --goal Build durable memory', dir);
    const threadId = threadOut.stdout.match(/Created work thread: (\S+)/)?.[1];
    expect(threadId).toBeDefined();

    const requestOut = runCli(
      `info-request create --title WhereToStoreRelations --thread ${threadId} --question RelationsStorage --detour-reason DerailsSession --expected-answer Recommendation`,
      dir
    );
    const requestId = requestOut.stdout.match(/Created info request: (\S+)/)?.[1];
    expect(requestId).toBeDefined();

    const articleOut = runCli(
      `article add --title RelationsStorageRecommendation --thread ${threadId} --summary UseRelationsJsonl --body Answer:relations.jsonl --answers ${requestId}`,
      dir
    );
    const articleId = articleOut.stdout.match(/Created article: (\S+)/)?.[1];
    expect(articleId).toBeDefined();

    const briefOut = runCli(`thread brief ${threadId}`, dir);
    expect(briefOut.stdout).toContain('MemoryHarness');
    expect(briefOut.stdout).toContain('WhereToStoreRelations');
    expect(briefOut.stdout).toContain('RelationsStorageRecommendation');
  });
});
