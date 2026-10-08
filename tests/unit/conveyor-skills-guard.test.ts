import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 2.15: guard ключевых секций скиллов конвейера (прецедент base-frames-guard 2.14 P323).
const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'skills');
const read = (name: string) => readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8');

describe('conveyor skills guard (2.15)', () => {
  it('wolf-design keeps contracts and prohibitions', () => {
    const s = read('wolf-design');
    expect(s).toContain('Контракты');
    expect(s).toContain('≤ 10 строк');
    expect(s).toContain('Копипаста реализации');
    expect(s).toContain('ADR');
    expect(s).toContain('approved');
    expect(s).toContain('NFR-NN');
  });

  it('wolf-testplan keeps GWT-per-REQ mapping', () => {
    const s = read('wolf-testplan');
    expect(s).toContain('REQ-NN');
    expect(s).toContain('Given/When/Then');
    expect(s).toContain('Маппинг');
    expect(s).toContain('КРАСНОЙ фазы');
  });

  it('wolf-brainstorm v2 outputs requirements anatomy and roadmap triage', () => {
    const s = read('wolf-brainstorm');
    expect(s).toContain('requirements.md');
    expect(s).toContain('[НЕОПРЕДЕЛЕНО');
    expect(s).toContain('Журнал изменений (CR)');
    expect(s).toContain('roadmap-триаж');
    expect(s).toContain('backlog.md');
    expect(s).toContain('rejected.md');
  });

  it('wolf-plan v2 consumes requirements+design; checkbox is source of truth', () => {
    const s = read('wolf-plan');
    expect(s).toContain('design.md');
    expect(s).toContain('единственный источник контрактов');
    expect(s).toContain('- [ ]');
    expect(s).toContain('истина завершённости');
    expect(s).toContain('file:line');
  });

  it('wolf-review v2 reviews file pairs with owner gates', () => {
    const s = read('wolf-review');
    expect(s).toContain('одна пара файлов');
    expect(s).toContain('plan.md ↔ design.md');
    expect(s).toContain('Гейты');
    expect(s).toContain('ADR');
    expect(s).toContain('после аппрува предыдущей');
    expect(s).toContain('review.md');
  });

  it('wolf-sdd/wolf-execute consume plan checkboxes and test-plan validation', () => {
    expect(read('wolf-sdd')).toContain('сделано → коммит');
    expect(read('wolf-sdd')).toContain('test-plan.md');
    expect(read('wolf-execute')).toContain('FLAT-fallback');
    expect(read('wolf-execute')).toContain('сделано → коммит');
  });
});
