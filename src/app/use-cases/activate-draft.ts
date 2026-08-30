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
import { buildScenarioFromDraft, runStopGate } from '../../domain/gates/stop-gate.js';
import { getCallInjections } from './get-call-injections.js';
import { tokenize } from '../../domain/solve/scenarios.js';

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

  // STOP-гейт Ф23 (спека §3 правило границы (б)): барьер автономной активации —
  // delivery-механизм обязан доносить знание до агента. Только автономный путь
  // (pass без --human-approved) и только механические draft'ы; текстовые идут
  // через needs_human_review/--human-approved выше.
  if (input.humanApproved !== true && verdict === 'pass') {
    const scenario = buildScenarioFromDraft(rec);
    if (scenario !== null) {
      // гипотетическая доставка: текущие call-инжекции по теме сценария +
      // draft как hypothetical-блок, ЕСЛИ trigger_keywords реально матчат тему
      // (как это сделает get-call-injections после активации — kw-матчинг D2)
      const inj = await getCallInjections(deps, { topic: scenario.topic });
      const kw: string[] = Array.isArray(rec.trigger_keywords) ? (rec.trigger_keywords as string[]) : [];
      const topicTokens = tokenize(scenario.topic);
      const blocks = topicTokens.some((t) => kw.includes(t))
        ? [...inj.blocks, `- [${input.draftId}] ${String(rec.title ?? '')} (hypothetical)\n${String(rec.body ?? '')}`]
        : inj.blocks;
      const gate = runStopGate(() => blocks, [scenario]);
      if (!gate.passed) {
        throw new UserFacingError(`STOP-гейт красный: ${gate.results[0]?.reason ?? 'fail'}`);
      }
    }
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
