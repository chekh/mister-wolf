import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

describe('Context CLI integration', () => {
  it('should scan files and show metadata', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-context-'));

    writeFileSync(join(tempDir, 'README.md'), '# Test Project');
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'index.ts'), 'console.log("hello");');
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} context scan`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Files scanned:');
    expect(output).toContain('Files included:');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should output metadata-only JSON with --json', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-context-'));

    writeFileSync(join(tempDir, 'README.md'), '# Test Project');
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'index.ts'), 'console.log("hello");');
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} context scan --json`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const json = JSON.parse(output);
    expect(json).toHaveProperty('files_scanned');
    expect(json).toHaveProperty('files_included');
    expect(json).toHaveProperty('files_skipped');
    expect(json).toHaveProperty('bytes_included');
    expect(json).not.toHaveProperty('files');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should build and write bundle and markdown', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-context-'));

    writeFileSync(join(tempDir, 'README.md'), '# Test Project');
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'index.ts'), 'console.log("hello");');
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    const output = execSync(`node ${cliPath} context build`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    expect(output).toContain('Context bundle written to:');
    expect(output).toContain('Context markdown written to:');

    const bundlePath = join(tempDir, '.wolf', 'context', 'context-bundle.json');
    const markdownPath = join(tempDir, '.wolf', 'context', 'context.md');

    expect(existsSync(bundlePath)).toBe(true);
    expect(existsSync(markdownPath)).toBe(true);

    const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));
    expect(bundle.version).toBe('1.0.0');
    expect(bundle.scenario).toBe('default');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should apply scenario overrides with --scenario', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-context-'));

    const config = `
context:
  include:
    - README.md
  scenarios:
    - id: dev
      match:
        keywords: []
      context:
        include:
          - src/**/*.ts
`;

    writeFileSync(join(tempDir, 'wolf.yaml'), config);
    writeFileSync(join(tempDir, 'README.md'), '# Test Project');
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'index.ts'), 'console.log("hello");');
    mkdirSync(join(tempDir, 'docs'), { recursive: true });
    writeFileSync(join(tempDir, 'docs', 'guide.md'), '# Guide');
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    // Without scenario, README.md should be included
    execSync(`node ${cliPath} context build`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const defaultBundlePath = join(tempDir, '.wolf', 'context', 'context-bundle.json');
    const defaultBundle = JSON.parse(readFileSync(defaultBundlePath, 'utf-8'));
    expect(defaultBundle.project.docs.some((f: any) => f.path === 'README.md')).toBe(true);

    // Clean up context dir
    rmSync(join(tempDir, '.wolf', 'context'), { recursive: true, force: true });

    // With dev scenario, src/**/*.ts should be included instead
    execSync(`node ${cliPath} context build --scenario dev`, {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const devBundlePath = join(tempDir, '.wolf', 'context', 'context-bundle.json');
    const devBundle = JSON.parse(readFileSync(devBundlePath, 'utf-8'));
    expect(devBundle.project.files.some((f: any) => f.path === 'src/index.ts')).toBe(true);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should exit with code 1 for nonexistent scenario', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-context-'));

    writeFileSync(join(tempDir, 'README.md'), '# Test Project');
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });

    let exitCode = 0;
    try {
      execSync(`node ${cliPath} context build --scenario nonexistent`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      exitCode = err.status || 1;
    }

    expect(exitCode).toBe(1);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
