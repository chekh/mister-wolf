import { describe, it, expect } from 'vitest';
import { buildTypeSchema } from '../../src/domain/type-schema-builder.js';
import { SYNTHESIS_DECL } from '../../src/domain/memory-types.js';
import { extractSynthesisMeta } from '../../src/app/use-cases/build-analytics.js';
import type { MemoryObject } from '../../src/domain/schemas/memory-object-schema.js';

// 2.18.0 REQ-01 (A9), test-plan S-04/S-05 (+S-51 legacy): synthesis v2 —
// схема (accepted_claims required min 1) + extractSynthesisMeta.

type Extra = Record<string, unknown>;

function synthesis(extra: Extra = {}): Extra {
  return {
    id: 'syn-x',
    title: 'synthesis',
    type: 'synthesis',
    status: 'accepted',
    review_state: 'accepted',
    confidence: 'high',
    importance: 0.5,
    created_at: '2026-09-01T06:00:00Z',
    updated_at: '2026-09-01T06:00:00Z',
    created_by: 'agent:alpha',
    source: { kind: 'manual' },
    body: '',
    ...extra,
  };
}

describe('S-04: extractSynthesisMeta читает все 5 полей v2-синтеза', () => {
  it('возвращает accepted_claims/rejected_alternatives/unresolved_dissent/confidence/required_validation', () => {
    const meta = extractSynthesisMeta(
      synthesis({
        accepted_claims: ['claim-1', 'claim-2'],
        rejected_alternatives: [{ claim: 'полный rewrite', reason: 'риск потери данных' }],
        unresolved_dissent: ['оценка нагрузки расходится'],
        confidence: 'high',
        required_validation: ['нагрузочный тест на playground-lab'],
      }) as MemoryObject
    );
    expect(meta).toEqual({
      accepted_claims: ['claim-1', 'claim-2'],
      rejected_alternatives: [{ claim: 'полный rewrite', reason: 'риск потери данных' }],
      unresolved_dissent: ['оценка нагрузки расходится'],
      confidence: 'high',
      required_validation: ['нагрузочный тест на playground-lab'],
    });
  });
});

describe('S-05: synthesis без accepted_claims отклоняется схемой', () => {
  it('ошибка указывает на accepted_claims (required, min 1)', () => {
    const schema = buildTypeSchema(SYNTHESIS_DECL);
    const result = schema.safeParse(synthesis({ body: 'X' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'accepted_claims')).toBe(true);
    }
  });
});

describe('S-51 (NFR-01): legacy-синтез без новых полей читается', () => {
  it('extractSynthesisMeta → пустые списки, confidence по умолчанию medium, без падения', () => {
    // legacy-объект: ни v2-полей, ни confidence (raw passthrough) — дефолт ADR-9
    const { confidence: _omit, ...legacy } = synthesis();
    const meta = extractSynthesisMeta(legacy as MemoryObject);
    expect(meta).toEqual({
      accepted_claims: [],
      rejected_alternatives: [],
      unresolved_dissent: [],
      confidence: 'medium',
      required_validation: [],
    });
  });
});
