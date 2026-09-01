import { z } from 'zod';
import { MemoryObjectSchema, type MemoryObject } from './schemas/memory-object-schema.js';
import { CORE_TAXONOMY, type FieldSpec, type MemoryStatus, type MemoryTypeDeclaration } from './memory-types.js';

/** FieldSpec -> zod. Используется для декларативных полей и будет использован
 * для project-типов из config.yaml (Phase 8, Task 3). */
export function fieldToZod(spec: FieldSpec): z.ZodTypeAny {
  const s = spec as {
    required?: boolean;
    min?: number;
    optional?: boolean;
    default?: string | string[] | number;
    minItems?: number;
    values?: readonly string[];
  };
  if (spec.kind === 'string') {
    if (s.required) {
      const str = z.string();
      return s.min !== undefined ? str.min(s.min) : str;
    }
    if (s.optional) return z.string().optional();
    return z.string().default(s.default as string);
  }
  if (spec.kind === 'boolean') {
    return z.boolean().optional();
  }
  if (spec.kind === 'int') {
    // int-поля таксономии — счётчики, отрицательные значения бессмысленны
    return z
      .number()
      .int()
      .min(0)
      .default((s.default as number | undefined) ?? 0);
  }
  if (spec.kind === 'string[]') {
    if (s.required) return z.array(z.string()).min(s.minItems ?? 0);
    return z.array(z.string()).default((s.default as string[]) ?? []);
  }
  return z.enum(s.values as [string, ...string[]]);
}

/**
 * Строит per-type схему как проекцию декларации таксономии.
 *
 * Рантайм-поведение: база MemoryObjectSchema + литерал типа + lifecycle-enum
 * статуса + поля из decl.fields (канон) + типизированные поля `fields`
 * (уточняют те же поля для статического вывода; расхождения ловят
 * guard-тесты схем и tsc на потребителях).
 *
 * Типизация: возвращаемый тип определяется `fields`, поэтому z.infer даёт
 * конкретную форму (публичный API сохранён, см. D2 спеки).
 */
// ponytail: cast ниже кодирует инвариант «fields ≡ decl.fields»; при расхождении
// падают guard-тесты схем — апгрейд: кодогенерация схем из деклараций.
export function buildTypeSchema<F extends z.ZodRawShape = Record<string, never>>(
  decl: MemoryTypeDeclaration,
  fields: F = {} as F
) {
  const declFields: Record<string, z.ZodTypeAny> = {};
  for (const [name, fs] of Object.entries(decl.fields ?? {})) {
    declFields[name] = fieldToZod(fs);
  }
  const typed = MemoryObjectSchema.extend({
    type: z.literal(decl.name),
    status: z.enum(decl.lifecycle as unknown as [MemoryStatus, ...MemoryStatus[]]),
    ...fields,
  });
  const complete = typed.extend(declFields) as typeof typed;
  return complete.superRefine((rawObj, ctx) => {
    // ponytail: rawObj — распарсенный MemoryObject; дженерик F мешает вывести source
    const obj = rawObj as MemoryObject;
    if (decl.requireSourcePath && !obj.source?.path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'path'],
        message: `${decl.name} requires source.path`,
      });
    }
  });
}

/**
 * Per-type поля всех деклараций таксономии как zod-shape — единый источник
 * входной схемы MCP `add`: поле, добавленное в декларацию, автоматически
 * появляется в MCP-туле. Коллизии ключей между типами (rule.trigger — string,
 * observation.trigger — boolean) схлопываются по kind в union; enum-значения
 * одного ключа объединяются. Все поля optional: обязательность конкретного
 * поля для конкретного типа проверяет домен (add-memory-object → buildTypeSchema).
 */
export function perTypeExtraFields(
  decls: readonly MemoryTypeDeclaration[] = CORE_TAXONOMY
): Record<string, z.ZodTypeAny> {
  const byKey = new Map<string, { kinds: Set<FieldSpec['kind']>; enumValues: Set<string> }>();
  for (const decl of decls) {
    for (const [name, spec] of Object.entries(decl.fields ?? {})) {
      let entry = byKey.get(name);
      if (!entry) {
        entry = { kinds: new Set(), enumValues: new Set() };
        byKey.set(name, entry);
      }
      entry.kinds.add(spec.kind);
      if (spec.kind === 'enum') for (const v of spec.values) entry.enumValues.add(v);
    }
  }
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, { kinds, enumValues }] of byKey) {
    const variants: z.ZodTypeAny[] = [];
    if (kinds.has('string')) variants.push(z.string());
    if (kinds.has('string[]')) variants.push(z.array(z.string()));
    if (kinds.has('boolean')) variants.push(z.boolean());
    if (kinds.has('int')) variants.push(z.number().int());
    if (kinds.has('enum')) variants.push(z.enum([...enumValues] as [string, ...string[]]));
    shape[name] = (variants.length === 1 ? variants[0] : z.union(variants)).optional();
  }
  return shape;
}
