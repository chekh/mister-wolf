export const MemorySearchInputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    type: { type: 'string' },
    status: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    memoryClass: { type: 'string' },
    truthRole: { type: 'string' },
    lifetime: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    minImportance: { type: 'number' },
    maxImportance: { type: 'number' },
    createdAfter: { type: 'string' },
    createdBefore: { type: 'string' },
    limit: { type: 'number' },
    includeSuperseded: { type: 'boolean' },
  },
  required: ['query'],
} as const;

export const MemoryAddInputSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    importance: { type: 'number' },
    memoryClass: { type: 'string' },
    truthRole: { type: 'string' },
    lifetime: { type: 'string' },
    createdBy: { type: 'string' },
  },
  required: ['type', 'title', 'createdBy'],
} as const;
