import { describe, it, expect } from 'vitest';
import {
  selectMicroNotes,
  MICRO_NOTE_TAG,
  CONSTRAINT_TAG,
  DEFAULT_MICRO_NOTE_BUDGET,
} from '../../src/app/use-cases/micro-note-delivery.js';
import {
  deliverableMicroNote,
  suppressionBlockState,
  remainingBlockNotice,
} from '../../src/app/use-cases/micro-note-delivery.js';
import { learningSignalRevision } from '../../src/domain/learning-signals.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';
import type { MicroNoteSuppressionRecord } from '../../src/ports/micro-note-delivery-log.port.js';

// 3.2.0 T-09 (test-plan S-17/S-18, REQ-09): адресный selector micro-notes.
// S-17: другая среда/stale/superseded не доставляются; подходящая доставляется
// с точным id+версией; пустой результат — без каких-либо LLM-вызовов (селектор —
// чистая детерминированная функция, модельных зависимостей в модуле нет).
// S-18: малый бюджет → optional сокращаются/отбрасываются; constraint не выбрасывается.

function note(id: string, overrides: Partial<MemoryObject> & Record<string, unknown> = {}): MemoryObject {
  return {
    title: `Note ${id}`,
    body: `Body of ${id}.`,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [MICRO_NOTE_TAG],
    superseded_by: null,
    type: 'note',
    id,
    ...overrides,
  } as MemoryObject;
}

function suppression(
  id: string,
  revision: string,
  overrides: Partial<MicroNoteSuppressionRecord> = {}
): MicroNoteSuppressionRecord {
  return {
    memory_id: id,
    revision,
    reason: 'observed contradiction',
    note_evidence: `${id}@${revision.slice(0, 12)}`,
    contradiction_evidence: 'observed behavior contradicts the note',
    suppressed_at: '2026-11-16T00:00:00Z',
    resolved_at: null,
    resolution: null,
    ...overrides,
  };
}

describe('selectMicroNotes (S-17: applicability and liveness)', () => {
  it('wrong environment is not delivered; matching note delivered with exact id@version', () => {
    const winOnly = note('n_win', { applies: { environments: ['win32'] } });
    const darwin = note('n_darwin', { applies: { environments: ['darwin'] } });
    const result = selectMicroNotes([winOnly, darwin], { environment: 'darwin' });
    expect(result.delivered.map((c) => c.id)).toEqual(['n_darwin']);
    const rev = learningSignalRevision(darwin);
    expect(result.blocks[0]).toContain(`[n_darwin@${rev.slice(0, 12)}]`);
  });

  it('stale/superseded/conflicting notes are not delivered (S-17, REQ-09 AC)', () => {
    const objects = [
      note('n_stale', { status: 'stale' }),
      note('n_superseded', { superseded_by: 'n_new' }),
      note('n_conflict', { status: 'conflicting' }),
      note('n_rejected', { review_state: 'rejected' }),
      note('n_ok'),
    ];
    const result = selectMicroNotes(objects, { environment: 'darwin' });
    expect(result.delivered.map((c) => c.id)).toEqual(['n_ok']);
    expect(result.selected.map((c) => c.id)).toEqual(['n_ok']);
  });

  it('no fitting notes → empty result, nothing selected (no model call possible: pure function)', () => {
    const objects = [note('n_other_env', { applies: { environments: ['linux'] } })];
    const result = selectMicroNotes(objects, { environment: 'darwin' });
    expect(result.blocks).toEqual([]);
    expect(result.selected).toEqual([]);
    expect(result.delivered).toEqual([]);
    expect(result.dropped).toEqual([]);
    expect(result.underReview).toEqual([]);
  });

  it('malformed applies → fail-closed; missing applies → universal', () => {
    const malformed = note('n_bad', { applies: 'win32' });
    const malformedList = note('n_bad_list', { applies: { environments: ['darwin', 42] } });
    const universal = note('n_any');
    const result = selectMicroNotes([malformed, malformedList, universal], { environment: 'darwin' });
    expect(result.delivered.map((c) => c.id)).toEqual(['n_any']);
  });

  it('version prefix rule: 3.2 matches 3.2.0; target substring matches', () => {
    const versioned = note('n_ver', { applies: { versions: ['3.2'] } });
    const other = note('n_ver31', { applies: { versions: ['3.1'] } });
    const targeted = note('n_target', { applies: { targets: ['src/ports'] } });
    const result = selectMicroNotes([versioned, other, targeted], {
      version: '3.2.0',
      target: 'src/ports/learning-signal-index.port.ts',
    });
    // deterministic order: same importance → id ascending
    expect(result.delivered.map((c) => c.id)).toEqual(['n_target', 'n_ver']);
  });
});

