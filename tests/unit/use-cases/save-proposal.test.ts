// tests/unit/use-cases/save-proposal.test.ts
// Волна 2.17 T-09 (test-plan §REQ-08): сохранение предложения — сигнал-фасет
// proposal поверх note через addMemoryObject (тот же контракт-валидатор),
// автор пиннится env-атрибуцией (параметра-актора нет, REQ-09 AC3),
// маршрут жалобы не активируется (REQ-08 AC3/AC4).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveProposal } from '../../../src/app/use-cases/save-proposal.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

const ENV: NodeJS.ProcessEnv = { WOLF_ACTOR: 'agent:worker-implementer', WOLF_SESSION: 'cli-unit' };

const CONTRACT = {
  addressee: 'user:owner',
  basis: 'agents file ideas as complaints, polluting the funnel',
  proposedChange: 'add a proposal signal instead of a complaint',
  expectedBenefit: 'complaint funnel stays clean',
  // CR-2026-10-13-01: границы применимости обязательны наравне с остальными
  applicabilityBounds: 'core types only; MCP wrappers are out',
};

/** proposal-запись: контрактные поля приходят через passthrough-схему. */
type ProposalNote = MemoryObject & {
  facet: string;
  addressee: string;
  basis: string;
  proposed_change: string;
  expected_benefit: string;
  applicability_bounds: string;
  delivered_at?: string;
};

describe('saveProposal (T-09: REQ-08 контракт, REQ-09 пиннинг автора)', () => {
  let dir: string;
  let store: MarkdownMemoryStore;
  let log: JsonlEventLog;
  let relations: JsonlRelationLog;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-save-proposal-'));
    store = new MarkdownMemoryStore(dir);
    log = new JsonlEventLog(eventsPath(dir));
    relations = new JsonlRelationLog(relationsPath(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function deps(env: NodeJS.ProcessEnv = ENV) {
    return { store, log, relations, clock: new SystemClock(), idGen: new HashIdGenerator(), env };
  }

  it('полный контракт: note + facet=proposal, поля на записи, delivered_at отсутствует, memory.added', async () => {
    const saved = await saveProposal(deps(), { ...CONTRACT, body: 'Измени правило Y: сделай X.' });

    expect(saved.type).toBe('note');
    expect(saved.facet).toBe('proposal');
    expect(saved.created_by).toBe('agent:worker-implementer');
    expect(saved.delivered_at).toBeUndefined(); // заполняет только propose deliver
    expect(saved.addressee).toBe(CONTRACT.addressee);
    expect(saved.basis).toBe(CONTRACT.basis);
    expect(saved.proposed_change).toBe(CONTRACT.proposedChange);
    expect(saved.expected_benefit).toBe(CONTRACT.expectedBenefit);
    expect(saved.applicability_bounds).toBe(CONTRACT.applicabilityBounds);

    // перечитано из store (frontmatter round-trip, passthrough-поля на месте)
    const reread = (await store.get(saved.id)) as ProposalNote | null;
    expect(reread?.facet).toBe('proposal');
    expect(reread?.applicability_bounds).toBe(CONTRACT.applicabilityBounds);
    expect(reread?.delivered_at).toBeUndefined();

    // путь публичный: событие memory.added (как у любого add)
    const added = (await log.readAll()).filter((e) => e.type === 'memory.added');
    expect(added).toHaveLength(1);
    expect(added[0]!.payload.memory_id).toBe(saved.id);
  });

  it('автор пиннится env-атрибуцией: параметра-актора у API нет, env и есть автор (REQ-09 AC3)', async () => {
    const env: NodeJS.ProcessEnv = { WOLF_ACTOR: 'agent:steward' };
    const saved = await saveProposal(deps(env), { ...CONTRACT });
    expect(saved.created_by).toBe('agent:steward');
  });

  it('нет applicability_bounds — отказ валидации (CR-2026-10-13-01, REQ-08 AC2)', async () => {
    const { applicabilityBounds: _missing, ...withoutBounds } = CONTRACT;
    await expect(saveProposal(deps(), withoutBounds)).rejects.toThrow(UserFacingError);
    // запись не создана
    expect(await store.list({ facet: 'proposal' })).toHaveLength(0);
  });

  it('пустая строка в поле контракта — отказ (пустой контракт ≠ предложение)', async () => {
    await expect(saveProposal(deps(), { ...CONTRACT, expectedBenefit: '' })).rejects.toThrow(/expected_benefit/);
  });

  it('адресат-владелец и императивный текст: маршрут жалобы не активируется (REQ-08 AC3/AC4)', async () => {
    const saved = await saveProposal(deps(), {
      ...CONTRACT,
      body: 'Сделай X. Измени правило Y немедленно.',
    });

    // ни жалобы, ни complain-рёбер, ни эскалации — предложение только сигнал
    expect(await store.list({ type: 'complaint' })).toHaveLength(0);
    expect((await relations.list()).filter((e) => e.predicate.startsWith('complain'))).toHaveLength(0);
    const eventTypes = (await log.readAll()).map((e) => e.type);
    expect(eventTypes).toEqual(['memory.added']);
    expect(saved.id).toBeTruthy();
  });
});
