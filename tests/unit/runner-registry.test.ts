import { describe, it, expect } from 'vitest';
import { RunnerRegistry } from '../../src/workflow/runner-registry.js';
import { EchoRunner } from '../../src/workflow/runners/echo.js';

describe('RunnerRegistry', () => {
  it('should register and retrieve runners', () => {
    const registry = new RunnerRegistry();
    const echo = new EchoRunner();
    registry.register(echo);
    expect(registry.get('echo')).toBe(echo);
  });

  it('should throw for unknown runner', () => {
    const registry = new RunnerRegistry();
    expect(() => registry.get('unknown')).toThrow('Unknown runner: unknown');
  });
});
