import { WorkflowDefinition } from '../types/workflow.js';
import { ValidationResult } from '../config/validator.js';

export interface DependencyGraph {
  nodes: Set<string>;
  edges: Map<string, string[]>;
  dependents: Map<string, string[]>;
  roots: string[];
}

export function buildGraph(workflow: WorkflowDefinition): DependencyGraph {
  const nodes = new Set(workflow.steps.map((s) => s.id));
  const edges = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();

  for (const step of workflow.steps) {
    edges.set(step.id, step.depends_on || []);
    for (const dep of step.depends_on || []) {
      const existing = dependents.get(dep) || [];
      existing.push(step.id);
      dependents.set(dep, existing);
    }
  }

  const roots = workflow.steps.filter((s) => !s.depends_on?.length).map((s) => s.id);

  return { nodes, edges, dependents, roots };
}

export function validateGraph(workflow: WorkflowDefinition): ValidationResult {
  const stepIds = new Set(workflow.steps.map((s) => s.id));
  const errors: string[] = [];

  for (const step of workflow.steps) {
    for (const depId of step.depends_on || []) {
      if (!stepIds.has(depId)) {
        errors.push(`Step ${step.id} depends_on unknown step: ${depId}`);
      }
    }
  }

  const graph = buildGraph(workflow);
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    for (const dep of graph.edges.get(node) || []) {
      if (!visited.has(dep) && hasCycle(dep)) return true;
      if (recStack.has(dep)) return true;
    }
    recStack.delete(node);
    return false;
  }

  for (const stepId of graph.nodes) {
    if (!visited.has(stepId) && hasCycle(stepId)) {
      errors.push(`Circular dependency detected involving: ${stepId}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true };
}

export function getReadySteps(graph: DependencyGraph, statuses: Record<string, string>): string[] {
  const ready: string[] = [];
  for (const stepId of graph.nodes) {
    const status = statuses[stepId];
    if (status && status !== 'pending') continue;
    const deps = graph.edges.get(stepId) || [];
    const allDepsSuccess = deps.every((depId) => statuses[depId] === 'success');
    if (allDepsSuccess) {
      ready.push(stepId);
    }
  }
  return ready;
}

export function getTransitiveDependents(graph: DependencyGraph, stepId: string): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [stepId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const deps = graph.dependents.get(current) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        result.push(dep);
        queue.push(dep);
      }
    }
  }

  return result;
}
