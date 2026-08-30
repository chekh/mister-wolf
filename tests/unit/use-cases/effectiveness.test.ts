import { describe, it, expect } from 'vitest';
import {
  buildEffectivenessReport,
  classifyNoise,
  classifySilent,
  resolveThresholds,
  DEFAULT_EFFECTIVENESS_THRESHOLDS,
} from '../../../src/app/use-cases/effectiveness.js';
import type { MemoryStore } from '../../../src/ports/memory-store.port.js';
import type { EventLog } from '../../../src/ports/event-log.port.js';
import type { RelationLog } from '../../../src/ports/relation-log.port.js';
import type { MemoryEvent } from '../../../src/domain/schemas/memory-event-schema.js';
import type { Relation } from '../../../src/domain/schemas/relation-schema.js';
import type { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import type { SignalEvent } from '../../../src/adapters/fs/session-metrics-log.js';

type Extra = Record<string, unknown>;

function mockStore(objects: Extra[]): MemoryStore {
  return {
    async list(filters) {
      return objects.filter(
        (o) => (!filters?.type || o.type === filters.type) && (!filters?.status || o.status === filters.status)
      ) as MemoryObject[];
    },
    async save() {
      throw new Error('not implemented');
    },
    async get() {
      return null;
    },
    async update() {
      throw new Error('not implemented');
    },
  };
}

function mockLog(events: MemoryEvent[]): EventLog {
  return {
    async readAll() {
      return events;
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}

function mockRelations(rels: Relation[]): RelationLog {
  return {
    async list() {
      return rels;
    },
    async append() {
      throw new Error('not implemented');
    },
  };
}

/** ISO-таймстамп «минута N» — лексикографическая сортировка = хронология. */
const T = (minute: number): string => new Date(Date.UTC(2026, 0, 1, 0, minute, 0)).toISOString();

function runEvent(session: string, ts: string): SignalEvent {
  return {
    ts,
    event: 'run',
    session_id: session,
    gen_ai: { modelID: 'm', agent: 'a' },
    orchestration: { task: 't', actor: 'user:cli' },
  };
}

function deliveryEvent(name: string, ts: string): SignalEvent {
  return {
    ts,
    event: 'delivery',
    session_id: null,
    gen_ai: { modelID: null, agent: null },
    orchestration: { task: null, actor: 'user:cli' },
    outcome: 'delivered',
    detail: { name },
  };
}

function memEvent(type: MemoryEvent['type'], id: string): MemoryEvent {
  return { id: `ev-${type}-${id}`, type, timestamp: T(0), actor: 'user:cli', payload: { memory_id: id } };
}

function relation(subject: string, object: string): Relation {
  return {
    id: `rel-${subject}-${object}`,
    subject,
    predicate: 'supports',
    object,
    created_at: T(0),
    source: 'agent',
    confidence: 'high',
  };
}

describe('buildEffectivenessReport (E1.2: панель эффективности)', () => {
  it('пустая память → нули/null, статусы NO_DATA, команда не падает', async () => {
    const report = await buildEffectivenessReport(
      { store: mockStore([]), log: mockLog([]), relations: mockRelations([]) },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS }
    );
    expect(report.rules).toEqual({ activeRules: 0, prevented: null, checked: null });
    expect(report.tools.toolCount).toBe(0);
    expect(report.tools.totalUsage).toBe(0);
    expect(report.tools.economy.sufficient).toBe(false);
    expect(report.delivery).toEqual({
      deliveryEvents: 0,
      triggeredObjects: 0,
      activeRules: 0,
      silentRules: 0,
      enoughDeliveryData: false,
      silentShare: null,
    });
    expect(report.noise).toEqual({ totalObjects: 0, writeOnly: 0, share: null, documents: 0 });
    expect(report.noiseStatus).toBe('NO_DATA');
    expect(report.silentStatus).toBe('NO_DATA');
    expect(report.routing).toEqual([]);
  });

  it('заполненная фикстура → числа совпадают с ручным подсчётом', async () => {
    // Объекты (12): r1/r2/r3 — active-правила, l1/l2 — lesson, t1/t2 — tool,
    // dr1/dr2 — document-ref (исключены из метрики шума), остальное — прочие типы
    const objects: Extra[] = (
      [
        ['r1', 'rule', 'active', { holdout_prevented: 3, holdout_checked: 5 }],
        ['r2', 'rule', 'active', {}],
        ['r3', 'rule', 'active', {}],
        ['l1', 'lesson', 'active', { holdout_prevented: 2, holdout_checked: 10 }],
        ['l2', 'lesson', 'active', {}],
        ['t1', 'tool', 'active', { usage_count: 4 }],
        ['t2', 'tool', 'deprecated', {}],
        ['d1', 'decision', 'active', {}],
        ['o1', 'blocker', 'open', {}],
        ['o2', 'work-thread', 'active', {}],
        ['dr1', 'document-ref', 'active', {}],
        ['dr2', 'document-ref', 'active', {}],
      ] as Array<[string, string, string, Extra]>
    ).map(([id, type, status, extra]) => ({ id, title: id, type, status, ...extra }));

    // event-log: memory.added на все 12; o2 ещё и обновлялся (читался)
    const events = objects.map((o) => memEvent('memory.added', o.id as string));
    events.push(memEvent('memory.updated', 'o2'));

    // связи: d1 и l2 связаны с r1 → {d1, l2, r1} не шум
    const relations = [relation('d1', 'r1'), relation('l2', 'r1')];

    // сигналы: 32 сессии (окно 30 достаточно), r2 доставлен рано (тихий), r3 — недавно
    const signals: SignalEvent[] = [];
    for (let i = 0; i < 32; i++) signals.push(runEvent(`s${String(i).padStart(2, '0')}`, T(i)));
    signals.push(deliveryEvent('r2', T(0)), deliveryEvent('r2', T(1)));
    for (let i = 3; i <= 20; i++) signals.push(deliveryEvent('r3', T(i)));

    // run-log: glm 6 задач (3 с tool-пометкой), kimi 2 задачи
    const runLog = [
      JSON.stringify({ model: 'glm', weighted: 10 }),
      JSON.stringify({ model: 'glm', weighted: 20 }),
      JSON.stringify({ model: 'glm', weighted: 30 }),
      JSON.stringify({ model: 'glm', weighted: 5, tools: ['x'] }),
      JSON.stringify({ model: 'glm', weighted: 6, tools: ['x'] }),
      JSON.stringify({ model: 'glm', weighted: 7, tools: ['x'] }),
      JSON.stringify({ model: 'kimi', weighted: 100 }),
      JSON.stringify({ model: 'kimi', weighted: 200 }),
    ].join('\n');

    const report = await buildEffectivenessReport(
      { store: mockStore(objects), log: mockLog(events), relations: mockRelations(relations) },
      { signals, runLogText: runLog, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS }
    );

    // Блок 1: 3 active-правила; prevented = 3+2, checked = 5+10
    expect(report.rules).toEqual({ activeRules: 3, prevented: 5, checked: 15 });

    // Блок 2: 2 tool-объекта (все статусы), usage = 4; экономика: medianTool=6 medianAll=15
    expect(report.tools.toolCount).toBe(2);
    expect(report.tools.totalUsage).toBe(4);
    expect(report.tools.economy.sufficient).toBe(true);
    expect(report.tools.economy.toolRuns).toBe(3);
    expect(report.tools.economy.totalRuns).toBe(8);
    expect(report.tools.economy.medianTool).toBe(6);
    expect(report.tools.economy.medianAll).toBe(15);
    expect(report.tools.economy.savingsPct).toBeCloseTo(60, 5);

    // Блок 3: 20 доставок, 2 уникальных объекта, 1 тихое правило из 3 → 33.3% BAD
    expect(report.delivery.deliveryEvents).toBe(20);
    expect(report.delivery.triggeredObjects).toBe(2);
    expect(report.delivery.silentRules).toBe(1);
    expect(report.delivery.silentShare).toBeCloseTo(100 / 3, 5);
    expect(report.silentStatus).toBe('BAD');

    // Блок 4: шум = r2,r3,l1,t1,t2,o1 (без связей и нечитанные) = 6/10 → 60% BAD;
    // dr1/dr2 — document-ref, исключены из числителя и знаменателя (documents=2)
    expect(report.noise).toEqual({ totalObjects: 10, writeOnly: 6, share: 60, documents: 2 });
    expect(report.noiseStatus).toBe('BAD');

    // Блок 5: glm впереди (6 задач, медиана (7+10)/2=8.5), kimi 2/150
    expect(report.routing).toEqual([
      { model: 'glm', tasks: 6, medianWeighted: 8.5 },
      { model: 'kimi', tasks: 2, medianWeighted: 150 },
    ]);
  });

  it('R2: scan-обновление считается использованием — объект со scan-событием не шум', async () => {
    // x1 подтверждён повторным сканом (memory.scan.updated) → не шум;
    // y1 без событий кроме memory.added → шум; dr1 (document-ref) исключён из метрики
    const objects: Extra[] = [
      { id: 'x1', type: 'decision', status: 'active' },
      { id: 'y1', type: 'decision', status: 'active' },
      { id: 'dr1', type: 'document-ref', status: 'active' },
    ];
    const events = objects.map((o) => memEvent('memory.added', o.id as string));
    events.push(memEvent('memory.scan.updated', 'x1'));
    const report = await buildEffectivenessReport(
      { store: mockStore(objects), log: mockLog(events), relations: mockRelations([]) },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS }
    );
    expect(report.noise).toEqual({ totalObjects: 2, writeOnly: 1, share: 50, documents: 1 });
  });

  it('мало delivery-данных (окно silentRuleIds) → silentShare null, NO_DATA', async () => {
    const objects: Extra[] = [{ id: 'r1', type: 'rule', status: 'active' }];
    const signals = [
      runEvent('s0', T(0)),
      runEvent('s1', T(1)),
      deliveryEvent('r1', T(1)), // доставок < 20 и сессий <= 30 — судить нельзя
    ];
    const report = await buildEffectivenessReport(
      { store: mockStore(objects), log: mockLog([]), relations: mockRelations([]) },
      { signals, runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS }
    );
    expect(report.delivery.silentShare).toBeNull();
    expect(report.silentStatus).toBe('NO_DATA');
  });

  it('молчащие delivery-имена НЕ-правил не считаются — доля не превышает 100% (F4)', async () => {
    // 2 active-правила (r1 свежий, r2 без доставок) + молчащий call-injection ci1:
    // раньше ci1 попадал в числитель и давал 50% фантомного «молчания правил»
    const objects: Extra[] = [
      { id: 'r1', type: 'rule', status: 'active' },
      { id: 'r2', type: 'rule', status: 'active' },
      { id: 'ci1', type: 'call-injection', status: 'active' },
    ];
    const signals: SignalEvent[] = [];
    for (let i = 0; i < 32; i++) signals.push(runEvent(`s${String(i).padStart(2, '0')}`, T(i)));
    signals.push(deliveryEvent('ci1', T(0)), deliveryEvent('ci1', T(1))); // ci1 молчит с окна
    for (let i = 3; i <= 22; i++) signals.push(deliveryEvent('r1', T(i))); // r1 свежий, ≥20 delivery
    const report = await buildEffectivenessReport(
      { store: mockStore(objects), log: mockLog([]), relations: mockRelations([]) },
      { signals, runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS }
    );
    expect(report.delivery.silentRules).toBe(0);
    expect(report.delivery.silentShare).toBe(0);
    expect(report.silentStatus).toBe('OK');
  });

  it('holdout-поля есть, но не числа → prevented/checked null (данных нет)', async () => {
    const objects: Extra[] = [
      { id: 'r1', type: 'rule', status: 'active', holdout_prevented: 'много', holdout_checked: NaN },
    ];
    const report = await buildEffectivenessReport(
      { store: mockStore(objects), log: mockLog([]), relations: mockRelations([]) },
      { signals: [], runLogText: null, thresholds: DEFAULT_EFFECTIVENESS_THRESHOLDS }
    );
    expect(report.rules).toEqual({ activeRules: 1, prevented: null, checked: null });
  });
});

describe('classifyNoise / classifySilent (границы порогов)', () => {
  const t = DEFAULT_EFFECTIVENESS_THRESHOLDS; // noiseOk=20, noiseWarn=40, silentOk=30

  it('classifyNoise: 19.9 OK | 20 WARN | 40 WARN | 40.1 BAD | null NO_DATA', () => {
    expect(classifyNoise(null, t)).toBe('NO_DATA');
    expect(classifyNoise(19.9, t)).toBe('OK');
    expect(classifyNoise(20, t)).toBe('WARN');
    expect(classifyNoise(40, t)).toBe('WARN');
    expect(classifyNoise(40.1, t)).toBe('BAD');
  });

  it('classifySilent: 29.9 OK | 30 BAD | null NO_DATA', () => {
    expect(classifySilent(null, t)).toBe('NO_DATA');
    expect(classifySilent(29.9, t)).toBe('OK');
    expect(classifySilent(30, t)).toBe('BAD');
  });
});

describe('resolveThresholds (config override поверх дефолтов)', () => {
  it('без override и пустой override → дефолты', () => {
    expect(resolveThresholds()).toEqual(DEFAULT_EFFECTIVENESS_THRESHOLDS);
    expect(resolveThresholds({})).toEqual(DEFAULT_EFFECTIVENESS_THRESHOLDS);
  });

  it('частичный и полный override мержится поверх дефолтов', () => {
    expect(resolveThresholds({ noiseOk: 10 })).toEqual({ noiseOk: 10, noiseWarn: 40, silentOk: 30 });
    expect(resolveThresholds({ noiseWarn: 50, silentOk: 60 })).toEqual({ noiseOk: 20, noiseWarn: 50, silentOk: 60 });
  });
});
