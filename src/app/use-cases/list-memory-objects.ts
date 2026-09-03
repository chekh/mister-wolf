import { MemoryStore } from '../../ports/memory-store.port.js';
import { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

export interface ListMemoryObjectsFilters {
  type?: string;
  status?: string;
  stale?: boolean;
}

export async function listMemoryObjects(
  store: MemoryStore,
  filters?: ListMemoryObjectsFilters
): Promise<MemoryObject[]> {
  return store.list(filters);
}

export interface ResolvedListType {
  /** Каноническое имя для фильтра; '' при ошибке (error). */
  type: string;
  warning?: string;
  error?: string;
}

/**
 * Резолв --type для list (спека 2.1.0 §2.2 F10): deprecated-алиас (warning,
 * проверяется раньше known — алиас формально есть в таксономии) → точное имя
 * из known → однострочная ошибка с ближайшим типом (edit distance ≤ 2;
 * ближайший-алиас подставляется своим каноническим именем).
 */
export function resolveListType(
  requested: string,
  known: readonly string[],
  aliases: Readonly<Record<string, string>>
): ResolvedListType {
  // алиас проверяем раньше known: 'document' формально в таксономии, но deprecated
  const alias = aliases[requested];
  if (alias) {
    return { type: alias, warning: `type '${requested}' is deprecated, use '${alias}'` };
  }
  if (known.includes(requested)) return { type: requested };
  const nearest = [...known]
    .map((t) => ({ t, d: levenshtein(requested, t) }))
    .filter((x) => x.d <= 2)
    .sort((a, b) => a.d - b.d || a.t.localeCompare(b.t))[0];
  // ближайший не должен быть deprecated-алиасом: предлагаем его каноническое имя
  const suggestion = nearest ? (aliases[nearest.t] ?? nearest.t) : undefined;
  const hint = suggestion ? ` closest: '${suggestion}';` : '';
  return { type: '', error: `unknown type '${requested}';${hint} allowed: ${[...known].sort().join(', ')}` };
}

/** Levenshtein (двухрядный DP, без зависимостей) — только для подсказки «ближайший». */
function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let carry = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, carry + (a[i - 1] === b[j - 1] ? 0 : 1));
      carry = tmp;
    }
  }
  return prev[b.length];
}
