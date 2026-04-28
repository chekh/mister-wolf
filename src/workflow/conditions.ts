import { Condition } from '../types/workflow.js';

export function evaluateCondition(condition: Condition, variables: Record<string, unknown>): boolean {
  const value = variables[condition.var];
  const strValue = value !== undefined && value !== null ? String(value) : undefined;

  if ('exists' in condition && condition.exists !== undefined) {
    return condition.exists ? strValue !== undefined : strValue === undefined;
  }

  if ('equals' in condition && condition.equals !== undefined) {
    return strValue === condition.equals;
  }

  if ('not_equals' in condition && condition.not_equals !== undefined) {
    return strValue !== condition.not_equals;
  }

  if ('contains' in condition && condition.contains !== undefined) {
    return strValue !== undefined && strValue.includes(condition.contains);
  }

  return true;
}
