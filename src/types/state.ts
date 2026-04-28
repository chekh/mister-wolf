import { z } from 'zod';

export const StepErrorSchema = z.object({
  type: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown()).optional(),
});

export type StepError = z.infer<typeof StepErrorSchema>;

export const StepResultSchema = z.object({
  status: z.enum(['success', 'failure', 'gated', 'skipped']),
  output: z.unknown().optional(),
  error: StepErrorSchema.optional(),
});

export type StepResult = z.infer<typeof StepResultSchema>;

export const GateStateSchema = z.object({
  step_id: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  requested_at: z.string(),
  responded_at: z.string().optional(),
  responded_by: z.string().optional(),
});

export type GateState = z.infer<typeof GateStateSchema>;

export const ExecutionStateSchema = z.object({
  case_id: z.string(),
  workflow_id: z.string(),
  status: z.enum(['pending', 'running', 'paused', 'completed', 'failed']),
  current_step_id: z.string().optional(),
  completed_steps: z.array(z.string()).default([]),
  failed_steps: z.array(z.string()).default([]),
  step_results: z.record(StepResultSchema).default({}),
  variables: z.record(z.unknown()).default({}),
  gates: z.record(GateStateSchema).default({}),
  started_at: z.string(),
  updated_at: z.string(),
});

export type ExecutionState = z.infer<typeof ExecutionStateSchema>;
