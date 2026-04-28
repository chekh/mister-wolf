import { ExecutionState } from '../types/state.js';
import { RuntimeEvent } from '../types/events.js';

export interface StateStore {
  getCaseDir(caseId: string): string;
  writeState(caseId: string, state: ExecutionState): void;
  readState(caseId: string): ExecutionState | null;
  appendEvent(caseId: string, event: RuntimeEvent): void;
  readEvents(caseId: string): RuntimeEvent[];
  writeOutput(caseId: string, stepId: string, stdout: string, stderr?: string): void;
}
