import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CanonicalEvidenceObservationSet,
  PagodaCallerSession,
  PagodaOracleEvaluationResult
} from '@petitbon/pagoda-core';
import type { PagodaRunPlan } from '@petitbon/pagoda-adapter-sdk';
import { renderRunReport } from '../reports/markdown.js';
import { sha256, stableJson } from './hashes.js';
import { atomicWriteArtifactFile } from './integrity.js';
import { type PagodaAdapterFailureDiagnostic, type PagodaRunArtifactManifest, runArtifactFiles } from './manifest.js';

export async function writeRunArtifactBundle(input: {
  directory: string;
  plan: PagodaRunPlan;
  targetManifest: unknown;
  canonicalObservation: CanonicalEvidenceObservationSet;
  oracleResult: PagodaOracleEvaluationResult;
  startedAt: string;
  completedAt: string;
  rawObservations?: unknown;
  callerSession?: PagodaCallerSession;
  logs?: { stdout?: string; stderr?: string };
  adapterFailures?: readonly PagodaAdapterFailureDiagnostic[];
}): Promise<PagodaRunArtifactManifest> {
  await mkdir(join(input.directory, 'logs'), { recursive: true });
  const files = runArtifactFiles;
  const manifestFiles: Record<string, string> = { ...files };
  if (!input.plan.interaction) delete manifestFiles.interaction;
  if (!input.callerSession) delete manifestFiles.callerSession;
  const agentic = input.callerSession
    ? {
        completed: input.callerSession.stopReason === 'completed',
        stopReason: input.callerSession.stopReason
      }
    : undefined;
  const oracleStatus = input.oracleResult.status;
  const adapterFailures = [...(input.adapterFailures ?? [])];
  const adapterStatus = adapterFailures.some((failure) => failure.status === 'SETUP_FAILED')
    ? 'SETUP_FAILED'
    : adapterFailures.some((failure) => failure.status === 'OBSERVABILITY_FAILED')
      ? 'OBSERVABILITY_FAILED'
      : undefined;
  const status = adapterStatus ?? (oracleStatus === 'PASS' && agentic?.completed === false ? 'FAIL' : oracleStatus);
  const manifest: PagodaRunArtifactManifest = {
    schemaVersion: 'pagoda.run-artifact',
    runId: input.plan.runId,
    targetId: input.plan.targetId,
    scenarioId: input.plan.scenario.id,
    channel: input.plan.channel,
    seed: input.plan.seed,
    interactionMode: input.plan.interaction?.mode ?? (input.plan.interaction ? 'generated' : undefined),
    interactionCaseId: input.plan.interaction?.caseId,
    status,
    oracleStatus,
    ...(agentic ? { agentic } : {}),
    ...(adapterFailures.length > 0 ? { adapterFailures } : {}),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    files: manifestFiles
  };
  const payloads: Record<string, unknown> = {
    [files.run]: manifest,
    [files.target]: input.targetManifest,
    [files.scenario]: input.plan.scenario,
    [files.evidenceMap]: input.plan.evidenceMap,
    [files.outcomeContract]: input.plan.contract,
    [files.rawObservations]: input.rawObservations ?? {},
    [files.canonicalObservation]: input.canonicalObservation,
    [files.oracleResult]: input.oracleResult
  };
  if (input.plan.interaction) payloads[files.interaction] = input.plan.interaction;
  if (input.callerSession) payloads[files.callerSession] = input.callerSession;
  const hashes: Record<string, string> = {};
  for (const [relativePath, payload] of Object.entries(payloads)) {
    const text = `${stableJson(payload)}\n`;
    hashes[relativePath] = sha256(text);
    await atomicWriteArtifactFile(input.directory, relativePath, text);
  }
  await atomicWriteArtifactFile(input.directory, files.stdout, input.logs?.stdout ?? '');
  await atomicWriteArtifactFile(input.directory, files.stderr, input.logs?.stderr ?? '');
  hashes[files.stdout] = sha256(input.logs?.stdout ?? '');
  hashes[files.stderr] = sha256(input.logs?.stderr ?? '');
  const report = renderRunReport({ manifest, oracleResult: input.oracleResult });
  await atomicWriteArtifactFile(input.directory, files.report, report);
  hashes[files.report] = sha256(report);
  await atomicWriteArtifactFile(input.directory, files.hashes, `${stableJson(hashes)}\n`);
  return manifest;
}
