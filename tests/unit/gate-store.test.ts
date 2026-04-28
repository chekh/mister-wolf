import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GateStore } from '../../src/state/gate-store.js';
import { CaseStore } from '../../src/state/case-store.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('GateStore', () => {
  let tempDir: string;
  let caseStore: CaseStore;
  let gateStore: GateStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-gate-'));
    caseStore = new CaseStore(tempDir);
    gateStore = new GateStore(caseStore);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should approve gate', () => {
    caseStore.createCase('case_123', { id: 'w', version: '0.1.0', steps: [] }, 'r');
    gateStore.createGate('case_123', 'step1');
    gateStore.approveGate('gate_case_123_step1', 'user');

    const state = caseStore.readState('case_123');
    expect(state?.gates['gate_case_123_step1'].status).toBe('approved');
  });
});
