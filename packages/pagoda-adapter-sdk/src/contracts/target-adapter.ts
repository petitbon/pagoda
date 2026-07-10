import type {
  CanonicalEvidenceObservationSet,
  PagodaCallerTurn,
  PagodaTargetTurn
} from '@petitbon/pagoda-core';
import type { TargetHealth } from './health.js';
import type {
  PagodaCallerAgentProvider,
  PagodaCallerAgentProviderFactoryInput
} from './caller-agent.js';
import type { PagodaRunPlan, PreparedRun, TargetRunResult } from './run-plan.js';

export interface PagodaTargetAdapter {
  targetId: string;
  healthCheck(): Promise<TargetHealth>;
  prepare(run: PagodaRunPlan): Promise<PreparedRun>;
  execute(prepared: PreparedRun): Promise<TargetRunResult>;
  collectObservations(result: TargetRunResult): Promise<CanonicalEvidenceObservationSet>;
  cleanup?(prepared: PreparedRun): Promise<void>;
}

export type PagodaAdapterOperationOptions = {
  signal?: AbortSignal;
};

export interface PagodaInteractiveTargetAdapter extends PagodaTargetAdapter {
  createCallerAgentProvider?(
    input: PagodaCallerAgentProviderFactoryInput
  ): PagodaCallerAgentProvider | Promise<PagodaCallerAgentProvider>;
  startInteractive(run: PagodaRunPlan, options?: PagodaAdapterOperationOptions): Promise<PreparedRun>;
  /**
   * Returns target turns observed since startup.
   * Adapters should return only newly observed turns for efficiency, but Pagoda
   * tolerates full transcript snapshots by deduping stable PagodaTargetTurn ids.
   */
  observeTarget(prepared: PreparedRun, options?: PagodaAdapterOperationOptions): Promise<{ turns: PagodaTargetTurn[] }>;
  /**
   * Sends one caller turn and returns any target turns observed in response.
   * Pagoda dedupes returned target turns by id across observeTarget and
   * sendCallerTurn; emit a new id if materially revised target text appears.
   */
  sendCallerTurn(prepared: PreparedRun, turn: PagodaCallerTurn, options?: PagodaAdapterOperationOptions): Promise<{ turns: PagodaTargetTurn[] }>;
  finishInteractive(prepared: PreparedRun, options?: PagodaAdapterOperationOptions): Promise<TargetRunResult>;
}
