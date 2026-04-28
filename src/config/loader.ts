import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import { WorkflowDefinition } from '../types/workflow.js';

export function loadWorkflow(path: string): WorkflowDefinition {
  const content = readFileSync(path, 'utf-8');
  const parsed = yaml.load(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid YAML file: ${path}`);
  }
  return parsed as WorkflowDefinition;
}
