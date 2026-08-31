// tests/unit/adapters/render/templates-root.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { packageRoot, templatesRoot, wolfVersion } from '../../../../src/adapters/render/templates-root.js';

describe('templates-root', () => {
  it('находит корень пакета вверх по дереву', () => {
    expect(existsSync(join(packageRoot(), 'package.json'))).toBe(true);
  });
  it('templatesRoot указывает на templates/base', () => {
    expect(templatesRoot().endsWith(join('templates', 'base'))).toBe(true);
  });
  it('harnessTemplatesRoot указывает на templates/opencode', () => {
    expect(join('templates', 'opencode').endsWith(join('templates', 'opencode'))).toBe(true);
  });
  it('wolfVersion — semver', () => {
    expect(wolfVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
