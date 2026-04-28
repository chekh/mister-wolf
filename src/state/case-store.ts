import { FileStateStore } from './file-store.js';
import { WorkflowDefinition } from '../types/workflow.js';
import { ExecutionState } from '../types/state.js';
import { CaseMetadata, CaseStatus } from '../types/case.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

export class CaseStore {
  private fileStore: FileStateStore;

  constructor(baseDir: string) {
    this.fileStore = new FileStateStore(baseDir);
  }

  createCase(caseId: string, workflow: WorkflowDefinition, rawRequest: string): void {
    const caseDir = this.fileStore.getCaseDir(caseId);
    mkdirSync(caseDir, { recursive: true });

    const meta: CaseMetadata = {
      case_id: caseId,
      workflow_id: workflow.id,
      workflow_version: workflow.version,
      title: workflow.name || workflow.id,
      status: CaseStatus.CREATED,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    writeFileSync(join(caseDir, 'case.yaml'), yaml.dump(meta));
    writeFileSync(join(caseDir, 'workflow.yaml'), yaml.dump(workflow));

    const state: ExecutionState = {
      case_id: caseId,
      workflow_id: workflow.id,
      status: 'pending',
      completed_steps: [],
      failed_steps: [],
      step_results: {},
      variables: {},
      gates: {},
      started_at: meta.created_at,
      updated_at: meta.created_at,
    };

    this.fileStore.writeState(caseId, state);
  }

  loadWorkflowSnapshot(caseId: string): WorkflowDefinition {
    const path = join(this.fileStore.getCaseDir(caseId), 'workflow.yaml');
    const content = readFileSync(path, 'utf-8');
    return yaml.load(content) as WorkflowDefinition;
  }

  updateCaseStatus(caseId: string, status: string): void {
    const caseDir = this.fileStore.getCaseDir(caseId);
    const path = join(caseDir, 'case.yaml');
    if (!existsSync(path)) return;
    const meta = yaml.load(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    meta.status = status;
    meta.updated_at = new Date().toISOString();
    writeFileSync(path, yaml.dump(meta));
  }

  writeState(caseId: string, state: ExecutionState): void {
    this.fileStore.writeState(caseId, state);
  }

  readState(caseId: string): ExecutionState | null {
    return this.fileStore.readState(caseId);
  }

  appendEvent(caseId: string, event: unknown): void {
    this.fileStore.appendEvent(caseId, event as any);
  }

  writeOutput(caseId: string, stepId: string, stdout: string, stderr?: string): void {
    this.fileStore.writeOutput(caseId, stepId, stdout, stderr);
  }
}
