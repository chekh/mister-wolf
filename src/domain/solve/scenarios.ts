import { MemoryType } from '../memory-types.js';

export const STOP_WORDS: ReadonlySet<string> = new Set([
  // en
  'the',
  'a',
  'an',
  'is',
  'are',
  'to',
  'of',
  'and',
  'or',
  'in',
  'on',
  'with',
  'for',
  'keeps',
  'keep',
  'agent',
  // ru
  'и',
  'в',
  'на',
  'с',
  'по',
  'для',
  'не',
  'что',
  'это',
]);

export interface SolveScenario {
  id: string;
  title: string;
  symptoms: readonly string[];
  includeTypes: readonly MemoryType[];
}

export const SOLVE_SCENARIOS: readonly SolveScenario[] = [
  {
    id: 'stale-instruction',
    title: 'Agent follows outdated instruction',
    symptoms: [
      'deprecated',
      'forbidden',
      'outdated',
      'stale',
      'old',
      'command',
      'instruction',
      'superseded',
      'obsolete',
    ],
    includeTypes: ['rule', 'decision', 'session-checkpoint'],
  },
  {
    id: 'missing-rule',
    title: 'Repeated correction without active rule',
    symptoms: ['repeats', 'repeated', 'correction', 'convention', 'missing', 'rule', 'instruction', 'durable'],
    includeTypes: ['rule', 'decision', 'article'],
  },
  {
    id: 'generic',
    title: 'Generic memory review',
    symptoms: [],
    includeTypes: ['rule', 'decision', 'article', 'document-ref', 'session-checkpoint'],
  },
];

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zа-яё]+/i)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}
