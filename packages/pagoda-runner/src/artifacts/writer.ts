import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CanonicalEvidenceObservationSet, PagodaOracleEvaluationResult } from '@petitbon/pagoda-core';
import type { PagodaRunPlan } from '@petitbon/pagoda-adapter-sdk';
import { renderRunReport } from '../reports/markdown.js';
import { sha256, stableJson } from './hashes.js';
import { type PagodaRunArtifactManifest, runArtifactFiles } from './manifest.js';

export async function writeRunArtifactBundle(input: {
  directory: string;
  plan: PagodaRunPlan;
  targetManifest: unknown;
  canonicalObservation: CanonicalEvidenceObservationSet;
  oracleResult: PagodaOracleEvaluationResult;
  startedAt: string;
  completedAt: string;
  rawObservations?: unknown;
  logs?: { stdout?: string; stderr?: string };
}): Promise<PagodaRunArtifactManifest> {
  await mkdir(join(input.directory, 'logs'), { recursive: true });
  const files = runArtifactFiles;
  const manifest: PagodaRunArtifactManifest = {
    schemaVersion: 'pagoda.run-artifact',
    runId: input.plan.runId,
    targetId: input.plan.targetId,
    scenarioId: input.plan.scenario.id,
    channel: input.plan.channel,
    seed: input.plan.seed,
    status: input.oracleResult.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    files
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
  const hashes: Record<string, string> = {};
  for (const [relativePath, payload] of Object.entries(payloads)) {
    const text = `${stableJson(payload)}\n`;
    hashes[relativePath] = sha256(text);
    await writeFile(join(input.directory, relativePath), text, 'utf8');
  }
  await writeFile(join(input.directory, files.stdout), input.logs?.stdout ?? '', 'utf8');
  await writeFile(join(input.directory, files.stderr), input.logs?.stderr ?? '', 'utf8');
  hashes[files.stdout] = sha256(input.logs?.stdout ?? '');
  hashes[files.stderr] = sha256(input.logs?.stderr ?? '');
  const report = renderRunReport({ manifest, oracleResult: input.oracleResult });
  await writeFile(join(input.directory, files.report), report, 'utf8');
  hashes[files.report] = sha256(report);
  await writeFile(join(input.directory, files.hashes), `${stableJson(hashes)}\n`, 'utf8');
  return manifest;
}
