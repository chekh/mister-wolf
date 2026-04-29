import { ContextBundle, ContextFile } from '../types/context.js';

export class ContextMdGenerator {
  generate(bundle: ContextBundle, maxChars: number = 1000): string {
    const lines: string[] = [];

    lines.push('# Context');
    lines.push('');
    lines.push(`**Scenario:** ${bundle.scenario}`);
    lines.push(`**Generated:** ${bundle.generated_at}`);
    lines.push(`**Project Root:** ${bundle.project.root}`);
    lines.push('');

    // Project Files
    lines.push('## Project Files');
    lines.push('');
    if (bundle.project.files.length === 0) {
      lines.push('_No project files._');
    } else {
      for (const file of bundle.project.files) {
        lines.push(...this.renderFile(file, maxChars));
      }
    }
    lines.push('');

    // Project Docs
    lines.push('## Project Docs');
    lines.push('');
    if (bundle.project.docs.length === 0) {
      lines.push('_No project docs._');
    } else {
      for (const file of bundle.project.docs) {
        lines.push(...this.renderFile(file, maxChars));
      }
    }
    lines.push('');

    // Project Rules
    lines.push('## Project Rules');
    lines.push('');
    if (bundle.project.rules.length === 0) {
      lines.push('_No project rules._');
    } else {
      for (const file of bundle.project.rules) {
        lines.push(...this.renderFile(file, maxChars));
      }
    }
    lines.push('');

    // Project Configs
    lines.push('## Project Configs');
    lines.push('');
    if (bundle.project.configs.length === 0) {
      lines.push('_No project configs._');
    } else {
      for (const file of bundle.project.configs) {
        lines.push(...this.renderFile(file, maxChars));
      }
    }
    lines.push('');

    // Case Memory
    lines.push('## Case Memory');
    lines.push('');
    if (bundle.case_memory.cases.length === 0) {
      lines.push('_No cases._');
    } else {
      for (const c of bundle.case_memory.cases) {
        lines.push(`- **${c.case_id}** (${c.workflow_id}, ${c.status})`);
      }
    }
    lines.push('');
    lines.push(`Total cases: ${bundle.case_memory.total_count}, Read: ${bundle.case_memory.count}`);
    lines.push('');

    // Scan Metadata
    lines.push('## Scan Metadata');
    lines.push('');
    lines.push(`- Files scanned: ${bundle.scan_metadata.files_scanned}`);
    lines.push(`- Files included: ${bundle.scan_metadata.files_included}`);
    lines.push(`- Files skipped: ${bundle.scan_metadata.files_skipped}`);
    lines.push(`- Bytes included: ${bundle.scan_metadata.bytes_included}`);
    lines.push(`- Bytes truncated: ${bundle.scan_metadata.bytes_truncated}`);
    lines.push(`- Limits applied: ${bundle.scan_metadata.limits_applied.join(', ') || 'none'}`);
    if (bundle.scan_metadata.skipped_files && bundle.scan_metadata.skipped_files.length > 0) {
      lines.push(`- Skipped files: ${bundle.scan_metadata.skipped_files.join(', ')}`);
    }
    lines.push('');

    // Resolve Metadata
    lines.push('## Resolve Metadata');
    lines.push('');
    for (const [group, count] of Object.entries(bundle.resolve_metadata.groups)) {
      lines.push(`- ${group}: ${count}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  private renderFile(file: ContextFile, maxChars: number): string[] {
    const lines: string[] = [];
    lines.push(`### ${file.path}`);
    lines.push('');
    lines.push(`- Size: ${file.size} bytes`);
    lines.push(`- Hash: ${file.hash}`);
    lines.push(`- Modified: ${file.mtime}`);
    lines.push('');

    if (file.content_included && file.content) {
      const lang = getLanguageHint(file.path);
      const truncated =
        file.content.length > maxChars ? file.content.slice(0, maxChars) + '\n... (truncated)' : file.content;
      lines.push('```' + lang);
      lines.push(truncated);
      lines.push('```');
    } else {
      lines.push('_Content not included._');
    }
    lines.push('');

    return lines;
  }
}

function getLanguageHint(filePath: string): string {
  if (filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.js')) return 'javascript';
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) return 'yaml';
  if (filePath.endsWith('.md')) return 'markdown';
  if (filePath === 'Dockerfile' || filePath.endsWith('Dockerfile')) return 'dockerfile';
  if (filePath.endsWith('.sh')) return 'bash';
  if (filePath.endsWith('.py')) return 'python';

  const ext = filePath.lastIndexOf('.');
  return ext > 0 ? filePath.slice(ext + 1) : '';
}