describe('selectMicroNotes (S-18: volume budget keeps constraints)', () => {
  it('small budget drops optional notes, keeps the constraint', () => {
    const constraint = note('n_constraint', {
      tags: [MICRO_NOTE_TAG, CONSTRAINT_TAG],
      body: 'Never run npm run build in parallel waves.',
    });
    const optionalA = note('n_opt_a', { body: 'A'.repeat(100) });
    const optionalB = note('n_opt_b', { body: 'B'.repeat(100) });
    const result = selectMicroNotes([optionalA, constraint, optionalB], { environment: 'darwin' }, { maxChars: 120 });
    expect(result.delivered.map((c) => c.id)).toEqual(['n_constraint']);
    expect(result.blocks.join('\n')).toContain('Never run npm run build in parallel waves.');
    expect(result.dropped.map((c) => c.id).sort()).toEqual(['n_opt_a', 'n_opt_b']);
  });

  it('mandatory note text is shortened, not discarded, when alone over budget', () => {
    const constraint = note('n_big_constraint', {
      tags: [MICRO_NOTE_TAG, CONSTRAINT_TAG],
      body: 'X'.repeat(5000),
    });
    const result = selectMicroNotes([constraint], { environment: 'darwin' }, { maxChars: 100 });
    expect(result.delivered).toHaveLength(1);
    expect(result.delivered[0]!.block.length).toBeLessThanOrEqual(1250);
    expect(result.blocks).toHaveLength(1);
  });

  it('maxNotes caps optional records only', () => {
    const optional = (id: string): MemoryObject => note(id, { body: 'short' });
    const result = selectMicroNotes(
      [optional('a'), optional('b'), optional('c')],
      { environment: 'darwin' },
      { maxNotes: 2 }
    );
    expect(result.delivered).toHaveLength(2);
    expect(result.dropped).toHaveLength(1);
    expect(DEFAULT_MICRO_NOTE_BUDGET.maxNotes).toBe(8);
    expect(DEFAULT_MICRO_NOTE_BUDGET.maxChars).toBe(4800);
  });

  it('deterministic order: mandatory first, then importance desc, id asc', () => {
    const optLow = note('n_low', { importance: 0.2, body: 'low' });
    const optHigh = note('n_high', { importance: 0.9, body: 'high' });
    const constraint = note('n_constraint', { tags: [MICRO_NOTE_TAG, CONSTRAINT_TAG] });
    const result = selectMicroNotes([optLow, optHigh, constraint], { environment: 'darwin' });
    expect(result.delivered.map((c) => c.id)).toEqual(['n_constraint', 'n_high', 'n_low']);
  });
});

