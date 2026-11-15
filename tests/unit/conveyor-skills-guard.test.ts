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
    expect(s).toContain('Specify contracts as types/schemas');
    expect(s).toContain('do not insert a ready-made product implementation');
    expect(s).toContain('ADR');
    expect(s).toContain('approved requirements');
    expect(s).toContain('REQ/NFR coverage map');
    expect(s).toContain('revision:path:symbol');
  });

  it('wolf-testplan keeps independent oracle and REQ/NFR coverage', () => {
    const s = read('wolf-testplan');
    expect(s).toContain('test-plan.md');
    expect(s).toContain('Given/When/Then');
    expect(s).toContain('oracle');
    expect(s).toContain('derived verification');
    expect(s).toContain('REQ/NFR');
    expect(s).toContain('do not hide instability with retries');
  });

  it('wolf-brainstorm outputs requirements with explicit unknowns and CR trail', () => {
    const s = read('wolf-brainstorm');
    expect(s).toContain('requirements.md');
    expect(s).toContain('Mark the unresolved explicitly');
    expect(s).toContain('Keep the CR');
    expect(s).toContain('roadmap triage');
    expect(s).toContain('unconfirmed scope');
    expect(s).toContain('wolf-design');
  });

  it('wolf-plan consumes requirements+design; checkbox acceptance is source of truth', () => {
    const s = read('wolf-plan');
    expect(s).toContain('a TASK from using-skills');
    expect(s).toContain('`[x]` is set by the task\'s acceptance owner');
    expect(s).toContain('does not prove acceptance');
    expect(s).toContain('FULL execution starts only after that');
    expect(s).toContain('wolf-execute');
  });

  it('wolf-review keeps verdict vocabulary, budget stop and security-lens log', () => {
    const s = read('wolf-review');
    expect(s).toContain('UNRESOLVED');
    expect(s).toContain('SUMMARY/VERDICT/FINDINGS/SCOPE/LIMITS/EVIDENCE');
    expect(s).toContain('artifact revision');
    expect(s).toContain('Security/trust is mandatory');
    expect(s).toContain('## Gate');
    expect(s).toContain('reuse unchanged results only with proven applicability');
  });

  it('deprecated skills are compatible entries pointing at surviving skills', () => {
    const sdd = read('wolf-sdd');
    expect(sdd).toContain('Load `wolf-execute` once');
    expect(sdd).toContain('Transitional measure: remove in the next release');
    expect(read('using-git-worktrees')).toContain('Load `wolf-git` once');
    expect(read('finishing-a-development-branch')).toContain('Load `wolf-git` once');
    const exec = read('wolf-execute');
    expect(exec).toContain('TASK/RESULT/EVIDENCE');
    expect(exec).toContain('dispatching');
    expect(exec).toContain('not an imitated call');
    expect(exec).toContain('Self-review is not independent');
  });

  it('discipline axis: review entry, RED/GREEN, evidence and acceptance vocabulary', () => {
    const rcr = read('receiving-code-review');
    expect(rcr).toContain('Load `wolf-review` once');
    expect(rcr).toContain('Transitional measure: remove in the next release');
    const ws = read('writing-skills');
    expect(ws).toContain('## Tracing');
    expect(ws).toContain('trial delivery');
    const tdd = read('test-driven-development');
    expect(tdd).toContain('Run RED');
    expect(tdd).toContain('GREEN');
    const vbc = read('verification-before-completion');
    expect(vbc).toContain('INCONCLUSIVE, not');
    expect(vbc).toContain("[x] is set by the task's acceptance owner");
    expect(vbc).toContain('ACCEPTED | PARTIAL | REJECTED | INCONCLUSIVE');
  });
});
