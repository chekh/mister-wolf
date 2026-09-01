import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));

describe('package hygiene (спека §5, §7)', () => {
  it('published as mister-wolf (typo-squat guard: mr-wolf is a foreign package)', () => {
    expect(pkg.name).toBe('mister-wolf');
  });

  it('ships only dist + templates (sandbox and research dirs must not leak into tarball)', () => {
    expect(pkg.files).toEqual(['dist', 'templates']);
  });

  it('declares engines.node >= 22 (prebuilt better-sqlite3 v13 line)', () => {
    expect(pkg.engines?.node).toBe('>=22');
  });

  it('declares license and repository (npm metadata)', () => {
    expect(pkg.license).toBe('MIT');
    expect(pkg.repository?.url).toContain('github.com/chekh/mister-wolf');
  });

  it('has NO install lifecycle scripts (native deps are not our postinstall)', () => {
    const scripts = pkg.scripts ?? {};
    for (const banned of ['preinstall', 'install', 'postinstall', 'prepublish']) {
      expect(scripts[banned], `scripts.${banned} must not exist`).toBeUndefined();
    }
  });

  it('depends on prebuilt better-sqlite3 >= 13 (Node 22/24 prebuilds)', () => {
    expect(pkg.dependencies['better-sqlite3']).toMatch(/^\^13\./);
  });

  it('depends on stable @modelcontextprotocol/server (no alpha/beta in runtime)', () => {
    const v = pkg.dependencies['@modelcontextprotocol/server'];
    expect(v).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(v).not.toMatch(/alpha|beta|rc/);
  });
});
