import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 3.0.0 (двухуровневая модель): гард жалобного контура и ревью-маркеров
// нового набора — mr-wolf.md принимает жалобы через `wolf list --type complaint`
// и принимает результат по evidence («как проверяли»); wolf-reviewer.md несёт
// вердикт-маркер и task-deny (специалист не делегирует).
describe('base frames guard', () => {
  it('mr-wolf.md keeps complaint-channel and evidence-acceptance markers', () => {
    // tests/unit → корень репо = 2 уровня вверх (бриф давал 3 — вылезал в .worktrees/)
    const frame = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents', 'mr-wolf.md'),
      'utf-8'
    );
    expect(frame).toContain('wolf list --type complaint');
    expect(frame).toContain('как проверяли');
  });

  it('wolf-reviewer.md keeps verdict marker and task-deny', () => {
    const reviewer = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents', 'wolf-reviewer.md'),
      'utf-8'
    );
    expect(reviewer).toContain('Вердикт APPROVED');
    expect(reviewer).toContain('task: deny');
  });
});
