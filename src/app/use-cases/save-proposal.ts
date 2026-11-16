// src/app/use-cases/save-proposal.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import {
  LEARNING_CHANGE_TAG,
  LearningCandidateInputSchema,
  LearningChangeEnvelopeSchema,
  learningCandidateContent,
  learningRequestKey,
  tryParseLearningChangeEnvelope,
  type LearningCandidateInput,
  type LearningChangeEnvelope,
} from '../../domain/schemas/learning-change-schema.js';
import { resolveLearningMode, type LearningMode, type LearningModeConfig } from '../../domain/learning-mode.js';
import { resolveCreatedBy } from '../../domain/actor.js';
import { UserFacingError } from '../../domain/errors.js';
import { addMemoryObject } from './add-memory-object.js';

/** Волна 2.17 T-09 (REQ-08, design §«Сигнал-фасет proposal»): сохранение
 * предложения — сигнал-фасет поверх note ЧЕРЕЗ addMemoryObject (валидация
 * контракта — тот же superRefine schema-builder, событие memory.added,
 * индексация; прецедент — design строка 158). Автор пиннится env-атрибуцией:
 * параметра-актора у API нет, подмена через флаг невозможна (REQ-09 AC3,
 * ADR-5). delivered_at вне схемы сохранения — заполняет только deliverProposal. */

export interface SaveProposalDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  declarations?: readonly MemoryTypeDeclaration[];
  /** Атрибуция только из env (WOLF_ACTOR), по умолчанию process.env. */
  env?: NodeJS.ProcessEnv;
}

export interface SaveProposalInput {
  /** Любой адресат, включая 'user:owner' и вышестоящих (REQ-08, Q3). */
  addressee: string;
  /** Наблюдение/опыт — основание предложения. */
  basis: string;
  proposedChange: string;
  expectedBenefit: string;
  /** CR-2026-10-13-01: границы применимости обязательны наравне с остальными. */
  applicabilityBounds: string;
  title?: string;
  body?: string;
  /** 3.2.0 T-04: доп. теги записи (конверт кандидата несёт свой маркер-тег). */
  tags?: string[];
  /** 3.2.0 T-04: доп. части отпечатка id после штатных трёх полей. */
  idFingerprintExtra?: string[];
}

/** proposal-запись: контрактные поля приходят через passthrough-схему. */
export type ProposalObject = MemoryObject & {
  facet: 'proposal';
  addressee: string;
  basis: string;
  proposed_change: string;
  expected_benefit: string;
  applicability_bounds: string;
  delivered_at?: string;
};

const CLIP = 60; // прецедент обрезки title — memory-complain.ts:71

export async function saveProposal(deps: SaveProposalDeps, input: SaveProposalInput): Promise<ProposalObject> {
  // Пиннинг автора: только env (REQ-09 AC3) — флага/параметра нет структурно
  const createdBy = resolveCreatedBy(undefined, deps.env ?? process.env);
  const shortChange =
    input.proposedChange.length > CLIP ? `${input.proposedChange.slice(0, CLIP)}…` : input.proposedChange;
  const { object } = await addMemoryObject(
    {
      store: deps.store,
      log: deps.log,
      clock: deps.clock,
      idGen: deps.idGen,
      index: deps.index,
      lock: deps.lock,
      declarations: deps.declarations,
    },
    {
      type: 'note',
      title: input.title ?? `Proposal to ${input.addressee}: ${shortChange}`,
      // 2.32.0: одинаковый клип заголовка не делает предложения одним и тем же
      idFingerprint: [
        input.addressee,
        input.proposedChange,
        input.expectedBenefit ?? '',
        ...(input.idFingerprintExtra ?? []),
      ].join('\u0000'),
      body: input.body,
      createdBy,
      facet: 'proposal',
      tags: input.tags,
      extra: {
        addressee: input.addressee,
        basis: input.basis,
        proposed_change: input.proposedChange,
        expected_benefit: input.expectedBenefit,
        applicability_bounds: input.applicabilityBounds,
      },
    }
  );
  return object as ProposalObject;
}

// --- 3.2.0 T-04 (REQ-03/REQ-05/REQ-12): кандидат изменения знания/навыка ---
//
// Кандидат — валидируемый кодом конверт (learning-change-schema) в body
// note/proposal с тегом wolf:learning-change:v1; общие поля proposal заполняются
// штатно. Дедуп по request_key (sha256 project+targets+problem+source-ревизии):
// повтор того же содержимого возвращает существующего кандидата без новых
// записей (S-05/S-09), изменённое содержимое с тем же ключом — конфликт.
// suggest/propose НИЧЕГО не активирует: phase='proposed', acceptance/activation
// равны null; режим off (REQ-12) не создаёт работы вовсе. Переходы фаз,
// trial-запись и acceptance/activation — контур apply/trial (T-06).

