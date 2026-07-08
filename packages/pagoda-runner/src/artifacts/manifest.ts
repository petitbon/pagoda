import type { PagodaCallerSession, PagodaEvidenceScenarioStatus } from '@petitbon/pagoda-core';

export type PagodaAdapterFailureDiagnostic = {
  phase: 'healthCheck' | 'prepare' | 'startInteractive' | 'observeTarget' | 'sendCallerTurn' | 'finishInteractive' | 'execute' | 'collectObservations';
  category: 'configuration' | 'dependency' | 'timeout' | 'setup' | 'observability' | 'unknown';
  dependency?: string;
  message: string;
};

export type PagodaRunArtifactManifest = {
  schemaVersion: 'pagoda.run-artifact';
  runId: string;
  targetId: string;
  scenarioId: string;
  channel: string;
  seed?: string;
  interactionMode?: 'generated' | 'agentic';
  interactionCaseId?: string;
  status: PagodaEvidenceScenarioStatus;
  oracleStatus?: PagodaEvidenceScenarioStatus;
  agentic?: {
    completed: boolean;
    stopReason: PagodaCallerSession['stopReason'];
  };
  adapterFailure?: PagodaAdapterFailureDiagnostic;
  startedAt: string;
  completedAt: string;
  files: Record<string, string>;
};

export const runArtifactFiles = {
  run: 'run.json',
  target: 'target.json',
  scenario: 'scenario.json',
  evidenceMap: 'evidence-map.json',
  outcomeContract: 'outcome-contract.json',
  interaction: 'interaction.json',
  callerSession: 'caller-session.json',
  rawObservations: 'raw-observations.json',
  canonicalObservation: 'canonical-observation.json',
  oracleResult: 'oracle-result.json',
  report: 'report.md',
  hashes: 'hashes.json',
  stdout: 'logs/stdout.log',
  stderr: 'logs/stderr.log'
} as const;
