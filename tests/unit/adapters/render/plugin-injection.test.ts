// tests/unit/adapters/render/plugin-injection.test.ts
// Юнит-тест чистой функции инъекции из harness-шаблона плагина (Task 13.3,
// спека §9: H3 идемпотентность, MAJ-1 повторная инъекция, MAJ-4 усечение L2,
// m13 fail-safe).
import { describe, expect, it } from 'vitest';
import { computeInjection, MARKER } from '../../../../templates/opencode/plugins/wolf-session-start.js';

interface Part {
  type: string;
  text?: string;
}
interface Msg {
  info: { role: string };
  parts: Part[];
}
const msg = (text: string): Msg => ({ info: { role: 'user' }, parts: [{ type: 'text', text }] });
const withMarker = [msg(`<session_context>\n${MARKER}\n\n## Recap\n…\n</session_context>`), msg('дальше')];
const fresh = [msg('новый вопрос после /clear')];

const GOVERNANCE = ['1%-правило', 'SUBAGENT-STOP', 'Лестница приоритетов', 'process-скиллы', 'rigid', 'flexible'];
const DISPATCH = ['1%', 'SUBAGENT-STOP', 'Лестница приоритетов', 'process-скиллы'];

describe('computeInjection (wolf-session-start, спека §5.4)', () => {
  it('маркер в транскрипте → null (H3: идемпотентность по маркеру)', () => {
    expect(computeInjection(withMarker, 'mr-wolf')).toBeNull();
  });

  it('маркера нет → инъекция; полный governance-набор для L0/L1 (H2)', () => {
    const out = computeInjection(fresh, 'executor-lead');
    expect(typeof out).toBe('string');
    for (const marker of [...GOVERNANCE, '{{tool.skill}}']) expect(out).toContain(marker);
    // контракт рендера: только разрешённые плейсхолдеры (manifest.substitute не упадёт)
    expect(out).not.toMatch(/\{\{tool\.(?!skill\b|task\b|todowrite\b)\w+\}\}/);
  });

  it('agentId worker-* → усечённое тело: нет диспетчерского контура, пассивный режим (MAJ-4, §11.8)', () => {
    const out = computeInjection(fresh, 'worker-implementer');
    expect(typeof out).toBe('string');
    expect(out).toContain('пассив');
    expect(out).toContain('rigid');
    expect(out).toContain('flexible');
    for (const marker of DISPATCH) expect(out).not.toContain(marker);
  });

  it('agentId L0/L1 (mr-wolf, steward, без id) → полное тело', () => {
    for (const id of ['mr-wolf', 'steward', 'executor-lead', null, '']) {
      const out = computeInjection(fresh, id as string | null);
      expect(out, `agentId=${String(id)}`).toContain('1%-правило');
    }
  });

  it('MAJ-1: кэша на процесс нет — маркер исчез → инъекция снова', () => {
    expect(computeInjection(withMarker, 'mr-wolf')).toBeNull();
    const again = computeInjection(fresh, 'mr-wolf');
    expect(typeof again).toBe('string');
    expect(again).toContain('1%-правило');
  });

  it('fail-safe (m13): битый вход → null/строка, никогда не бросает', () => {
    expect(() => computeInjection(null as unknown as Msg[], 'x')).not.toThrow();
    expect(computeInjection(null as unknown as Msg[], 'x')).toBeNull();
    expect(() => computeInjection([] as Msg[], 'x')).not.toThrow();
    const empty = computeInjection([] as Msg[], 'x');
    // контракт маркера: пустой транскрипт — маркера нет → инъекция
    expect(empty === null || typeof empty === 'string').toBe(true);
    expect(() => computeInjection([{} as unknown as Msg, 'junk' as unknown as Msg], 'worker-x')).not.toThrow();
  });
});
