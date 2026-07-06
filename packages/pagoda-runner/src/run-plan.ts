import { randomUUID } from 'node:crypto';
import type {
  PagodaEvidenceMap,
  PagodaMaterializedInteraction,
  PagodaOutcomeContract,
  PagodaScenario
} from '@petitbon/pagoda-core';
import type { PagodaRunPlan } from '@petitbon/pagoda-adapter-sdk';

export type PagodaRunnerEvent =
  | { type: 'run.started'; runId: string; targetId: string; scenarioId: string }
  | { type: 'run.finished'; runId: string; status: string }
  | { type: 'run.blocked'; runId: string; reason: string };

export function createPagodaRunPlan(input: {
  targetId: string;
  projectRoot: string;
  targetRoot: string;
  artifactDirectory: string;
  scenario: PagodaScenario;
  evidenceMap: PagodaEvidenceMap;
  contract: PagodaOutcomeContract;
  channel: string;
  seed?: string;
  interaction?: PagodaMaterializedInteraction;
}): PagodaRunPlan {
  return {
    runId: `pagoda-run:${randomUUID()}`,
    targetId: input.targetId,
    projectRoot: input.projectRoot,
    targetRoot: input.targetRoot,
    artifactDirectory: input.artifactDirectory,
    scenario: input.scenario,
    evidenceMap: input.evidenceMap,
    contract: input.contract,
    channel: input.channel,
    seed: input.seed,
    interaction: input.interaction
  };
}
