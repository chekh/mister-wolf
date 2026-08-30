import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { proposeDraft } from '../../../src/app/use-cases/propose-draft.js';
import { validateDraft, replayHoldout } from '../../../src/app/use-cases/validate-draft.js';
import type { PatternSummary } from '../../../src/app/use-cases/pattern-detection.js';
import type { SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import { JsonlEventLog } from '../../../src/adapters/fs/jsonl-event-log.js';
import { SystemClock } from '../../../src/adapters/fs/system-clock.js';
import { HashIdGenerator } from '../../../src/adapters/fs/hash-id-generator.js';
import { eventsPath } from '../../../src/adapters/fs/project-paths.js';

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

describe('validateDraft / replayHoldout (Ф22 D2.2)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-validate-'));
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
    };
  }

  async function propose(patternKey: string, polarity?: 'negative') {
    const deps = makeDeps();
    const { object } = await proposeDraft(deps, {
      patternKey,
      patterns: patternsFor(patternKey),
      actor: 'steward:archivist',
      ...(polarity ? { polarity } : {}),
    });
    const ts = (offsetMs: number) => new Date(new Date(object.created_at).getTime() + offsetMs).toISOString();
    return { deps, draftId: object.id, created_at: object.created_at, before: ts(-60_000), after: ts(60_000) };
  }

  it('(а) positive pass: события генерации не считаются, holdout — да', async () => {
    const { deps, draftId, before, after } = await propose('bash:timeout');
    const signals = [
      toolError('bash', 'timeout', before),
      toolError('bash', 'timeout', before),
      toolError('bash', 'timeout', before),
      toolError('bash', 'timeout', after),
      toolError('bash', 'timeout', after),
    ];
    const v = await validateDraft({ store: deps.store, clock: deps.clock }, { draftId, signals });
    expect(v.verdict).toBe('pass');
    expect(v.prevented).toBe(2);
    expect(v.checked).toBe(2);
  });

  it('(б) positive fail: нет событий после created_at', async () => {
    const { deps, draftId, before } = await propose('bash:timeout');
    const v = await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', before), toolError('bash', 'timeout', before)] }
    );
    expect(v.verdict).toBe('fail');
    expect(v.checked).toBe(0);
    expect(v.note).toContain('данных для активации недостаточно');
  });

  it('(в) negative: анти-правило покрывает все классы ошибок тула + предупреждение', async () => {
    const { deps, draftId, after } = await propose('bash:timeout', 'negative');
    const v = await validateDraft(
      { store: deps.store, clock: deps.clock },
      {
        draftId,
        signals: [
          toolError('bash', 'timeout', after),
          toolError('bash', 'timeout', after),
          toolError('bash', 'file_not_found', after),
          toolError('grep', 'timeout', after), // другой тул — не в зачёт
        ],
      }
    );
    expect(v.verdict).toBe('pass');
    expect(v.prevented).toBe(3);
    expect(v.checked).toBe(4);
    expect(v.note).toContain('timeout, file_not_found');
    expect(v.note).toContain('легитимные использования тула не логируются — риск блокировки оценивает человек');
  });

  it('(г) текстовый draft (mechanical false) → needs_human_review', async () => {
    const { deps, draftId, after } = await propose('complaint:skill:demo');
    const v = await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    expect(v.verdict).toBe('needs_human_review');
    expect(v.prevented).toBe(0);
    expect(v.checked).toBe(0);
    expect(v.note).toContain('не поддаётся механическому replay');
  });

  it('(д) вердикт фиксируется в объекте и пересчитывается повторным прогоном', async () => {
    const { deps, draftId, after } = await propose('bash:timeout');

    await validateDraft(
      { store: deps.store, clock: deps.clock },
      { draftId, signals: [toolError('bash', 'timeout', after)] }
    );
    let stored = (await deps.store.get(draftId)) as Record<string, unknown>;
    expect(stored.holdout_verdict).toBe('pass');
    expect(stored.holdout_prevented).toBe(1);
    expect(stored.holdout_checked).toBe(1);
    expect(typeof stored.holdout_ts).toBe('string');

    // новое событие в логе → повторный validate пересчитывает (idempotent update)
    await validateDraft(
      {
        store: deps.store,
        clock: deps.clock,
      },
      {
        draftId,
        signals: [toolError('bash', 'timeout', after), toolError('bash', 'timeout', after)],
      }
    );
    stored = (await deps.store.get(draftId)) as Record<string, unknown>;
    expect(stored.holdout_prevented).toBe(2);
    expect(stored.holdout_checked).toBe(2);
  });

  it('replayHoldout — чистая функция: окно строго после created_at', () => {
    const draft = {
      mechanical: true,
      constraint_tool: 'bash',
      constraint_class: 'timeout',
      polarity: 'positive',
      created_at: '2026-08-30T12:00:00.000Z',
    };
    const v = replayHoldout(draft, [
      toolError('bash', 'timeout', '2026-08-30T12:00:00.000Z'), // граница — не входит
      toolError('bash', 'timeout', '2026-08-30T11:00:00.000Z'),
      toolError('bash', 'timeout', '2026-08-30T13:00:00.000Z'),
    ]);
    expect(v.verdict).toBe('pass');
    expect(v.checked).toBe(1);
  });
});
