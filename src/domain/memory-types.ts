export const MEMORY_TYPES = [
  'document',
  'decision',
  'lesson',
  'observation',
  'session-summary',
  'open-question',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export type MemoryStatus = 'active' | 'superseded';
export type ReviewState = 'accepted' | 'proposed' | 'rejected';
export type Confidence = 'low' | 'medium' | 'high';
export type SourceKind = 'manual' | 'session' | 'file' | 'scan';
