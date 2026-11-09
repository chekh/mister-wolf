import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';

// A1.2 (REQ-12), редакция S-DELIVERY 3.0.0: носитель плотности standard|draft
// доставляется базовым набором в контракт TASK (using-skills, execution) и в
// тела всех восьми исполнителей wolf-*; лиц больше нет. Гард против регресса:
// без носителя тест падает — плотность не текст-пожелание, а ось.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const base = join(root, 'templates/base');
const harness = join(root, 'templates/opencode');
const projects: string[] = [];
const renderer = () => new OpencodeBaseSetRenderer(base, { harnessTemplatesRoot: harness, setVersion: '9.9.9' });
const project = () => {
  const path = mkdtempSync(join(tmpdir(), 'wolf-density-'));
  projects.push(path);
  return path;
};

const EXECUTORS = [
  'wolf-architect',
  'wolf-developer',
  'wolf-editor',
  'wolf-expert',
  'wolf-release-engineer',
  'wolf-researcher',
  'wolf-reviewer',
  'wolf-tester',
];

const sourceRead = (rel: string) => readFileSync(join(base, rel), 'utf8');

afterEach(() => {
  for (const path of projects.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('density mode (standard|draft) delivery through the real base set', () => {
  it('delivers the density axis in the TASK execution contract', async () => {
    const path = project();
    await renderer().renderBaseSet(path, { models: { primary: 'test/primary', worker: 'test/worker' } });
    const read = (file: string) => readFileSync(join(path, '.opencode', file), 'utf8');
    const using = read('skills/using-skills/SKILL.md');
    // Ось — носитель в блоке execution, отдельная от execute|solve и FULL/LITE/FIX.
    expect(using).toContain('density standard|draft');
    // Отсутствие поля трактуется как standard (совместимость, NFR-01).
    expect(using).toContain('отсутствие поля — standard');
    // Draft сокращает запись, не основания; неопределённость расширяет анализ.
    expect(using).toContain('сохраняя основания');
    expect(using).toContain('Существенная неопределённость');
  });

  it('delivers the density axis to every executor frame (no faces anymore)', async () => {
    const path = project();
    await renderer().renderBaseSet(path, { models: { primary: 'test/primary', worker: 'test/worker' } });
    for (const role of EXECUTORS) {
      const body = readFileSync(join(path, '.opencode/agents', `${role}.md`), 'utf8');
      expect(body, role).toContain('density standard|draft');
      expect(body, role).toContain('возврат нанимателю');
    }
    // отсутствующие роли не возвращаются: старых носителей плотности нет
    expect(sourceRead('agents/mr-wolf.md')).not.toContain('executor-lead');
  });

  it('keeps researcher and reviewer reports honest under the axis', async () => {
    const path = project();
    await renderer().renderBaseSet(path, { models: { primary: 'test/primary', worker: 'test/worker' } });
    const researcher = readFileSync(join(path, '.opencode/agents/wolf-researcher.md'), 'utf8');
    const reviewer = readFileSync(join(path, '.opencode/agents/wolf-reviewer.md'), 'utf8');
    // исследователь: findings с явными пробелами и возвратом нанимателю
    expect(researcher).toContain('FINDINGS/CONFIDENCE/GAPS');
    expect(researcher).toContain('QUESTION/NEEDS_CONTEXT');
    // ревьюер: вердикт-словарь сохранён
    expect(reviewer).toContain('APPROVED | CHANGES_REQUIRED | INCONCLUSIVE');
  });

  it('keeps observation scenarios fixture valid for the A1.1-based comparison', () => {
    const fixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/a1-2-density/scenarios.json'), 'utf8')) as {
      baseline: string;
      scenarios: Array<{ id: string; expectation: string }>;
    };
    expect(fixture.baseline).toBe('2.23.3');
    expect(fixture.scenarios.map((s) => s.id)).toEqual([
      'S1-small-unambiguous',
      'S2-substantial-unknown',
      'S3-full-lite-in-draft',
    ]);
    for (const scenario of fixture.scenarios) expect(scenario.expectation.length).toBeGreaterThan(20);
  });
});
