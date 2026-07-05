import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  canonicalEvidenceObservation,
  evaluatePagodaOutcomeContract,
  projectScenarioToOutcomeContract,
  type PagodaEvidenceMap,
  type PagodaOutcomeContract,
  type PagodaScenario
} from './index.js';

const contract = {
  id: 'PGD-CORE-TEST.contract',
  scenarioId: 'PGD-CORE-TEST',
  channels: ['browser-chat'],
  fixture: {
    requiredState: [],
    requiredFixtures: [],
    setupEvidenceCodes: ['SETUP_READY']
  },
  requiredEvidence: {
    requiredTraceSources: ['transcript'],
    acceptedEvidenceCodes: ['OUTCOME_ACCEPTED'],
    rejectedEvidenceCodes: ['OUTCOME_REJECTED'],
    repairCodes: [],
    requiredWorkflowOutcomes: []
  },
  channelContracts: {
    commonEvidenceCodes: [],
    channels: {
      'browser-chat': {
        requiredEvidenceCodes: ['CHANNEL_READY'],
        oracleClauses: []
      }
    },
    parity: {
      required: false,
      compare: []
    }
  },
  trace: {
    requiredSources: ['transcript'],
    correlation: ['channel'],
    ordering: [],
    missingEvidenceStatus: 'OBSERVABILITY_FAILED'
  },
  forbiddenSideEffects: {
    forbiddenToolNames: ['commit_booking'],
    forbiddenEvents: [],
    forbiddenClaims: []
  }
} as unknown as PagodaOutcomeContract;

const passingObservation = () => canonicalEvidenceObservation({
  setupEvidenceCodes: ['SETUP_READY'],
  observedTraceSources: ['transcript'],
  observedCorrelation: ['channel'],
  acceptedEvidenceCodes: ['OUTCOME_ACCEPTED', 'CHANNEL_READY']
});

describe('@petitbon/pagoda-core', () => {
  it('oracle applies the canonical classification order', () => {
    expect(evaluatePagodaOutcomeContract({
      contract,
      channel: 'phone' as never,
      caseId: 'case',
      observations: passingObservation()
    }).status).toBe('SCENARIO_INVALID');
    expect(evaluatePagodaOutcomeContract({
      contract,
      channel: 'browser-chat',
      caseId: 'case',
      observations: canonicalEvidenceObservation({ collectorStatus: 'SETUP_FAILED' })
    }).status).toBe('SETUP_FAILED');
    expect(evaluatePagodaOutcomeContract({
      contract,
      channel: 'browser-chat',
      caseId: 'case',
      observations: canonicalEvidenceObservation({
        setupEvidenceCodes: ['SETUP_READY'],
        collectorStatus: 'OBSERVABILITY_FAILED'
      })
    }).status).toBe('OBSERVABILITY_FAILED');
    expect(evaluatePagodaOutcomeContract({
      contract,
      channel: 'browser-chat',
      caseId: 'case',
      observations: canonicalEvidenceObservation({
        ...passingObservation(),
        forbiddenToolNames: ['commit_booking']
      })
    }).status).toBe('FAIL');
    expect(evaluatePagodaOutcomeContract({
      contract,
      channel: 'browser-chat',
      caseId: 'case',
      observations: passingObservation()
    }).status).toBe('PASS');
  });

  it('projects contracts with source freshness metadata when supplied by caller', async () => {
    const scenario = JSON.parse(await readFile(
      '../../targets/demo-agent/docs/pagoda/scenarios/demo-proposal-presented-001.scenario.json',
      'utf8'
    )) as PagodaScenario;
    const evidenceMap = JSON.parse(await readFile(
      '../../targets/demo-agent/docs/pagoda/evidence-maps/DEMO-PROPOSAL-PRESENTED-001.evidence-map.json',
      'utf8'
    )) as PagodaEvidenceMap;
    const projected = {
      ...projectScenarioToOutcomeContract(scenario, 'docs/pagoda/scenarios/pgd-core-test.scenario.json', evidenceMap),
      generatedFrom: {
        scenarioHash: 'sha256:scenario',
        evidenceMapHash: 'sha256:evidence-map',
        pagodaCoreVersion: '0.1.0'
      }
    };
    expect(projected.generatedFrom).toEqual({
      scenarioHash: 'sha256:scenario',
      evidenceMapHash: 'sha256:evidence-map',
      pagodaCoreVersion: '0.1.0'
    });
  });

});
