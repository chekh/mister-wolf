import { describe, it, expect } from 'vitest';
import { interpolateTemplate, interpolateObject } from '../../src/workflow/template.js';

describe('template interpolation', () => {
  it('should interpolate variables in string', () => {
    const result = interpolateTemplate('Hello {{ variables.name }}', { name: 'World' });
    expect(result).toBe('Hello World');
  });

  it('should throw on missing variable', () => {
    expect(() => interpolateTemplate('Hello {{ variables.name }}', {})).toThrow('Missing variable: name');
  });

  it('should interpolate object fields recursively', () => {
    const result = interpolateObject({ message: 'Dir: {{ variables.dir }}', count: 42 }, { dir: '/tmp' });
    expect(result).toEqual({ message: 'Dir: /tmp', count: 42 });
  });
});
