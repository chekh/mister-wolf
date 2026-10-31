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
const WORKERS = ['worker-implementer', 'worker-researcher', 'worker-reviewer'];

describe('wolf init: базовый набор (спека §7, §11.1–11.3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-base-set-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "base-set-it" }');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("создаёт полный набор: 6 агентов, 20 скиллов, 3 команды, 2 плагина + 6 seeded playbook'ов (§11.1)", () => {
    const res = runCli(['init', '--full', '--model', 'zai-coding-plan/glm-5.3'], dir);
    expect(res.status).toBe(0);

    // 31 файл (6+20+3+2) + AGENTS.md в корне (onboarding v2 §4.2) созданы + 6 playbook'ов посеяны;
    // F5 (§2.3): 20 скиллов печатаются как `[skill] …` — в счётчике `- base set:` их больше нет
    const created = (res.stdout.match(/- base set: \S+ created/g) ?? []).length;
    expect(created).toBe(18);
    expect((res.stdout.match(/\[skill\] /g) ?? []).length).toBe(20);
    expect(res.stdout).toMatch(/- base set: AGENTS\.md created/);

    const agents = readdirSync(join(dir, '.opencode/agents')).filter((f) => f.endsWith('.md'));
    expect(agents).toHaveLength(6);

    const skills = readdirSync(join(dir, '.opencode/skills')).filter((d) =>
      existsSync(join(dir, '.opencode/skills', d, 'SKILL.md'))
    );
    expect(skills).toHaveLength(20);

    const commands = readdirSync(join(dir, '.opencode/command')).filter((f) => f.endsWith('.md'));
    expect(commands).toHaveLength(3);

    const plugins = readdirSync(join(dir, '.opencode/plugins')).filter((f) => /\.(js|ts)$/.test(f));
    expect(plugins).toHaveLength(2);

    // посев в память: 6 playbook'ов → волна 2.17 T-05: base-set сеется ЛИЦАМИ
    // (type face, shared/faces/, initiator: seed, owner_skill в каждом);
    // legacy-посев note+facet howto больше не существует
    const faces = readdirSync(join(dir, '.wolf/memory/shared/faces')).filter((f) => f.endsWith('.md'));
    expect(faces).toHaveLength(6);
    for (const f of faces) {
      expect(readFileSync(join(dir, '.wolf/memory/shared/faces', f), 'utf-8')).toContain('owner_skill');
    }
    const list = runCli(['list', '--type', 'face'], dir).stdout;
    expect((list.match(/\[face\]/g) ?? []).length).toBe(6);

    // триггер жалобы в воркерских лицах (лица живут в shared/faces/) —
    // процедурный, не декларативный (дефект догфудинга фазы C: декларативное
    // правило воркеры не исполняли). Исключение 2.21.1: у reviewer жалоба
    // переведена на рамку (W1–W4 + «Жалоба — по рамке»), без
    // playbook-триггера
    for (const f of ['worker-implementer', 'worker-researcher']) {
      const seeded = readdirSync(join(dir, '.wolf/memory/shared/faces'))
        .map((p) => readFileSync(join(dir, '.wolf/memory/shared/faces', p), 'utf-8'))
        .find((body) => body.includes(`owner_skill: ${f}`));
      expect(seeded, f).toBeDefined();
      expect(seeded, f).toContain('ТРИГГЕР ЖАЛОБЫ');
      expect(seeded, f).toContain('НЕ заменяет');
    }
    const reviewerFace = readdirSync(join(dir, '.wolf/memory/shared/faces'))
      .map((p) => readFileSync(join(dir, '.wolf/memory/shared/faces', p), 'utf-8'))
      .find((body) => body.includes('owner_skill: worker-reviewer'));
    expect(reviewerFace, 'worker-reviewer').toBeDefined();
    expect(reviewerFace, 'worker-reviewer').toContain('W1–W4');
    expect(reviewerFace, 'worker-reviewer').toContain('Жалоба — по рамке');
  });

  it("повторный init: все файловые outcomes skipped, playbook'ы не задвоены (§11.2)", () => {
    expect(runCli(['init', '--full', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);
    const agentPath = join(dir, '.opencode/agents/mr-wolf.md');
    const before = readFileSync(agentPath, 'utf-8');

    // повторный init на живом проекте — под K6-гейтом подтверждения: --yes применяет план
    const again = runCli(['init', '--full', '--model', 'zai-coding-plan/glm-5.3', '--yes'], dir);
    expect(again.status).toBe(0);
    expect(again.stdout).not.toMatch(/- base set: \S+ created/); // всё skipped (wx-политика)
    expect(again.stdout).toMatch(/- base set: \S+ skipped/);
    expect(readFileSync(agentPath, 'utf-8')).toBe(before); // существующее не тронуто

    const list = runCli(['list', '--type', 'face'], dir).stdout;
    expect((list.match(/\[face\]/g) ?? []).length).toBe(6); // снова 6, не 12
  });

  it('контент отрендеренных агентов: agent-id ×6, ЛИЦО доставлено L1/plugin у воркеров, steward — тройка с plugin-inject (§11.3, §11.8)', () => {
    expect(runCli(['init', '--full', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    for (const a of AGENTS) {
      const body = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8');
      expect(body, a).toContain(`agent-id: ${a}`);
      expect(body, a).toContain('wolf:rendered base='); // штамп рендера
    }

    // тройка у воркеров (2.21.1): ЛИЦО доставляет L1/plugin — рамка ссылается
    // на доставленное лицо, самостоятельного wolf search у воркеров больше нет;
    // steward сохраняет полный контур plugin-inject + wolf search
    for (const a of WORKERS) {
      const body = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8');
      // 'playbook' в любом регистре: reviewer пишет «Playbook не расширяет TASK»
      expect(body.toLowerCase(), a).toContain('playbook');
      expect(body, a).toContain('доставленное лицо');
      expect(body, a).not.toContain('plugin-inject');
    }
    const stewardBody = readFileSync(join(dir, '.opencode/agents', 'steward.md'), 'utf-8');
    expect(stewardBody).toContain('plugin-inject');
    expect(stewardBody).toContain('wolf search');

    // словарь вердиктов ревьюера — полный enum в рамке worker-reviewer
    const reviewerBody = readFileSync(join(dir, '.opencode/agents', 'worker-reviewer.md'), 'utf-8');
    expect(reviewerBody).toContain('VERDICT: APPROVED | CHANGES_REQUIRED | INCONCLUSIVE');

    // using-skills в rendered-виде: инварианты редакции 2026-10-09
    const using = readFileSync(join(dir, '.opencode/skills/using-skills/SKILL.md'), 'utf-8');
    for (const marker of [
      'Обязательные процессные скиллы',
      'загрузи и проверь',
      'протокол ошибки масштаба',
      'режим меняет только L1',
      'Режим фиксирует L1',
      'Контракты передачи',
      'DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED',
    ])
      expect(using).toContain(marker);
  });

  it('worker-*: wolf_* MCP-тулы запрещены в rendered permission (изоляция памяти воркеров)', () => {
    expect(runCli(['init', '--full', '--model', 'zai-coding-plan/glm-5.3'], dir).status).toBe(0);

    // воркеры: deny обоих MCP-алиасов wolf (серверы «wolf» и «mr-wolf») внутри frontmatter
    for (const a of ['worker-implementer', 'worker-researcher', 'worker-reviewer']) {
      const body = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8');
      const frontmatter = body.split('---')[1] ?? '';
      for (const pat of ['wolf_\\*', 'mr-wolf_\\*']) {
        expect(frontmatter, `${a}: ${pat}`).toMatch(new RegExp(`["']?${pat}["']?:\\s*deny`));
      }
    }
    // не-воркеры запрета не получают
    for (const a of ['mr-wolf', 'executor-lead', 'steward']) {
      const body = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8');
      expect(body, a).not.toMatch(/["']?(wolf|mr-wolf)_\*["']?:\s*deny/);
    }
  });
});
