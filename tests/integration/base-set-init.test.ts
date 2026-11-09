// tests/integration/base-set-init.test.ts
// Полный `wolf init` в tmp-проекте, редакция S-DELIVERY 3.0.0: состав набора
// (9 агентов, 35 скиллов, 3 команды, БЕЗ плагинов и лиц) + идемпотентность
// повторного init + проверки контента отрендеренных файлов.
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

const MODEL = 'zai-coding-plan/glm-5.3';
const AGENTS = [
  'mr-wolf',
  'wolf-architect',
  'wolf-developer',
  'wolf-editor',
  'wolf-expert',
  'wolf-release-engineer',
  'wolf-researcher',
  'wolf-reviewer',
  'wolf-tester',
];
const MAP_FORM_DENY = [
  'wolf-architect',
  'wolf-developer',
  'wolf-editor',
  'wolf-release-engineer',
  'wolf-researcher',
  'wolf-reviewer',
  'wolf-tester',
];

describe('wolf init: базовый набор (S-DELIVERY 3.0.0)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-base-set-'));
    writeFileSync(join(dir, 'package.json'), '{ "name": "base-set-it" }');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('создаёт полный набор: 9 агентов, 35 скиллов, 3 команды, БЕЗ плагинов и лиц (R-08/R-11/R-12b)', () => {
    const res = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir);
    expect(res.status).toBe(0);

    // 13 файловых целей «created» (9 агентов + 3 команды + AGENTS.md); скиллы
    // печатаются как `[skill] <имя> → <файл>` — 55 файловых целей (35 SKILL.md + references/scripts).
    const created = (res.stdout.match(/- base set: \S+ created/g) ?? []).length;
    expect(created).toBe(13);
    expect((res.stdout.match(/\[skill\] /g) ?? []).length).toBe(55);
    expect(res.stdout).toMatch(/- base set: AGENTS\.md created/);

    const agents = readdirSync(join(dir, '.opencode/agents')).filter((f) => f.endsWith('.md'));
    expect(agents).toHaveLength(9);
    const installed = agents.map((f) => f.replace(/\.md$/, '')).sort();
    expect(installed).toEqual(AGENTS.slice().sort());

    const skills = readdirSync(join(dir, '.opencode/skills')).filter((d) =>
      existsSync(join(dir, '.opencode/skills', d, 'SKILL.md'))
    );
    expect(skills).toHaveLength(35);
    expect(skills).toContain('wolf-agent-language');
    expect(skills).toContain('wolf-memory');
    expect(skills).toContain('wolf-release');
    expect(skills).toContain('wolf-requirements');
    expect(skills).toContain('wolf-test');

    const commands = readdirSync(join(dir, '.opencode/command')).filter((f) => f.endsWith('.md'));
    expect(commands).toHaveLength(3);

    // R-12b: плагины вне автозагрузки — каталог не создаётся вовсе
    expect(existsSync(join(dir, '.opencode/plugins')), 'plugins не рендерятся').toBe(false);

    // R-08: лица не сеются; данных в памяти проекта нет
    expect(existsSync(join(dir, '.wolf/memory/shared/faces')), 'faces не сеются').toBe(false);
    const list = runCli(['list', '--type', 'face'], dir).stdout;
    expect(list.match(/\[face\]/g)).toBeNull();
  });

  it('повторный init: все файловые outcomes skipped, дублей нет', () => {
    expect(runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir).status).toBe(0);
    const agentPath = join(dir, '.opencode/agents/mr-wolf.md');
    const before = readFileSync(agentPath, 'utf-8');

    // повторный init на живом проекте — под K6-гейтом подтверждения: --yes применяет план
    const again = runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL, '--yes'], dir);
    expect(again.status).toBe(0);
    expect(again.stdout).not.toMatch(/- base set: \S+ created/); // всё skipped (wx-политика)
    expect(again.stdout).toMatch(/- base set: \S+ skipped/);
    expect(readFileSync(agentPath, 'utf-8')).toBe(before); // существующее не тронуто

    const list = runCli(['list', '--type', 'face'], dir).stdout;
    expect(list.match(/\[face\]/g)).toBeNull(); // лица не появились
  });

  it('контент отрендеренных агентов: agent-id ×9, штампы, словари исследователя/ревьюера, using-skills (§11.3)', () => {
    expect(runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir).status).toBe(0);

    for (const a of AGENTS) {
      const body = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8');
      expect(body, a).toContain(`agent-id: ${a}`);
      expect(body, a).toContain('wolf:rendered base='); // штамп рендера
      expect(body, a).not.toContain('{{model.'); // плейсхолдеры подставлены
      expect(body, a).not.toContain('{{tool.'); // манифест-контракт рендера
    }

    // исследователь: честный отчёт с пробелами; ревьюер: словарь вердиктов
    const researcher = readFileSync(join(dir, '.opencode/agents/wolf-researcher.md'), 'utf-8');
    expect(researcher).toContain('FINDINGS/CONFIDENCE/GAPS');
    expect(researcher).toContain('QUESTION/NEEDS_CONTEXT');
    const reviewer = readFileSync(join(dir, '.opencode/agents/wolf-reviewer.md'), 'utf-8');
    expect(reviewer).toContain('APPROVED | CHANGES_REQUIRED | INCONCLUSIVE');

    // исполнители не нанимают (map-форма permission; wolf-expert — list-form permissions)
    for (const a of MAP_FORM_DENY) {
      const fm = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8').split('---')[1] ?? '';
      expect(fm, `${a}: task deny`).toMatch(/task:\s*deny/);
    }
    const expertFm = readFileSync(join(dir, '.opencode/agents/wolf-expert.md'), 'utf-8').split('---')[1] ?? '';
    expect(expertFm).toContain("action: 'task'");
    expect(expertFm).toContain("effect: 'deny'");
    const mrWolfFm = readFileSync(join(dir, '.opencode/agents/mr-wolf.md'), 'utf-8').split('---')[1] ?? '';
    expect(mrWolfFm).toMatch(/"wolf-developer":\s*allow/); // нанимает wolf-*

    // using-skills в rendered-виде: маршруты и плотность
    const core = readFileSync(join(dir, '.opencode/skills/using-skills/SKILL.md'), 'utf-8');
    expect(core).toContain('references/routes-intent.md');
    expect(core).toContain('density standard|draft');
    const labor = join(dir, '.opencode/skills/using-skills/references/division-of-labor.md');
    expect(existsSync(labor), 'division-of-labor доставлен').toBe(true);
    expect(readFileSync(labor, 'utf-8')).toContain(
      readFileSync(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          '../../templates/base/skills/using-skills/references/division-of-labor.md'
        ),
        'utf-8'
      )
    );
  });

  it('wolf-*: wolf_* MCP-тулы запрещены в rendered permission (изоляция памяти исполнителей)', () => {
    expect(runCli(['init', '--full', '--platform', 'opencode', '--model', MODEL], dir).status).toBe(0);

    // исполнители (map-форма): deny обоих MCP-алиасов wolf (серверы «wolf» и «mr-wolf») внутри frontmatter
    for (const a of MAP_FORM_DENY) {
      const body = readFileSync(join(dir, '.opencode/agents', `${a}.md`), 'utf-8');
      const frontmatter = body.split('---')[1] ?? '';
      for (const pat of ['wolf_\\*', 'mr-wolf_\\*']) {
        expect(frontmatter, `${a}: ${pat}`).toMatch(new RegExp(`["']?${pat}["']?:\\s*deny`));
      }
    }
    // wolf-expert (list-форма): deny-записи перекрывают всё, кроме read/glob/grep
    const expertFm = readFileSync(join(dir, '.opencode/agents/wolf-expert.md'), 'utf-8').split('---')[1] ?? '';
    expect(expertFm).toMatch(/\{\s*action:\s*'\*',\s*resource:\s*'\*',\s*effect:\s*'deny'\s*\}/);
    // mr-wolf запрета не получает
    const mrWolfFm = readFileSync(join(dir, '.opencode/agents/mr-wolf.md'), 'utf-8');
    expect(mrWolfFm).not.toMatch(/["']?(wolf|mr-wolf)_\*["']?:\s*deny/);
  });
});
