import type { PagodaEvidenceScenarioStatus } from '@petitbon/pagoda-core';

export type PagodaRunArtifactManifest = {
  schemaVersion: 'pagoda.run-artifact';
  runId: string;
  targetId: string;
  scenarioId: string;
  channel: string;
  seed?: string;
  status: PagodaEvidenceScenarioStatus;
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
  rawObservations: 'raw-observations.json',
  canonicalObservation: 'canonical-observation.json',
  oracleResult: 'oracle-result.json',
  report: 'report.md',
  hashes: 'hashes.json',
  stdout: 'logs/stdout.log',
  stderr: 'logs/stderr.log'
} as const;
