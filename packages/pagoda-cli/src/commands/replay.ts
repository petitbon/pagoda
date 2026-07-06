import { evaluatePagodaOutcomeContract } from '@petitbon/pagoda-core';
import { readRunArtifactBundle } from '@petitbon/pagoda-runner';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { stableJson } from '../shared/json.js';
import { resolveInputPath } from '../target-pack/context.js';

export async function replayArtifact(context: PagodaRootContext, artifactPath: string | undefined, io: PagodaCliIo): Promise<PagodaCommandResult> {
  if (!artifactPath) throw new Error('pagoda replay requires --artifact <path>.');
  const directory = resolveInputPath(artifactPath, context);
  const bundle = await readRunArtifactBundle(directory);
  const replayed = evaluatePagodaOutcomeContract({
    contract: bundle.contract,
    channel: bundle.manifest.channel as never,
    caseId: bundle.manifest.interactionCaseId ?? bundle.contract.harness.selectedCase ?? bundle.manifest.scenarioId,
    observations: bundle.canonicalObservation
  });
  const matches = stableJson(replayed) === stableJson(bundle.oracleResult);
  io.stdout(JSON.stringify({
    artifact: directory,
    runId: bundle.manifest.runId,
    savedStatus: bundle.oracleResult.status,
    replayedStatus: replayed.status,
    matches
  }, null, 2));
  return { exitCode: matches ? 0 : 1 };
}
