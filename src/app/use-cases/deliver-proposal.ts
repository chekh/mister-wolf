// src/app/use-cases/deliver-proposal.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { resolveCreatedBy } from '../../domain/actor.js';
import { UserFacingError } from '../../domain/errors.js';
import type { ProposalObject } from './save-proposal.js';

/** Волна 2.17 T-09 (REQ-09, design §«Сигнал-фасет proposal»): доставка
 * предложения — явный отдельный шаг `wolf propose deliver <id>`. Только
 * заполняет delivered_at и журналирует memory.proposal.delivered {id,
 * addressee}: императивный текст НЕ применяется, лицо/память адресата не
 * меняются, полномочия автора не меняются — предложение остаётся сигналом
 * до решения Стюарда/владельца. Сохранение ≠ доставка ≠ обработка (AC4):
 * повторная доставка — отказ. */

export interface DeliverProposalDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  lock?: MemoryLock;
  /** Атрибуция доставляющего — только env (WOLF_ACTOR). */
  env?: NodeJS.ProcessEnv;
}

export async function deliverProposal(deps: DeliverProposalDeps, id: string): Promise<ProposalObject> {
  const actor = resolveCreatedBy(undefined, deps.env ?? process.env);
  const run = async (): Promise<ProposalObject> => {
    const obj = (await deps.store.get(id)) as ProposalObject | null;
    if (!obj) throw new UserFacingError(`Memory object not found: ${id}`);
    if (obj.facet !== 'proposal') {
      throw new UserFacingError(`Memory object ${id} is not a proposal (facet: ${obj.facet ?? '—'})`);
    }
    if (obj.delivered_at !== undefined) {
      throw new UserFacingError(
        `Proposal ${id} was already delivered at ${obj.delivered_at} (saving ≠ delivery ≠ processing; delivery is a one-time step)`
      );
    }

    const now = deps.clock.now();
    // delivered_at вне схемы сохранения (type-schema-builder) — пишется только
    // здесь; passthrough-схема объекта пропускает ключ через frontmatter
    const updated = await deps.store.update(id, {
      delivered_at: now.toISOString(),
    } as Partial<MemoryObject>);
    await deps.log.append({
      id: deps.idGen.generateEventId(now),
      type: 'memory.proposal.delivered',
      timestamp: now.toISOString(),
      actor,
      payload: { id, addressee: obj.addressee },
    });
    if (deps.index) {
      await deps.index.indexObject(updated);
    }
    return updated as ProposalObject;
  };
  return deps.lock ? deps.lock.withLock(run) : run();
}
