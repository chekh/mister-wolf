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
    writeFileSync(join(tempDir, 'wolf.yaml'), `
state_dir: ".wolf/custom"
defaults:
  timeout: "60s"
  shell:
    max_output_size: "2MB"
    blocked_commands:
      - sudo
`);
    const config = loadProjectConfig(join(tempDir, 'wolf.yaml'));
    expect(config.state_dir).toBe('.wolf/custom');
    expect(config.defaults.timeout).toBe('60s');
    expect(config.defaults.shell?.max_output_size).toBe('2MB');
  });
});
