import { PolicyRule, PolicyDecision, RiskLevel } from '../types/policy.js';
import { PolicyConfig } from '../config/project-config.js';
import { StepDefinition } from '../types/workflow.js';

const DECISION_PRECEDENCE = { deny: 3, ask: 2, allow: 1 } as const;
const RISK_ORDER = { low: 1, medium: 2, high: 3, critical: 4 } as const;

export class PolicyEngine {
  evaluate(
    step: StepDefinition,
    config: PolicyConfig,
    workflowId: string,
    enforcement: 'workflow_preflight' | 'step_runtime'
  ): PolicyDecision {
    const matchedRules: PolicyRule[] = [];

    for (const rule of config.rules) {
      if (this.matches(rule, step)) {
        matchedRules.push(rule);
      }
    }

    // Default decision
    let decision: PolicyDecision['decision'] = 'allow';
    let risk: PolicyDecision['risk'] = 'low';
    let primaryRuleId: string | undefined;
    let reason = 'No matching policy rule';

    if (matchedRules.length > 0) {
      const primary = this.selectPrimary(matchedRules);
      decision = primary.decision;
      risk = primary.risk || 'low';
      primaryRuleId = primary.id;
      reason = primary.reason;
    }

    // max_risk enforcement
    const maxRisk = config.defaults.max_risk;
    if (this.riskLevel(risk) > this.riskLevel(maxRisk) && decision === 'allow') {
      decision = 'ask';
    }

    const decisionId = `policy_${workflowId}_${step.id}_${primaryRuleId || 'default'}_${enforcement}`;

    return {
      id: decisionId,
      decision,
      risk,
      rule_id: primaryRuleId,
      reason,
      enforcement,
      subject: {
        workflow_id: workflowId,
        step_id: step.id,
        runner: step.runner,
      },
      matched_rules: matchedRules.map((r) => r.id),
    };
  }

  private matches(rule: PolicyRule, step: StepDefinition): boolean {
    if (rule.match.runner && rule.match.runner !== step.runner) {
      return false;
    }
    if (rule.match.step_id && rule.match.step_id !== step.id) {
      return false;
    }
    if (rule.match.command_contains && rule.match.command_contains.length > 0) {
      const command = step.input?.command;
      if (typeof command !== 'string') {
        return false;
      }
      if (!rule.match.command_contains.some((pattern) => command.includes(pattern))) {
        return false;
      }
    }
    return true;
  }

  private selectPrimary(rules: PolicyRule[]): PolicyRule {
    return rules.reduce((best, current) => {
      const bestPrec = DECISION_PRECEDENCE[best.decision];
      const currPrec = DECISION_PRECEDENCE[current.decision];
      if (currPrec > bestPrec) return current;
      if (currPrec < bestPrec) return best;

      const bestRisk = RISK_ORDER[best.risk || 'low'];
      const currRisk = RISK_ORDER[current.risk || 'low'];
      if (currRisk > bestRisk) return current;
      return best;
    });
  }

  private riskLevel(risk: RiskLevel): number {
    return RISK_ORDER[risk];
  }
}
