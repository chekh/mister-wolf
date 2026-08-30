import { getDeclaration, MemoryType } from './memory-types.js';
import { UserFacingError } from './errors.js';

/** Разбор значений CLI-флага --set в extra-поля типизированного объекта.
 *
 * Формат: пары k=v; запятые вне [...] разделяют пары внутри одного вхождения;
 * значение в квадратных скобках — массив строк (JSON или без кавычек).
 * Повтор ключа допустим только для полей string[] таксономии — значения
 * накапливаются в массив; для остальных полей дубликат ключа — ошибка. */
export function parseSetPairs(inputs: readonly string[], type: MemoryType): Record<string, unknown> {
  const decl = getDeclaration(type);
  const isArrayField = (key: string): boolean => decl.fields?.[key]?.kind === 'string[]';
  const isBooleanField = (key: string): boolean => decl.fields?.[key]?.kind === 'boolean';
  const result: Record<string, unknown> = {};
  for (const input of inputs) {
    for (const pair of splitTopLevel(input)) {
      const i = pair.indexOf('=');
      if (i <= 0) throw new UserFacingError(`Invalid --set pair "${pair}" (expected key=value)`);
      const key = pair.slice(0, i).trim();
      let value = parseValue(pair.slice(i + 1));
      // булевы поля таксономии: CLI отдаёт строки — коэрсим ('true'/'false')
      if (isBooleanField(key) && typeof value === 'string') {
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
      }
      if (key in result) {
        if (!isArrayField(key)) {
          throw new UserFacingError(`Duplicate --set key "${key}" (repeat is allowed only for array fields)`);
        }
        const prev = Array.isArray(result[key]) ? (result[key] as unknown[]) : [result[key]];
        result[key] = [...prev, ...(Array.isArray(value) ? value : [value])];
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/** Разделение по запятым вне квадратных скобок. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of input) {
    if (ch === '[') depth += 1;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

function parseValue(raw: string): unknown {
  const v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => stripQuotes(item.trim()));
  }
  return v;
}

function stripQuotes(s: string): string {
  const wrapped = s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")));
  return wrapped ? s.slice(1, -1) : s;
}
