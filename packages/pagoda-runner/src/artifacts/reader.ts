import type {
  CanonicalEvidenceObservationSet,
  PagodaCallerSession,
  PagodaMaterializedInteraction,
  PagodaOracleEvaluationResult,
  PagodaOutcomeContract
} from '@petitbon/pagoda-core';
import { sha256 } from './hashes.js';
import {
  assertValidRunArtifactManifest,
  parseJsonObject,
  readRegularArtifactFile
} from './integrity.js';
import type { PagodaRunArtifactManifest } from './manifest.js';
import { runArtifactFiles } from './manifest.js';

export type PagodaRunArtifactBundle = {
  manifest: PagodaRunArtifactManifest;
  contract: PagodaOutcomeContract;
  interaction?: PagodaMaterializedInteraction;
  callerSession?: PagodaCallerSession;
  canonicalObservation: CanonicalEvidenceObservationSet;
  oracleResult: PagodaOracleEvaluationResult;
  hashes: Readonly<Record<string, string>>;
};

const parsePayload = <T>(text: string, label: string): T => parseJsonObject(text, label) as T;

const parseHashes = (text: string): Record<string, string> => {
  const value = parseJsonObject(text, runArtifactFiles.hashes);
  const hashes: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [path, hash] of Object.entries(value)) {
    if (typeof hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
      throw new Error(`Invalid Pagoda artifact: hash for ${path} is malformed.`);
    }
    hashes[path] = hash;
  }
  return hashes;
};

export async function readRunArtifactBundle(
  directory: string,
  options: { verifyReport?: boolean } = {}
): Promise<PagodaRunArtifactBundle> {
  const verifyReport = options.verifyReport ?? true;
  const runText = await readRegularArtifactFile(directory, runArtifactFiles.run);
  const manifest = assertValidRunArtifactManifest(parseJsonObject(runText, runArtifactFiles.run));
  const hashes = parseHashes(await readRegularArtifactFile(directory, runArtifactFiles.hashes));
  const expectedPaths = Object.values(manifest.files).filter((path) => path !== runArtifactFiles.hashes);
  const expectedSet = new Set(expectedPaths);

  for (const path of Object.keys(hashes)) {
    if (!expectedSet.has(path)) throw new Error(`Invalid Pagoda artifact: unexpected hash entry ${path}.`);
  }
  for (const path of expectedPaths) {
    if (!Object.hasOwn(hashes, path)) throw new Error(`Invalid Pagoda artifact: missing hash entry ${path}.`);
  }

  const contents = new Map<string, string>([[runArtifactFiles.run, runText]]);
  for (const path of expectedPaths) {
    if (path === runArtifactFiles.report && !verifyReport) continue;
    const text = contents.get(path) ?? await readRegularArtifactFile(directory, path);
    contents.set(path, text);
    if (sha256(text) !== hashes[path]) {
      throw new Error(`Invalid Pagoda artifact: hash mismatch for ${path}.`);
    }
  }

  const readPayload = async <T>(path: string, label = path): Promise<T> => {
    const text = contents.get(path) ?? await readRegularArtifactFile(directory, path);
    contents.set(path, text);
    return parsePayload<T>(text, label);
  };

  const canonicalObservation = await readPayload<CanonicalEvidenceObservationSet>(
    manifest.files.canonicalObservation
  );
  if (!Array.isArray(canonicalObservation.observedOrdering)) {
    throw new Error('Invalid Pagoda artifact: canonical-observation.json observedOrdering must be an array.');
  }
  const oracleResult = await readPayload<PagodaOracleEvaluationResult>(manifest.files.oracleResult);
  if (!Array.isArray(oracleResult.missingOrdering)) {
    throw new Error('Invalid Pagoda artifact: oracle-result.json missingOrdering must be an array.');
  }

  const interactionPath = manifest.files.interaction;
  const callerSessionPath = manifest.files.callerSession;
  return {
    manifest,
    contract: await readPayload<PagodaOutcomeContract>(manifest.files.outcomeContract),
    interaction: interactionPath
      ? await readPayload<PagodaMaterializedInteraction>(interactionPath)
      : undefined,
    callerSession: callerSessionPath
      ? await readPayload<PagodaCallerSession>(callerSessionPath)
      : undefined,
    canonicalObservation,
    oracleResult,
    hashes
  };
}
