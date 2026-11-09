import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 2.15: guard ключевых секций скиллов конвейера (прецедент base-frames-guard 2.14 P323).
// Редакция S-DELIVERY 3.0.0: двухуровневая модель — удалённые роли заменены
// совместимыми входами (D-2); маркеры — имена скиллов, термины, статусы
// (не редакционные обороты).
const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'skills');
const read = (name: string) => readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8');

describe('conveyor skills guard (2.15, редакция 3.0.0)', () => {
  it('wolf-design keeps contracts, ADR and no-implementation rule', () => {
    const s = read('wolf-design');
    expect(s).toContain('Контракты задавай типами/схемами');
    expect(s).toContain('Не вставляй готовую реализацию продукта');
    expect(s).toContain('ADR');
    expect(s).toContain('approved requirements');
    expect(s).toContain('покрытия REQ/NFR');
    expect(s).toContain('revision:path:symbol');
  });

  it('wolf-testplan keeps independent oracle and REQ/NFR coverage', () => {
    const s = read('wolf-testplan');
    expect(s).toContain('test-plan.md');
    expect(s).toContain('Given/When/Then');
    expect(s).toContain('oracle');
    expect(s).toContain('derived verification');
    expect(s).toContain('REQ/NFR');
    expect(s).toContain('не скрывай нестабильность ретраями');
  });

  it('wolf-brainstorm outputs requirements with explicit unknowns and CR trail', () => {
    const s = read('wolf-brainstorm');
    expect(s).toContain('requirements.md');
    expect(s).toContain('Неразрешённое пометь явно');
    expect(s).toContain('Сохрани CR');
    expect(s).toContain('Roadmap-триаж');
    expect(s).toContain('Не помечай approved при неподтверждённом scope');
    expect(s).toContain('wolf-design');
  });

  it('wolf-plan consumes requirements+design; checkbox acceptance is source of truth', () => {
    const s = read('wolf-plan');
    expect(s).toContain('TASK из using-skills');
    expect(s).toContain('[x] ставит приёмник задачи');
    expect(s).toContain('не доказывает приёмку');
    expect(s).toContain('Исполнение FULL не стартует до этой сверки');
    expect(s).toContain('wolf-execute');
  });

  it('wolf-review keeps verdict vocabulary, budget stop and security-lens log', () => {
    const s = read('wolf-review');
    expect(s).toContain('UNRESOLVED');
    expect(s).toContain('SUMMARY/VERDICT/FINDINGS/SCOPE/LIMITS/EVIDENCE');
    expect(s).toContain('artifact revision');
    expect(s).toContain('Security/trust обязателен');
    expect(s).toContain('## Гейт');
    expect(s).toContain('неизменённые результаты переиспользуй только при доказанной применимости');
  });

  it('deprecated skills are compatible entries pointing at surviving skills', () => {
    const sdd = read('wolf-sdd');
    expect(sdd).toContain('Загрузить `wolf-execute` один раз');
    expect(sdd).toContain('Переходная мера: удалить в следующем релизе');
    expect(read('using-git-worktrees')).toContain('Загрузить `wolf-git` один раз');
    expect(read('finishing-a-development-branch')).toContain('Загрузить `wolf-git` один раз');
    const exec = read('wolf-execute');
    expect(exec).toContain('TASK/RESULT/EVIDENCE');
    expect(exec).toContain('диспетчеризация');
    expect(exec).toContain('не имитирует вызов');
    expect(exec).toContain('Саморевью не независимо');
  });

  it('discipline axis: review entry, RED/GREEN, evidence and acceptance vocabulary', () => {
    const rcr = read('receiving-code-review');
    expect(rcr).toContain('Загрузить `wolf-review` один раз');
    expect(rcr).toContain('Переходная мера: удалить в следующем релизе');
    const ws = read('writing-skills');
    expect(ws).toContain('Трассировка');
    expect(ws).toContain('пробной доставке');
    const tdd = read('test-driven-development');
    expect(tdd).toContain('Запусти RED');
    expect(tdd).toContain('GREEN');
    const vbc = read('verification-before-completion');
    expect(vbc).toContain('INCONCLUSIVE, а не');
    expect(vbc).toContain('[x] в плане ставит приёмник задачи');
    expect(vbc).toContain('ACCEPTED | PARTIAL | REJECTED | INCONCLUSIVE');
  });
});
