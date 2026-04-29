import { z } from 'zod';

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const DecisionTypeSchema = z.enum(['allow', 'ask', 'deny']);
export type DecisionType = z.infer<typeof DecisionTypeSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string(),
  match: z
    .object({
      runner: z.string().optional(),
      command_contains: z.array(z.string()).optional(),
      step_id: z.string().optional(),
    })
    .default({}),
  decision: DecisionTypeSchema,
  risk: RiskLevelSchema.optional(),
  reason: z.string(),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyDecisionSchema = z.object({
  id: z.string(),
  decision: DecisionTypeSchema,
  risk: RiskLevelSchema,
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
  overall: DecisionTypeSchema,
  decisions: z.array(PolicyDecisionSchema),
  steps_allowed: z.number().int().nonnegative(),
  steps_ask: z.number().int().nonnegative(),
  steps_denied: z.number().int().nonnegative(),
});

export type PolicyReport = z.infer<typeof PolicyReportSchema>;
