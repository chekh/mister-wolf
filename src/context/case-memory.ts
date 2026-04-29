import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { ContextCase, CaseMemoryMetadata } from '../types/context.js';
import { ContextConfig } from '../config/project-config.js';
import yaml from 'js-yaml';

export interface CaseMemoryResult {
  cases: ContextCase[];
  metadata: CaseMemoryMetadata;
}

export class CaseMemoryReader {
  read(casesDir: string, config: ContextConfig): CaseMemoryResult {
    if (!existsSync(casesDir)) {
      return {
        cases: [],
        metadata: {
          cases_read: 0,
          total_cases: 0,
          skipped_cases: [],
        },
      };
    }

    const skippedCases: string[] = [];
    const cases: ContextCase[] = [];

    let entries: string[];
    try {
      entries = readdirSync(casesDir);
    } catch {
      return {
        cases: [],
        metadata: {
          cases_read: 0,
          total_cases: 0,
          skipped_cases: [],
        },
      };
    }

    for (const caseId of entries) {
      const caseDir = join(casesDir, caseId);
      let caseStat;
      try {
        caseStat = statSync(caseDir);
      } catch {
        skippedCases.push(caseId);
        continue;
      }

      if (!caseStat.isDirectory()) {
        continue;
      }

      const caseYamlPath = join(caseDir, 'case.yaml');
      const stateJsonPath = join(caseDir, 'state.json');

      let caseMeta: Record<string, unknown> = {};
      let stateData: Record<string, unknown> = {};

      try {
        if (existsSync(caseYamlPath)) {
          const caseContent = readFileSync(caseYamlPath, 'utf-8');
          caseMeta = (yaml.load(caseContent) as Record<string, unknown>) || {};
        }
        if (existsSync(stateJsonPath)) {
          const stateContent = readFileSync(stateJsonPath, 'utf-8');
          stateData = JSON.parse(stateContent) as Record<string, unknown>;
        }
      } catch {
        skippedCases.push(caseId);
        continue;
      }

      // If either file is missing or either parsed to null/undefined, skip
      if (!caseMeta || !stateData || Object.keys(caseMeta).length === 0 || Object.keys(stateData).length === 0) {
        skippedCases.push(caseId);
        continue;
      }

      // case.yaml is authoritative for case metadata; state.json provides execution details
      const merged: Record<string, unknown> = { ...stateData, ...caseMeta };

      const case_id = String(merged.case_id || caseId);
      const workflow_id = String(merged.workflow_id || '');
      const status = String(merged.status || '');
      const created_at = String(merged.created_at || '');
      const updated_at = String(merged.updated_at || '');
      const completed_steps = Array.isArray(stateData.completed_steps)
        ? (stateData.completed_steps as string[])
        : undefined;
      const failed_steps = Array.isArray(stateData.failed_steps) ? (stateData.failed_steps as string[]) : undefined;

      let artifact_count = 0;
      const artifactsDir = join(caseDir, 'artifacts');
      if (existsSync(artifactsDir)) {
        artifact_count = this.countFilesRecursively(artifactsDir);
      } else if (typeof merged.artifact_count === 'number') {
        artifact_count = merged.artifact_count;
      }

      cases.push({
        case_id,
        workflow_id,
        status,
        created_at,
        updated_at,
        artifact_count,
        completed_steps,
        failed_steps,
      });
    }

    // Sort by updated_at descending, then case_id ascending
    cases.sort((a, b) => {
      if (a.updated_at !== b.updated_at) {
        return b.updated_at.localeCompare(a.updated_at);
      }
      return a.case_id.localeCompare(b.case_id);
    });

    const totalCases = cases.length + skippedCases.length;
    const limitedCases = cases.slice(0, config.limits.max_cases);

    return {
      cases: limitedCases,
      metadata: {
        cases_read: limitedCases.length,
        total_cases: totalCases,
        skipped_cases: skippedCases,
      },
    };
  }

  private countFilesRecursively(dir: string): number {
    let count = 0;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        count += this.countFilesRecursively(fullPath);
      } else if (entry.isFile()) {
        count++;
      }
    }
    return count;
  }
}
