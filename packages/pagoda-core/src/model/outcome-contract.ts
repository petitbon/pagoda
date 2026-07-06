import type { PagodaTraceContract } from './trace.js';
import type { PagodaChannel, PagodaChannelContracts, PagodaScenario } from './scenario.js';

export type PagodaOutcomeContract = {
  schemaVersion: 'pagoda.outcome-contract';
  id: string;
  scenarioId: string;
  mapId: string;
  generatedFrom?: {
    scenarioHash?: string;
    evidenceMapHash?: string;
    pagodaCoreVersion: string;
  };
  outcome: string;
  sourceScenarioPath: string;
  title: string;
  owner: string;
  labels: PagodaScenario['labels'];
  channels: PagodaChannel[];
  intent: PagodaScenario['intent'];
  fixture: PagodaScenario['fixture'];
  requiredEvidence: PagodaScenario['evidence'];
  channelContracts: PagodaChannelContracts;
  trace: PagodaTraceContract;
  forbiddenSideEffects: PagodaScenario['forbiddenSideEffects'];
  harness: PagodaScenario['harness'];
  interaction?: PagodaScenario['interaction'];
};
