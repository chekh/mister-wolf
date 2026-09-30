import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { ensureBuilt, runCli } from './helpers.js';
import { ProjectsRegistry } from '../../src/adapters/fs/projects-registry.js';

// P330/2.14 §11.4 (критерий 1): фикстура реестра 2 живых tmp-проекта + 1 missing
// → таблица 3 строки с вычисленными именем/версией/активностью/размером + сводка;
// missing помечен. Изоляция реестра — WOLF_SANDBOX (риск §4 плана: e2e на
// тестовом реестре через env), живой ~/.config/wolf не трогаем.
const RECENT = new Date(); // сейчас — активен в окне 7д
const OLD = new Date(Date.now() - 8 * 86_400_000); // 8д назад — не активен

describe('wolf projects e2e (P330/2.14 §11.4)', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'wolf-projects-e2e-sb-'));
  const dirs: string[] = [sandbox];
  let projA: string;
  let projB: string;
  let gone: string;
  let neutralCwd: string;

  function liveProject(eventsBytes: number, mtime: Date): string {
    const dir = mkdtempSync(join(tmpdir(), 'wolf-projects-e2e-'));
    dirs.push(dir);
    const memDir = join(dir, '.wolf', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, 'events.jsonl'), 'x'.repeat(eventsBytes));
    utimesSync(join(memDir, 'events.jsonl'), mtime, mtime);
    return dir;
  }

  beforeAll(async () => {
    ensureBuilt();
    projA = liveProject(1000, RECENT);
    projB = liveProject(500, OLD);
    gone = join(mkdtempSync(join(tmpdir(), 'wolf-projects-e2e-')), 'deleted'); // путь не существует
    neutralCwd = mkdtempSync(join(tmpdir(), 'wolf-projects-e2e-cwd-')); // без .wolf — самолечение no-op
    writeFileSync(join(neutralCwd, 'package.json'), '{ "name": "neutral" }');
    const registry = new ProjectsRegistry(join(sandbox, '.config', 'wolf'));
    await registry.register(projA, 2);
    await registry.register(projB, 1);
    await registry.register(gone, 2);
  });

  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('таблица 3 строки: вычисленные поля, missing помечен, сводка с окном 7д', () => {
    const res = runCli(['projects'], neutralCwd, { WOLF_SANDBOX: sandbox });
    expect(res.status).toBe(0);
    // обе живые строки: имя + версия схемы
    expect(res.stdout).toContain(basename(projA));
    expect(res.stdout).toContain(basename(projB));
    // вычисленные активность и размер (фиксированные байты фикстуры)
    expect(res.stdout).toContain('v2');
    expect(res.stdout).toContain('v1');
    expect(res.stdout).toContain('1000 B');
    expect(res.stdout).toContain('500 B');
    // отсутствующий путь помечен
    expect(res.stdout).toContain('missing');
    // сводка: проектов 3, активен за 7д только projA
    expect(res.stdout).toContain('проектов 3');
    expect(res.stdout).toContain('активны за 7д: 1');
    expect(res.stdout).toContain('суммарный размер памяти');
  });

  it('пустой реестр — подсказка init', () => {
    const emptySandbox = mkdtempSync(join(tmpdir(), 'wolf-projects-e2e-empty-'));
    dirs.push(emptySandbox);
    const res = runCli(['projects'], neutralCwd, { WOLF_SANDBOX: emptySandbox });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('No registered projects');
  });
});
