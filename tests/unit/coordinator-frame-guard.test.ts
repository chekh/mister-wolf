import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 2.14 §7.1 (триггер 1): цикловой триггер Стюарда в рамке координатора —
// recap после приёмки отчётов + вложенный вызов steward + подтверждение
// владельцем. Гард против регресса шаблона (дизъюнктен с base-frames-guard).
describe('coordinator frame guard (mr-wolf.md)', () => {
  it('keeps aggregation cycle-trigger markers: recap + steward + apply', () => {
    const frame = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents', 'mr-wolf.md'),
      'utf-8'
    );
    // координатор обнаруживает: recap-строка неагрегированных
    expect(frame).toContain('wolf recap');
    expect(frame).toContain('Стюард: агрегация');
    // диспетчеризация вложенным вызовом, не автоспавн
    expect(frame).toContain('opencode run --agent steward');
    // двухшаговость: подтверждает владелец
    expect(frame).toContain('wolf aggregate apply');
  });
});
