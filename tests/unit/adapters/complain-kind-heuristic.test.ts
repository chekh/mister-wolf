import { describe, it, expect } from 'vitest';
import { inferComplaintKind } from '../../../src/adapters/cli/commands/memory-complain.js';

// Волна 2.14 §6.1: дефолт-эвристика kind по about — три ветки спеки.
describe('complain kind heuristic (2.14 §6.1)', () => {
  it('about = базовый агент или skill:<имя> → behavioral', () => {
    for (const agent of ['executor-lead', 'mr-wolf', 'steward', 'worker-implementer', 'worker-reviewer']) {
      expect(inferComplaintKind(agent), agent).toBe('behavioral');
    }
    expect(inferComplaintKind('skill:apprentice')).toBe('behavioral');
  });

  it('about = mem-id → technical', () => {
    expect(inferComplaintKind('mem_20260930_zhaloba_same_title_817efd')).toBe('technical');
  });

  it('прочее → без kind (undefined): явный выбор — только через флаг --kind', () => {
    expect(inferComplaintKind('что-угодно')).toBeUndefined();
    expect(inferComplaintKind('agent-unknown')).toBeUndefined();
  });
});
