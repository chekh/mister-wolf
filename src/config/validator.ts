import { WorkflowDefinition, WorkflowDefinitionSchema } from '../types/workflow.js';

export interface ValidationResult {
  success: boolean;
  errors?: string[];
}

export function validateWorkflow(workflow: unknown): ValidationResult {
  const schemaResult = WorkflowDefinitionSchema.safeParse(workflow);
  if (!schemaResult.success) {
    return {
      success: false,
      errors: schemaResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
    };
  }
  
  const validated = schemaResult.data;
  const errors: string[] = [];
  
  const stepIds = new Set<string>();
  for (const step of validated.steps) {
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`);
    }
    stepIds.add(step.id);
  }
  
  const outputs = new Set<string>();
  for (const step of validated.steps) {
    if (step.output) {
      if (outputs.has(step.output)) {
        errors.push(`Duplicate output variable: ${step.output}`);
      }
      outputs.add(step.output);
    }
  }
  
  const stepIndexMap = new Map<string, number>();
  validated.steps.forEach((step, idx) => stepIndexMap.set(step.id, idx));
  
  for (let i = 0; i < validated.steps.length; i++) {
    const step = validated.steps[i];
    if (step.depends_on) {
      for (const depId of step.depends_on) {
        const depIndex = stepIndexMap.get(depId);
        if (depIndex === undefined) {
          errors.push(`Step ${step.id} depends_on unknown step: ${depId}`);
        } else if (depIndex >= i) {
          errors.push(`Step ${step.id} depends_on future step: ${depId}`);
        }
      }
    }
  }
  
  if (errors.length > 0) {
    return { success: false, errors };
  }
  
  return { success: true };
}
