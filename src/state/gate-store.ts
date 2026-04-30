import { CaseStore } from './case-store.js';
import { GateState } from '../types/state.js';
import { SQLiteIndex } from './sqlite-index.js';

export class GateStore {
  private caseStore: CaseStore;

  constructor(
    caseStoreOrPath: CaseStore | string,
    private index?: SQLiteIndex
  ) {
    if (typeof caseStoreOrPath === 'string') {
      this.caseStore = new CaseStore(caseStoreOrPath);
    } else {
      this.caseStore = caseStoreOrPath;
    }
  }

  createGate(caseId: string, stepId: string, type?: string, payload?: Record<string, unknown>): string {
    const gateId = `gate_${caseId}_${stepId}`;
    const state = this.caseStore.readState(caseId);
    if (!state) throw new Error(`Case not found: ${caseId}`);

    // If gate already exists, don't overwrite
    if (state.gates[gateId]) {
      return gateId;
    }

    const gate: GateState = {
      step_id: stepId,
      status: 'pending',
      requested_at: new Date().toISOString(),
      type: type ?? 'manual',
      payload,
    };

    state.gates[gateId] = gate;
    this.caseStore.writeState(caseId, state);

    this.index?.insertGate({
      id: gateId,
      case_id: caseId,
      step_id: stepId,
      status: gate.status,
      requested_at: gate.requested_at,
      type: gate.type,
      payload: gate.payload ? JSON.stringify(gate.payload) : undefined,
    });

    return gateId;
  }

  getGate(gateId: string): { caseId: string; stepId: string; gate: GateState } | null {
    // gateId format: gate_{caseId}_{stepId}
    // caseId format: case_{uuid} (uuid has no underscores)
    // stepId may contain underscores
    const prefix = 'gate_';
    if (!gateId.startsWith(prefix)) return null;

    const rest = gateId.slice(prefix.length);
    const casePrefix = 'case_';
    if (!rest.startsWith(casePrefix)) return null;

    const afterCasePrefix = rest.slice(casePrefix.length);
    const firstUnderscore = afterCasePrefix.indexOf('_');
    if (firstUnderscore === -1) return null;

    const caseId = 'case_' + afterCasePrefix.slice(0, firstUnderscore);
    const stepId = afterCasePrefix.slice(firstUnderscore + 1);

    const state = this.caseStore.readState(caseId);
    if (!state) return null;

    const gate = state.gates[gateId];
    if (!gate) return null;

    return { caseId, stepId, gate };
  }

  approveGate(gateId: string, approvedBy: string): void {
    this.updateGate(gateId, 'approved', approvedBy);
  }

  rejectGate(gateId: string, rejectedBy: string): void {
    this.updateGate(gateId, 'rejected', rejectedBy);
  }

  private updateGate(gateId: string, status: 'approved' | 'rejected', actor: string): void {
    const found = this.getGate(gateId);
    if (!found) throw new Error(`Gate not found: ${gateId}`);

    const { caseId } = found;
    const state = this.caseStore.readState(caseId)!;
    const respondedAt = new Date().toISOString();
    state.gates[gateId].status = status;
    state.gates[gateId].responded_at = respondedAt;
    state.gates[gateId].responded_by = actor;
    if (status === 'rejected') {
      state.status = 'failed';
    }
    this.caseStore.writeState(caseId, state);

    this.index?.updateGate(gateId, status, respondedAt);
  }
}
