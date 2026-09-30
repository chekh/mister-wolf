import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 2.14: рамка лида содержит эскалационную строку жалобного контура
// (поведенческие жалобы → steward-mutation) — гард против регресса шаблона.
describe('base frames guard', () => {
  it('executor-lead.md keeps behavioral-escalation markers', () => {
    // tests/unit → корень репо = 2 уровня вверх (бриф давал 3 — вылезал в .worktrees/)
    const frame = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents', 'executor-lead.md'),
      'utf-8'
    );
    expect(frame).toContain('kind=behavioral');
    expect(frame).toContain('steward');
  });
});
