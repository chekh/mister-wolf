import { ContextBundle } from '../types/context.js';
import { ScanMetadata } from '../types/context.js';
import { ResolvedContext } from './resolver.js';

export class ContextBundleBuilder {
  build(resolved: ResolvedContext, scanMetadata: ScanMetadata, projectRoot: string, scenario: string): ContextBundle {
    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      scenario,
      project: {
        root: projectRoot,
        files: resolved.files,
        docs: resolved.docs,
        rules: resolved.rules,
        configs: resolved.configs,
      },
      case_memory: {
        cases: resolved.cases,
        count: resolved.cases.length,
        total_count: resolved.caseMemoryMetadata.total_cases,
        metadata: resolved.caseMemoryMetadata,
      },
      scan_metadata: scanMetadata,
      resolve_metadata: resolved.resolveMetadata,
    };
  }
}
