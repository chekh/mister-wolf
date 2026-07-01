export const MemoryGetInputSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
  },
  required: ['id'],
} as const;

export const MemoryListInputSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    status: { type: 'string' },
    stale: { type: 'boolean' },
    memoryClass: { type: 'string' },
    truthRole: { type: 'string' },
    lifetime: { type: 'string' },
  },
} as const;

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
    createdBy: { type: 'string' },
  },
  required: ['type', 'title', 'createdBy'],
} as const;

export const MemoryTransitionInputSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    status: { type: 'string' },
  },
  required: ['id', 'status'],
} as const;

export const MemoryCreateThreadInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    goal: { type: 'string' },
    currentState: { type: 'string' },
    nextSteps: { type: 'array', items: { type: 'string' } },
    createdBy: { type: 'string' },
  },
  required: ['title', 'goal', 'createdBy'],
} as const;

export const MemoryCreateInfoRequestInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    thread: { type: 'string' },
    question: { type: 'string' },
    detourReason: { type: 'string' },
    neededFor: { type: 'array', items: { type: 'string' } },
    expectedAnswer: { type: 'array', items: { type: 'string' } },
    preliminaryAnswer: { type: 'string' },
    createdBy: { type: 'string' },
  },
  required: ['title', 'thread', 'question', 'detourReason', 'expectedAnswer', 'createdBy'],
} as const;

export const MemoryCreateArticleInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    thread: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
    answers: { type: 'array', items: { type: 'string' } },
    supports: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'string' } },
    createdBy: { type: 'string' },
  },
  required: ['title', 'thread', 'summary', 'body', 'createdBy'],
} as const;

export const MemoryCreateDecisionInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    thread: { type: 'string' },
    basedOn: { type: 'array', items: { type: 'string' } },
    createdBy: { type: 'string' },
  },
  required: ['title', 'body', 'createdBy'],
} as const;

export const MemoryCreateBlockerInputSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    impact: { type: 'string' },
    workaround: { type: 'string' },
    thread: { type: 'string' },
    createdBy: { type: 'string' },
  },
  required: ['title', 'impact', 'createdBy'],
} as const;

export const MemoryResolveBlockerInputSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    resolvedBy: { type: 'string' },
  },
  required: ['id'],
} as const;