describe('selectMicroNotes (S-27: contradiction suppression, selector side)', () => {
  it('open conflict on the same revision keeps the note out of delivery and marks it for review', () => {
    const obj = note('n_conf');
    const rev = learningSignalRevision(obj);
    const result = selectMicroNotes([obj], { environment: 'darwin' }, {}, [suppression('n_conf', rev)]);
    expect(result.delivered).toEqual([]);
    expect(result.underReview).toEqual([{ id: 'n_conf', revision: rev, reason: 'observed contradiction' }]);
    // both evidences stay visible in the record (S-27: nothing deleted)
    expect(result.underReview[0]!.revision).toBe(rev);
  });

  it('resolved conflict → note delivers again', () => {
    const obj = note('n_conf');
    const rev = learningSignalRevision(obj);
    const resolved = suppression('n_conf', rev, { resolved_at: '2026-11-17T00:00:00Z', resolution: 'note confirmed' });
    const result = selectMicroNotes([obj], { environment: 'darwin' }, {}, [resolved]);
    expect(result.delivered.map((c) => c.id)).toEqual(['n_conf']);
    expect(result.underReview).toEqual([]);
  });

  it('note revised after the conflict → new revision delivers; audit record untouched', () => {
    const original = note('n_rev');
    const revOriginal = learningSignalRevision(original);
    const revised = note('n_rev', { body: 'Body of n_rev (corrected).', updated_at: '2026-11-17T00:00:00Z' });
    const revNew = learningSignalRevision(revised);
    expect(revNew).not.toBe(revOriginal);
    const result = selectMicroNotes([revised], { environment: 'darwin' }, {}, [suppression('n_rev', revOriginal)]);
    expect(result.delivered.map((c) => c.id)).toEqual(['n_rev']);
    expect(result.delivered[0]!.revision).toBe(revNew);
    expect(result.underReview).toEqual([]);
  });
});

// --- REQ-321-5 (R-5): тело микро-заметки доставляется в пределах бюджета ---

describe('selectMicroNotes (REQ-321-5: full body within budget)', () => {
  it('AC-5.1: multi-line body is delivered in full when it fits the budget', () => {
    const obj = note('n_build', { body: 'Build note\nNEVER run deploy before approval' });
    const result = selectMicroNotes([obj], { environment: 'darwin' });
    expect(result.delivered.map((c) => c.id)).toEqual(['n_build']);
    const text = result.blocks.join('\n');
    expect(text).toContain('Build note');
    expect(text).toContain('NEVER run deploy before approval');
  });

  it('AC-5.2: budget-clipped text carries a visible truncation marker, not a silent cut', () => {
    const obj = note('n_big', { tags: [MICRO_NOTE_TAG, CONSTRAINT_TAG], body: 'X'.repeat(5000) });
    const result = selectMicroNotes([obj], { environment: 'darwin' }, { maxChars: 100 });
    expect(result.delivered).toHaveLength(1);
    expect(result.blocks.join('\n')).toContain('truncated');
    expect(result.blocks[0]!.length).toBeLessThanOrEqual(1250);
  });

  it('AC-5.3: constraint-tagged note keeps every line of the limit within budget', () => {
    const obj = note('n_c', {
      tags: [MICRO_NOTE_TAG, CONSTRAINT_TAG],
      body: 'Build note\nNEVER run deploy before approval',
    });
    const result = selectMicroNotes([obj], { environment: 'darwin' });
    expect(result.delivered.map((c) => c.id)).toEqual(['n_c']);
    const text = result.blocks.join('\n');
    expect(text).toContain('Build note');
    expect(text).toContain('NEVER run deploy before approval');
    expect(result.dropped).toEqual([]);
  });
});

// --- REQ-321-2 (AC-2.4): worktree-scope учитывается и в микро-селекторе ---

describe('selectMicroNotes (AC-2.4: worktree scope)', () => {
  /** Подмена видимости copy (та же форма, что у createWorktreeVisibility). */
  const visibility = (visibleIds: Record<string, boolean>) => ({
    isVisible: (o: Record<string, unknown>): boolean => visibleIds[o.id as string] ?? true,
    conflicts: (): string[] => [],
    currentToken: null,
    identity: undefined,
  });

  it('micro-note scoped to a foreign worktree is not delivered in main', () => {
    const scoped = note('n_foreign_wt', { scope: 'worktree:w-fedcba987654' });
    const result = selectMicroNotes(
      [scoped, note('n_ok')],
      { environment: 'darwin' },
      {},
      [],
      visibility({ n_foreign_wt: false })
    );
    expect(result.delivered.map((c) => c.id)).toEqual(['n_ok']);
    expect(result.blocks.join('\n')).not.toContain('n_foreign_wt');
  });

  it('micro-note scoped to the own worktree is delivered in its copy', () => {
    const scoped = note('n_own_wt', { scope: 'worktree:w-0123456789ab' });
    const result = selectMicroNotes([scoped], { environment: 'darwin' }, {}, [], visibility({ n_own_wt: true }));
    expect(result.delivered.map((c) => c.id)).toEqual(['n_own_wt']);
  });
});

