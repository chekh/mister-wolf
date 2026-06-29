import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';
import { HeuristicProjectScanner } from '../../../src/adapters/fs/heuristic-project-scanner.js';

describe('HeuristicProjectScanner', () => {
  let tempDir: string;
  let scanner: HeuristicProjectScanner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolf-scan-'));
    scanner = new HeuristicProjectScanner(new FsFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('scans a project, ignores node_modules, and returns sorted metadata', async () => {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'foo'), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-proj', dependencies: { zod: '^3' } }),
      'utf-8'
    );
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export {}', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test', 'utf-8');

    const snapshot = await scanner.scan(tempDir);

    expect(snapshot.projectName).toBe('test-proj');
    expect(snapshot.root).toBe('.');
    expect(snapshot.summary.languages).toContain('ts');
    expect(snapshot.summary.dependencies).toContain('zod');
    expect(snapshot.summary.configFiles).toContain('package.json');
    expect(snapshot.summary.topLevelDirectories).toEqual(['src']);
    expect(snapshot.summary.entryPoints).toContain('src/index.ts');
    expect(snapshot.files.map((f) => f.path)).toEqual(
      snapshot.files
        .map((f) => f.path)
        .slice()
        .sort((a, b) => a.localeCompare(b))
    );
    expect(snapshot.files.map((f) => f.path)).not.toContain(expect.stringContaining('node_modules'));
    expect(snapshot.summary.fileCount).toBe(3);
  });
});
