import { describe, it, expect } from 'vitest';
import { parseSetPairs } from '../../../src/domain/parse-set-pairs.js';

describe('parseSetPairs', () => {
  it('merges multiple --set occurrences into separate fields', () => {
    expect(parseSetPairs(['a=1', 'b=2'], 'lesson')).toEqual({ a: '1', b: '2' });
  });

  it('throws on duplicate key for non-array fields', () => {
    expect(() => parseSetPairs(['impact=x', 'impact=y'], 'blocker')).toThrow(/[Dd]uplicate/);
  });

  it('parses JSON array value', () => {
    expect(parseSetPairs(['trigger_keywords=["git","merge"]'], 'call-injection')).toEqual({
      trigger_keywords: ['git', 'merge'],
    });
  });

  it('parses unquoted bracket array value', () => {
    expect(parseSetPairs(['trigger_keywords=[git,merge]'], 'call-injection')).toEqual({
      trigger_keywords: ['git', 'merge'],
    });
  });

  it('accumulates repeated key for string[] taxonomy field', () => {
    expect(parseSetPairs(['trigger_keywords=git', 'trigger_keywords=merge'], 'call-injection')).toEqual({
      trigger_keywords: ['git', 'merge'],
    });
  });

  it('keeps commas inside brackets intact while splitting pairs', () => {
    expect(parseSetPairs(['trigger_keywords=[git,merge]', 'related_objects=mem_1'], 'call-injection')).toEqual({
      trigger_keywords: ['git', 'merge'],
      related_objects: 'mem_1',
    });
  });

  it('mixes JSON array and repeated scalar accumulation for string[] field', () => {
    expect(parseSetPairs(['trigger_keywords=[git]', 'trigger_keywords=merge'], 'call-injection')).toEqual({
      trigger_keywords: ['git', 'merge'],
    });
  });

  it('splits comma-separated pairs inside one occurrence (backward compat)', () => {
    expect(parseSetPairs(['executor=lead,priority=high'], 'task-brief')).toEqual({
      executor: 'lead',
      priority: 'high',
    });
  });

  it('throws on pair without "="', () => {
    expect(() => parseSetPairs(['broken'], 'lesson')).toThrow(/Invalid --set pair/);
  });

  it('returns empty object for empty input', () => {
    expect(parseSetPairs([], 'lesson')).toEqual({});
  });
});
