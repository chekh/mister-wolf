import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// T013 (спека 1.2.b, приёмка): непустота брифа — контентная проверка e2e.
// Бриф после init + принятой памяти несёт обязательные секции и сам объект.

describe('brief content (T013: непустота брифа)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('wolf brief печатает непустой бриф с секциями памяти и объектом', () => {
    const dir = tmpProject();
    dirs.push(dir);
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    const add = runCli(
      ['add', '--type', 'decision', '--title', 'E2E brief content marker decision', '--body', 'marker'],
      dir
    );
    expect(add.status).toBe(0);

    const brief = runCli(['brief'], dir);
    expect(brief.status).toBe(0);
    expect(brief.stdout).toContain('# Agent Brief:');
    expect(brief.stdout).toContain('## What This Project Is');
    expect(brief.stdout).toContain('## Active Memory');
    expect(brief.stdout).toContain('E2E brief content marker decision');
    expect(brief.stdout).toContain('## Open Questions');
    expect(brief.stdout).toContain('## Blockers');
    expect(brief.stdout).toContain('## Recommended First Steps');
  });
});
