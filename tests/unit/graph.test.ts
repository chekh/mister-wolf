import { describe, it, expect } from 'vitest';
import { buildGraph, validateGraph, getReadySteps, getTransitiveDependents } from '../../src/workflow/graph.js';
import { WorkflowDefinition } from '../../src/types/workflow.js';

describe('graph', () => {
  it('should build graph from workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo' },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
        { id: 'c', type: 'builtin', runner: 'echo', depends_on: ['a'] },
      ],
    };
    const graph = buildGraph(workflow);
    expect(graph.roots).toEqual(['a']);
    expect(graph.edges.get('b')).toEqual(['a']);
    expect(graph.edges.get('c')).toEqual(['a']);
  });

  it('should detect circular dependency', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['c'] },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
        { id: 'c', type: 'builtin', runner: 'echo', depends_on: ['b'] },
      ],
    };
    const result = validateGraph(workflow);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Circular');
  });

  it('should detect unknown dependency', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo', depends_on: ['x'] },
      ],
    };
    const result = validateGraph(workflow);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('unknown');
  });

  it('should get ready steps', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo' },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
      ],
    };
    const graph = buildGraph(workflow);
    const ready = getReadySteps(graph, { a: 'success' });
    expect(ready).toContain('b');
    expect(ready).not.toContain('a');
  });

  it('should get transitive dependents', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '0.1.0',
      steps: [
        { id: 'a', type: 'builtin', runner: 'echo' },
        { id: 'b', type: 'builtin', runner: 'echo', depends_on: ['a'] },
        { id: 'c', type: 'builtin', runner: 'echo', depends_on: ['b'] },
      ],
    };
    const graph = buildGraph(workflow);
    const dependents = getTransitiveDependents(graph, 'a');
    expect(dependents).toEqual(['b', 'c']);
  });
});
