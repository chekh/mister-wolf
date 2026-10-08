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
});
