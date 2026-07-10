import type {
  PagodaCallerAgentDecision,
  PagodaMaterializedAgenticInteraction,
  PagodaTargetTurn
} from '@petitbon/pagoda-core';
import type { PagodaRunPlan } from './run-plan.js';

export type PagodaCallerDecisionInput = {
  interaction: PagodaMaterializedAgenticInteraction;
  observedTurns: PagodaTargetTurn[];
  previousDecisions: PagodaCallerAgentDecision[];
};

export interface PagodaCallerAgentProvider {
  readonly id: string;
  readonly model?: string;
  readonly deterministic: boolean;
  decide(input: PagodaCallerDecisionInput): Promise<PagodaCallerAgentDecision>;
}

export type PagodaCallerAgentProviderFactoryInput = {
  run: PagodaRunPlan;
  interaction: PagodaMaterializedAgenticInteraction;
};
