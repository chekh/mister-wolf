import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT = fileURLToPath(new URL('../../../tools/pipeline/autorefine.sh', import.meta.url));

const TMP_ROOTS: string[] = [];

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-autorefine-'));
  TMP_ROOTS.push(dir);
  return dir;
}

/** Bin dir with symlinks to every tool the script needs, minus the excluded ones. */
function makeBin(exclude: string[]): string {
  const tools = ['bash', 'sed', 'grep', 'cat', 'awk', 'jq', 'git', 'head', 'mkdir', 'rm', 'env'];
  const bin = tmpRoot();
  for (const t of tools) {
    if (exclude.includes(t)) continue;
    const found = spawnSync('which', [t], { encoding: 'utf-8' });
    if (found.status === 0 && found.stdout.trim()) {
      try {
        symlinkSync(found.stdout.trim(), join(bin, t));
      } catch {
        /* already linked */
      }
    }
  }
  return bin;
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], binDir: string): RunResult {
  const cwd = tmpRoot();
  writeFileSync(join(cwd, 'plan.md'), '# Plan\n\n- task one\n');
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, PATH: binDir },
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

afterAll(() => {
  for (const dir of TMP_ROOTS) rmSync(dir, { recursive: true, force: true });
});

describe('autorefine.sh robustness', () => {
  it('fails fast when the plan file does not exist and leaves no state dir', () => {
    const bin = makeBin(['opencode']);
    const cwd = tmpRoot();
    const res = spawnSync('bash', [SCRIPT, join(cwd, 'nope.md'), '3'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, PATH: bin },
    });
    expect(res.status).not.toBe(0);
    expect(`${res.stderr}${res.stdout}`).toMatch(/nope\.md|план/i);
    expect(existsSync(join(cwd, '.autorefine'))).toBe(false);
  });

  it.each(['abc', '0'])('rejects non-positive max_rounds=%s before any side effects', (rounds) => {
    const bin = makeBin(['opencode']);
    const res = runScript(['plan.md', rounds], bin);
    expect(res.status).not.toBe(0);
    expect(`${res.stderr}${res.stdout}`).not.toMatch(/integer expression|syntax error/);
  });

  it('fails fast when jq is missing from PATH', () => {
    const bin = makeBin(['jq', 'opencode']);
    const res = runScript(['plan.md', '3'], bin);
    expect(res.status).not.toBe(0);
    expect(`${res.stderr}${res.stdout}`).toMatch(/jq/i);
  });

  it('resets corrupted resume state instead of crashing on arithmetic', () => {
    const bin = makeBin(['opencode']);
    const cwd = tmpRoot();
    writeFileSync(join(cwd, 'plan.md'), '# Plan\n');
    mkdirSync(join(cwd, '.autorefine'));
    writeFileSync(join(cwd, '.autorefine', 'plan'), join(cwd, 'plan.md'));
    writeFileSync(join(cwd, '.autorefine', 'round'), 'garbage');
    const res = spawnSync('bash', [SCRIPT, 'plan.md', '3'], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, PATH: bin },
    });
    const out = `${res.stderr}${res.stdout}`;
    expect(out).not.toMatch(/integer expression|unary operator/);
    // state was re-initialized cleanly: plan rewritten, round absent or numeric
    expect(readFileSync(join(cwd, '.autorefine', 'plan'), 'utf-8').trim()).toBe('plan.md');
    const roundPath = join(cwd, '.autorefine', 'round');
    if (existsSync(roundPath)) {
      expect(readFileSync(roundPath, 'utf-8').trim()).toMatch(/^[0-9]+$/);
    }
  });
});
