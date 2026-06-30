export const MEMORY_TYPES = [
  'document',
  'decision',
  'lesson',
  'observation',
  'session-summary',
  'open-question',
  'context',
  'work-thread',
  'info-request',
  'article',
  'blocker',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export type MemoryStatus =
  | 'active'
  | 'open'
  | 'resolved'
  | 'stale'
  | 'conflicting'
  | 'superseded'
  | 'archived'
  | 'paused'
  | 'completed'
  | 'answered'
  | 'rejected'
  | 'obsolete'
  | 'proposed'
  | 'accepted';
export type ReviewState = 'accepted' | 'proposed' | 'rejected';
export type Confidence = 'low' | 'medium' | 'high';
export type SourceKind = 'manual' | 'session' | 'file' | 'scan';
