import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '../../src/workflow/conditions.js';
import { Condition } from '../../src/types/workflow.js';

describe('evaluateCondition', () => {
  it('should return true for exists when variable present', () => {
    const condition: Condition = { var: 'foo', exists: true };
    expect(evaluateCondition(condition, { foo: 'bar' })).toBe(true);
  });

  it('should return false for exists when variable missing', () => {
    const condition: Condition = { var: 'foo', exists: true };
    expect(evaluateCondition(condition, {})).toBe(false);
  });

  it('should match equals', () => {
    const condition: Condition = { var: 'foo', equals: 'bar' };
    expect(evaluateCondition(condition, { foo: 'bar' })).toBe(true);
    expect(evaluateCondition(condition, { foo: 'baz' })).toBe(false);
  });

  it('should match not_equals', () => {
    const condition: Condition = { var: 'foo', not_equals: 'bar' };
    expect(evaluateCondition(condition, { foo: 'baz' })).toBe(true);
    expect(evaluateCondition(condition, { foo: 'bar' })).toBe(false);
  });

  it('should match contains', () => {
    const condition: Condition = { var: 'foo', contains: 'err' };
    expect(evaluateCondition(condition, { foo: 'error message' })).toBe(true);
    expect(evaluateCondition(condition, { foo: 'success' })).toBe(false);
  });

  it('should coerce values to string', () => {
    const condition: Condition = { var: 'count', equals: '42' };
    expect(evaluateCondition(condition, { count: 42 })).toBe(true);
  });
});