export interface SaveLearningCandidateDeps extends SaveProposalDeps {
  /** Явный программный режим; иначе config → env WOLF_LEARNING_MODE → 'suggest'. */
  mode?: LearningMode;
  config?: LearningModeConfig | null;
}

export interface SaveLearningCandidateInput {
  /** Строго валидируется доменом (S-08): пропуски обязательных полей и
   * неизвестные поля — отказ без каких-либо записей. */
  envelope: unknown;
  /** Адресат решения; по умолчанию 'user:owner' (приёмка — владелец/ведущий). */
  addressee?: string;
}

export interface SaveLearningCandidateResult {
  object: ProposalObject;
  envelope: LearningChangeEnvelope;
  /** true — возвращён существующий кандидат, новых записей/событий нет. */
  deduplicated: boolean;
}

export async function saveLearningCandidate(
  deps: SaveLearningCandidateDeps,
  input: SaveLearningCandidateInput
): Promise<SaveLearningCandidateResult> {
  const mode = deps.mode ?? resolveLearningMode(deps.env ?? process.env, deps.config);
  if (mode === 'off') {
    // REQ-12: off не запускает и не предлагает работу — до любой записи.
    throw new UserFacingError(
      'learning mode is "off": candidates are not proposed and no work is created (REQ-12, design §6)'
    );
  }
  const parsed = LearningCandidateInputSchema.safeParse(input.envelope);
  if (!parsed.success) {
    throw new UserFacingError(
      `Invalid learning candidate envelope: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`
    );
  }
  const candidateInput: LearningCandidateInput = parsed.data;
  const requestKey = learningRequestKey(candidateInput);
  const changeId = candidateInput.change_id ?? `lc-${requestKey.slice(0, 12)}`;
  const envelope: LearningChangeEnvelope = {
    schema_version: 1,
    change_id: changeId,
    request_key: requestKey,
    phase: 'proposed',
    kind: candidateInput.kind,
    problem: candidateInput.problem,
    goal: candidateInput.goal,
    expected_benefit: candidateInput.expected_benefit,
    scope: candidateInput.scope,
    sources: candidateInput.sources,
    baseline: candidateInput.baseline,
    candidate: candidateInput.candidate,
    trial: { ...candidateInput.trial, result_ref: null },
    acceptance: null,
    activation: null,
    rollback: candidateInput.rollback,
  };
  const content = learningCandidateContent(envelope);

  const run = async (): Promise<SaveLearningCandidateResult> => {
    // Дедуп-скан по proposal-записям с тегом конверта (чужие/битые записи —
    // терпеливый пропуск, прецедент councilNotes)
    const proposals = (await deps.store.list({ facet: 'proposal' })) as ProposalObject[];
    for (const existing of proposals) {
      const existingEnvelope = tryParseLearningChangeEnvelope(existing);
      if (!existingEnvelope || existingEnvelope.request_key !== requestKey) continue;
      if (learningCandidateContent(existingEnvelope) !== content) {
        // Design §9: изменённый запрос с прежним request_key — конфликт, не запись
        throw new UserFacingError(
          `request_key "${requestKey}" is already recorded as learning candidate "${existing.id}" with different content (change the sources/targets/problem to get a new request_key, or replay the identical content)`
        );
      }
      // Повтор той же revision → прежний кандидат, 0 новых записей (S-09)
      return { object: existing, envelope: existingEnvelope, deduplicated: true };
    }

    // Конверт валидируется кодом и перед записью (REQ-05 AC: инвариант записи)
    const checked = LearningChangeEnvelopeSchema.safeParse(envelope);
    if (!checked.success) {
      throw new UserFacingError(
        `Learning candidate envelope failed validation: ${checked.error.issues
          .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
          .join('; ')}`
      );
    }
    const object = await saveProposal(
      {
        ...deps,
        // lock уже удержан этим вызовом (не реентерабелен) — не пробрасываем
        // внутрь (прецедент record-council)
        lock: undefined,
      },
      {
        addressee: input.addressee ?? 'user:owner',
        basis: envelope.problem,
        proposedChange: `${envelope.kind}: ${envelope.goal}`,
        expectedBenefit: envelope.expected_benefit,
        applicabilityBounds: envelope.scope.applicability.join('; '),
        title: `Learning candidate ${envelope.change_id} (${envelope.phase})`,
        body: JSON.stringify(envelope, null, 2),
        tags: [LEARNING_CHANGE_TAG],
        idFingerprintExtra: [envelope.request_key],
      }
    );
    return { object, envelope, deduplicated: false };
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
