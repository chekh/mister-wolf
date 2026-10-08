// tests/e2e/doctor-artifacts.e2e.ts
// E2E секции Artifacts в wolf doctor (спека §4-A3): грязный docs/dev → находка по
// каждой подложенной проблеме; чистый docs/dev → секции нет. Паттерн base-set.e2e.ts:
// dist CLI + tmp-проекты + tmp XDG (изоляция реестра), срез npm_command.
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

/** Грязный requirements.md: дубль REQ-01 + дубликат текста требования, REQ-02 без AC/Источник,
 * НЕОПРЕДЕЛЕНО в approved, CR без downstream. */
const REQ_DIRTY = [
  '---',
  'slug: x',
  'status: approved',
  '---',
  '',
  '### REQ-01 — a',
  '- Требование: Когда щелчок, система должна сохранить.',
  '- AC: z',
  '- Источник: d',
  '',
  '### REQ-01 — b',
  '- Требование: когда  ЩЕЛЧОК,  система должна сохранить.',
  '- AC: z',
  '- Источник: d',
  '',
  '### REQ-02 — c',
  '- Требование: когда  ЩЕЛЧОК,  система должна сохранить.',
  '- История: пусто',
  '',
  '[НЕОПРЕДЕЛЕНО: вопрос владельцу]',
  '',
  '- CR-2026-10-08-01: поменяли REQ-01 — владелец',
  '',
].join('\n');

describe('wolf doctor — секция Artifacts (спека §4-A3)', () => {
  let dirty: string;
  let clean: string;
  let xdgDirty: string;
  let xdgClean: string;

  beforeAll(() => {
    // Отдельные XDG: doctor вычищает tmp-проекты из СВОЕГО реестра (sandbox-prune),
    // общий реестр сделал бы чистый прогон пустым → ранний выход мимо гейта секции.
    xdgDirty = mkdtempSync(join(tmpdir(), 'wolf-doctor-artifacts-xdg-dirty-'));
    xdgClean = mkdtempSync(join(tmpdir(), 'wolf-doctor-artifacts-xdg-clean-'));

    dirty = mkdtempSync(join(tmpdir(), 'wolf-doctor-artifacts-dirty-'));
    writeFileSync(join(dirty, 'package.json'), '{ "name": "doctor-artifacts-dirty" }');
    expect(run(['init', '--model', 'zai-coding-plan/glm-5.3'], dirty, xdgDirty).status).toBe(0);
    const xFolder = join(dirty, 'docs', 'dev', '2026-10-08-x');
    mkdirSync(xFolder, { recursive: true });
    writeFileSync(join(xFolder, 'requirements.md'), REQ_DIRTY);
    writeFileSync(
      join(xFolder, 'design.md'),
      ['---', 'slug: x', 'status: draft', '---', '', 'см. REQ-99', ''].join('\n')
    );
    const roadmap = join(dirty, 'docs', 'dev', 'roadmap');
    mkdirSync(roadmap, { recursive: true });
    writeFileSync(join(roadmap, 'backlog.md'), '- Конвейер: части индексов\n');
    writeFileSync(join(roadmap, 'wave-2.16.md'), '- Конвейер: части  индексов\n');
    mkdirSync(join(dirty, '.opencode', 'skills', 'ghost-skill'), { recursive: true });

    clean = mkdtempSync(join(tmpdir(), 'wolf-doctor-artifacts-clean-'));
    writeFileSync(join(clean, 'package.json'), '{ "name": "doctor-artifacts-clean" }');
    expect(run(['init', '--model', 'zai-coding-plan/glm-5.3'], clean, xdgClean).status).toBe(0);
    mkdirSync(join(clean, 'docs', 'dev'), { recursive: true });
  });

  afterAll(() => {
    rmSync(dirty, { recursive: true, force: true });
    rmSync(clean, { recursive: true, force: true });
    rmSync(xdgDirty, { recursive: true, force: true });
    rmSync(xdgClean, { recursive: true, force: true });
  });

  it('грязный docs/dev: секция с находкой по каждой подложенной проблеме', () => {
    const res = run(['doctor'], dirty, xdgDirty);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('## Artifacts (docs/dev)');
    // строки находок — верхнеуровневые "! " (issues проектов в doctor печатаются с отступом)
    const bangs = res.stdout.split('\n').filter((l) => l.startsWith('! '));
    expect(bangs.length).toBeGreaterThanOrEqual(7);
    for (const needle of [
      'REQ-01',
      'REQ-99',
      'CR-',
      '[НЕОПРЕДЕЛЕНО',
      'дубликат требования',
      'пункт роадмапа в двух файлах',
      'ghost-skill',
    ]) {
      expect(res.stdout).toContain(needle);
    }
  });

  it('чистый docs/dev: секции нет вообще', () => {
    const res = run(['doctor'], clean, xdgClean);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('## Artifacts');
  });
});
