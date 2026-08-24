import type { MemoryStore } from '../../ports/memory-store.port.js';
import type { SearchIndex } from '../../ports/search-index.port.js';
import type { Clock } from '../../ports/clock.port.js';
import { SOLVE_SCENARIOS, tokenize } from '../../domain/solve/scenarios.js';
import { classifyScenario } from '../../domain/solve/classify.js';
import { finalScore } from '../../domain/solve/relevance.js';
import type { MemoryObject } from '../../domain/schemas/memory-object-schema.js';

const ANALYSIS_BY_ID: Record<string, string[]> = {
  'stale-instruction': [
    'Identify which memory objects are outdated or conflicting',
    'Check for supersession relations already recorded',
    'Verify if the correct replacement instruction exists',
  ],
  'missing-rule': [
    'Identify the repeated correction pattern',
    'Determine if any related rule exists but is inactive',
    'Check for existing decisions or articles that cover the topic',
  ],
};

const GENERIC_ANALYSIS = [
  'Review all relevant memory objects for conflicts or gaps',
  'Check for stale or superseded entries that may still influence behavior',
];

const OUTPUT_BY_ID: Record<string, string[]> = {
  'stale-instruction': ['diagnosis', 'Proposed rule update', 'supersedes relation', 'call-injection'],
  'missing-rule': ['new rule proposal', 'supporting article', 'call-injection'],
};

const GENERIC_OUTPUT = ['Diagnosis', 'Proposed action (rule / relation / article)', 'call-injection (if applicable)'];

export async function buildSolvePack(
  deps: { store: MemoryStore; index?: SearchIndex; clock: Clock },
  input: { problem: string; scenarioId?: string }
): Promise<{ markdown: string; objectIds: string[] }> {
  // 1. classify
  const match = input.scenarioId
    ? { scenarioId: input.scenarioId, matchedSymptoms: [] as string[] }
    : classifyScenario(input.problem);

  // 2. scenario lookup
  const scenario = SOLVE_SCENARIOS.find((s) => s.id === match.scenarioId) ?? SOLVE_SCENARIOS[2];

  // 3. keywords
  const keywords = tokenize(input.problem).slice(0, 3);

  // 4. gather candidates
  const candidateMap = new Map<string, { obj: MemoryObject; ftsScore: number }>();

  const dedup = (obj: MemoryObject, ftsScore: number) => {
    const existing = candidateMap.get(obj.id);
    if (!existing || ftsScore > existing.ftsScore) {
      candidateMap.set(obj.id, { obj, ftsScore });
    }
  };

  for (const type of scenario.includeTypes) {
    if (deps.index && keywords.length > 0) {
      for (const kw of keywords) {
        const results = await deps.index.search(kw, { type });
        for (const r of results) {
          dedup(r.object, r.score);
        }
      }
    } else {
      const objs = await deps.store.list({ type });
      for (const obj of objs) {
        dedup(obj, 1);
      }
    }
  }

  // 5. rank, sort desc, top-12
  const now = deps.clock.now();
  const ranked = [...candidateMap.values()]
    .map(({ obj, ftsScore }) => ({
      obj,
      score: finalScore(
        { ftsScore, importance: obj.importance, confidence: obj.confidence, updatedAt: obj.updated_at },
        now
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const objectIds = ranked.map((r) => r.obj.id);

  // 6. render markdown
  const lines: string[] = [];
  lines.push('# Mr. Wolf Solve Pack');
  lines.push('');
  lines.push(`Scenario: ${scenario.id}`);
  if (match.matchedSymptoms.length > 0) {
    lines.push(`Matched symptoms: ${match.matchedSymptoms.join(', ')}`);
  }
  lines.push('');
  lines.push('## Problem');
  lines.push(input.problem);
  lines.push('');

  // What to Analyze
  const analysisItems = ANALYSIS_BY_ID[scenario.id] ?? GENERIC_ANALYSIS;
  lines.push('## What to Analyze');
  for (const a of analysisItems) lines.push(`- ${a}`);
  lines.push('');

  // Relevant Memory
  lines.push('## Relevant Memory');
  if (ranked.length === 0) {
    lines.push('No relevant memory found');
  } else {
    const byType = new Map<string, typeof ranked>();
    for (const r of ranked) {
      const arr = byType.get(r.obj.type) ?? [];
      arr.push(r);
      byType.set(r.obj.type, arr);
    }
    for (const [type, items] of byType) {
      lines.push(`### ${type}`);
      for (const { obj } of items) {
        lines.push(`- ${obj.id} ${obj.title}`);
      }
      lines.push('');
    }
  }

  // Suspected Issue Types
  lines.push('## Suspected Issue Types');
  lines.push(`- ${scenario.id}`);
  lines.push('');

  // Required Output
  const outputItems = OUTPUT_BY_ID[scenario.id] ?? GENERIC_OUTPUT;
  lines.push('## Required Output');
  for (const o of outputItems) lines.push(`- ${o}`);
  lines.push('');

  // Constraints
  lines.push('## Constraints');
  lines.push('- Prefer superseding over deleting');
  lines.push('- Do not create memory objects directly; propose them for user review');
  lines.push('');

  return { markdown: lines.join('\n'), objectIds };
}
