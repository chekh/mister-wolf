import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/bootstrap/cli.js');

function runCli(args: string, cwd: string): { stdout: string; stderr: string } {
  const result = spawnSync('node', [cliPath, ...args.split(' ')], {
    cwd,
    encoding: 'utf-8',
  });
  if (result.error) {
    throw result.error;
  }
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('MVP-B workflow', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-mvp-b-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('initializes, scans the project, and generates an agent brief', () => {
    const projectName = 'mvp-b-test-project';

    const pkg = {
      name: projectName,
      version: '1.0.0',
      dependencies: { commander: '^12.0.0' },
    };

    const srcDir = join(dir, 'src');
    const indexPath = join(srcDir, 'index.ts');

    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    writeFileSync(indexPath, 'export const app = () => "hello";\n');
    writeFileSync(join(dir, 'README.md'), `# ${projectName}\n\nA test project for the MVP-B workflow.\n`);

    runCli('init --model zai-coding-plan/glm-5.3', dir);
    const scanResult = runCli('scan', dir);
    expect(scanResult.stdout).toContain('Project scan saved: project-scan-latest');

    const scanPath = join(dir, '.wolf', 'memory', 'shared', 'notes', 'project-scan-latest.md');
    expect(existsSync(scanPath)).toBe(true);

    const briefResult = runCli('brief', dir);
    expect(briefResult.stdout).toContain(`# Agent Brief: ${projectName}`);
    expect(briefResult.stderr).toContain('.wolf/memory/briefs/agent-brief-latest.md');

    const briefPath = join(dir, '.wolf', 'memory', 'briefs', 'agent-brief-latest.md');
    expect(existsSync(briefPath)).toBe(true);

    const briefContent = readFileSync(briefPath, 'utf-8');
    expect(briefContent).toContain(`# Agent Brief: ${projectName}`);
  });
});
