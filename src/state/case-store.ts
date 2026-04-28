import { FileStateStore } from './file-store.js';
import { WorkflowDefinition } from '../types/workflow.js';
import { ExecutionState } from '../types/state.js';
import { CaseMetadata, CaseStatus } from '../types/case.js';
import { SQLiteIndex } from './sqlite-index.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'js-yaml';

export class CaseStore {
  private fileStore: FileStateStore;

  constructor(baseDir: string, private index?: SQLiteIndex) {
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

    this.index?.insertCase({
      id: caseId,
      workflow_id: workflow.id,
      status: meta.status,
      created_at: meta.created_at,
      updated_at: meta.updated_at,
      path: caseDir,
    });

    const state: ExecutionState = {
      case_id: caseId,
      workflow_id: workflow.id,
      status: 'pending',
      completed_steps: [],
      failed_steps: [],
      skipped_steps: [],
      step_results: {},
      step_statuses: {},
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

    this.index?.insertCase({
      id: caseId,
      workflow_id: String(meta.workflow_id || ''),
      status: String(meta.status),
      created_at: String(meta.created_at || ''),
      updated_at: String(meta.updated_at),
      path: caseDir,
    });
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

  writeArtifact(caseId: string, stepId: string, artifactPath: string, content: string): void {
    const caseDir = this.fileStore.getCaseDir(caseId);
    const fullPath = join(caseDir, 'artifacts', artifactPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
}
