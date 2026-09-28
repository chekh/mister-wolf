// tests/e2e/router-fallback.e2e.ts
// T012 (волна 1.1): router fallback — против templates/-канона (init рендерит
// плагин из шаблона в tmp-проект). PATH-shim `wolf` → dist CLI; реальный spawn
// без моков. DoD: miss-rate executor-lead = 0% (<5%).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureBuilt } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');

/** Драйвер в tmp-проекте: импортирует ОТРЕНДЕРЕННЫЙ плагин (не догфуд-копию),
 *  вызывает transform с маркером agent-id, печатает true/false — инъекция была. */
const DRIVER = `
const { WolfPlaybookPlugin } = await import(new URL('./.opencode/plugins/wolf-router.ts', import.meta.url).href);
const agentId = process.argv[2];
const output = { system: ['agent-id: ' + agentId + '\\n\\nРоль: рамка агента.'] };
const plugin = await WolfPlaybookPlugin({});
await plugin['experimental.chat.system.transform']({}, output);
const injected = output.system.some((p) => String(p).includes('# Актуальный playbook'));
console.log(injected ? 'true' : 'false');
`;

describe('wolf-router fallback (T012): canonical приоритетен, miss → fallback', () => {
  let root: string;
  let project: string;
  let bin: string;
  let log: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-router-fallback-'));
    project = join(root, 'project');
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), '{ "name": "router-fallback-e2e" }');
    const xdg = join(root, 'xdg');
    mkdirSync(xdg);

    // init: сеет playbook'и (вкл. executor-lead) и рендерит плагин из templates/-канона
    const init = spawnSync('node', [cli, 'init', '--model', 'zai-coding-plan/glm-5.3'], {
      cwd: project,
      encoding: 'utf-8',
      timeout: 60_000,
      env: (() => {
        const { npm_command: _drop, ...rest } = process.env;
        return { ...rest, XDG_CONFIG_HOME: xdg };
      })(),
    });
    expect(init.status).toBe(0);
    expect(init.stdout).toMatch(/- base set: \S+ created/);

    // PATH-shim: плагин зовёт глобальный `wolf` → перехватываем на dist CLI
    bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'wolf'), `#!/bin/sh\nexec node "${cli}" "$@"\n`);
    chmodSync(join(bin, 'wolf'), 0o755);

    writeFileSync(join(project, 'driver.mjs'), DRIVER);
    log = join(root, 'router.log');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Свежий spawn драйвера (свежий кэш плагина — TTL не мешает). */
  function drive(agentId: string): { stdout: string; stderr: string; status: number | null } {
    return spawnSync('node', ['--experimental-strip-types', 'driver.mjs', agentId], {
      cwd: project,
      encoding: 'utf-8',
      timeout: 30_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WOLF_ROUTER_LOG: log },
    });
  }

  const routerLogLines = (): string[] => {
    try {
      return readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  };
  const lastLineFor = (agentId: string): string =>
    (
      routerLogLines()
        .filter((l) => l.includes(`agent-id=${agentId} `))
        .at(-1) ?? ''
    ).replace(/^\S+ /, '');

  it('executor-lead: canonical hit (посев executor-lead-playbook из base set)', () => {
    const r = drive('executor-lead');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('true');
    expect(lastLineFor('executor-lead')).toMatch(
      /^agent-id=executor-lead playbook=hit name=\S+ variant=canonical injected=yes$/
    );
  });

  it('worker-reviewer: canonical hit — hit-rate worker-* не регрессировал', () => {
    const r = drive('worker-reviewer');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('true');
    expect(lastLineFor('worker-reviewer')).toMatch(
      /^agent-id=worker-reviewer playbook=hit name=\S+ variant=canonical injected=yes$/
    );
  });

  it('unknown agent-id: fallback инъецирован, variant=fallback', () => {
    const r = drive('no-canonical-xyz');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('true');
    expect(lastLineFor('no-canonical-xyz')).toBe(
      'agent-id=no-canonical-xyz playbook=hit name=fallback variant=fallback injected=yes'
    );
  });

  it('DoD: 0 строк playbook=miss во всём router.log → miss-rate executor-lead 0% < 5%', () => {
    expect(routerLogLines().length).toBeGreaterThanOrEqual(3); // лог вообще писался
    expect(routerLogLines().filter((l) => l.includes('playbook=miss'))).toHaveLength(0);
  });
});
