import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadProjectConfig } from '../../src/config/project-config.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('loadProjectConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-config-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load defaults when no config exists', () => {
    const config = loadProjectConfig(join(tempDir, 'nonexistent.yaml'));
    expect(config.state_dir).toBe('.wolf/state');
    expect(config.defaults.timeout).toBe('30s');
  });

  it('should load custom config', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
state_dir: ".wolf/custom"
defaults:
  timeout: "60s"
  shell:
    max_output_size: "2MB"
    blocked_commands:
      - sudo
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.state_dir).toBe('.wolf/custom');
    expect(config.defaults.timeout).toBe('60s');
    expect(config.defaults.shell?.max_output_size).toBe('2MB');
  });

  it('should load policy defaults when no policy config exists', () => {
    const config = loadProjectConfig(join(tempDir, 'nonexistent.yaml'));
    expect(config.policy.defaults.enabled).toBe(true);
    expect(config.policy.defaults.autonomy).toBe('supervised');
    expect(config.policy.defaults.max_risk).toBe('high');
    expect(config.policy.rules).toEqual([]);
  });

  it('should load custom policy config', () => {
    writeFileSync(
      join(tempDir, 'wolf.yaml'),
      `
policy:
  defaults:
    enabled: false
    autonomy: autonomous
    max_risk: critical
  rules:
    - id: block-shell
      match:
        runner: shell
      decision: deny
      risk: high
      reason: Shell execution blocked
`
    );
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.policy.defaults.enabled).toBe(false);
    expect(config.policy.defaults.autonomy).toBe('autonomous');
    expect(config.policy.defaults.max_risk).toBe('critical');
    expect(config.policy.rules).toHaveLength(1);
    expect(config.policy.rules[0].id).toBe('block-shell');
    expect(config.policy.rules[0].decision).toBe('deny');
  });
});
