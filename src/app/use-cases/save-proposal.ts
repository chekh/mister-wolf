// src/app/use-cases/save-proposal.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { resolveCreatedBy } from '../../domain/actor.js';
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
      body: input.body,
      createdBy,
      facet: 'proposal',
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
