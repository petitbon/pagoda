import type { CanonicalCollectorDiagnostic, PagodaCallerSession, PagodaEvidenceMap, PagodaEvidenceScenarioStatus, PagodaOutcomeContract, PagodaScenario } from '@petitbon/pagoda-core';
import type { PagodaAdapterManifest, PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { evaluatePagodaOutcomeContract } from '@petitbon/pagoda-core';
import type { PagodaAdapterFailureDiagnostic } from '@petitbon/pagoda-runner';
import type { PagodaBatchCoordinates } from './commands/run-batch.js';

export type LoadedScenario = { path: string; scenario: PagodaScenario; hash: string };
export type LoadedEvidenceMap = { path: string; evidenceMap: PagodaEvidenceMap; hash: string };
export type LoadedContract = { path: string; contract: PagodaOutcomeContract };
export type LoadedAdapterManifest = { path: string; root: string; manifest: PagodaAdapterManifest };
export type PagodaCliReporter = 'default' | 'json';

export type PagodaRootContext = {
  mode: 'target-pack' | 'workspace';
  projectRoot: string;
  targetRoot: string;
  manifestPath: string;
  targetId: string;
  manifest: PagodaTargetManifest;
};

export type PagodaEvidenceRegistryEntry = {
  code: string;
  kind: 'setup' | 'context' | 'outcome' | 'workflow' | 'channel' | 'rejected' | 'repair' | 'forbidden' | 'adapter';
  description: string;
  scenarios?: string[];
  producedBy?: string[];
  trustedSources?: string[];
};

export type PagodaEvidenceRegistry = {
  schemaVersion: 'pagoda.evidence-registry';
  targetId: string;
  codes: PagodaEvidenceRegistryEntry[];
};

export type PagodaRunCliResult = {
  runId: string;
  artifactDirectory: string;
  projectId: string;
  scenarioId: string;
  channel: string;
  interactionCaseId?: string;
  batch?: PagodaBatchCoordinates;
  status: PagodaEvidenceScenarioStatus;
  adapterRunStatus: string;
  evidence: {
    accepted: number;
    rejected: number;
    setup: number;
    traceSources: readonly string[];
    correlation: readonly string[];
    ordering: readonly string[];
  };
  startedAt: string;
  completedAt: string;
  durationMs: number;
  agentic?: {
    completed: boolean;
    stopReason: PagodaCallerSession['stopReason'];
  };
  adapterFailures?: readonly PagodaAdapterFailureDiagnostic[];
  collectorDiagnostics?: readonly CanonicalCollectorDiagnostic[];
  oracle: ReturnType<typeof evaluatePagodaOutcomeContract>;
};

export type PagodaRunCliSummary = {
  projectId: string;
  channel: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  batch?: {
    concurrency: number;
    sequential: number;
    jobs: number;
  };
  runs: PagodaRunCliResult[];
};

export type PagodaCliIo = {
  stdout(message: string): void;
  stderr(message: string): void;
};

export type PagodaCommandResult = {
  exitCode: number;
};
