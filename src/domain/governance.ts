import type { MemoryStatus } from './memory-types.js';

export type MemoryClass = 'working' | 'canonical';
export type TruthRole = 'proposed_knowledge' | 'accepted_knowledge' | 'source_of_truth';
export type Lifetime = 'long_term' | 'short_term' | 'session';

export function defaultTruthRole(createdBy: string): TruthRole {
  return createdBy.startsWith('agent:') ? 'proposed_knowledge' : 'accepted_knowledge';
}

export function governanceDefaults(createdBy: string): {
  memory_class: MemoryClass;
  truth_role: TruthRole;
  lifetime: Lifetime;
} {
  return {
    memory_class: 'working',
    truth_role: defaultTruthRole(createdBy),
    lifetime: 'long_term',
  };
}

export function validateGovernance(obj: {
  memory_class: MemoryClass;
  truth_role: TruthRole;
  lifetime: Lifetime;
}): string[] {
  const warnings: string[] = [];
  if (obj.truth_role === 'source_of_truth' && obj.memory_class !== 'canonical') {
    warnings.push('source_of_truth requires memory_class canonical.');
  }
  return warnings;
}

export const ALLOWED_TRANSITIONS: Record<MemoryStatus, MemoryStatus[]> = {
  // resolved/obsolete/answered из active нужны блокерам и вопросам (open-question);
  // deprecated из active — типу tool (Фаза C); эффективные переходы =
  // ALLOWED_TRANSITIONS ∩ lifecycle типа.
  active: [
    'stale',
    'superseded',
    'archived',
    'conflicting',
    'completed',
    'resolved',
    'obsolete',
    'answered',
    'deprecated',
  ],
  open: ['resolved', 'rejected', 'archived', 'answered'],
  resolved: ['archived'],
  stale: ['active', 'archived'],
  conflicting: ['active', 'archived'],
  superseded: [],
  archived: [],
  paused: ['active', 'archived'],
  completed: ['archived'],
  answered: ['archived'],
  rejected: ['archived'],
  obsolete: ['archived'],
  proposed: ['accepted', 'rejected', 'archived'],
  accepted: ['active', 'obsolete', 'archived'],
  // tool (Фаза C): кандидат подтверждается или отбрасывается
  candidate: ['active', 'deprecated', 'archived'],
  // реанимация инструмента — deprecated → active разрешена
  deprecated: ['active', 'archived'],
};

export function canTransition(from: MemoryStatus, to: MemoryStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
