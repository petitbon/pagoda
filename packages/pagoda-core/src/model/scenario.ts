import type { PagodaTraceSource } from './trace.js';
import type { PagodaInteractionSpec } from './interaction.js';

export type PagodaScenarioStatus = 'draft' | 'active' | 'retired';

export type PagodaChannel = 'browser-chat' | 'phone';

export type PagodaChannelContracts = {
  commonEvidenceCodes: string[];
  channels: Partial<Record<PagodaChannel, {
    requiredEvidenceCodes: string[];
    oracleClauses: string[];
  }>>;
  parity: {
    required: boolean;
    compare: string[];
  };
};

export type PagodaScenario = {
  schemaVersion: 'pagoda.scenario';
  id: string;
  status: PagodaScenarioStatus;
  title: string;
  owner: string;
  labels: {
    domain: string;
    outcome: string;
    risk: string;
    channels: PagodaChannel[];
  };
  intent: {
    actor: string;
    kind: string;
    summary: string;
  };
  fixture: {
    requiredState: string[];
    requiredFixtures: string[];
    setupEvidenceCodes: string[];
  };
  evidence: {
    requiredTraceSources: PagodaTraceSource[];
    acceptedEvidenceCodes: string[];
    rejectedEvidenceCodes: string[];
    repairCodes: string[];
    requiredWorkflowOutcomes: string[];
  };
  forbiddenSideEffects: {
    forbiddenToolNames: string[];
    forbiddenEvents: string[];
    forbiddenClaims: string[];
  };
  channelContracts: PagodaChannelContracts;
  harness: {
    suite: string;
    scenario: string;
    selectedCase?: string;
  };
  interaction?: PagodaInteractionSpec;
};
