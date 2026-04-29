import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CaseMemoryReader } from '../../src/context/case-memory.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ContextConfig } from '../../src/config/project-config.js';
import yaml from 'js-yaml';

describe('CaseMemoryReader', () => {
  let tempDir: string;
  let reader: CaseMemoryReader;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-case-mem-'));
    reader = new CaseMemoryReader();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function defaultConfig(overrides?: Partial<ContextConfig>): ContextConfig {
    return {
      include: ['**/*'],
      exclude: [],
      limits: {
        max_files: 100,
        max_bytes: 10485760,
        max_file_bytes: 1048576,
        max_cases: 10,
      },
      include_content: true,
      markdown_render_chars: 1000,
      output: {
        bundle: '.wolf/context/context-bundle.json',
        markdown: '.wolf/context/context.md',
      },
      scenarios: [],
      ...overrides,
    } as ContextConfig;
  }

  function createCase(
    caseId: string,
    status: string,
    updatedAt: string,
    overrides?: {
      workflow_id?: string;
      created_at?: string;
      completed_steps?: string[];
      failed_steps?: string[];
      artifact_count?: number;
    }
  ): void {
    const caseDir = join(tempDir, caseId);
    mkdirSync(caseDir, { recursive: true });

    const caseMeta = {
      case_id: caseId,
      workflow_id: overrides?.workflow_id || 'wf-test',
      status,
      created_at: overrides?.created_at || updatedAt,
      updated_at: updatedAt,
    };
    writeFileSync(join(caseDir, 'case.yaml'), yaml.dump(caseMeta));

    const state = {
      case_id: caseId,
      workflow_id: overrides?.workflow_id || 'wf-test',
      status: 'pending',
      execution_mode: 'sequential',
      completed_steps: overrides?.completed_steps || [],
      failed_steps: overrides?.failed_steps || [],
      skipped_steps: [],
      step_results: {},
      step_statuses: {},
      variables: {},
      gates: {},
      started_at: overrides?.created_at || updatedAt,
      updated_at: updatedAt,
    };
    writeFileSync(join(caseDir, 'state.json'), JSON.stringify(state, null, 2));

    if (overrides?.artifact_count && overrides.artifact_count > 0) {
      const artifactsDir = join(caseDir, 'artifacts');
      mkdirSync(artifactsDir, { recursive: true });
      for (let i = 0; i < overrides.artifact_count; i++) {
        writeFileSync(join(artifactsDir, `artifact-${i}.txt`), `content ${i}`);
      }
    }
  }

  it('should read case metadata', () => {
    createCase('case-001', 'completed', '2024-01-15T10:00:00Z', {
      workflow_id: 'wf-demo',
      created_at: '2024-01-15T09:00:00Z',
      completed_steps: ['step1', 'step2'],
      failed_steps: [],
    });

    const result = reader.read(tempDir, defaultConfig());

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]).toMatchObject({
      case_id: 'case-001',
      workflow_id: 'wf-demo',
      status: 'completed',
      created_at: '2024-01-15T09:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      artifact_count: 0,
      completed_steps: ['step1', 'step2'],
      failed_steps: [],
    });
    expect(result.metadata.cases_read).toBe(1);
    expect(result.metadata.total_cases).toBe(1);
    expect(result.metadata.skipped_cases).toEqual([]);
  });

  it('should sort by updated_at descending, then case_id ascending', () => {
    createCase('case-a', 'completed', '2024-01-15T10:00:00Z');
    createCase('case-b', 'completed', '2024-01-15T12:00:00Z');
    createCase('case-c', 'completed', '2024-01-15T10:00:00Z');

    const result = reader.read(tempDir, defaultConfig());
    const ids = result.cases.map((c) => c.case_id);

    expect(ids).toEqual(['case-b', 'case-a', 'case-c']);
  });

  it('should apply max_cases limit after sorting', () => {
    createCase('case-001', 'completed', '2024-01-15T10:00:00Z');
    createCase('case-002', 'completed', '2024-01-15T11:00:00Z');
    createCase('case-003', 'completed', '2024-01-15T12:00:00Z');

    const result = reader.read(
      tempDir,
      defaultConfig({ limits: { max_files: 100, max_bytes: 10485760, max_file_bytes: 1048576, max_cases: 2 } })
    );

    expect(result.cases).toHaveLength(2);
    expect(result.cases[0].case_id).toBe('case-003');
    expect(result.cases[1].case_id).toBe('case-002');
    expect(result.metadata.cases_read).toBe(2);
    expect(result.metadata.total_cases).toBe(3);
  });

  it('should tolerate missing case.yaml', () => {
    createCase('case-good', 'completed', '2024-01-15T10:00:00Z');

    const badCaseDir = join(tempDir, 'case-bad');
    mkdirSync(badCaseDir, { recursive: true });
    writeFileSync(join(badCaseDir, 'state.json'), JSON.stringify({ case_id: 'case-bad' }));

    const result = reader.read(tempDir, defaultConfig());

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].case_id).toBe('case-good');
    expect(result.metadata.skipped_cases).toContain('case-bad');
    expect(result.metadata.total_cases).toBe(2);
  });

  it('should tolerate missing state.json', () => {
    createCase('case-good', 'completed', '2024-01-15T10:00:00Z');

    const badCaseDir = join(tempDir, 'case-bad');
    mkdirSync(badCaseDir, { recursive: true });
    writeFileSync(join(badCaseDir, 'case.yaml'), yaml.dump({ case_id: 'case-bad' }));

    const result = reader.read(tempDir, defaultConfig());

    expect(result.cases).toHaveLength(1);
    expect(result.metadata.skipped_cases).toContain('case-bad');
  });

  it('should tolerate corrupt files', () => {
    createCase('case-good', 'completed', '2024-01-15T10:00:00Z');

    const badCaseDir = join(tempDir, 'case-bad');
    mkdirSync(badCaseDir, { recursive: true });
    writeFileSync(join(badCaseDir, 'case.yaml'), 'not: valid: yaml: [:');
    writeFileSync(join(badCaseDir, 'state.json'), '{ invalid json');

    const result = reader.read(tempDir, defaultConfig());

    expect(result.cases).toHaveLength(1);
    expect(result.metadata.skipped_cases).toContain('case-bad');
  });

  it('should count artifacts recursively', () => {
    const caseDir = join(tempDir, 'case-art');
    mkdirSync(caseDir, { recursive: true });

    writeFileSync(
      join(caseDir, 'case.yaml'),
      yaml.dump({
        case_id: 'case-art',
        workflow_id: 'wf-test',
        status: 'completed',
        created_at: '2024-01-15T09:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      })
    );
    writeFileSync(
      join(caseDir, 'state.json'),
      JSON.stringify({
        case_id: 'case-art',
        completed_steps: [],
        failed_steps: [],
      })
    );

    const artifactsDir = join(caseDir, 'artifacts');
    mkdirSync(join(artifactsDir, 'nested'), { recursive: true });
    writeFileSync(join(artifactsDir, 'a.txt'), 'a');
    writeFileSync(join(artifactsDir, 'b.txt'), 'b');
    writeFileSync(join(artifactsDir, 'nested', 'c.txt'), 'c');

    const result = reader.read(tempDir, defaultConfig());

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].artifact_count).toBe(3);
  });

  it('should use artifact_count from state when artifacts dir is missing', () => {
    const caseDir = join(tempDir, 'case-meta');
    mkdirSync(caseDir, { recursive: true });

    writeFileSync(
      join(caseDir, 'case.yaml'),
      yaml.dump({
        case_id: 'case-meta',
        workflow_id: 'wf-test',
        status: 'completed',
        created_at: '2024-01-15T09:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      })
    );
    writeFileSync(
      join(caseDir, 'state.json'),
      JSON.stringify({
        case_id: 'case-meta',
        artifact_count: 5,
        completed_steps: [],
        failed_steps: [],
      })
    );

    const result = reader.read(tempDir, defaultConfig());

    expect(result.cases[0].artifact_count).toBe(5);
  });

  it('should return empty result when casesDir does not exist', () => {
    const result = reader.read(join(tempDir, 'nonexistent'), defaultConfig());

    expect(result.cases).toEqual([]);
    expect(result.metadata.cases_read).toBe(0);
    expect(result.metadata.total_cases).toBe(0);
    expect(result.metadata.skipped_cases).toEqual([]);
  });

  it('should tolerate unreadable files', () => {
    createCase('case-good', 'completed', '2024-01-15T10:00:00Z');

    const badCaseDir = join(tempDir, 'case-bad');
    mkdirSync(badCaseDir, { recursive: true });
    // Create a directory named case.yaml to make it unreadable as a file
    mkdirSync(join(badCaseDir, 'case.yaml'), { recursive: true });
    writeFileSync(join(badCaseDir, 'state.json'), '{}');

    const result = reader.read(tempDir, defaultConfig());

    expect(result.cases).toHaveLength(1);
    expect(result.metadata.skipped_cases).toContain('case-bad');
  });
});
