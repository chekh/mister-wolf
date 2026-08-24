import { SOLVE_SCENARIOS, tokenize } from './scenarios.js';

export interface ScenarioMatch {
  scenarioId: string;
  matchedSymptoms: string[];
}

export function classifyScenario(problemText: string): ScenarioMatch {
  const tokens = new Set(tokenize(problemText));
  let best = { id: 'generic', score: 0, matched: [] as string[] };
  for (const scenario of SOLVE_SCENARIOS) {
    const matched = scenario.symptoms.filter((s) => tokens.has(s));
    if (matched.length > best.score) {
      best = { id: scenario.id, score: matched.length, matched };
    }
  }
  return { scenarioId: best.id, matchedSymptoms: best.matched };
}
