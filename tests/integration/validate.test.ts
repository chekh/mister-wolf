import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

describe('wolf validate', () => {
  it('should validate correct workflow', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-val-'));
    writeFileSync(join(tempDir, 'good.yaml'), `id: test\nversion: "0.1.0"\nsteps:\n  - id: s1\n    type: builtin\n    runner: echo\n`);
    
    const output = execSync(`node ${cliPath} validate good.yaml`, {
      cwd: tempDir,
      encoding: 'utf-8',
    });
    expect(output).toContain('valid');
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject invalid workflow', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wolf-val-'));
    writeFileSync(join(tempDir, 'bad.yaml'), `id: test\nversion: "0.1.0"\nsteps: []\n`);
    
    let exitCode = 0;
    try {
      execSync(`node ${cliPath} validate bad.yaml`, { cwd: tempDir, encoding: 'utf-8' });
    } catch (err: any) {
      exitCode = err.status || 1;
    }
    expect(exitCode).toBe(1);
    rmSync(tempDir, { recursive: true, force: true });
  });
});
