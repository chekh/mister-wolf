import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpencodeBaseSetRenderer } from '../../../../src/adapters/render/opencode/opencode-renderer.js';

// A1.2 (REQ-12): носитель плотности standard|draft доставляется базовым набором
// в контракт TASK (execution), рамки агентов и лица (плейбуки). Гард против
// регресса: без носителя тест падает — плотность не текст-пожелание, а ось.
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
    expect(using).toContain('standard');
    // Draft сокращает запись, не основания; неопределённость расширяет анализ.
    expect(using).toContain('основания');
    expect(using).toContain('неопределённост');
  });

  it('delivers the contract to the lead frame and the lead playbook', async () => {
    const path = project();
    await renderer().renderBaseSet(path, { models: { primary: 'test/primary', worker: 'test/worker' } });
    const lead = readFileSync(join(path, '.opencode/agents/executor-lead.md'), 'utf8');
    expect(lead).toContain('density standard|draft');
    // Приёмка сверяет наблюдаемые действия и результат, а не ярлык draft в RESULT.
    expect(lead).toContain('ярлык');
    expect(sourceRead('playbooks/executor-lead-playbook.md')).toContain('density standard|draft');
    expect(sourceRead('playbooks/executor-lead-playbook.md').toLowerCase()).toContain('плотность');
  });

  it('delivers executor behavior to the implementer frame and playbook', async () => {
    const path = project();
    await renderer().renderBaseSet(path, { models: { primary: 'test/primary', worker: 'test/worker' } });
    const impl = readFileSync(join(path, '.opencode/agents/worker-implementer.md'), 'utf8');
    expect(impl).toContain('плотность');
    expect(impl).toContain('неопределённост');
    expect(sourceRead('playbooks/worker-implementer-playbook.md').toLowerCase()).toContain('плотность');
    expect(sourceRead('playbooks/worker-implementer-playbook.md')).toContain('draft');
  });

  it('keeps researcher and reviewer reports honest in draft', async () => {
    const path = project();
    await renderer().renderBaseSet(path, { models: { primary: 'test/primary', worker: 'test/worker' } });
    const researcher = readFileSync(join(path, '.opencode/agents/worker-researcher.md'), 'utf8');
    const reviewer = readFileSync(join(path, '.opencode/agents/worker-reviewer.md'), 'utf8');
    expect(researcher).toContain('draft');
    expect(researcher).toContain('GAPS');
    expect(reviewer).toContain('draft');
    expect(reviewer).toContain('вердикт');
    expect(sourceRead('playbooks/worker-researcher-playbook.md').toLowerCase()).toContain('плотность');
    expect(sourceRead('playbooks/worker-reviewer-playbook.md').toLowerCase()).toContain('плотность');
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
