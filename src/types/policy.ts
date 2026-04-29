import { z } from 'zod';

export const PolicyRuleSchema = z.object({
  id: z.string(),
  match: z
    .object({
      runner: z.string().optional(),
      command_contains: z.array(z.string()).optional(),
      step_id: z.string().optional(),
    })
    .default({}),
  decision: z.enum(['allow', 'ask', 'deny']),
  risk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  reason: z.string(),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyDecisionSchema = z.object({
  id: z.string(),
  decision: z.enum(['allow', 'ask', 'deny']),
  risk: z.enum(['low', 'medium', 'high', 'critical']),
  rule_id: z.string().optional(),
  reason: z.string(),
  enforcement: z.enum(['workflow_preflight', 'step_runtime']),
  subject: z.object({
    workflow_id: z.string(),
    step_id: z.string().optional(),
    runner: z.string().optional(),
  }),
  matched_rules: z.array(z.string()),
});

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const PolicyReportSchema = z.object({
  workflow_id: z.string(),
  overall: z.enum(['allow', 'ask', 'deny']),
  decisions: z.array(PolicyDecisionSchema),
  steps_allowed: z.number(),
  steps_ask: z.number(),
  steps_denied: z.number(),
});

export type PolicyReport = z.infer<typeof PolicyReportSchema>;
