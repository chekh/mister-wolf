import { describe, it, expect } from 'vitest';
import { detectUnaggregatedLessons, MATURITY_AGE_MS } from '../../../src/app/use-cases/detect-unaggregated-lessons.js';
import { MemoryObject } from '../../../src/domain/schemas/memory-object-schema.js';
import { Relation } from '../../../src/domain/schemas/relation-schema.js';

// 2.14 §7.2: детектор неагрегированных уроков — чистая функция, фикстуры в памяти
const NOW = new Date('2026-09-30T00:00:00.000Z');

function mkObj(id: string, overrides: Record<string, unknown> = {}): MemoryObject {
  return {
    id,
    type: 'lesson',
    title: id,
    status: 'active',
    review_state: 'accepted',
    confidence: 'medium',
    importance: 0.5,
    created_at: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
    updated_at: new Date(NOW.getTime() - 86_400_000).toISOString(),
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

/** Ребро пары агрегации: forward (aggregates) — как пишет Стюард на шаге 1. */
function edge(aggId: string, lessonId: string, predicate: 'aggregates' | 'aggregated_in' = 'aggregates'): Relation {
  return {
    id: `rel-${aggId}-${lessonId}-${predicate}`,
    subject: predicate === 'aggregates' ? aggId : lessonId,
    predicate,
    object: predicate === 'aggregates' ? lessonId : aggId,
    created_at: NOW.toISOString(),
    source: 'agent',
    confidence: 'high',
  };
}

describe('detectUnaggregatedLessons', () => {
  it('ребро от proposed и от active агрегата учитывается (урок не неагрегирован)', () => {
    // тип агрегата детектору не важен (проверяет только статус); note — чтобы
    // сам агрегат не попадал в пул уроков и кейс мерил только исключение урока
    const all = [
      mkObj('agg_p', { type: 'note', status: 'proposed' }),
      mkObj('agg_a', { type: 'note', status: 'active' }),
      mkObj('lesson_1'),
      mkObj('lesson_2'),
    ];
    // lesson_1 — прямое ребро aggregates, lesson_2 — инверсия aggregated_in
    const res = detectUnaggregatedLessons(
      all,
      [edge('agg_p', 'lesson_1'), edge('agg_a', 'lesson_2', 'aggregated_in')],
      NOW
    );
    expect(res.total).toBe(0);
    expect(res.mature).toBe(0);
  });

  it('ребро от rejected агрегата игнорируется — кластер снова неагрегирован', () => {
    const all = [
      mkObj('agg_r', { type: 'note', status: 'rejected' }),
      mkObj('lesson_1'),
      mkObj('lesson_2'),
      mkObj('lesson_3'),
    ];
    const res = detectUnaggregatedLessons(all, [edge('agg_r', 'lesson_1')], NOW);
    expect(res.total).toBe(3);
  });

  it('ребро от archived агрегата игнорируется', () => {
    const all = [
      mkObj('agg_arch', { type: 'note', status: 'archived' }),
      mkObj('lesson_1'),
      mkObj('lesson_2'),
      mkObj('lesson_3'),
    ];
    const res = detectUnaggregatedLessons(all, [edge('agg_arch', 'lesson_1')], NOW);
    expect(res.total).toBe(3);
  });

  it('агрегат-объект отсутствует в all → ребро игнорируется', () => {
    const all = [mkObj('lesson_1'), mkObj('lesson_2'), mkObj('lesson_3')];
    const res = detectUnaggregatedLessons(all, [edge('ghost_agg', 'lesson_1')], NOW);
    expect(res.total).toBe(3);
  });

  it('не-active урок не считается неагрегированным', () => {
    const all = [mkObj('lesson_done', { status: 'archived' }), mkObj('lesson_prop', { status: 'proposed' })];
    const res = detectUnaggregatedLessons(all, [], NOW);
    expect(res.total).toBe(0);
  });

  it('зрелость числом: 3 урока без рёбер → mature=3, total=3', () => {
    const all = [
      // свежие: зрелость только числом кластера
      mkObj('l1', { created_at: NOW.toISOString() }),
      mkObj('l2', { created_at: NOW.toISOString() }),
      mkObj('l3', { created_at: NOW.toISOString() }),
    ];
    const res = detectUnaggregatedLessons(all, [], NOW);
    expect(res).toEqual({ total: 3, mature: 3 });
  });

  it('2 свежих урока → mature=0, total=2', () => {
    const all = [mkObj('l1', { created_at: NOW.toISOString() }), mkObj('l2', { created_at: NOW.toISOString() })];
    const res = detectUnaggregatedLessons(all, [], NOW);
    expect(res).toEqual({ total: 2, mature: 0 });
  });

  it('старейшему ровно 7 дней → mature>=1 (граница включительно)', () => {
    const all = [
      mkObj('old', { created_at: new Date(NOW.getTime() - MATURITY_AGE_MS).toISOString() }),
      mkObj('fresh', { created_at: NOW.toISOString() }),
    ];
    const res = detectUnaggregatedLessons(all, [], NOW);
    expect(res.total).toBe(2);
    expect(res.mature).toBeGreaterThanOrEqual(1);
  });
});
