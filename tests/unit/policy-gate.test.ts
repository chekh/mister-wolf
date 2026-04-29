import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolicyGateAdapter } from '../../src/policy/gate-adapter.js';
import { GateStore } from '../../src/state/gate-store.js';
import { CaseStore } from '../../src/state/case-store.js';
import { PolicyDecision } from '../../src/types/policy.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function makeDecision(partial: Partial<PolicyDecision> = {}): PolicyDecision {
  return {
    id: partial.id ?? 'dec_1',
    decision: partial.decision ?? 'ask',
    risk: partial.risk ?? 'medium',
    rule_id: partial.rule_id,
    reason: partial.reason ?? 'Needs approval',
    enforcement: 'step_runtime',
    subject: partial.subject ?? {
      workflow_id: 'wf1',
      step_id: 's1',
      runner: 'shell',
    },
    matched_rules: partial.matched_rules ?? ['r1'],
  };
}

describe('PolicyGateAdapter', () => {
  let tempDir: string;
  let caseStore: CaseStore;
  let gateStore: GateStore;
  let adapter: PolicyGateAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-policy-gate-'));
    caseStore = new CaseStore(tempDir);
    gateStore = new GateStore(caseStore);
    adapter = new PolicyGateAdapter(gateStore);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create policy gate via PolicyGateAdapter', () => {
    caseStore.createCase('case_123', { id: 'w', version: '0.1.0', steps: [] }, 'r');
    const decision = makeDecision();
    const gateId = adapter.createPolicyGate('case_123', 's1', decision, { cmd: 'echo hi' });

    expect(gateId).toBe('gate_case_123_s1');

    const found = gateStore.getGate(gateId);
    expect(found).not.toBeNull();
    expect(found?.gate.type).toBe('policy_approval');
    expect(found?.gate.status).toBe('pending');
    expect(found?.gate.payload).toEqual({
      decision,
      workflow_id: 'wf1',
      step_id: 's1',
      runner: 'shell',
      resolved_input: { cmd: 'echo hi' },
    });
  });

  it('should return true for approved policy gate', () => {
    caseStore.createCase('case_123', { id: 'w', version: '0.1.0', steps: [] }, 'r');
    const decision = makeDecision();
    adapter.createPolicyGate('case_123', 's1', decision, {});
    gateStore.approveGate('gate_case_123_s1', 'admin');

    expect(adapter.isPolicyGateApproved('case_123', 's1')).toBe(true);
  });

  it('should return false for pending policy gate', () => {
    caseStore.createCase('case_123', { id: 'w', version: '0.1.0', steps: [] }, 'r');
    const decision = makeDecision();
    adapter.createPolicyGate('case_123', 's1', decision, {});

    expect(adapter.isPolicyGateApproved('case_123', 's1')).toBe(false);
  });

  it('should return false for rejected policy gate', () => {
    caseStore.createCase('case_123', { id: 'w', version: '0.1.0', steps: [] }, 'r');
    const decision = makeDecision();
    adapter.createPolicyGate('case_123', 's1', decision, {});
    gateStore.rejectGate('gate_case_123_s1', 'admin');

    expect(adapter.isPolicyGateApproved('case_123', 's1')).toBe(false);
  });

  it('should return false for manual gate', () => {
    caseStore.createCase('case_123', { id: 'w', version: '0.1.0', steps: [] }, 'r');
    gateStore.createGate('case_123', 's1');
    gateStore.approveGate('gate_case_123_s1', 'admin');

    expect(adapter.isPolicyGateApproved('case_123', 's1')).toBe(false);
  });

  it('should create gate with type and payload via GateStore', () => {
    caseStore.createCase('case_123', { id: 'w', version: '0.1.0', steps: [] }, 'r');
    const payload = { reason: 'test', value: 42 };
    gateStore.createGate('case_123', 's1', 'custom_type', payload);

    const found = gateStore.getGate('gate_case_123_s1');
    expect(found).not.toBeNull();
    expect(found?.gate.type).toBe('custom_type');
    expect(found?.gate.payload).toEqual(payload);
  });
});
