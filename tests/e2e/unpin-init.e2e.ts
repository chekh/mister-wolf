import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('unpin: init без --model (спека 2.16 §14.1-14.2)', () => {
  let cwd: string;
  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('non-interactive init without --model exits 0', () => {
    // WP1 (спека 2.16 §4): профили существуют только в полном наборе — кейс через --full
    expect(runCli(['init', '--full'], cwd).status).toBe(0);
  });

  it('profiles have no model lines (platform default is inherited)', () => {
    // [НЕПР] частичное закрытие: ассертится только отсутствие pin-строк; фактическое
    // наследование платформенного дефолта e2e без сети проверить нельзя (Р1 спеки §2 P5)
    for (const f of ['mr-wolf.md', 'worker-researcher.md']) {
      const raw = readFileSync(join(cwd, '.opencode/agents', f), 'utf-8');
      expect(raw).not.toMatch(/^[^\S\n]*model:[^\S\n]*\{\{model\./m);
      expect(raw).not.toMatch(/^model:\s+\S+/m);
    }
  });

  it('--model stays opt-in and pins model lines', () => {
    const dir = tmpProject();
    expect(runCli(['init', '--full', '--model', 'test-provider/test-model'], dir).status).toBe(0);
    const agent = readFileSync(join(dir, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(agent).toContain('model: test-provider/test-model');
    rmSync(dir, { recursive: true, force: true });
  });
});
