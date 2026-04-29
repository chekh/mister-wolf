import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStateStore } from '../../src/state/file-store.js';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ExecutionState } from '../../src/types/state.js';

describe('FileStateStore', () => {
  let tempDir: string;
  let store: FileStateStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-test-'));
    store = new FileStateStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create case directory', () => {
    const caseDir = store.getCaseDir('case_123');
    expect(caseDir).toContain('case_123');
  });

  it('should write state atomically', () => {
    const state: ExecutionState = {
      case_id: 'case_123',
      workflow_id: 'test',
      status: 'running',
      completed_steps: [],
      failed_steps: [],
      step_results: {},
      variables: {},
      gates: {},
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.writeState('case_123', state);
    const read = store.readState('case_123');
    expect(read).toEqual(state);
  });

  it('should append events', () => {
    const event = {
      id: 'evt_1',
      type: 'test.event',
      case_id: 'case_123',
      timestamp: new Date().toISOString(),
      actor: { type: 'system', id: 'test' },
      payload: {},
    };

    store.appendEvent('case_123', event);
    store.appendEvent('case_123', event);

    const events = store.readEvents('case_123');
    expect(events).toHaveLength(2);
  });
});
