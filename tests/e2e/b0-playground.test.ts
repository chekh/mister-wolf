// tests/e2e/b0-playground.test.ts
// REQ-04 (B0, 2.18.0): S-33 — внешний проект → init → doctor/call/face show;
// S-35/S-80 (NFR-04) — «2.17.x → 2.18.0»: re-init (--yes) поверх живого
// проекта не теряет ни steward-мутнувшие лица (diverged), ни локальные правки
// файлов набора (mutated-skip).
//
// Отступление от буквы S-33: playground-lab — незакоммиченное состояние
// основного чекаута (вне allowlist worktree), его мутация из параллельного
// воркера небезопасна. REQ-04 явно разрешает альтернативу: «tmp-каталог с
// wolf init --full --platform opencode» — внешняя форма проекта та же
// (README + package.json, не-волчий контент).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, realpathSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');
const MODEL = 'zai-coding-plan/glm-5.3';
const BASE_AGENTS = [
  'mr-wolf',
  'executor-lead',
  'steward',
  'worker-implementer',
  'worker-researcher',
  'worker-reviewer',
];
// doctor чистит записи под os.tmpdir() как sandbox (2.14 §8.2) — «: ok»
// наблюдаемо только вне tmpdir; фикстура живёт в untracked-каталоге tests/
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function runCli(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): { stdout: string; stderr: string; status: number | null } {
  const { npm_command: _drop, ...base } = process.env;
  const r = spawnSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...base, ...env },
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

describe('wolf B0 на внешнем проекте: init → doctor/call/faces (S-33) + upgrade re-init (S-35/S-80)', () => {
  let dir: string;
  const faceOwners = () =>
    [
      ...new Set(
        readdirSync(join(dir, '.wolf/memory/shared/faces'))
          .map((f) => readFileSync(join(dir, '.wolf/memory/shared/faces', f), 'utf-8'))
          .map((body) => body.match(/^owner_skill:\s*(\S+)$/m)?.[1])
      ),
    ]
      .filter((o): o is string => o !== undefined)
      .sort();

  beforeAll(() => {
    dir = mkdtempSync(join(REPO, 'tests', '.b0-playground-'));
    // форма внешнего проекта: не-волчий README + маркер корня
    writeFileSync(join(dir, 'README.md'), '# External lab project\n\nNot a wolf repo.\n');
    writeFileSync(join(dir, 'package.json'), '{ "name": "b0-playground-lab" }');
    const res = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir);
    expect(res.status).toBe(0);
  }, 120_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('S-33: init без ошибок; структура набора на месте', () => {
    for (const sub of ['agents', 'skills', 'command', 'plugins']) {
      expect(readdirSync(join(dir, '.opencode', sub)).length, sub).toBeGreaterThan(0);
    }
    expect(faceOwners()).toEqual(BASE_AGENTS.slice().sort());
  });

  it('S-33: wolf doctor — зелёный (проект ok, без issues)', () => {
    const res = runCli(['doctor'], dir);
    expect(res.status).toBe(0);
    // registry хранит realpath (macOS tmp — симлинк /var → /private/var)
    const real = realpathSync(dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(res.stdout).toMatch(new RegExp(`- ${real}: ok \\(schema`));
    expect(res.stdout).not.toMatch(/^  ! /m);
  });

  it('S-33: wolf call — честный пустой пул на свежем проекте', () => {
    const res = runCli(['call'], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('No active call injections.');
  });

  it('S-33: face show — все 6 базовых агентов, owner_skill === agent_id', () => {
    for (const a of BASE_AGENTS) {
      const res = runCli(['face', 'show', a], dir);
      expect(res.status, a).toBe(0);
      expect(res.stdout.split('\n')[0], a).toMatch(new RegExp(`^${a}\\s+v\\d+\\s+\\S+\\s+\\[active\\]`));
    }
  });

  it('S-35/S-80 (NFR-04): re-init поверх живого проекта — steward-лицо diverged, локальная правка mutated-skip, потерь нет', () => {
    // «проект 2.17.x жил»: Стюард мутировал лицо, пользователь правит файл набора
    const face = runCli(
      [
        'face',
        'new',
        'worker-implementer',
        '--reason',
        'S-35: steward mutation before upgrade',
        '--body',
        'Steward-mutated playbook body (S-35).',
        '--minimal-change',
        'тело лица',
        '--boundaries',
        'рамка агента',
        '--example-helps',
        'воркер',
        '--example-keep',
        'scaffold',
        '--verification',
        'face show',
        '--rollback',
        'face restore v1',
      ],
      dir,
      { WOLF_ACTOR: 'agent:steward' }
    );
    expect(face.status).toBe(0);
    expect(face.stdout).toContain('v2');

    const agentFile = join(dir, '.opencode/agents/worker-researcher.md');
    writeFileSync(agentFile, `${readFileSync(agentFile, 'utf-8')}\n<!-- S-35: локальная правка перед upgrade -->\n`);

    // «обновление до 2.18.0»: тот же путь re-init c initiator seed (design §3.4)
    const res = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL, '--yes'], dir);
    expect(res.status).toBe(0);
    // steward-мутнувшее лицо — diverged (init печатает «file action», без двоеточия)
    expect(res.stdout).toContain('worker-implementer-playbook.md conflict');
    expect(res.stdout).toContain('diverged');
    // локальная правка файла набора — mutated-skip
    expect(res.stdout).toContain('.opencode/agents/worker-researcher.md skipped');
    expect(res.stdout).toContain('mutated');
    expect(readFileSync(agentFile, 'utf-8')).toContain('S-35: локальная правка перед upgrade');

    // потерь нет: 6 владельцев, steward-версия v2 жива
    expect(faceOwners()).toEqual(BASE_AGENTS.slice().sort());
    const show = runCli(['face', 'show', 'worker-implementer'], dir);
    expect(show.status).toBe(0);
    expect(show.stdout.split('\n')[0]).toMatch(/^worker-implementer\s+v2\s+/);
    expect(show.stdout).toContain('Steward-mutated playbook body (S-35).');
    // guard §3.4: все лица на месте — нарушения нет
    expect(res.stdout).not.toContain('(base set faces)');
  }, 120_000);
});
