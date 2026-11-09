import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 3.0.0, норма R-14: Стюард временно вне штатного роутинга — не вызывается
// ни агентами, ни скиллами; сигналы принимаются без ложного закрытия.
// Гард нормы R-14: автоматическая обработка Стюардом отключена, императивы
// вызова в рамке отсутствуют, жалобный контур сохранён (дизъюнктен с base-frames-guard).
describe('coordinator frame guard (R-14, mr-wolf.md)', () => {
  it('keeps no steward-imperative markers; complaint channel stays', () => {
    const frame = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents', 'mr-wolf.md'),
      'utf-8'
    );
    // R-14: маркеры цикла Стюарда отменены — ни recap, ни агрегации, ни вложенного вызова
    expect(frame).not.toContain('wolf recap');
    expect(frame).not.toContain('Стюард');
    expect(frame).not.toContain('steward');
    expect(frame).not.toContain('wolf aggregate apply');
    expect(frame).not.toContain('вложенный вызов');
    // жалобный контур сохранён: жалобы принимаются и сохраняются как данные
    expect(frame).toContain('wolf list --type complaint');
  });
});
