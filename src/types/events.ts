import { z } from 'zod';

export const EventActorSchema = z.object({
  type: z.enum(['system', 'agent', 'user', 'tool', 'external']),
  id: z.string(),
});

export type EventActor = z.infer<typeof EventActorSchema>;

export const RuntimeEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  case_id: z.string(),
  workflow_id: z.string().optional(),
  step_id: z.string().optional(),
  timestamp: z.string(),
  actor: EventActorSchema,
  payload: z.record(z.unknown()).default({}),
  correlation_id: z.string().optional(),
  parent_event_id: z.string().optional(),
});

export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

/*
 * MVP1B Event Types:
 * - step.skipped       { case_id, step_id, reason: "condition_false", condition }
 * - step.retrying      { case_id, step_id, attempt, max_attempts, reason }
 * - artifact.created   { case_id, step_id, path }
 * - case.cancelled     { case_id, cancelled_by }
 * - step.timed_out     { case_id, step_id, timeout_ms }
 */
