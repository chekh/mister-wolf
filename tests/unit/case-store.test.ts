import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CaseStore } from '../../src/state/case-store.js';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('CaseStore', () => {
  let tempDir: string;
  let store: CaseStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-case-'));
    store = new CaseStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create case with snapshot', () => {
    const workflow = { id: 'test', version: '0.1.0', steps: [] };
    store.createCase('case_123', workflow, 'raw request');

    expect(existsSync(join(tempDir, 'cases', 'case_123', 'case.yaml'))).toBe(true);
    expect(existsSync(join(tempDir, 'cases', 'case_123', 'workflow.yaml'))).toBe(true);

    const snapshot = store.loadWorkflowSnapshot('case_123');
    expect(snapshot.id).toBe('test');
  });

  it('should write artifact', () => {
    store.createCase('case_123', { id: 'w', version: '0.1.0', steps: [] }, 'r');
    store.writeArtifact('case_123', 'step1', 'reports/output.txt', 'artifact content');

    const artifactPath = join(tempDir, 'cases', 'case_123', 'artifacts', 'reports', 'output.txt');
    expect(existsSync(artifactPath)).toBe(true);
    expect(readFileSync(artifactPath, 'utf-8')).toBe('artifact content');
  });
});
