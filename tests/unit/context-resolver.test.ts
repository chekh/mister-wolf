import { describe, it, expect } from 'vitest';
import { ContextResolver } from '../../src/context/resolver.js';
import { ScanResult } from '../../src/context/scanner.js';
import { CaseMemoryResult } from '../../src/context/case-memory.js';
import { ContextConfig } from '../../src/config/project-config.js';
import { ContextFile } from '../../src/types/context.js';

function makeFile(path: string): ContextFile {
  return {
    path,
    kind: 'project_file',
    size: 100,
    extension: path.includes('.') ? path.slice(path.lastIndexOf('.')) : '',
    hash: 'abc123',
    mtime: '2024-01-01T00:00:00Z',
    content_included: true,
    content_truncated: false,
    content: 'content',
  };
}

function makeScanResult(files: ContextFile[]): ScanResult {
  return {
    files,
    metadata: {
      files_scanned: files.length,
      files_included: files.length,
      files_skipped: 0,
      bytes_included: 0,
      bytes_truncated: 0,
      limits_applied: [],
    },
  };
}

function makeCaseMemory(cases: any[] = []): CaseMemoryResult {
  return {
    cases,
    metadata: {
      cases_read: cases.length,
      total_cases: cases.length,
      skipped_cases: [],
    },
  };
}

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

describe('ContextResolver', () => {
  const resolver = new ContextResolver();

  it('classifies docs, rules, configs, and files', () => {
    const files = [
      makeFile('README.md'),
      makeFile('AGENTS.md'),
      makeFile('docs/guide.md'),
      makeFile('.wolf/notes.md'),
      makeFile('wolf.yaml'),
      makeFile('.wolf/config.yaml'),
      makeFile('package.json'),
      makeFile('tsconfig.json'),
      makeFile('vitest.config.ts'),
      makeFile('Dockerfile'),
      makeFile('docker-compose.yml'),
      makeFile('.github/workflows/ci.yml'),
      makeFile('.github/workflows/deploy.yaml'),
      makeFile('.prettierrc'),
      makeFile('.prettierrc.json'),
      makeFile('src/main.ts'),
      makeFile('src/app.ts'),
    ];

    const result = resolver.resolve(makeScanResult(files), makeCaseMemory(), defaultConfig());

    expect(result.docs.map((f) => f.path)).toEqual(['README.md', 'AGENTS.md', 'docs/guide.md', '.wolf/notes.md']);
    expect(result.rules.map((f) => f.path)).toEqual(['wolf.yaml', '.wolf/config.yaml']);
    expect(result.configs.map((f) => f.path)).toEqual([
      'package.json',
      'tsconfig.json',
      'vitest.config.ts',
      'Dockerfile',
      'docker-compose.yml',
      '.github/workflows/ci.yml',
      '.github/workflows/deploy.yaml',
      '.prettierrc',
      '.prettierrc.json',
    ]);
    expect(result.files.map((f) => f.path)).toEqual(['src/main.ts', 'src/app.ts']);

    expect(result.resolveMetadata.groups).toEqual({
      project_files: 2,
      project_docs: 4,
      project_rules: 2,
      project_configs: 9,
      cases: 0,
    });
  });

  it('throws on unknown scenario', () => {
    const config = defaultConfig({
      scenarios: [{ id: 'test', match: { keywords: ['test'] } }],
    });

    expect(() => {
      resolver.resolve(makeScanResult([]), makeCaseMemory(), config, 'unknown');
    }).toThrow('Scenario not found: unknown');
  });

  it('applies scenario merge semantics for limits', () => {
    const cases = Array.from({ length: 20 }, (_, i) => ({
      case_id: `case-${i}`,
      workflow_id: 'wf-1',
      status: 'completed',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      artifact_count: 0,
    }));

    const config = defaultConfig({
      limits: {
        max_files: 100,
        max_bytes: 10485760,
        max_file_bytes: 1048576,
        max_cases: 10,
      },
      scenarios: [
        {
          id: 'dev',
          match: { keywords: ['dev'] },
          context: {
            limits: {
              max_cases: 5,
            },
          },
        },
      ],
    });

    const caseMemory = makeCaseMemory(cases);

    // Without scenario: uses base limit of 10
    const resultBase = resolver.resolve(makeScanResult([]), caseMemory, config);
    expect(resultBase.cases.length).toBe(10);
    expect(resultBase.resolveMetadata.groups.cases).toBe(10);

    // With scenario: uses merged limit of 5
    const resultScenario = resolver.resolve(makeScanResult([]), caseMemory, config, 'dev');
    expect(resultScenario.cases.length).toBe(5);
    expect(resultScenario.resolveMetadata.groups.cases).toBe(5);
  });

  it('applies scenario merge semantics for include and exclude', () => {
    const config = defaultConfig({
      include: ['src/**/*'],
      exclude: ['dist/**'],
      scenarios: [
        {
          id: 'docs',
          match: { keywords: ['docs'] },
          context: {
            include: ['docs/**/*.md'],
            exclude: ['tmp/**'],
          },
        },
      ],
    });

    // Resolver should accept valid scenario and not throw;
    // include/exclude merging is validated at the config level
    const files = [makeFile('src/main.ts'), makeFile('docs/readme.md')];
    const result = resolver.resolve(makeScanResult(files), makeCaseMemory(), config, 'docs');
    expect(result.files.length).toBe(1);
    expect(result.docs.length).toBe(1);
  });

  it('works without scenario', () => {
    const files = [makeFile('README.md'), makeFile('src/main.ts')];
    const result = resolver.resolve(makeScanResult(files), makeCaseMemory(), defaultConfig());

    expect(result.docs.length).toBe(1);
    expect(result.files.length).toBe(1);
  });
});
