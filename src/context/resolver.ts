import { ContextFile, ContextCase, ResolveMetadata } from '../types/context.js';
import { ContextConfig } from '../config/project-config.js';
import { ScanResult } from './scanner.js';
import { CaseMemoryResult } from './case-memory.js';

export interface ResolvedContext {
  files: ContextFile[];
  docs: ContextFile[];
  rules: ContextFile[];
  configs: ContextFile[];
  cases: ContextCase[];
  caseMemoryMetadata: CaseMemoryResult['metadata'];
  resolveMetadata: ResolveMetadata;
}

export class ContextResolver {
  resolve(
    scanResult: ScanResult,
    caseMemory: CaseMemoryResult,
    config: ContextConfig,
    scenarioId?: string
  ): ResolvedContext {
    const scenario = this.findScenario(config, scenarioId);

    const effectiveLimits = scenario?.context?.limits
      ? { ...config.limits, ...scenario.context.limits }
      : config.limits;

    // Apply case limit from effective config
    const cases = caseMemory.cases.slice(0, effectiveLimits.max_cases);

    const files: ContextFile[] = [];
    const docs: ContextFile[] = [];
    const rules: ContextFile[] = [];
    const configs: ContextFile[] = [];

    for (const file of scanResult.files) {
      const kind = classifyPath(file.path);
      const classifiedFile = { ...file, kind };

      switch (kind) {
        case 'project_doc':
          docs.push(classifiedFile);
          break;
        case 'project_rule':
          rules.push(classifiedFile);
          break;
        case 'project_config':
          configs.push(classifiedFile);
          break;
        default:
          files.push(classifiedFile);
          break;
      }
    }

    const resolveMetadata: ResolveMetadata = {
      groups: {
        project_files: files.length,
        project_docs: docs.length,
        project_rules: rules.length,
        project_configs: configs.length,
        cases: cases.length,
      },
    };

    return {
      files,
      docs,
      rules,
      configs,
      cases,
      caseMemoryMetadata: caseMemory.metadata,
      resolveMetadata,
    };
  }

  private findScenario(config: ContextConfig, scenarioId?: string) {
    if (!scenarioId) return undefined;
    const scenario = config.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }
    return scenario;
  }
}

function classifyPath(filePath: string): ContextFile['kind'] {
  // project_docs: README.md, AGENTS.md, docs/**/*.md, .wolf/**/*.md
  if (
    filePath === 'README.md' ||
    filePath === 'AGENTS.md' ||
    (filePath.startsWith('docs/') && filePath.endsWith('.md')) ||
    (filePath.startsWith('.wolf/') && filePath.endsWith('.md'))
  ) {
    return 'project_doc';
  }

  // project_rules: wolf.yaml, .wolf/**/*.yaml
  if (filePath === 'wolf.yaml' || (filePath.startsWith('.wolf/') && filePath.endsWith('.yaml'))) {
    return 'project_rule';
  }

  // project_configs: package.json, tsconfig.json, vitest.config.ts, Dockerfile,
  // docker-compose.yml, .github/workflows/*.yml, .github/workflows/*.yaml, .prettierrc*
  if (
    filePath === 'package.json' ||
    filePath === 'tsconfig.json' ||
    filePath === 'vitest.config.ts' ||
    filePath === 'Dockerfile' ||
    filePath === 'docker-compose.yml' ||
    /^\.github\/workflows\/[^/]+\.(yml|yaml)$/.test(filePath) ||
    filePath.startsWith('.prettierrc')
  ) {
    return 'project_config';
  }

  // project_files: everything else
  return 'project_file';
}
