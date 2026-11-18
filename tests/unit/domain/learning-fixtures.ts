// tests/unit/domain/learning-fixtures.ts
// 3.2.0 T-04: общие фикстуры контракта кандидата для unit/integration тестов
// (не тест-файл: импорт из .test.ts дублировал бы регистрацию тестов).
import {
  learningRequestKey,
  type LearningCandidateInput,
  type LearningChangeEnvelope,
} from '../../../src/domain/schemas/learning-change-schema.js';

/** Валидный вход создания кандидата (REQ-05: проблема, источники, границы,
 * цель, baseline hash, diff, польза, негативные сценарии, оракул, бюджет,
 * откат). */
export function validCandidateInput(): LearningCandidateInput {
  return {
    kind: 'skill_delta',
    problem: 'agents keep pasting external commands into the shell',
    goal: 'gate shell commands through a confirmation checklist',
    expected_benefit: 'fewer accidental destructive commands',
    scope: {
      project_id: 'proj-demo',
      target_paths: ['skills/shell-guard/SKILL.md'],
      applicability: ['projects with shell access', 'not for read-only sandboxes'],
    },
    sources: [
      {
        signal_id: 'sig-1',
        ref: 'mem_20261117_abc123',
        revision: 'r2',
        source: 'complaint',
        context: 'complaint about a near-miss rm -rf',
        observed_outcome: 'unknown',
      },
    ],
    baseline: {
      files: [{ path: 'skills/shell-guard/SKILL.md', sha256: 'a'.repeat(64) }],
      model: 'company/code',
      harness: 'opencode',
    },
    candidate: {
      diff_ref: 'patches/shell-guard-r2.diff',
      sha256: 'b'.repeat(64),
      rationale: 'the checklist adds a confirmation step',
      negative_cases: ['false trigger on git status', 'missing context: no shell tool'],
    },
    trial: { suite_ref: 'trials/shell-guard', oracle_sha256: 'c'.repeat(64), budget: { tool_calls: 12 } },
    rollback: { previous_ref: 'faces/skill:demo@v3', expected_active_sha256: 'd'.repeat(64) },
  };
}

/** Конверт фазы proposed, как его пишет saveLearningCandidate. */
export function envelopeOf(input: LearningCandidateInput): LearningChangeEnvelope {
  return {
    schema_version: 1,
    change_id: 'lc-test',
    request_key: learningRequestKey(input),
    phase: 'proposed',
    kind: input.kind,
    problem: input.problem,
    goal: input.goal,
    expected_benefit: input.expected_benefit,
    scope: input.scope,
    sources: input.sources,
    baseline: input.baseline,
    candidate: input.candidate,
    trial: { ...input.trial, result_ref: null },
    acceptance: null,
    activation: null,
    rollback: input.rollback,
  };
}
