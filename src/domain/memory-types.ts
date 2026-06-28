export type MemoryType =
  | 'document'
  | 'decision'
  | 'lesson'
  | 'observation'
  | 'session-summary'
  | 'open-question';

export type MemoryStatus = 'active' | 'superseded';
export type ReviewState = 'accepted' | 'proposed' | 'rejected';
export type Confidence = 'low' | 'medium' | 'high';
export type SourceKind = 'manual' | 'session' | 'file' | 'scan';

export const MEMORY_TYPES: MemoryType[] = [
  'document',
  'decision',
  'lesson',
  'observation',
  'session-summary',
  'open-question',
];
