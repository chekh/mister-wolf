import { describe, it, expect } from 'vitest';
import { isNpxRun } from '../../../src/domain/npx.js';

describe('isNpxRun (спека §3: npx-путь никогда не пишет MCP-конфиг)', () => {
  it('true when npm_command === npx (set by the npx shim)', () => {
    expect(isNpxRun({ npm_command: 'npx' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('false for regular npm scripts', () => {
    expect(isNpxRun({ npm_command: 'run-script' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('false for plain node execution / global bin', () => {
    expect(isNpxRun({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
