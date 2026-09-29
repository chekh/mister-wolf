import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

// P221 (спека 2.13 §6.5, критерий §10.4): старые имена insights/effectiveness/
// dashboard — скрытые синонимы analytics --view …: работают, не видны в help,
// deprecation-предупреждение — только в stderr (stdout для машин не шумит).
describe('hidden synonyms: insights/effectiveness/dashboard (P221)', () => {
  const dirs: string[] = [];

  beforeAll(() => {
    ensureBuilt();
  });

  afterEach(() => {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function newProject(): string {
    const dir = tmpProject();
    dirs.push(dir);
    runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    return dir;
  }

  it('synonyms work: same stdout as analytics --view, deprecation only in stderr', () => {
    const dir = newProject();
    const cases: Array<{ name: string; view: string; marker: string }> = [
      { name: 'insights', view: 'readiness', marker: 'readiness' },
      { name: 'effectiveness', view: 'effectiveness', marker: 'noise' },
      { name: 'dashboard', view: 'dashboard', marker: 'health' },
    ];
    for (const c of cases) {
      const direct = runCli(['analytics', '--view', c.view], dir);
      expect(direct.status).toBe(0);
      const synonym = runCli([c.name], dir);
      expect(synonym.status).toBe(0);
      expect(synonym.stdout).toBe(direct.stdout);
      expect(synonym.stderr).toContain('deprecated');
      expect(synonym.stderr).toContain(`analytics --view ${c.view}`);
    }
  });

  it('synonym passes through flags (--snapshot via effectiveness)', () => {
    const dir = newProject();
    const r = runCli(['effectiveness', '--snapshot'], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('snapshot appended');
  });

  it('hidden names are absent from wolf --help', () => {
    const dir = newProject();
    const help = runCli(['--help'], dir);
    expect(help.status).toBe(0);
    // командная строка справки начинается с имени команды; слова в описаниях
    // (analytics упоминает effectiveness) не считаются
    const cmdLines = help.stdout.split('\n').map((l) => l.trim());
    for (const hidden of ['insights', 'effectiveness', 'dashboard']) {
      expect(cmdLines.some((l) => new RegExp(`^${hidden}\\b`).test(l))).toBe(false);
    }
    // новые команды пятёрки — видимы
    expect(cmdLines.some((l) => /^edit\b/.test(l))).toBe(true);
    expect(cmdLines.some((l) => /^archive\b/.test(l))).toBe(true);
  });
});
