import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  countSessions,
  lastDeliveryTs,
  sessionsSinceTrigger,
  runDecayPass,
  decayStatus,
} from '../../../src/app/use-cases/learn-decay.js';
import { getCallInjections } from '../../../src/app/use-cases/get-call-injections.js';
import { MarkdownMemoryStore } from '../../../src/adapters/fs/markdown-memory-store.js';
import type { SignalEvent, SignalEventName } from '../../../src/adapters/fs/session-metrics-log.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const clock = { now: () => new Date(T0) };

// ---- фикстуры сигнального лога (без реального времени) ----

function ev(event: SignalEventName, extra: Partial<SignalEvent> = {}): SignalEvent {
  return {
    ts: new Date(T0).toISOString(),
    event,
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:owner' },
    ...extra,
  };
}

/** n run-событий: session_id s1..sn, ts шагом 1 мин от T0. */
function sessions(n: number): SignalEvent[] {
  const out: SignalEvent[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      ev('run', { ts: new Date(T0 + i * 60_000).toISOString(), session_id: `s${i + 1}`, weighted: 1, outcome: 'ok' })
    );
  }
  return out;
}

function deliveryAt(offsetMs: number, name: string): SignalEvent {
  return ev('delivery', { ts: new Date(T0 + offsetMs).toISOString(), detail: { name, mechanism: 'call' } });
}

function toolErrorAt(offsetMs: number, cls: string): SignalEvent {
  return ev('tool_error', { ts: new Date(T0 + offsetMs).toISOString(), tool_name: 'bash', error_class_id: cls });
}

function writeLog(dir: string, signals: SignalEvent[]): void {
  mkdirSync(join(dir, '.wolf', 'metrics'), { recursive: true });
  writeFileSync(
    join(dir, '.wolf', 'metrics', 'session-metrics.jsonl'),
    signals.map((s) => JSON.stringify(s)).join('\n') + '\n'
  );
}

// ---- in-memory MemoryStore (прецедент: mock-deps в pattern-detection/get-call-injections) ----

class MemStore implements MemoryStore {
  objects = new Map<string, MemoryObject>();

  async save(o: MemoryObject): Promise<void> {
    this.objects.set(o.id, o);
  }
  async get(id: string): Promise<MemoryObject | null> {
    return this.objects.get(id) ?? null;
  }
  async list(filters?: { type?: string; status?: string }): Promise<MemoryObject[]> {
    return [...this.objects.values()].filter(
      (o) => (!filters?.type || o.type === filters.type) && (!filters?.status || o.status === filters.status)
    );
  }
  async update(id: string, patch: Partial<MemoryObject>): Promise<MemoryObject> {
    const ex = this.objects.get(id);
    if (!ex) throw new Error(`Memory object not found: ${id}`);
    const next = { ...ex, ...patch, updated_at: new Date().toISOString() } as MemoryObject;
    this.objects.set(id, next);
    return next;
  }
}

function makeObj(id: string, type: string, overrides: Record<string, unknown> = {}): MemoryObject {
  return {
    id,
    type,
    title: id,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: new Date(T0 - 1).toISOString(), // все сессии фикстуры — после created_at
    updated_at: new Date(T0 - 1).toISOString(),
    created_by: 'user:test',
    schema_version: 1,
    source: { kind: 'manual' },
    related: { files: [], docs: [], decisions: [] },
    tags: [],
    superseded_by: null,
    body: '',
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
    ...overrides,
  } as MemoryObject;
}

describe('Ф26 learn-decay: чистые функции пробега', () => {
  it('countSessions — упорядоченные уникальные session_id из run-событий', () => {
    const sig = [...sessions(3), ev('run', { ts: new Date(T0 + 5 * 60_000).toISOString(), session_id: 's1' })];
    expect(countSessions(sig)).toEqual(['s1', 's2', 's3']);
  });

  it('lastDeliveryTs — последний штамп по detail.name; sessionsSinceTrigger — сессии после доставки', () => {
    const sig = [
      ...sessions(3),
      deliveryAt(3.5 * 60_000, 'lesson_1'), // после s1–s3
      ...sessions(1).map((s) => ({ ...s, session_id: 's4', ts: new Date(T0 + 4 * 60_000).toISOString() })),
    ];
    expect(lastDeliveryTs('lesson_1', sig)).toBe(new Date(T0 + 3.5 * 60_000).toISOString());
    const obj = makeObj('lesson_1', 'lesson');
    expect(sessionsSinceTrigger(obj, sig)).toBe(1); // только s4
    expect(sessionsSinceTrigger(obj, [])).toBe(0); // нет доставок и сессий после created_at → 0
  });
});

