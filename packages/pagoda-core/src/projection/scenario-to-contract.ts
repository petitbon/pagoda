import type { PagodaEvidenceMap, PagodaOutcomeContract, PagodaScenario } from '../types.js';

export const pagodaContractPathForScenario = (scenario: Pick<PagodaScenario, 'id'>): string =>
  `docs/pagoda/contracts/${scenario.id}.outcome-contract.json`;

export const pagodaEvidenceMapPathForScenario = (scenario: Pick<PagodaScenario, 'id'>): string =>
  `docs/pagoda/evidence-maps/${scenario.id}.evidence-map.json`;

export const projectScenarioToOutcomeContract = (
  scenario: PagodaScenario,
  sourceScenarioPath: string,
  evidenceMap: PagodaEvidenceMap
): PagodaOutcomeContract => ({
  schemaVersion: 'pagoda.outcome-contract',
  id: scenario.id,
  scenarioId: scenario.id,
  mapId: evidenceMap.id,
  outcome: scenario.labels.outcome,
  sourceScenarioPath,
  title: scenario.title,
  owner: scenario.owner,
  labels: scenario.labels,
  channels: scenario.labels.channels,
  intent: scenario.intent,
  fixture: scenario.fixture,
  requiredEvidence: scenario.evidence,
  channelContracts: scenario.channelContracts,
  trace: evidenceMap.traceContract,
  forbiddenSideEffects: scenario.forbiddenSideEffects,
  harness: scenario.harness
});
