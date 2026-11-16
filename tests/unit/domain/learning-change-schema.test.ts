// tests/unit/domain/learning-change-schema.test.ts
// 3.2.0 T-04 (REQ-03/REQ-05, design §5, S-09): валидируемая кодом схема
// кандидата — request_key детерминирован, сравнение содержимого исключает
// lifecycle-поля, строгая схема отклоняет неизвестные поля, разбор конверта
// из memory-объекта по тегу.
import { describe, it, expect } from 'vitest';
import {
  LEARNING_CHANGE_TAG,
  LearningCandidateInputSchema,
  LearningChangeEnvelopeSchema,
  learningCandidateContent,
  learningRequestKey,
  parseLearningChangeEnvelope,
  tryParseLearningChangeEnvelope,
  type LearningChangeEnvelope,
} from '../../../src/domain/schemas/learning-change-schema.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import { envelopeOf, validCandidateInput } from './learning-fixtures.js';

function taggedNote(tags: string[], body: string): MemoryObject {
  return { id: 'mem_test_candidate', tags, body } as unknown as MemoryObject;
}

describe('learningRequestKey (REQ-03, S-09: дедуп-ключ детерминирован)', () => {
  it('одинаковый вход → одинаковый ключ; источник reobserved под новым signal_id — тот же ключ', () => {
    const a = learningRequestKey(validCandidateInput());
    const b = learningRequestKey(validCandidateInput());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);

    const reobserved = validCandidateInput();
    reobserved.sources[0]!.signal_id = 'sig-1-repeat';
    expect(learningRequestKey(reobserved)).toBe(a); // дубль связывается с кандидатом
  });

  it('порядок sources/target_paths не влияет; проблема/ревизия/цель/проект — влияют', () => {
    const base = learningRequestKey(validCandidateInput());

    const reordered = validCandidateInput();
    reordered.scope = { ...reordered.scope, target_paths: [...reordered.scope.target_paths].reverse() };
    reordered.sources = [...reordered.sources].reverse();
    expect(learningRequestKey(reordered)).toBe(base);

    const newRevision = validCandidateInput();
    newRevision.sources[0]!.revision = 'r3';
    expect(learningRequestKey(newRevision)).not.toBe(base);

    const newProblem = validCandidateInput();
    newProblem.problem = 'different problem';
    expect(learningRequestKey(newProblem)).not.toBe(base);

    const newTarget = validCandidateInput();
    newTarget.scope.target_paths = ['skills/other/SKILL.md'];
    expect(learningRequestKey(newTarget)).not.toBe(base);

    const newProject = validCandidateInput();
    newProject.scope = { ...newProject.scope, project_id: 'proj-other' };
    expect(learningRequestKey(newProject)).not.toBe(base);
  });
});

describe('learningCandidateContent (S-09: конфликт = то же содержимое с тем же ключом)', () => {
  it('lifecycle-поля (phase, trial.result_ref, acceptance, change_id) не меняют содержимое', () => {
    const input = validCandidateInput();
    const proposed = envelopeOf(input);
    const trialled: LearningChangeEnvelope = {
      ...proposed,
      phase: 'trialled',
      change_id: 'lc-explicit',
      trial: { ...proposed.trial, result_ref: 'trial-1' },
      acceptance: { verdict: 'keep' },
    };
    expect(learningCandidateContent(trialled)).toBe(learningCandidateContent(proposed));
  });

  it('изменение candidate/baseline/sources даёт другое содержимое', () => {
    const input = validCandidateInput();
    const a = envelopeOf(input);
    const changedDiff = envelopeOf({
      ...input,
      candidate: { ...input.candidate, sha256: 'e'.repeat(64) },
    });
    const changedBaseline = envelopeOf({
      ...input,
      baseline: { ...input.baseline, model: 'other/model' },
    });
    expect(learningCandidateContent(changedDiff)).not.toBe(learningCandidateContent(a));
    expect(learningCandidateContent(changedBaseline)).not.toBe(learningCandidateContent(a));
  });
});

describe('строгие схемы (REQ-05 AC: unsupported field отклоняется кодом)', () => {
  it('вход создания: неизвестное поле верхнего уровня и вложенное — отказ', () => {
    expect(LearningCandidateInputSchema.safeParse({ ...validCandidateInput(), phase: 'proposed' }).success).toBe(false);
    expect(LearningCandidateInputSchema.safeParse({ ...validCandidateInput(), trial_id: 't1' }).success).toBe(false);
    const nested = validCandidateInput();
    (nested.scope as Record<string, unknown>).extra = 1;
    expect(LearningCandidateInputSchema.safeParse(nested).success).toBe(false);
  });

  it('обязательные полноты: applicability/sources/baseline пустые — отказ (S-08)', () => {
    const noApplicability = validCandidateInput();
    noApplicability.scope = { ...noApplicability.scope, applicability: [] };
    expect(LearningCandidateInputSchema.safeParse(noApplicability).success).toBe(false);

    const noSources = validCandidateInput();
    noSources.sources = [];
    expect(LearningCandidateInputSchema.safeParse(noSources).success).toBe(false);

    const noBaseline = validCandidateInput();
    noBaseline.baseline = { ...noBaseline.baseline, files: [] };
    expect(LearningCandidateInputSchema.safeParse(noBaseline).success).toBe(false);
  });

  it('hash-поля: не-sha256 отклоняется; observed_outcome=unknown валиден (REQ-03 unknown остаётся unknown)', () => {
    const badHash = validCandidateInput();
    badHash.candidate.sha256 = 'not-a-hash';
    expect(LearningCandidateInputSchema.safeParse(badHash).success).toBe(false);
    expect(LearningCandidateInputSchema.safeParse(validCandidateInput()).success).toBe(true);
  });

  it('конверт: phase вне словаря — отказ; все фазы design §5 входят', () => {
    const envelope = envelopeOf(validCandidateInput());
    expect(LearningChangeEnvelopeSchema.safeParse({ ...envelope, phase: 'active' }).success).toBe(true);
    expect(LearningChangeEnvelopeSchema.safeParse({ ...envelope, phase: 'published' }).success).toBe(false);
    expect(LearningChangeEnvelopeSchema.safeParse({ ...envelope, acceptance: { verdict: 'accept' } }).success).toBe(
      true
    );
  });
});

describe('разбор конверта из memory-объекта', () => {
  it('нет тега → null даже с валидным body', () => {
    const envelope = envelopeOf(validCandidateInput());
    expect(parseLearningChangeEnvelope(taggedNote([], JSON.stringify(envelope)))).toBeNull();
    expect(tryParseLearningChangeEnvelope(taggedNote([], JSON.stringify(envelope)))).toBeNull();
  });

  it('тег + валидный body → конверт', () => {
    const envelope = envelopeOf(validCandidateInput());
    expect(parseLearningChangeEnvelope(taggedNote([LEARNING_CHANGE_TAG], JSON.stringify(envelope)))).toEqual(envelope);
  });

  it('тег + битый body: parse бросает UserFacingError, tryParse — null (терпеливый скан)', () => {
    const broken = taggedNote([LEARNING_CHANGE_TAG], '{not json');
    expect(() => parseLearningChangeEnvelope(broken)).toThrow(/unreadable body/);
    expect(tryParseLearningChangeEnvelope(broken)).toBeNull();

    const wrongShape = taggedNote([LEARNING_CHANGE_TAG], JSON.stringify({ schema_version: 1 }));
    expect(() => parseLearningChangeEnvelope(wrongShape)).toThrow(/not a valid/);
    expect(tryParseLearningChangeEnvelope(wrongShape)).toBeNull();
  });
});
