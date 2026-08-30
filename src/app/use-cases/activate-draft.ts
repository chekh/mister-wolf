/**
 * Ф22 (D2.2): `wolf learn activate` — гейт §2.5 «создание ≠ активация»:
 * доставляемость разрешена только после зелёного Sandbox Replay Holdout
 * (детерминированный гейт) или явного человеческого апрува.
 * Активный объект доставляется через wolf call (get-call-injections матчит
 * только status:'active') — draft до активации недоставляем по построению.
 */
import { MemoryStore } from '../../ports/memory-store.port.js';
import { EventLog } from '../../ports/event-log.port.js';
import { Clock } from '../../ports/clock.port.js';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { SearchIndex } from '../../ports/search-index.port.js';
import { MemoryLock } from '../../ports/memory-lock.port.js';
import { RelationLog } from '../../ports/relation-log.port.js';
import { type MemoryTypeDeclaration } from '../../domain/memory-types.js';
import { UserFacingError } from '../../domain/errors.js';
import { transitionMemoryObject } from './transition-memory-object.js';
import { recordRelation } from './record-relation.js';
import { appendDeliverySignal } from '../../adapters/fs/session-metrics-log.js';

export async function activateDraft(
  deps: {
    store: MemoryStore;
    log: EventLog;
    clock: Clock;
    idGen: IdGenerator;
    index?: SearchIndex;
    lock?: MemoryLock;
    declarations?: readonly MemoryTypeDeclaration[];
    relations?: RelationLog;
    baseDir: string;
  },
  input: { draftId: string; actor: string; humanApproved?: boolean }
): Promise<void> {
  const draft = await deps.store.get(input.draftId);
  if (!draft) throw new UserFacingError(`Memory object not found: ${input.draftId}`);
  const rec = draft as Record<string, unknown>;
  const patternKey = rec.pattern_key as string | undefined;
  if (patternKey === undefined) throw new UserFacingError(`не draft propose: ${input.draftId}`);
  if (draft.type !== 'rule' && draft.type !== 'lesson') {
    throw new UserFacingError(`не draft-тип: ${input.draftId} (${draft.type})`);
  }
  if (draft.status === 'active') throw new UserFacingError(`уже активен: ${input.draftId}`);
  if (draft.status !== 'proposed') {
    throw new UserFacingError(`активация возможна только из proposed (текущий: ${draft.status})`);
  }

  // Гейт §2.5: pass ИЛИ человек. Причина отказа — точной формулировкой.
  const verdict = rec.holdout_verdict as string | undefined;
  if (verdict !== 'pass' && input.humanApproved !== true) {
    if (verdict === undefined) {
      throw new UserFacingError(`holdout-вердикт отсутствует — сначала \`wolf learn validate ${input.draftId}\``);
    }
    if (verdict === 'fail') {
      throw new UserFacingError('активация заблокирована: holdout fail');
    }
    throw new UserFacingError('текстовый draft: требуется человеческое ревью (--human-approved)');
  }

  // governance-переходы proposed→accepted→active (события lifecycle пишутся)
  await transitionMemoryObject(deps, input.draftId, 'accepted', input.actor);
  await transitionMemoryObject(deps, input.draftId, 'active', input.actor);

  // delivery_event Ф20: факт доставки через wolf call (trigger_keywords)
  appendDeliverySignal(deps.baseDir, {
    name: input.draftId,
    mechanism: 'call',
    target: patternKey,
    actor: input.actor,
    detail: { polarity: rec.polarity ?? 'positive', mechanical: rec.mechanical ?? false },
  });

  // связь с паттерном-источником (object — внешняя строка pattern:<key>)
  await recordRelation(
    { relations: deps.relations, idGen: deps.idGen, lock: deps.lock },
    deps.clock.now(),
    input.draftId,
    'based_on',
    `pattern:${patternKey}`,
    'agent'
  );
}
