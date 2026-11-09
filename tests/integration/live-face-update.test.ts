// tests/integration/live-face-update.test.ts
// Редакция S-DELIVERY 3.0.0 (R-08, «данные не удаляются»): init/re-init в
// штатном пути НЕ создаёт лиц, НЕ пишет face-строк в вывод и НЕ трогает
// face-историю существующих проектов (в т.ч. steward-мутнувшие лица — без
// «diverged», лицо не меняется); `wolf sync` память лиц не меняет (D4).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createFaceVersion } from '../../src/app/use-cases/create-face-version.js';
import { createCliContainer } from '../../src/bootstrap/container.js';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');

interface RunResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runCli(args: string[], cwd: string, envExtra?: NodeJS.ProcessEnv): RunResult {
  // npm_command срезаем: `npx vitest` проставляет 'exec' → isNpxRun() true → набор не пишется
  const { npm_command: _drop, ...env } = process.env;
  const r = spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...env, ...envExtra },
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

function faceIds(historyStdout: string): Map<string, { id: string; status: string }> {
  const out = new Map<string, { id: string; status: string }>();
  for (const line of historyStdout.split('\n')) {
    const m = line.match(/^v(\d+)\s+(mem_\S+)\s+\[(\w+)\]/);
    if (m) out.set(m[1]!, { id: m[2]!, status: m[3]! });
  }
  return out;
}

function readEvents(dir: string): Array<Record<string, unknown>> {
  const p = join(dir, '.wolf', 'memory', 'events.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function facesSnapshot(dir: string): string[] {
  const facesDir = join(dir, '.wolf', 'memory', 'shared', 'faces');
  if (!existsSync(facesDir)) return [];
  return readdirSync(facesDir)
    .map((f) => readFileSync(join(facesDir, f), 'utf-8'))
    .sort();
}

describe('R-08: init/re-init не трогают лица (штатный путь без seed)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-live-r08-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "live-face-it" }');
  }, 120_000);
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('свежая установка: лиц нет, в выводе init нет face-строк (steward-nastavnik/seed/diverged)', () => {
    const res = runCli(['init', '--full', '--platform', 'opencode'], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('steward-nastavnik.md created');
    expect(res.stdout).not.toMatch(/face|playbook|steward/i);
    expect(existsSync(join(dir, '.wolf/memory/shared/faces'))).toBe(false);

    const reinit = runCli(['init', '--full', '--platform', 'opencode', '--yes'], dir);
    expect(reinit.status, reinit.stderr).toBe(0);
    expect(reinit.stdout).not.toMatch(/face|playbook|steward/i);
    expect(existsSync(join(dir, '.wolf/memory/shared/faces'))).toBe(false);
    // посев лиц удалён из штатного пути: face-операций в журнале нет
    expect(readEvents(dir).filter((e) => String(e['type'] ?? '').startsWith('memory.face'))).toEqual([]);
  }, 120_000);

  it('проект с существующим лицом (seed-наследие): re-init и sync лицо не трогают', async () => {
    expect(runCli(['init', '--full', '--platform', 'opencode'], dir).status).toBe(0);
    // «проект жил в 2.17»: лицо steward, посеянное старым путём, на месте
    await createFaceVersion(createCliContainer(dir), {
      command: 'seed',
      ownerSkill: 'steward',
      reason: 'base-set seed: steward-nastavnik.md',
      title: 'Наставник v1 — протокол мутации playbook’ов',
      body: '# Наставник — протокол мутации (v1)\nНаследие 2.17.',
      tags: ['steward:наставник', 'playbook'],
    });
    const before = facesSnapshot(dir);
    expect(before.length).toBeGreaterThan(0);
    const historyBefore = faceIds(runCli(['face', 'history', 'steward'], dir).stdout);
    expect(historyBefore.size).toBe(1);
    const faceOpsBefore = readEvents(dir).filter((e) => String(e['type'] ?? '').startsWith('memory.face.op_')).length;

    // re-init: лицо не мутируется, никаких face-строк и «diverged»/«template update»
    const reinit = runCli(['init', '--full', '--platform', 'opencode', '--yes'], dir);
    expect(reinit.status, reinit.stderr).toBe(0);
    expect(reinit.stdout).not.toMatch(/face|playbook|steward|diverged|template update/i);
    expect(facesSnapshot(dir)).toEqual(before);
    expect(faceIds(runCli(['face', 'history', 'steward'], dir).stdout)).toEqual(historyBefore);
    expect(readEvents(dir).filter((e) => String(e['type'] ?? '').startsWith('memory.face.op_')).length).toBe(
      faceOpsBefore
    );

    // sync: память лиц не меняет (D4)
    const sync = runCli(['sync'], dir);
    expect(sync.status).toBe(0);
    expect(sync.stdout).toContain('Memory (.wolf/) untouched');
    expect(facesSnapshot(dir)).toEqual(before);
  }, 120_000);

  it('steward-мутнувшее лицо: re-init без «diverged», лицо и история не меняются; sync не трогает', () => {
    expect(runCli(['init', '--full', '--platform', 'opencode'], dir).status).toBe(0);
    const bodyFile = join(dir, 'steward-v2.md');
    writeFileSync(bodyFile, '# Наставник (steward-мутация)\nЛокальная правка Стюарда.');
    const mutated = runCli(
      [
        'face',
        'new',
        'steward',
        '--title',
        'Наставник (steward-мутация)',
        '--file',
        bodyFile,
        '--reason',
        'жалоба',
        '--minimal-change',
        'm',
        '--boundaries',
        'b',
        '--example-helps',
        'h',
        '--example-keep',
        'k',
        '--verification',
        'v',
        '--rollback',
        'r',
      ],
      dir,
      { WOLF_ACTOR: 'agent:steward' }
    );
    expect(mutated.status).toBe(0);
    expect(mutated.stdout).toContain('v1');
    const before = facesSnapshot(dir);
    const historyBefore = faceIds(runCli(['face', 'history', 'steward'], dir).stdout);
    expect(historyBefore.size).toBe(1);

    const reinit = runCli(['init', '--full', '--platform', 'opencode', '--yes'], dir);
    expect(reinit.status, reinit.stderr).toBe(0);
    expect(reinit.stdout).not.toContain('diverged');
    expect(reinit.stdout).not.toMatch(/face|playbook|steward/i);
    expect(facesSnapshot(dir)).toEqual(before);
    expect(faceIds(runCli(['face', 'history', 'steward'], dir).stdout)).toEqual(historyBefore);

    const sync = runCli(['sync'], dir);
    expect(sync.status).toBe(0);
    expect(sync.stdout).toContain('Memory (.wolf/) untouched');
    expect(facesSnapshot(dir)).toEqual(before);
  }, 120_000);
});
