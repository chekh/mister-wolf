import { MemoryObject } from '../schemas/memory-object-schema.js';
import { validateGovernance } from '../governance.js';

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateMemoryObject(obj: MemoryObject): ValidationResult {
  const warnings: string[] = [];

  if (!obj.body || obj.body.trim().length === 0) {
    warnings.push('Body is empty; memory may not be useful.');
  }

  if (
    obj.tags.length === 0 &&
    Object.keys(obj.related).every((k) => obj.related[k as keyof typeof obj.related].length === 0)
  ) {
    warnings.push('No tags or related links; memory may be hard to discover.');
  }

  const hasMeaningfulContent =
    obj.body.trim().length > 20 || obj.tags.length > 0 || Object.values(obj.related).some((arr) => arr.length > 0);

  if (!hasMeaningfulContent) {
    warnings.push('Memory object does not appear to contain useful context.');
  }

  warnings.push(...validateGovernance(obj));

  return { valid: true, warnings };
}
