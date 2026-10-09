import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 2.15: guard ключевых секций скиллов конвейера (прецедент base-frames-guard 2.14 P323).
// Редакция 2026-10-09: маркеры — имена скиллов, термины, статусы (не редакционные обороты).
const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'skills');
const read = (name: string) => readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8');

describe('conveyor skills guard (2.15)', () => {
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

  it('wolf-plan consumes requirements+design; L1-set checkbox is source of truth', () => {
    const s = read('wolf-plan');
    expect(s).toContain('TASK из using-skills');
    expect(s).toContain('[x] ставит L1');
    expect(s).toContain('не доказывает приёмку');
    expect(s).toContain('Исполнение FULL не стартует до этой сверки');
    expect(s).toContain('wolf-sdd');
    expect(s).toContain('wolf-execute');
  });

  it('wolf-review keeps verdict vocabulary, budget stop and security-lens log', () => {
    const s = read('wolf-review');
    expect(s).toContain('UNRESOLVED');
    expect(s).toContain('VERDICT: APPROVED | CHANGES_REQUIRED | INCONCLUSIVE');
    expect(s).toContain('artifact revision');
    expect(s).toContain('security-линзы зафиксируй в review.md');
    expect(s).toContain('Гейты');
    expect(s).toContain('прежнее одобрение не переносится');
  });

  it('wolf-sdd/wolf-execute keep worker-no-commit and linear fallback semantics', () => {
    const sdd = read('wolf-sdd');
    expect(sdd).toContain('Воркер не коммитит; L1 фиксирует результат');
    expect(sdd).toContain('task-local');
    expect(sdd).toContain('из test-plan');
    const exec = read('wolf-execute');
    expect(exec).toContain('TASK/RESULT/EVIDENCE');
    expect(exec).toContain('диспетчеризация недоступна');
    expect(exec).toContain('саморевью не выдавай за независимое');
  });

  it('discipline axis: review labels, RED/GREEN, evidence and worktree ownership', () => {
    const rcr = read('receiving-code-review');
    expect(rcr).toContain('ACCEPTED, REFUTED, DEFERRED или NEEDS_CLARIFICATION');
    expect(rcr).toContain('Отсутствие ответа ревьюера не означает одобрения');
    const ws = read('writing-skills');
    expect(ws).toContain('Трассировка');
    expect(ws).toContain('wolf-skill-intake');
    const tdd = read('test-driven-development');
    expect(tdd).toContain('Запусти RED');
    expect(tdd).toContain('GREEN');
    const vbc = read('verification-before-completion');
    expect(vbc).toContain('INCONCLUSIVE, а не');
    expect(vbc).toContain('[x] в плане ставит L1');
    expect(read('using-git-worktrees')).toContain('.worktrees/<task>');
    expect(read('finishing-a-development-branch')).toContain('Не предлагай недоступное действие как исполнимое');
    expect(read('finishing-a-development-branch')).toContain(
      'Не удаляй branch/worktree до подтверждения успешной интеграции'
    );
  });
});
