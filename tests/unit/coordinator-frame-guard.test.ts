import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 3.0.0, норма R-14: Стюард временно вне штатного роутинга — не вызывается
// ни агентами, ни скиллами; сигналы принимаются без ложного закрытия.
// 3.2.0 (REQ-02): wolf-steward вернулся в роутинг конечными поручениями
// (learning mode suggest/apply-approved); гард продолжает запрещать
// императивы СТАРОГО цикла (recap, aggregate apply, вложенный вызов) и
// голый legacy-actor `steward`; жалобный контур сохранён (дизъюнктен с base-frames-guard).
describe('coordinator frame guard (R-14 3.0.0 -> 3.2.0, mr-wolf.md)', () => {
  it('keeps no old-cycle steward imperatives; wolf-steward routed; complaint channel stays', () => {
    const frame = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'base', 'agents', 'mr-wolf.md'),
      'utf-8'
    );
    // старые маркеры цикла Стюарда отменены — ни recap, ни агрегации, ни вложенного вызова
    expect(frame).not.toContain('wolf recap');
    expect(frame).not.toContain('wolf aggregate apply');
    expect(frame).not.toContain('вложенный вызов');
    // голый legacy-actor `steward` не является целью роутинга; wolf-steward — легален (REQ-02)
    expect(frame).not.toMatch(/(?<![-\w])steward/i);
    // новый состав: wolf-steward разрешён в task-мапе и в ростере
    expect(frame).toContain('"wolf-steward": allow');
    expect(frame).toContain('wolf-steward');
    // жалобный контур сохранён: жалобы принимаются и сохраняются как данные
    expect(frame).toContain('wolf list --type complaint');
  });
});
