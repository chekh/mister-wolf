import { StateStore } from './store.js';
import { ExecutionState } from '../types/state.js';
import { RuntimeEvent } from '../types/events.js';
import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

export class FileStateStore implements StateStore {
  constructor(private baseDir: string) {}

  getCaseDir(caseId: string): string {
    return join(this.baseDir, 'cases', caseId);
  }

  private ensureCaseDir(caseId: string): void {
    const dir = this.getCaseDir(caseId);
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, 'outputs'), { recursive: true });
  }

  writeState(caseId: string, state: ExecutionState): void {
    this.ensureCaseDir(caseId);
    const statePath = join(this.getCaseDir(caseId), 'state.json');
    const tmpPath = statePath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(state, null, 2));
    renameSync(tmpPath, statePath);
  }

  readState(caseId: string): ExecutionState | null {
    const statePath = join(this.getCaseDir(caseId), 'state.json');
    if (!existsSync(statePath)) return null;
    const content = readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as ExecutionState;
  }

  appendEvent(caseId: string, event: RuntimeEvent): void {
    this.ensureCaseDir(caseId);
    const eventsPath = join(this.getCaseDir(caseId), 'events.jsonl');
    const line = JSON.stringify(event) + '\n';
    appendFileSync(eventsPath, line);
  }

  readEvents(caseId: string): RuntimeEvent[] {
    const eventsPath = join(this.getCaseDir(caseId), 'events.jsonl');
    if (!existsSync(eventsPath)) return [];
    const content = readFileSync(eventsPath, 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  writeOutput(caseId: string, stepId: string, stdout: string, stderr?: string): void {
    this.ensureCaseDir(caseId);
    const outputsDir = join(this.getCaseDir(caseId), 'outputs');
    writeFileSync(join(outputsDir, `${stepId}.stdout.txt`), stdout);
    if (stderr !== undefined) {
      writeFileSync(join(outputsDir, `${stepId}.stderr.txt`), stderr);
    }
  }
}
