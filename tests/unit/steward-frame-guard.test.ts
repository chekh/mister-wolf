import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 2.14 §7.3 (шаг 1 в рамке): протокол агрегации уроков в рамке Стюарда —
// без него контур неисполним (координатор зовёт, Стюард не знает шагов).
// Маркеры — по тексту секции «Агрегация уроков»; файл дизъюнктен с
// coordinator-frame-guard и base-frames-guard (поток B).
describe('steward frame guard (steward.md)', () => {
  it('keeps aggregation protocol markers (step 1 §7.3)', () => {
    const frame = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents', 'steward.md'),
      'utf-8'
    );
    // секция протокола присутствует
    expect(frame).toContain('Агрегация уроков');
    // механика шага 1: proposed-агрегат + рёбра aggregates
    expect(frame).toContain('status=proposed');
    expect(frame).toContain('aggregates');
    // контракт тела «было → стало → почему»
    expect(frame).toContain('## Было');
    expect(frame).toContain('## Стало');
    expect(frame).toContain('## Почему');
    // двухшаговость: подтверждение владельцем + перераспределение доставки
    expect(frame).toContain('wolf aggregate apply');
    expect(frame).toContain('trigger_keywords');
    expect(frame).toContain('перераспределение');
    // мутация лица — через память с исходом
    expect(frame).toContain('outcome_of');
  });
});
