import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureBuilt, runCli } from './helpers.js';

ensureBuilt();

const DOC_ID_RE = /mem_\d{8}_doc_architecture_[0-9a-f]{8}/;

/** Изолированный tmp-проект с документом docs/guide/architecture.md + tmp XDG. */
function newProject(): { project: string; xdg: string } {
  const project = mkdtempSync(join(tmpdir(), 'wolf-scan-doc-id-'));
  writeFileSync(join(project, 'package.json'), '{ "name": "scan-doc-id-e2e" }');
  mkdirSync(join(project, 'docs', 'guide'), { recursive: true });
  writeFileSync(join(project, 'docs', 'guide', 'architecture.md'), '# Architecture\n\nContent.');
  const xdg = mkdtempSync(join(tmpdir(), 'wolf-scan-doc-id-xdg-'));
  return { project, xdg };
}

const env = (xdg: string): NodeJS.ProcessEnv => ({ ...process.env, XDG_CONFIG_HOME: xdg });

describe('wolf scan/list: канон doc-id + резолв --type (спека 2.1.0 §2.1 F9, §2.2 F10)', () => {
  it('scan регистрирует документ каноническим id; повторный scan — id стабильны', () => {
    const { project, xdg } = newProject();

    const first = runCli(['scan'], project, env(xdg));
    expect(first.status).toBe(0);

    // файл носителя: .wolf/memory/shared/documents/mem_*_doc_architecture_<hash8>.md
    const docsDir = join(project, '.wolf', 'memory', 'shared', 'documents');
    const docFiles = readdirSync(docsDir).filter((f) => f.endsWith('.md'));
    expect(docFiles).toHaveLength(1);
    expect(docFiles[0]).toMatch(/^mem_\d{8}_doc_architecture_[0-9a-f]{8}\.md$/);
    expect(first.stdout).toMatch(DOC_ID_RE);

    const second = runCli(['scan'], project, env(xdg));
    expect(second.status).toBe(0);
    // стабильность: тот же id в stdout и тот же файл на диске
    expect(second.stdout).toMatch(docFiles[0].replace(/\.md$/, ''));
    expect(readdirSync(docsDir).filter((f) => f.endsWith('.md'))).toEqual(docFiles);
  });

  it('AC2: list --type document → warning + document-ref, exit 0; --type documnt → exit 1 с ближайшим', () => {
    const { project, xdg } = newProject();
    expect(runCli(['scan'], project, env(xdg)).status).toBe(0);

    // deprecated-алиас: фильтр по каноническому типу + warning в stderr
    const aliasList = runCli(['list', '--type', 'document'], project, env(xdg));
    expect(aliasList.status).toBe(0);
    expect(aliasList.stdout).toContain('[document-ref]');
    expect(aliasList.stderr).toContain("Warning: тип 'document' устарел, используйте 'document-ref'");

    // опечатка: однострочная ошибка с ближайшим типом, exit 1
    const typoList = runCli(['list', '--type', 'documnt'], project, env(xdg));
    expect(typoList.status).toBe(1);
    expect(typoList.stderr).toContain("неизвестный тип 'documnt'");
    expect(typoList.stderr).toContain("ближайший: 'document-ref'");
    expect(typoList.stderr).toContain('допустимые:');
  });
});
