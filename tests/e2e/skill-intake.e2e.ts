// tests/e2e/skill-intake.e2e.ts
// E2E протокола wolf-skill-intake (спека 2.15 C1–C4): кандидат отклонён → призрак
// без регистрации → аппрув/установка/регистрация (add --type tool c owner_skill/
// version/source_url, шаг 5 обёртки) → жалоба на скилл → откат (archived НЕ гасит
// призрака — фильтр в memory-doctor.ts при сборке toolOwners). Внешний CLI
// `npx skills` не вызывается (сеть недетерминирована) — «установка» имитируется
// созданием файлов скилла. Паттерн base-set.e2e.ts / doctor-artifacts.e2e.ts:
// dist CLI + tmp-проект + tmp XDG (изоляция реестра), срез npm_command.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureBuilt } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');

/** Изоляция: tmp XDG (реестр проектов) + срез npm_command (npx-запуск теста не должен выглядеть как npx try-out CLI). */
function env(xdg: string): NodeJS.ProcessEnv {
  const { npm_command: _drop, ...rest } = process.env;
  return { ...rest, XDG_CONFIG_HOME: xdg };
}

function run(args: string[], cwd: string, xdg: string) {
  const r = spawnSync('node', [cli, ...args], { cwd, env: env(xdg), encoding: 'utf-8', timeout: 60_000 });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

describe('wolf skill-intake: призраки doctor и жизненный цикл регистрации (спека 2.15 C1–C4)', () => {
  let project: string;
  let xdg: string;
  let toolId: string;

  beforeAll(() => {
    // Один tmp-проект — один ВЫДЕЛЕННЫЙ XDG-реестр (урок mem_20261008_e2e_doctor_
    // razdelnye_xdg_reestry_na_tmp_2e907e: sandbox-prune в doctor вычищает tmp-пути
    // из ОБЩЕГО реестра; здесь проект один, но XDG всё равно свой — если в этом
    // файле появится второй tmp-проект, ему нужен отдельный XDG).
    xdg = mkdtempSync(join(tmpdir(), 'wolf-skill-intake-xdg-'));
    project = mkdtempSync(join(tmpdir(), 'wolf-skill-intake-'));
    writeFileSync(join(project, 'package.json'), '{ "name": "skill-intake-e2e" }');
    expect(run(['init', '--model', 'zai-coding-plan/glm-5.3'], project, xdg).status).toBe(0);
    // Гейт секции Artifacts в doctor: docs/dev/ существует.
    mkdirSync(join(project, 'docs', 'dev'), { recursive: true });
  });
  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(xdg, { recursive: true, force: true });
  });

  it('C1 кандидат отклонён: скилла и тул-объекта нет — doctor молчит о призраках', () => {
    const res = run(['doctor'], project, xdg);
    expect(res.status).toBe(0);
    // Ассерт «секции нет вообще» (а не «нет строк про призраков»): в чистом проекте
    // lint-находок нет ни по одной из 12 правил — секция печатается только при
    // findings.length > 0; это самый сильный детерминированный запрос и тот же
    // паттерн, что в doctor-artifacts.e2e.ts («чистый docs/dev: секции нет»).
    expect(res.stdout).not.toContain('## Artifacts');
    // и в памяти нет tool-объекта ghost-skill
    const list = run(['list', '--type', 'tool'], project, xdg);
    expect(list.status).toBe(0);
    expect(list.stdout).not.toContain('ghost-skill');
  });

  it('C2 призрак без регистрации: SKILL.md на диске, тул-объекта нет → находка doctor', () => {
    // имитация «установленного, но незарегистрированного» скилла (без npx skills)
    mkdirSync(join(project, '.opencode', 'skills', 'ghost-skill'), { recursive: true });
    writeFileSync(join(project, '.opencode', 'skills', 'ghost-skill', 'SKILL.md'), '---\nname: ghost-skill\n---\n');
    const res = run(['doctor'], project, xdg);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('## Artifacts (docs/dev)');
    // находка строкой `! <file>: <message>` (тексты находок — русские, english-surface гейт не задет)
    expect(res.stdout).toMatch(
      /^! \.opencode\/skills\/ghost-skill: скилл-призрак: .* без тул-объекта в памяти \(wolf add --type tool\)$/m
    );
  });

  it('C3 аппрув → установка → регистрация: тул-объект гасит призрака, поля на месте', () => {
    // Шаг 5 обёртки wolf-skill-intake дословно: CLI add --set (повторяемый k=v).
    // Выбран CLI, а не программный store: детерминирован и проверяет реальный
    // путь пользователя; owner_skill/version/source_url — объявленные
    // опциональные string-поля tool, parseSetPairs их принимает.
    const r = run(
      [
        'add',
        '--type',
        'tool',
        '--title',
        'skill: ghost-skill',
        '--set',
        'name=ghost-skill',
        '--set',
        'script_path=.opencode/skills/ghost-skill/SKILL.md',
        '--set',
        'language=markdown',
        '--set',
        'owner_skill=ghost-skill',
        '--set',
        'version=1.0.0',
        '--set',
        'source_url=https://example.com/ghost-skill',
      ],
      project,
      xdg
    );
    expect(r.status).toBe(0);
    toolId = r.stdout.match(/Created memory object: (\S+)/)?.[1] ?? '';
    expect(toolId).toMatch(/^mem_/);

    // живая регистрация (candidate) гасит призрака — ghost-skill больше нигде в doctor
    const doc = run(['doctor'], project, xdg);
    expect(doc.status).toBe(0);
    expect(doc.stdout).not.toContain('скилл-призрак');
    expect(doc.stdout).not.toContain('ghost-skill');

    // все три новых поля читаются обратно
    const got = run(['get', toolId], project, xdg);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('"owner_skill": "ghost-skill"');
    expect(got.stdout).toContain('"version": "1.0.0"');
    expect(got.stdout).toContain('"source_url": "https://example.com/ghost-skill"');
  });

  it('C4 жалоба на скилл: --about skill:<имя> → kind behavioral', () => {
    const r = run(
      [
        'complain',
        '--about',
        'skill:ghost-skill',
        '--rule',
        'шаг 2 скилла требует ревью-линзу',
        '--evidence',
        'установка прошла без ревью-линзы кандидата',
        '--proposal',
        'добавить гард перед шагом установки',
      ],
      project,
      xdg
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Complaint kind: behavioral');
  });

  it('C5 откат: transition archived — archived НЕ гасит призрака', () => {
    const r = run(['transition', toolId, 'archived'], project, xdg);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Transitioned ${toolId} to archived`);

    // фильтр в memory-doctor.ts: archived-тулы не попадают в toolOwners → призрак снова виден
    const doc = run(['doctor'], project, xdg);
    expect(doc.status).toBe(0);
    expect(doc.stdout).toContain('## Artifacts (docs/dev)');
    expect(doc.stdout).toMatch(/^! \.opencode\/skills\/ghost-skill: скилл-призрак:/m);
  });
});
