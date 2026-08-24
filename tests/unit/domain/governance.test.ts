import { describe, it, expect } from 'vitest';
import {
  defaultTruthRole,
  governanceDefaults,
  validateGovernance,
  canTransition,
} from '../../../src/domain/governance.js';

describe('governance', () => {
  it('defaults agent-created objects to proposed knowledge', () => {
    const defaults = governanceDefaults('agent:opencode');
    expect(defaults.memory_class).toBe('working');
    expect(defaults.truth_role).toBe('proposed_knowledge');
    expect(defaults.lifetime).toBe('long_term');
  });

  it('defaults user-created objects to accepted knowledge', () => {
    const defaults = governanceDefaults('user:cli');
    expect(defaults.memory_class).toBe('working');
    expect(defaults.truth_role).toBe('accepted_knowledge');
    expect(defaults.lifetime).toBe('long_term');
  });

  it('warns when source_of_truth is not canonical', () => {
    const warnings = validateGovernance({
      memory_class: 'working',
      truth_role: 'source_of_truth',
      lifetime: 'long_term',
    });
    expect(warnings).toContain('source_of_truth requires memory_class canonical.');
  });

  it('allows source_of_truth when canonical', () => {
    const warnings = validateGovernance({
      memory_class: 'canonical',
      truth_role: 'source_of_truth',
      lifetime: 'long_term',
    });
    expect(warnings).toHaveLength(0);
  });

  it('allows active to stale', () => {
    expect(canTransition('active', 'stale')).toBe(true);
  });

  it('disallows arbitrary transitions', () => {
    expect(canTransition('archived', 'active')).toBe(false);
  });
});

describe('phase 8 transitions', () => {
  it('allows active -> completed (task-brief, report, work-thread)', () => {
    expect(canTransition('active', 'completed')).toBe(true);
  });
  it('allows open -> answered (council-question, decision-request)', () => {
    expect(canTransition('open', 'answered')).toBe(true);
  });
});
