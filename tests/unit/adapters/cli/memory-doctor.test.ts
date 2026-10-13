// tests/unit/adapters/cli/memory-doctor.test.ts
// Волна 2.17 T-06 (test-plan §NFR-02): lintFaces — чистая механика doctor-проверок
// лиц: дубликат канонического face, битый based_on, legacy+face одновременно,
// face вне контракта (записи, отбракованные парсером store — вход faceProblems).
import { describe, it, expect } from 'vitest';
import { lintFaces } from '../../../../src/adapters/cli/commands/memory-doctor.js';
import type { MemoryObject } from '../../../../src/domain/schemas/memory-object-schema.js';

type Fm = Record<string, unknown>;

function mem(id: string, fm: Fm): MemoryObject {
  return {
    id,
    type: 'note',
    title: id,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-10-13T10:00:00Z',
    updated_at: '2026-10-13T10:00:00Z',
    created_by: 'user:cli',
    source: { kind: 'manual' },
    ...fm,
  } as MemoryObject;
}

function face(id: string, fm: Fm = {}): MemoryObject {
  return mem(id, {
    type: 'face',
    owner_skill: 'skill:demo',
    version: '1',
    reason: 'initial',
    initiator: 'steward',
    ...fm,
  });
}

/** Legacy-playbook: note + facet howto + owner_skill (alias-резолв playbook даёт то же). */
function legacy(id: string, fm: Fm = {}): MemoryObject {
  return mem(id, { facet: 'howto', owner_skill: 'skill:demo', ...fm });
}

describe('lintFaces (2.17 NFR-02: гигиена канонических лиц)', () => {
  it('(а) два активных face одного owner_skill — duplicate canonical face на каждом дубле; superseded не считается', () => {
    const findings = lintFaces(
      [
        face('mem_a', { version: '1', status: 'superseded' }),
        face('mem_b', { version: '2' }),
        face('mem_c', { version: '3' }),
      ],
      []
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.file).sort()).toEqual(['mem_b', 'mem_c']);
    for (const f of findings) expect(f.issue).toContain('duplicate canonical face for skill:demo');
  });

  it('единственный активный face с валидным based_on — находок нет', () => {
    const findings = lintFaces(
      [face('mem_a'), face('mem_b', { version: '2', based_on: 'mem_a', status: 'superseded' })],
      []
    );
    expect(findings).toEqual([]);
  });

  it('(в) based_on указывает на несуществующий id — находка на записи-версии', () => {
    const findings = lintFaces([face('mem_a', { based_on: 'mem_ghost' })], []);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('mem_a');
    expect(findings[0]!.issue).toContain('based_on mem_ghost does not exist');
  });

  it('(г) активная legacy-playbook рядом с face — находка с указанием wolf face migrate; superseded/archived legacy чисты', () => {
    const dirty = lintFaces([face('mem_f'), legacy('mem_l')], []);
    expect(dirty).toHaveLength(1);
    expect(dirty[0]!.file).toBe('mem_l');
    expect(dirty[0]!.issue).toContain('active legacy playbook for skill:demo');
    expect(dirty[0]!.issue).toContain('wolf face migrate');

    const clean = lintFaces(
      [face('mem_f'), legacy('mem_old', { status: 'superseded' }), legacy('mem_arch', { status: 'archived' })],
      []
    );
    expect(clean).toEqual([]);
  });

  it('(г) legacy-playbook без face — норма до миграции; howto без owner_skill — не лицо (REQ-02 AC4)', () => {
    expect(lintFaces([legacy('mem_l')], [])).toEqual([]);
    const noOwner = mem('mem_howto', { facet: 'howto' });
    expect(lintFaces([face('mem_f'), noOwner], [])).toEqual([]);
  });

  it('(б) face вне контракта (файл отбракован парсером) — находка по пути файла', () => {
    const findings = lintFaces([], [{ path: 'shared/faces/mem_broken.md', error: 'Required' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('shared/faces/mem_broken.md');
    expect(findings[0]!.issue).toContain('face does not match its contract');
  });
});
