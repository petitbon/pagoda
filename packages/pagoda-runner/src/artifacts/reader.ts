import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CanonicalEvidenceObservationSet,
  PagodaOracleEvaluationResult,
  PagodaOutcomeContract
} from '@petitbon/pagoda-core';
import type { PagodaRunArtifactManifest } from './manifest.js';

export async function readRunArtifactBundle(directory: string): Promise<{
  manifest: PagodaRunArtifactManifest;
  contract: PagodaOutcomeContract;
  canonicalObservation: CanonicalEvidenceObservationSet;
  oracleResult: PagodaOracleEvaluationResult;
}> {
  const manifest = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8')) as PagodaRunArtifactManifest;
  return {
    manifest,
    contract: JSON.parse(await readFile(join(directory, manifest.files.outcomeContract), 'utf8')) as PagodaOutcomeContract,
    canonicalObservation: JSON.parse(await readFile(join(directory, manifest.files.canonicalObservation), 'utf8')) as CanonicalEvidenceObservationSet,
    oracleResult: JSON.parse(await readFile(join(directory, manifest.files.oracleResult), 'utf8')) as PagodaOracleEvaluationResult
  };
}
