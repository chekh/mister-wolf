// tests/integration/base-set-init.test.ts
// Полный `wolf init` в tmp-проекте: базовый набор (спека §11.1–11.3, §11.8)
// + идемпотентность повторного init + проверки контента отрендеренных файлов.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number | null } {
  // npm_command срезаем: `npx vitest` проставляет 'exec' → isNpxRun() true → набор не пишется
  const { npm_command: _drop, ...env } = process.env;
  const r = spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf-8', timeout: 60_000, env });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

const AGENTS = ['executor-lead', 'mr-wolf', 'steward', 'worker-implementer', 'worker-researcher', 'worker-reviewer'];
const WORKERS_PLUS_STEWARD = ['steward', 'worker-implementer', 'worker-researcher', 'worker-reviewer'];

describe('wolf init: базовый набор (спека §7, §11.1–11.3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-base-set-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "base-set-it" }');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("создаёт полный набор: 6 агентов, 13 скиллов, 3 команды, 2 плагина + 6 seeded playbook'ов (§11.1)", () => {
    const res = runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    expect(res.status).toBe(0);

    // 24 файла (6+13+3+2) + AGENTS.md в корне (onboarding v2 §4.2) созданы + 6 playbook'ов посеяны;
    // F5 (§2.3): 13 скиллов печатаются как `[skill] …` — в счётчике `- base set:` их больше нет
    const created = (res.stdout.match(/- base set: \S+ created/g) ?? []).length;
    expect(created).toBe(18);
    expect((res.stdout.match(/\[skill\] /g) ?? []).length).toBe(13);
    expect(res.stdout).toMatch(/- base set: AGENTS\.md created/);

    const agents = readdirSync(join(dir, '.opencode/agents')).filter((f) => f.endsWith('.md'));
    expect(agents).toHaveLength(6);

    const skills = readdirSync(join(dir, '.opencode/skills')).filter((d) =>
      existsSync(join(dir, '.opencode/skills', d, 'SKILL.md'))
    );
    expect(skills).toHaveLength(13);

    const commands = readdirSync(join(dir, '.opencode/command')).filter((f) => f.endsWith('.md'));
    expect(commands).toHaveLength(3);

    const plugins = readdirSync(join(dir, '.opencode/plugins')).filter((f) => /\.(js|ts)$/.test(f));
    expect(plugins).toHaveLength(2);

    // посев в память: 6 playbook-объектов с owner_skill (M3, MAJ-3)
    const playbooks = readdirSync(join(dir, '.wolf/memory/shared/playbooks')).filter((f) => f.endsWith('.md'));
    expect(playbooks).toHaveLength(6);
    for (const f of playbooks) {
      expect(readFileSync(join(dir, '.wolf/memory/shared/playbooks', f), 'utf-8')).toContain('owner_skill');
    }
    const list = runCli(['list', '--type', 'playbook'], dir).stdout;
    expect((list.match(/\[playbook\]/g) ?? []).length).toBe(6);

    // триггер жалобы в воркерских playbook'ах — процедурный, не декларативный
    // (дефект догфудинга фазы C: декларативное правило воркеры не исполняли)
    for (const f of ['worker-implementer', 'worker-researcher', 'worker-reviewer']) {
      const seeded = readdirSync(join(dir, '.wolf/memory/shared/playbooks'))
        .map((p) => readFileSync(join(dir, '.wolf/memory/shared/playbooks', p), 'utf-8'))
        .find((body) => body.includes(`owner_skill: ${f}`));
      expect(seeded, f).toBeDefined();
      expect(seeded, f).toContain('ТРИГГЕР ЖАЛОБЫ');
      expect(seeded, f).toContain('НЕ заменяет');
    }
  });

  it("повторный init: все файловые outcomes skipped, playbook'ы не задвоены (§11.2)", () => {
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);
    const agentPath = join(dir, '.opencode/agents/mr-wolf.md');
    const before = readFileSync(agentPath, 'utf-8');

    const again = runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir);
    expect(again.status).toBe(0);
    expect(again.stdout).not.toMatch(/- base set: \S+ created/); // всё skipped (wx-политика)
    expect(again.stdout).toMatch(/- base set: \S+ skipped/);
    expect(readFileSync(agentPath, 'utf-8')).toBe(before); // существующее не тронуто

    const list = runCli(['list', '--type', 'playbook'], dir).stdout;
    expect((list.match(/\[playbook\]/g) ?? []).length).toBe(6); // снова 6, не 12
  });

  it('контент отрендеренных агентов: agent-id ×6, тройка «рамка/лицо/доставка», wolf search у воркеров (§11.3, §11.8)', () => {
    expect(runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    for (const a of AGENTS) {
      const body = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8');
      expect(body, a).toContain(`agent-id: ${a}`);
      expect(body, a).toContain('wolf:rendered base='); // штамп рендера
    }

    // тройка: ЛИЦО (тег playbook) + ДОСТАВКА (plugin-inject / pull через wolf search)
    for (const a of WORKERS_PLUS_STEWARD) {
      const body = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8');
      expect(body, a).toContain('playbook');
      expect(body, a).toContain('plugin-inject');
      expect(body, a).toContain('wolf search');
    }

    // using-skills в rendered-виде: governance-набор (H2)
    const using = readFileSync(join(dir, '.opencode/skills/using-skills/SKILL.md'), 'utf-8');
    for (const marker of ['1%', 'пассивн', 'лестниц', 'rigid', 'flexible']) expect(using).toContain(marker);
  });
});
