import { z } from 'zod';
import { MemoryObjectSchema } from './schemas/memory-object-schema.js';
import { type FieldSpec, type MemoryStatus, type MemoryTypeDeclaration } from './memory-types.js';

function fieldToZod(spec: FieldSpec): z.ZodTypeAny {
  switch (spec.kind) {
    case 'string':
      if ('required' in spec && spec.required) {
        const s = z.string();
        return spec.min !== undefined ? s.min(spec.min) : s;
      }
      if ('optional' in spec && spec.optional) return z.string().optional();
      return z.string().default(spec.default);
    case 'string[]':
      if ('required' in spec && spec.required) return z.array(z.string()).min(spec.minItems ?? 0);
      return z.array(z.string()).default(spec.default ?? []);
    case 'enum':
      return z.enum(spec.values as [string, ...string[]]);
  }
}

export function buildTypeSchema(decl: MemoryTypeDeclaration) {
  const fields: Record<string, z.ZodTypeAny> = {
    type: z.literal(decl.name),
    status: z.enum(decl.lifecycle as unknown as [MemoryStatus, ...MemoryStatus[]]),
  };
  for (const [name, spec] of Object.entries(decl.fields ?? {})) {
    fields[name] = fieldToZod(spec);
  }
  let schema = MemoryObjectSchema.extend(fields);
  if (decl.requireSourcePath) {
    schema = schema.superRefine((obj, ctx) => {
      if (!obj.source?.path) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['source', 'path'],
          message: `${decl.name} requires source.path`,
        });
      }
    });
  }
  return schema;
}
