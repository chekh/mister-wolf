// tests/e2e/recreate-guard.e2e.ts
// §2.5 (спека 2.1.0): `init --recreate` — единственный вход CLI, обходящий guard runCli;
// из удалённого cwd он обязан падать однострочной UserFacingError (safeCwd), не сырым ENOENT-стеком.
// Удалённый cwd БЕЗ .wolf/config.yaml: recreate-guard не должен пытаться лечить конфиг до падения cwd.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureBuilt } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');

describe('recreate-guard (§2.5): удалённый cwd', () => {
  it('init --recreate из удалённого cwd → exit 1, однострочный Error без стека', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wolf-recreate-guard-')); // пустой каталог: без .wolf/config.yaml
    const res = spawnSync('sh', ['-c', `cd "${tmp}" && rm -rf "${tmp}" && node "${cli}" init --recreate --model x/y`], {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Error:');
    expect(res.stderr).not.toContain('    at '); // стека нет — UserFacingError, не сырой ENOENT
    const lines = res.stderr.trim().split('\n');
    expect(lines).toHaveLength(1); // сообщение однострочное
    expect(lines[0]).toMatch(/^Error: /);
  });
});