// REQ-333-6 (AC-6.2): честные статусы — deliverableMicroNote (да/нет/неизвестно),
// block: unknown для не-deliverable заметки (класс r6 «block: actual» после
// снятия тега исчезает), remainingBlockNotice для resolve (единый текст CLI/MCP).
describe('REQ-333-6: honest statuses (deliverableMicroNote, suppressionBlockState, remainingBlockNotice)', () => {
  const rev = learningSignalRevision(note('n6'));

  function openSup(memoryId: string, revision: string, suffix: string = memoryId): MicroNoteSuppressionRecord {
    return suppression(memoryId, revision, { suppression_id: `cnr_20261119_${suffix}` });
  }

  it('deliverable: yes — deliverable micro-note with no open records besides the considered one', () => {
    const n = note('n6');
    const own = openSup('n6', rev);
    expect(deliverableMicroNote(n, [own], own.suppression_id)).toBe('yes');
    // посторонняя запись другой заметки не мешает
    expect(deliverableMicroNote(n, [own, openSup('other', rev)], own.suppression_id)).toBe('yes');
  });

  it('deliverable: no — another open record blocks the current revision; tag removed; superseded', () => {
    const n = note('n6');
    const own = openSup('n6', rev);
    const other = openSup('n6', rev, 'n6b');
    expect(deliverableMicroNote(n, [own, other], own.suppression_id)).toBe('no'); // заблокирована другой
    expect(deliverableMicroNote(note('n6', { tags: [] }), [own], own.suppression_id)).toBe('no'); // тег снят
    expect(
      deliverableMicroNote(note('n6', { status: 'superseded', superseded_by: 'mem_new' }), [own], own.suppression_id)
    ).toBe('no'); // superseded
    // разрешённая запись не блокирует
    expect(deliverableMicroNote(n, [own, { ...other, resolved_at: '2026-11-19T00:00:00Z' }], own.suppression_id)).toBe(
      'yes'
    );
  });

  it('deliverable: unknown — the note is missing from the store', () => {
    expect(deliverableMicroNote(undefined, [openSup('gone', rev)], 'cnr_x')).toBe('unknown');
  });

  it('block: unknown — the note exists but is not a deliverable micro-note (r6: tag removed, same revision)', () => {
    const record = openSup('n6', rev);
    expect(suppressionBlockState(record, note('n6', { tags: [] }))).toBe('unknown'); // было 'actual' — дефект r6
    expect(suppressionBlockState(record, note('n6', { status: 'superseded', superseded_by: 'mem_new' }))).toBe(
      'unknown'
    );
    // регресс: отредактированная deliverable-заметка — по-прежнему superseded
    expect(suppressionBlockState(record, note('n6'))).toBe('actual');
    expect(suppressionBlockState(record, note('n6', { body: 'Edited body.' }))).toBe('superseded');
    expect(suppressionBlockState(record, undefined)).toBe('unknown');
  });

  it('remainingBlockNotice: still blocked counts remaining open records on the current revision', () => {
    const n = note('n6');
    expect(remainingBlockNotice(n, [openSup('n6', rev)])).toBe(
      'Note still blocked by 1 open contradiction(s) on the current revision'
    );
    expect(remainingBlockNotice(n, [openSup('n6', rev), openSup('n6', rev)])).toContain('by 2 open');
    expect(remainingBlockNotice(n, [])).toBe('No other open contradictions on the current revision — delivery resumes');
    // записи других ревизий/заметок и разрешённые не считаются
    expect(remainingBlockNotice(n, [openSup('n6', 'deadbeef'.repeat(8)), openSup('other', rev)])).toBe(
      'No other open contradictions on the current revision — delivery resumes'
    );
  });
});
