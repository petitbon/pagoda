import type {
  PagodaEvidenceMap,
  PagodaOutcomeContract,
  PagodaScenario
} from '@petitbon/pagoda-core';

export type PagodaRunPlan = {
  runId: string;
  targetId: string;
  projectRoot: string;
  targetRoot: string;
  artifactDirectory: string;
  scenario: PagodaScenario;
  evidenceMap: PagodaEvidenceMap;
  contract: PagodaOutcomeContract;
  channel: string;
  seed?: string;
};

export type PreparedRun = {
  runId: string;
  targetId: string;
  artifactDirectory?: string;
  metadata?: Record<string, unknown>;
};

export type TargetRunResult = {
  runId: string;
  status: 'completed' | 'blocked' | 'failed';
  rawArtifacts?: readonly string[];
  summaryFile?: string;
  reportFile?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  metadata?: Record<string, unknown>;
};
