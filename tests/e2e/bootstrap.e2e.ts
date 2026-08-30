import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('wolf bootstrap: starting project memory in one command', () => {
  let cwd: string;

  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo-app', scripts: { test: 'vitest run' } }));
    writeFileSync(join(cwd, 'README.md'), '# Demo App\n\nTest project.\n');
  });

  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('init -> bootstrap creates proposed rules, document-ref and work-thread', () => {
    expect(runCli(['init'], cwd).status).toBe(0);

    const r = runCli(['bootstrap'], cwd);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Bootstrap brief');
    expect(r.stdout).toContain('Стюард');

    // proposed-правила в shared/rules
    const rulesDir = join(cwd, '.wolf', 'memory', 'shared', 'rules');
    const ruleFiles = readdirSync(rulesDir);
    expect(ruleFiles.length).toBeGreaterThanOrEqual(1);
    const ruleText = readFileSync(join(rulesDir, ruleFiles[0]), 'utf-8');
    expect(ruleText).toContain('proposed');
    expect(ruleText).toContain('scope: project');

    // document-ref в shared/documents
    const docsDir = join(cwd, '.wolf', 'memory', 'shared', 'documents');
    expect(readdirSync(docsDir).length).toBeGreaterThanOrEqual(1);

    // work-thread в threads/<id>/WORK-THREAD.md
    const threadsDir = join(cwd, '.wolf', 'memory', 'threads');
    const threadIds = readdirSync(threadsDir);
    expect(threadIds.length).toBeGreaterThanOrEqual(1);
    expect(readFileSync(join(threadsDir, threadIds[0], 'WORK-THREAD.md'), 'utf-8')).toContain('Bootstrap');
  });
});
