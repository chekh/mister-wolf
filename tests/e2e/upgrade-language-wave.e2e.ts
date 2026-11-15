// e2e skeleton for the language-wave migration (SC-19..SC-23, REQ-08, ADR-5).
// T-32 delivers the contour (npm shim + isolated env + stamped fixture
// builder) following the upgrade-* e2e pattern; T-37 fills in the scenarios
// once the migration mechanism (T-35 update-map regeneration) is in place.
//
// Scenario map (test-plan §SC-19..SC-23):
//   SC-19 clean project migrates without questions (replaced > 0, backups)
//   SC-20 mutated → conflict + take default with backup; protect untouched
//   SC-21 faces untouched by the wave (diverged count before === after)
//   SC-22 AC-3: 0 Cyrillic in stamped files after migration
//   SC-23 (negative) mutated without --resolve stays RU, deferred, idempotent
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { repoRoot, tmpProject, ensureBuilt } from './helpers.js';

const cli = join(repoRoot, 'dist/bootstrap/cli.js');
let home = '';
let shimDir = '';
let repoVersion = '';

beforeAll(() => {
  ensureBuilt();
  repoVersion = (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as { version: string }).version;
  home = mkdtempSync(join(tmpdir(), 'wolf-upgrade-wave-'));
  // npm shim: the real registry is never hit; view reports the current version
  // by default (T-37 overrides via WOLF_FAKE_VERSION for the release flow).
  shimDir = join(home, 'npm-shim');
  mkdirSync(shimDir, { recursive: true });
  const shim = join(shimDir, 'npm');
  writeFileSync(
    shim,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  view) printf \'%s\\n\' "${WOLF_FAKE_VERSION:-${WOLF_SELF_VERSION}}"; exit 0 ;;',
      `  prefix) printf '%s\\n' '${repoRoot}'; exit 0 ;;`,
      '  *) echo "wolf-e2e npm shim: refusing: $*" >&2; exit 1 ;;',
      'esac',
      '',
    ].join('\n')
  );
  chmodSync(shim, 0o755);
}, 180_000);

afterAll(() => {
  if (home !== '') rmSync(home, { recursive: true, force: true });
});

/** Isolated env: tmp HOME/XDG (no machine litter) + npm shim first in PATH. */
function isolatedEnv(fakeVersion?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    PATH: `${shimDir}:${process.env.PATH ?? ''}`,
    WOLF_SELF_VERSION: repoVersion,
    ...(fakeVersion !== undefined ? { WOLF_FAKE_VERSION: fakeVersion } : {}),
  };
}

/**
 * Fixture: a project whose delivered copies are stamped and still Russian
 * (the pre-wave 3.0 state). The stamp marks files the migration may replace;
 * T-37 aligns the exact stamp/manifest contract with T-35's update-map.
 */
function buildStampedFixture(): string {
  const dir = tmpProject();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'wave-migrate-app', scripts: { test: 'echo ok' } }));
  execSync(`node ${cli} init --full --model zai-coding-plan/glm-5.3`, {
    cwd: dir,
    stdio: 'ignore',
    // vitest наследует npm_command=exec (init treats it as an npx try-out and
    // skips the base set); an installed run renders the full set
    env: { ...process.env, npm_command: 'install' },
  });
  // overwrite a rendered copy with a pre-wave marker: the stamp line marks the
  // file as migration-replaceable; T-37 aligns this with T-35's update-map
  const agentPath = join(dir, '.opencode', 'agents', 'wolf-reviewer.md');
  const rendered = readFileSync(agentPath, 'utf-8');
  writeFileSync(
    agentPath,
    rendered.replace(/(description: [^\n]*\n)/, '$1# wolf:rendered ru-baseline 3.0.0 (pre-wave)\n')
  );
  return dir;
}

describe('upgrade language wave: migration contour (skeleton for T-37, SC-19..SC-23)', () => {
  it('contour is wired: shim, isolated env and stamped fixture build cleanly', () => {
    expect(isolatedEnv().PATH).toContain('npm-shim');
    const dir = buildStampedFixture();
    try {
      const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
      expect(agents.length).toBeGreaterThan(0);
      const agent = readFileSync(join(dir, '.opencode', 'agents', 'wolf-reviewer.md'), 'utf-8');
      expect(agent).toContain('wolf:rendered');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.todo('SC-19: clean stamped project migrates without questions (replaced > 0, backups listed)');
  it.todo('SC-20: mutated → conflict, take default with backup; protect file untouched');
  it.todo('SC-21: faces untouched by the wave (diverged before === after)');
  it.todo('SC-22: AC-3 — 0 Cyrillic in stamped files after migration');
  it.todo('SC-23: mutated without --resolve stays RU (deferred) and re-offers; EN files unchanged on repeat');
});
