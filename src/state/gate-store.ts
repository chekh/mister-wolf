import { CaseStore } from './case-store.js';
import { GateState } from '../types/state.js';
import { SQLiteIndex } from './sqlite-index.js';

export class GateStore {
  constructor(private caseStore: CaseStore, private index?: SQLiteIndex) {}

  createGate(caseId: string, stepId: string): string {
    const gateId = `gate_${caseId}_${stepId}`;
    const state = this.caseStore.readState(caseId);
    if (!state) throw new Error(`Case not found: ${caseId}`);

    const gate: GateState = {
      step_id: stepId,
      status: 'pending',
      requested_at: new Date().toISOString(),
    };

    state.gates[gateId] = gate;
    this.caseStore.writeState(caseId, state);

    this.index?.insertGate({
      id: gateId,
      case_id: caseId,
      step_id: stepId,
      status: gate.status,
      requested_at: gate.requested_at,
    });

    return gateId;
  }

  getGate(gateId: string): { caseId: string; stepId: string; gate: GateState } | null {
    const parts = gateId.split('_');
    if (parts.length < 3) return null;
    const stepId = parts.pop()!;
    const caseId = parts.slice(1).join('_');

    const state = this.caseStore.readState(caseId);
    if (!state) return null;

    const gate = state.gates[gateId];
    if (!gate) return null;

    return { caseId, stepId, gate };
  }

  approveGate(gateId: string, approvedBy: string): void {
    const found = this.getGate(gateId);
    if (!found) throw new Error(`Gate not found: ${gateId}`);

    const { caseId } = found;
    const state = this.caseStore.readState(caseId)!;
    const respondedAt = new Date().toISOString();
    state.gates[gateId].status = 'approved';
    state.gates[gateId].responded_at = respondedAt;
    state.gates[gateId].responded_by = approvedBy;
    this.caseStore.writeState(caseId, state);

    this.index?.updateGate(gateId, 'approved', respondedAt);
  }

  rejectGate(gateId: string, rejectedBy: string): void {
    const found = this.getGate(gateId);
    if (!found) throw new Error(`Gate not found: ${gateId}`);

    const { caseId } = found;
    const state = this.caseStore.readState(caseId)!;
    const respondedAt = new Date().toISOString();
    state.gates[gateId].status = 'rejected';
    state.gates[gateId].responded_at = respondedAt;
    state.gates[gateId].responded_by = rejectedBy;
    state.status = 'failed';
    this.caseStore.writeState(caseId, state);

    this.index?.updateGate(gateId, 'rejected', respondedAt);
  }
}
