import type { CanonicalEvidenceObservationSet } from '@petitbon/pagoda-core';
import type { TargetHealth } from './health.js';
import type { PagodaRunPlan, PreparedRun, TargetRunResult } from './run-plan.js';

export interface PagodaTargetAdapter {
  targetId: string;
  healthCheck(): Promise<TargetHealth>;
  prepare(run: PagodaRunPlan): Promise<PreparedRun>;
  execute(prepared: PreparedRun): Promise<TargetRunResult>;
  collectObservations(result: TargetRunResult): Promise<CanonicalEvidenceObservationSet>;
  cleanup?(prepared: PreparedRun): Promise<void>;
}