describe('Ф26 learn-decay: runDecayPass / decayStatus', () => {
  let dir: string;
  let store: MemStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-decay-'));
    store = new MemStore();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lesson без доставок: 90 сессий → review_required (статус остаётся active), 89 → нет', async () => {
    writeLog(dir, sessions(90));
    await store.save(makeObj('lesson_1', 'lesson'));
    const r = await runDecayPass({ store, clock }, dir);
    expect(r.marked).toBe(1);
    const o = store.objects.get('lesson_1') as Record<string, unknown>;
    expect(o.review_state).toBe('review_required');
    expect(o.status).toBe('active'); // НЕ lifecycle-переход (спека §6)
    expect(o.decay_reason).toBe('ttl');
    expect(o.sessions_since_last_trigger).toBe(90);

    // 89 сессий — не гаснем
    const dir2 = mkdtempSync(join(tmpdir(), 'wolf-decay-'));
    try {
      writeLog(dir2, sessions(89));
      const store2 = new MemStore();
      await store2.save(makeObj('lesson_1', 'lesson'));
      const r2 = await runDecayPass({ store: store2, clock }, dir2);
      expect(r2.marked).toBe(0);
      expect(store2.objects.get('lesson_1')!.review_state).toBe('accepted');
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('TTL по типам: session-summary 30/29, decision 180/179', async () => {
    writeLog(dir, sessions(180));
    await store.save(makeObj('sum_1', 'session-summary')); // 180 сессий после created_at
    // created_at после первого run s151 → ровно 29 сессий после created_at
    await store.save(makeObj('sum_2', 'session-summary', { created_at: new Date(T0 + 151 * 60_000).toISOString() }));
    await store.save(makeObj('dec_1', 'decision')); // 180 сессий ≥ 180
    await store.save(makeObj('dec_2', 'decision', { created_at: new Date(T0 + 60_000).toISOString() })); // 179 < 180
    const r = await runDecayPass({ store, clock }, dir);
    expect(r.marked).toBe(2); // sum_1 и dec_1
    expect(store.objects.get('sum_1')!.review_state).toBe('review_required');
    expect(store.objects.get('sum_2')!.review_state).toBe('accepted');
    expect(store.objects.get('dec_1')!.review_state).toBe('review_required');
    expect(store.objects.get('dec_2')!.review_state).toBe('accepted');
  });

  it('реактивация: delivery после review_required → accepted, reactivations=1', async () => {
    writeLog(dir, sessions(90));
    await store.save(makeObj('lesson_1', 'lesson'));
    await runDecayPass({ store, clock }, dir);
    expect(store.objects.get('lesson_1')!.review_state).toBe('review_required');

    const st1 = await decayStatus({ store, clock }, dir);
    expect(st1.reviewQueue).toHaveLength(1);
    expect(st1.indicators.reactivations).toBe(0); // доставок ещё нет

    // новая доставка после всех сессий + одна сессия после доставки
    writeLog(dir, [...sessions(90), deliveryAt(90 * 60_000, 'lesson_1')]);
    const st2 = await decayStatus({ store, clock }, dir);
    expect(st2.indicators.reactivations).toBe(1); // pending-реактивация

    const r2 = await runDecayPass({ store, clock }, dir);
    expect(r2.reactivations).toBe(1);
    const o = store.objects.get('lesson_1') as Record<string, unknown>;
    expect(o.review_state).toBe('accepted');
    expect(o.decay_reason).toBeUndefined(); // причина снята
    expect(o.last_triggered_at).toBe(new Date(T0 + 90 * 60_000).toISOString()); // derived-кэш из лога
    const st3 = await decayStatus({ store, clock }, dir);
    expect(st3.reviewQueue).toHaveLength(0);
  });

  it('override config learning.decay_ttl: lesson TTL 5 сессий', async () => {
    mkdirSync(join(dir, '.wolf'), { recursive: true });
    writeFileSync(join(dir, '.wolf', 'config.yaml'), 'learning:\n  decay_ttl:\n    lesson: 5\n');
    writeLog(dir, sessions(5));
    await store.save(makeObj('lesson_1', 'lesson'));
    expect((await runDecayPass({ store, clock }, dir)).marked).toBe(1); // 5 ≥ override 5

    const dir2 = mkdtempSync(join(tmpdir(), 'wolf-decay-'));
    try {
      mkdirSync(join(dir2, '.wolf'), { recursive: true });
      writeFileSync(join(dir2, '.wolf', 'config.yaml'), 'learning:\n  decay_ttl:\n    lesson: 5\n');
      writeLog(dir2, sessions(4));
      const store2 = new MemStore();
      await store2.save(makeObj('lesson_1', 'lesson'));
      expect((await runDecayPass({ store: store2, clock }, dir2)).marked).toBe(0); // 4 < 5
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('drift: silentRules → review_required rule_utilization; newErrorClasses вне таксономии', async () => {
    // 40 сессий; правило rule_R доставлено рано (до границы окна 30), 20 доставок
    // другим объектам в свежем окне; tool_error с неизвестным классом
    const sig: SignalEvent[] = [...sessions(40)];
    sig.push(deliveryAt(2 * 60_000, 'rule_R')); // до s10 (граница последних 30)
    for (let i = 0; i < 20; i++) sig.push(deliveryAt((31 + i / 100) * 60_000, 'other_1')); // внутри окна
    sig.push(toolErrorAt(3 * 60_000, 'brand_new_class'));
    writeLog(dir, sig);
    await store.save(makeObj('rule_R', 'rule', { scope: 'project' }));

    const st = await decayStatus({ store, clock }, dir);
    expect(st.indicators.silentRules).toBeGreaterThanOrEqual(1);
    expect(st.indicators.newErrorClasses).toContain('brand_new_class');

    const r = await runDecayPass({ store, clock }, dir);
    expect(r.silentRulesMarked).toBe(1);
    const o = store.objects.get('rule_R') as Record<string, unknown>;
    expect(o.review_state).toBe('review_required');
    expect(o.decay_reason).toBe('rule_utilization');
    expect(o.status).toBe('active');
    // в очереди пересмотра — с причиной drift-индикатора
    const st2 = await decayStatus({ store, clock }, dir);
    expect(st2.reviewQueue[0]).toMatchObject({ id: 'rule_R', reason: 'rule_utilization' });
    expect(st2.indicators.decayShare).toBeGreaterThan(0);
  });

  it('dryRun ничего не пишет', async () => {
    writeLog(dir, sessions(90));
    await store.save(makeObj('lesson_1', 'lesson'));
    const r = await runDecayPass({ store, clock }, dir, { dryRun: true });
    expect(r.marked).toBe(1);
    expect(store.objects.get('lesson_1')!.review_state).toBe('accepted');
  });
});

describe('Ф26: deliveredIds в getCallInjections', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-call-deliv-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('deliveredIds = id объектов, реально попавших в блоки (бюджет отрезает хвост)', async () => {
    const store = new MarkdownMemoryStore(dir);
    const longTitle = 'A'.repeat(500);
    for (const id of ['inj_A', 'inj_B', 'inj_C']) {
      await store.save({
        id,
        type: 'call-injection',
        title: longTitle,
        status: 'active',
        review_state: 'accepted',
        confidence: 'medium',
        importance: 0.5,
        created_at: new Date(T0 - 86_400_000).toISOString(),
        updated_at: new Date(T0 - 86_400_000).toISOString(),
        created_by: 'user:test',
        schema_version: 1,
        source: { kind: 'manual' },
        trigger_keywords: [id],
      } as unknown as MemoryObject);
    }
    const result = await getCallInjections({ store, clock }, { compact: true });
    expect(result.blocks).toHaveLength(2); // прецедент компакт-бюджета из существующего теста
    expect(result.truncated).toBe(1);
    expect(result.deliveredIds).toHaveLength(2);
    for (const id of result.deliveredIds) {
      expect(result.blocks.join('\n')).toContain(id);
    }
    expect(result.deliveredIds).not.toContain('inj_C');
  });
});
