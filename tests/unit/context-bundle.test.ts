import { describe, it, expect } from 'vitest';
import { ContextBundleBuilder } from '../../src/context/bundle-builder.js';
import { ContextMdGenerator } from '../../src/context/md-generator.js';
import { ResolvedContext } from '../../src/context/resolver.js';
import { ScanMetadata } from '../../src/types/context.js';

function makeResolvedContext(overrides?: Partial<ResolvedContext>): ResolvedContext {
  return {
    files: [],
    docs: [],
    rules: [],
    configs: [],
    cases: [],
    caseMemoryMetadata: { cases_read: 0, total_cases: 0, skipped_cases: [] },
    resolveMetadata: { groups: {} },
    ...overrides,
  } as ResolvedContext;
}

describe('ContextBundleBuilder', () => {
  const builder = new ContextBundleBuilder();

  it('builds a valid bundle', () => {
    const resolved = makeResolvedContext({
      files: [
        {
          path: 'src/main.ts',
          kind: 'project_file',
          size: 100,
          extension: '.ts',
          hash: 'abc',
          mtime: '2024-01-01T00:00:00Z',
          content_included: true,
          content_truncated: false,
          content: 'const x = 1;',
        },
      ],
      docs: [
        {
          path: 'README.md',
          kind: 'project_doc',
          size: 50,
          extension: '.md',
          hash: 'def',
          mtime: '2024-01-01T00:00:00Z',
          content_included: true,
          content_truncated: false,
          content: '# Hello',
        },
      ],
      cases: [
        {
          case_id: 'case-1',
          workflow_id: 'wf-1',
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          artifact_count: 0,
        },
      ],
      caseMemoryMetadata: { cases_read: 1, total_cases: 1, skipped_cases: [] },
      resolveMetadata: { groups: { project_files: 1, project_docs: 1, cases: 1 } },
    });

    const scanMetadata: ScanMetadata = {
      files_scanned: 2,
      files_included: 2,
      files_skipped: 0,
      bytes_included: 150,
      bytes_truncated: 0,
      limits_applied: [],
    };

    const bundle = builder.build(resolved, scanMetadata, '/project', 'default');

    expect(bundle.version).toBe('1.0.0');
    expect(bundle.scenario).toBe('default');
    expect(bundle.project.root).toBe('/project');
    expect(bundle.project.files.length).toBe(1);
    expect(bundle.project.docs.length).toBe(1);
    expect(bundle.case_memory.cases.length).toBe(1);
    expect(bundle.case_memory.count).toBe(1);
    expect(bundle.case_memory.total_count).toBe(1);
    expect(bundle.scan_metadata.files_scanned).toBe(2);
    expect(bundle.resolve_metadata.groups.project_files).toBe(1);
  });
});

describe('ContextMdGenerator', () => {
  const generator = new ContextMdGenerator();

  it('generates markdown with truncation', () => {
    const longContent = 'a'.repeat(2000);
    const resolved = makeResolvedContext({
      files: [
        {
          path: 'src/main.ts',
          kind: 'project_file',
          size: 2000,
          extension: '.ts',
          hash: 'abc',
          mtime: '2024-01-01T00:00:00Z',
          content_included: true,
          content_truncated: false,
          content: longContent,
        },
      ],
    });

    const builder = new ContextBundleBuilder();
    const bundle = builder.build(
      resolved,
      {
        files_scanned: 1,
        files_included: 1,
        files_skipped: 0,
        bytes_included: 2000,
        bytes_truncated: 0,
        limits_applied: [],
      },
      '/project',
      'default'
    );

    const markdown = generator.generate(bundle, 100);

    expect(markdown).toContain('## Project Files');
    expect(markdown).toContain('```typescript');
    expect(markdown).toContain('a'.repeat(100));
    expect(markdown).toContain('... (truncated)');
    expect(markdown).not.toContain('a'.repeat(101));
  });

  it('uses default maxChars of 1000', () => {
    const content = 'b'.repeat(1500);
    const resolved = makeResolvedContext({
      files: [
        {
          path: 'app.js',
          kind: 'project_file',
          size: 1500,
          extension: '.js',
          hash: 'def',
          mtime: '2024-01-01T00:00:00Z',
          content_included: true,
          content_truncated: false,
          content,
        },
      ],
    });

    const builder = new ContextBundleBuilder();
    const bundle = builder.build(
      resolved,
      {
        files_scanned: 1,
        files_included: 1,
        files_skipped: 0,
        bytes_included: 1500,
        bytes_truncated: 0,
        limits_applied: [],
      },
      '/project',
      'default'
    );

    const markdown = generator.generate(bundle);
    expect(markdown).toContain('b'.repeat(1000));
    expect(markdown).toContain('... (truncated)');
  });

  it('renders all sections correctly', () => {
    const resolved = makeResolvedContext({
      files: [
        {
          path: 'src/main.ts',
          kind: 'project_file',
          size: 100,
          extension: '.ts',
          hash: 'abc',
          mtime: '2024-01-01T00:00:00Z',
          content_included: false,
          content_truncated: false,
        },
      ],
      docs: [
        {
          path: 'README.md',
          kind: 'project_doc',
          size: 50,
          extension: '.md',
          hash: 'def',
          mtime: '2024-01-01T00:00:00Z',
          content_included: true,
          content_truncated: false,
          content: '# Hello',
        },
      ],
      rules: [
        {
          path: 'wolf.yaml',
          kind: 'project_rule',
          size: 30,
          extension: '.yaml',
          hash: 'ghi',
          mtime: '2024-01-01T00:00:00Z',
          content_included: true,
          content_truncated: false,
          content: 'rules:',
        },
      ],
      configs: [
        {
          path: 'package.json',
          kind: 'project_config',
          size: 40,
          extension: '.json',
          hash: 'jkl',
          mtime: '2024-01-01T00:00:00Z',
          content_included: true,
          content_truncated: false,
          content: '{}',
        },
      ],
      cases: [
        {
          case_id: 'case-1',
          workflow_id: 'wf-1',
          status: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          artifact_count: 0,
        },
      ],
      caseMemoryMetadata: { cases_read: 1, total_cases: 1, skipped_cases: [] },
      resolveMetadata: {
        groups: {
          project_files: 1,
          project_docs: 1,
          project_rules: 1,
          project_configs: 1,
          cases: 1,
        },
      },
    });

    const builder = new ContextBundleBuilder();
    const bundle = builder.build(
      resolved,
      {
        files_scanned: 5,
        files_included: 5,
        files_skipped: 0,
        bytes_included: 260,
        bytes_truncated: 0,
        limits_applied: [],
      },
      '/project',
      'default'
    );

    const markdown = generator.generate(bundle);

    expect(markdown).toContain('## Project Files');
    expect(markdown).toContain('## Project Docs');
    expect(markdown).toContain('## Project Rules');
    expect(markdown).toContain('## Project Configs');
    expect(markdown).toContain('## Case Memory');
    expect(markdown).toContain('## Scan Metadata');
    expect(markdown).toContain('## Resolve Metadata');

    expect(markdown).toContain('_Content not included._');
    expect(markdown).toContain('```markdown');
    expect(markdown).toContain('```yaml');
    expect(markdown).toContain('```json');
    expect(markdown).toContain('**case-1** (wf-1, completed)');
    expect(markdown).toContain('Total cases: 1, Read: 1');
  });
});
