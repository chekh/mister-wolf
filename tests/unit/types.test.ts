import { describe, it, expect } from 'vitest';
import { WorkflowDefinitionSchema } from '../../src/types/workflow.js';
import { CaseStatus } from '../../src/types/case.js';
import { RuntimeEventSchema } from '../../src/types/events.js';
import { ExecutionStateSchema } from '../../src/types/state.js';

describe('types', () => {
  it('should export WorkflowDefinitionSchema', () => {
    expect(WorkflowDefinitionSchema).toBeDefined();
  });

  it('should export CaseStatus enum values', () => {
    expect(CaseStatus.CREATED).toBe('created');
    expect(CaseStatus.RUNNING).toBe('running');
    expect(CaseStatus.PAUSED).toBe('paused');
    expect(CaseStatus.COMPLETED).toBe('completed');
    expect(CaseStatus.FAILED).toBe('failed');
    expect(CaseStatus.CANCELLED).toBe('cancelled');
  });

  it('should export RuntimeEventSchema', () => {
    expect(RuntimeEventSchema).toBeDefined();
  });

  it('should export ExecutionStateSchema', () => {
    expect(ExecutionStateSchema).toBeDefined();
  });
});
