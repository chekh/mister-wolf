import { describe, it, expect } from 'vitest';
import { MemoryEventSchema, type MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
import { generateOpId, incompleteFaceOperations } from '../../../src/app/use-cases/face-operation.js';
import { getDeclaration } from '../../../src/domain/memory-types.js';
import { canTransition } from '../../../src/domain/governance.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';

// 2.17.1 REQ-03 (R04): контракты операции лица — события memory.face.op_*
// (design §3.3), lifecycle face += candidate (ADR-3), op_id в fields,
// чистые помощники журнала. Unit-уровень: схема/домен без ФС.

function ev(type: string, payload: Record<string, unknown>): MemoryEvent {
  return MemoryEventSchema.parse({
    id: 'evt_20261013_test_000001',
    type,
    timestamp: '2026-10-13T00:00:00.000Z',
    actor: 'agent:steward',
    payload,
  });
}

describe('REQ-03: события memory.face.op_* в схеме журнала', () => {
  it('op_started принимает обязательные ключи {opId, command, owner_skill, plan, input}', () => {
    expect(() =>
      ev('memory.face.op_started', {
        opId: 'faceop-1-aaaa',
        command: 'new',
        owner_skill: 'skill:demo',
        plan: ['add_face', 'g17_record', 'activate', 'supersede_prev', 'announce'],
        input: { command: 'new', ownerSkill: 'skill:demo', reason: 'r', body: 'b' },
      })
    ).not.toThrow();
  });

  it('op_started без plan отклоняется схемой', () => {
    expect(() =>
      ev('memory.face.op_started', { opId: 'x', command: 'new', owner_skill: 'skill:demo', input: {} })
    ).toThrow(/plan/);
  });

  it('op_step требует {opId, step}; op_committed — {opId}; op_aborted — {opId, by, reason}', () => {
    expect(() => ev('memory.face.op_step', { opId: 'x', step: 'add_face' })).not.toThrow();
    expect(() => ev('memory.face.op_step', { opId: 'x' })).toThrow(/step/);
    expect(() => ev('memory.face.op_committed', { opId: 'x' })).not.toThrow();
    expect(() => ev('memory.face.op_committed', {})).toThrow(/opId/);
    expect(() => ev('memory.face.op_aborted', { opId: 'x', by: 'user:owner', reason: 'r' })).not.toThrow();
    expect(() => ev('memory.face.op_aborted', { opId: 'x', by: 'user:owner' })).toThrow(/reason/);
  });
});

describe('REQ-03 (ADR-3): lifecycle face += candidate, fields += op_id', () => {
  it('candidate входит в lifecycle face; переходы candidate→active и candidate→archived разрешены', () => {
    const decl = getDeclaration('face');
    expect(decl.lifecycle).toContain('candidate');
    expect(canTransition('candidate', 'active')).toBe(true);
    expect(canTransition('candidate', 'archived')).toBe(true);
    expect(canTransition('active', 'superseded')).toBe(true);
  });

  it('op_id — необязательное строковое поле face', () => {
    const spec = getDeclaration('face').fields!['op_id']!;
    expect(spec).toEqual({ kind: 'string', optional: true });
  });
});

describe('REQ-03: generateOpId / incompleteFaceOperations', () => {
  it('generateOpId: faceop-<ts>-<rand4>', () => {
    const id = generateOpId(new SystemClock());
    expect(id).toMatch(/^faceop-\d{10,}-[0-9a-z]{4}$/);
    expect(generateOpId(new SystemClock())).not.toBe(id); // rand4 различает
  });

  const E = {
    started: (opId: string) =>
      ev('memory.face.op_started', { opId, command: 'new', owner_skill: 'skill:demo', plan: [], input: {} }),
    step: (opId: string, step: string) => ev('memory.face.op_step', { opId, step }),
    committed: (opId: string) => ev('memory.face.op_committed', { opId }),
    aborted: (opId: string) => ev('memory.face.op_aborted', { opId, by: 'user:owner', reason: 'r' }),
  };

  it('op_started без op_committed/op_aborted — неполный след с opId и признаком applied', () => {
    const out = incompleteFaceOperations([E.started('op-1'), E.step('op-1', 'activate')]);
    expect(out).toEqual([{ opId: 'op-1', command: 'new', ownerSkill: 'skill:demo', activated: true }]);
    expect(incompleteFaceOperations([E.started('op-2')])[0]!.activated).toBe(false);
  });

  it('committed/aborted закрывают след; чужие события игнорируются', () => {
    expect(incompleteFaceOperations([E.started('op-1'), E.committed('op-1')])).toEqual([]);
    expect(incompleteFaceOperations([E.started('op-1'), E.aborted('op-1')])).toEqual([]);
    expect(
      incompleteFaceOperations([E.started('op-1'), E.step('op-1', 'add_face'), ev('memory.added', { memory_id: 'm' })])
    ).toHaveLength(1);
  });
});
