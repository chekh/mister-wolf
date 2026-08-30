import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { proposeDraft } from '../../../src/app/use-cases/propose-draft.js';
import { validateDraft } from '../../../src/app/use-cases/validate-draft.js';
import { activateDraft } from '../../../src/app/use-cases/activate-draft.js';
import type { PatternSummary } from '../../../src/app/use-cases/pattern-detection.js';
import type { SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';
import { metricsLogPath } from '../../../src/adapters/fs/session-metrics-log.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { JsonlRelationLog } from '../../../src/adapters/fs/jsonl-relation-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath, relationsPath } from '../../../src/adapters/fs/project-paths.js';
import { UserFacingError } from '../../../src/domain/errors.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

function toolError(tool: string, cls: string, ts: string): SignalEvent {
  return {
    ts,
    event: 'tool_error',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'error',
    tool_name: tool,
    error_class_id: cls,
    detail: { message: 'stub error' },
  };
}

function patternsFor(key: string): PatternSummary[] {
  return [
    {
      key,
      count: 3,
      first_ts: '2026-08-30T10:00:00.000Z',
      last_ts: '2026-08-30T11:00:00.000Z',
      evidence: ['session-metrics.jsonl:1', 'session-metrics.jsonl:2', 'session-metrics.jsonl:3'],
    },
  ];
}

function readJsonl(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('activateDraft (Ф22 D2.2, гейт §2.5)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-activate-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps() {
    return {
      store: new MarkdownMemoryStore(dir),
      log: new JsonlEventLog(eventsPath(dir)),
      clock: new SystemClock(),
      idGen: new HashIdGenerator(),
      relations: new JsonlRelationLog(relationsPath(dir)),
      baseDir: dir,
    };
  }

  /** propose → {draftId, afterTs}: событие на 60с позже created_at draft'а. */
  async function proposeDeps(patternKey: string, polarity?: 'negative') {
    const deps = makeDeps();
    const { object } = await proposeDraft(deps, {
      patternKey,
      patterns: patternsFor(patternKey),
      actor: 'steward:archivist',
      ...(polarity ? { polarity } : {}),
    });
    const after = new Date(new Date(object.created_at).getTime() + 60_000).toISOString();
    return { deps, draftId: object.id, after };
  }

  it('(а) без вердикта → UserFacingError «вердикт отсутствует»', async () => {
    const { deps, draftId } = await proposeDeps('bash:timeout');
    await expect(activateDraft(deps, { draftId, actor: 'user:owner' })).rejects.toThrow(UserFacingError);
    await expect(activateDraft(deps, { draftId, actor: 'user:owner' })).rejects.toThrow('вердикт отсутствует');
  });

  it('(б) после validate fail → активация заблокирована', async () => {
    const { deps, draftId } = await proposeDeps('bash:timeout');
    const before = new Date(Date.now() - 3_600_000).toISOString();
    await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', before)] }
    );
    await expect(activateDraft(deps, { draftId, actor: 'user:owner' })).rejects.toThrow(
      'активация заблокирована: holdout fail'
    );
  });

  it('(в) после validate pass: два перехода, delivery-событие, relation based_on', async () => {
    const { deps, draftId, after } = await proposeDeps('bash:timeout');
    await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    await activateDraft(deps, { draftId, actor: 'user:owner' });

    const obj = await deps.store.get(draftId);
    expect(obj?.status).toBe('active');

    // delivery_event в Ф20-логе
    const deliveries = readJsonl(metricsLogPath(dir)).filter((l) => l.event === 'delivery');
    expect(deliveries).toHaveLength(1);
    const detail = deliveries[0]!.detail as Record<string, unknown>;
    expect(detail.mechanism).toBe('call');
    expect(detail.name).toBe(draftId);
    expect(detail.target).toBe('bash:timeout');

    // relation к паттерну-источнику + обратная
    const rels = readJsonl(relationsPath(dir));
    expect(
      rels.some((r) => r.subject === draftId && r.predicate === 'based_on' && r.object === 'pattern:bash:timeout')
    ).toBe(true);
    expect(
      rels.some((r) => r.subject === 'pattern:bash:timeout' && r.predicate === 'basis_for' && r.object === draftId)
    ).toBe(true);
  });

  it('(г) текстовый draft: needs_human_review — гейт человека', async () => {
    const { deps, draftId, after } = await proposeDeps('complaint:skill:demo');
    const v = await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    expect(v.verdict).toBe('needs_human_review');

    await expect(activateDraft(deps, { draftId, actor: 'user:owner' })).rejects.toThrow('требуется человеческое ревью');
    await activateDraft(deps, { draftId, actor: 'user:owner', humanApproved: true });
    expect((await deps.store.get(draftId))?.status).toBe('active');
  });

  it('(д) повторный activate активного → «уже активен»', async () => {
    const { deps, draftId, after } = await proposeDeps('bash:timeout');
    await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    await activateDraft(deps, { draftId, actor: 'user:owner' });
    await expect(activateDraft(deps, { draftId, actor: 'user:owner' })).rejects.toThrow('уже активен');
  });

  it('не-draft объект (нет pattern_key) отклоняется', async () => {
    const deps = makeDeps();
    const { log } = deps;
    const { addMemoryObject } = await import('../../../src/app/use-cases/add-memory-object.js');
    const plain = await addMemoryObject(
      { store: deps.store, log, clock: deps.clock, idGen: deps.idGen },
      { type: 'lesson', title: 'Обычный урок', body: 'текст без draft-полей', createdBy: 'user:owner' }
    );
    await expect(activateDraft(deps, { draftId: plain.object.id, actor: 'user:owner' })).rejects.toThrow(
      `не draft propose: ${plain.object.id}`
    );
  });

  it('(е) Ф23 STOP-гейт: механический draft с корректными trigger_keywords — гейт зелёный', async () => {
    const { deps, draftId, after } = await proposeDeps('bash:timeout');
    await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    await activateDraft(deps, { draftId, actor: 'user:owner' });
    expect((await deps.store.get(draftId))?.status).toBe('active');
  });

  it('(ж) Ф23 STOP-гейт: пустые trigger_keywords → активация заблокирована', async () => {
    const { deps, draftId, after } = await proposeDeps('bash:timeout');
    await deps.store.update(draftId, { trigger_keywords: [] } as Partial<MemoryObject>);
    await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    await expect(activateDraft(deps, { draftId, actor: 'user:owner' })).rejects.toThrow('STOP-гейт красный');
    expect((await deps.store.get(draftId))?.status).toBe('proposed');
  });

  it('(з) Ф23 STOP-гейт: чужие trigger_keywords → активация заблокирована', async () => {
    const { deps, draftId, after } = await proposeDeps('bash:timeout');
    await deps.store.update(draftId, { trigger_keywords: ['чужое'] } as Partial<MemoryObject>);
    await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    await expect(activateDraft(deps, { draftId, actor: 'user:owner' })).rejects.toThrow('STOP-гейт красный');
  });

  it('(и) Ф23 STOP-гейт: --human-approved обходит гейт (человек — компенсатор)', async () => {
    const { deps, draftId, after } = await proposeDeps('bash:timeout');
    await deps.store.update(draftId, { trigger_keywords: [] } as Partial<MemoryObject>);
    await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    await activateDraft(deps, { draftId, actor: 'user:owner', humanApproved: true });
    expect((await deps.store.get(draftId))?.status).toBe('active');
  });
});
