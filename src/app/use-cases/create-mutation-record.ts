// src/app/use-cases/create-mutation-record.ts
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';
import { governanceDefaults } from '../../domain/governance.js';
import { UserFacingError } from '../../domain/errors.js';
import { recordRelation } from './record-relation.js';

/** Волна 2.17 REQ-06 (design ADR-2, §«Запись мутации Стюарда»): G17-запись
 * note(history), атомарно создаваемая вместе с версией лица при мутации
 * Стюардом; relation ('mutates', запись, face-версия). Прецедент спец-полей
 * note — scaffold-agent.ts:152: addMemoryObject не пускает G17-поля в extra
 * (guard полей note), поэтому запись сеем напрямую через store.save — она
 * создаётся только версионирующим путём, не свободным add. Вызывается из-под
 * внешнего MemoryLock (createFaceVersion) — lock здесь не пере-берётся. */

/** Поля шаблона G17 (имена на записи — snake_case дословно из design). */
export interface MutationG17Input {
  reason: string;
  minimalChange: string;
  boundaries: string;
  exampleHelps: string;
  exampleKeep: string;
  verification: string;
  rollback: string;
}

const G17_FIELDS: ReadonlyArray<{ key: keyof MutationG17Input; name: string }> = [
  { key: 'reason', name: 'reason' },
  { key: 'minimalChange', name: 'minimal_change' },
  { key: 'boundaries', name: 'boundaries' },
  { key: 'exampleHelps', name: 'example_helps' },
  { key: 'exampleKeep', name: 'example_keep' },
  { key: 'verification', name: 'verification' },
  { key: 'rollback', name: 'rollback' },
];

/** REQ-06 AC2: шаблон неопционален — имя первого пустого/отсутствующего поля
 * (null — всё на месте). Общая проверка для createFaceVersion и записи. */
export function missingG17Field(input: Partial<MutationG17Input>): string | null {
  for (const { key, name } of G17_FIELDS) {
    const v = input[key];
    if (typeof v !== 'string' || v.trim() === '') return name;
  }
  return null;
}

/** boundaries (REQ-06 AC3) фиксирует, что НЕ меняется — суть/рамка агента. */
export type MutationRecord = MemoryObject & {
  facet: 'history';
  reason: string;
  minimal_change: string;
  boundaries: string;
  example_helps: string;
  example_keep: string;
  verification: string;
  rollback: string;
};

export interface CreateMutationRecordDeps {
  store: MemoryStore;
  log: EventLog;
  clock: Clock;
  idGen: IdGenerator;
  index?: SearchIndex;
  relations?: RelationLog;
}

export interface CreateMutationRecordInput extends MutationG17Input {
  ownerSkill: string;
  /** Номер создаваемой версии (title: 'mutation: <owner_skill> v<ver>'). */
  version: string;
  faceId: string;
  createdBy: string;
}

export async function createMutationRecord(
  deps: CreateMutationRecordDeps,
  input: CreateMutationRecordInput
): Promise<MutationRecord> {
  const missing = missingG17Field(input);
  if (missing !== null) {
    throw new UserFacingError(`Face mutation record requires G17 field "${missing}" (REQ-06: the template is not optional)`);
  }

  const now = deps.clock.now();
  const defaults = governanceDefaults(input.createdBy);
  const title = `mutation: ${input.ownerSkill} v${input.version}`;
  const note: MutationRecord = {
    id: deps.idGen.generateMemoryId(now, title),
    type: 'note',
    facet: 'history',
    title,
    body: '',
    status: 'active',
    review_state: input.createdBy.startsWith('agent:') ? 'proposed' : 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    created_by: input.createdBy,
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    memory_class: defaults.memory_class,
    truth_role: defaults.truth_role,
    lifetime: defaults.lifetime,
    reason: input.reason,
    minimal_change: input.minimalChange,
    boundaries: input.boundaries,
    example_helps: input.exampleHelps,
    example_keep: input.exampleKeep,
    verification: input.verification,
    rollback: input.rollback,
  };

  await deps.store.save(note);
  await deps.log.append({
    id: deps.idGen.generateEventId(now),
    type: 'memory.added',
    timestamp: now.toISOString(),
    actor: input.createdBy,
    payload: { memory_id: note.id, type: 'note' },
  });
  if (deps.index) {
    await deps.index.indexObject(note);
  }
  // Та же lock-транзакция, что и версия: lock не передаём (FsMemoryLock не
  // реентерабелен, внешний withLock держит createFaceVersion).
  if (deps.relations) {
    await recordRelation(
      { relations: deps.relations, idGen: deps.idGen },
      now,
      note.id,
      'mutates',
      input.faceId,
      'system'
    );
  }
  return note;
}
