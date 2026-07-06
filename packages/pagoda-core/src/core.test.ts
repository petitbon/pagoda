import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  canonicalEvidenceObservation,
  evaluatePagodaOutcomeContract,
  listPagodaInteractionCases,
  materializePagodaInteraction,
  projectScenarioToOutcomeContract,
  validatePagodaScenario,
  type PagodaEvidenceMap,
  type PagodaInteractionSpec,
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

const interaction = {
  mode: 'generated',
  slots: {
    city: { values: ['Boston', 'Austin'] },
    urgency: { values: ['normal', 'urgent'] },
    format: { values: ['short', 'detailed'] }
  },
  turns: [
    {
      id: 'ask',
      actor: 'user',
      after: 'channel-ready',
      templates: [
        'Give me a {urgency} {format} answer for {city}.',
        'I need {city}: {format}, {urgency}.'
      ]
    }
  ],
  coverage: { strategy: 'seeded-pairwise' }
} satisfies PagodaInteractionSpec;

const scenarioWithInteraction = (): PagodaScenario => ({
  schemaVersion: 'pagoda.scenario',
  id: 'PGD-CORE-INTERACTION-001',
  status: 'active',
  title: 'Core interaction',
  owner: 'pagoda',
  labels: { domain: 'core', outcome: 'interaction', risk: 'medium', channels: ['browser-chat'] },
  intent: { actor: 'user', kind: 'ask', summary: 'A user asks for an answer.' },
  fixture: { requiredState: ['ready'], requiredFixtures: ['fixture'], setupEvidenceCodes: ['SETUP_READY'] },
  evidence: {
    requiredTraceSources: ['transcript'],
    acceptedEvidenceCodes: ['OUTCOME_ACCEPTED'],
    rejectedEvidenceCodes: [],
    repairCodes: [],
    requiredWorkflowOutcomes: ['OUTCOME_RECORDED']
  },
  forbiddenSideEffects: { forbiddenToolNames: [], forbiddenEvents: [], forbiddenClaims: [] },
  channelContracts: {
    commonEvidenceCodes: ['SESSION_CONTEXT'],
    channels: {
      'browser-chat': { requiredEvidenceCodes: ['CHANNEL_READY'], oracleClauses: ['answer is visible'] }
    },
    parity: { required: false, compare: ['status'] }
  },
  harness: { suite: 'core', scenario: 'interaction', selectedCase: 'legacy-case' },
  interaction
});

const evidenceMapFor = (scenario: PagodaScenario): PagodaEvidenceMap => ({
  schemaVersion: 'pagoda.evidence-map',
  id: scenario.id,
  scenarioId: scenario.id,
  outcomeContractId: scenario.id,
  title: 'Evidence map',
  owner: 'pagoda',
  nodes: [
    { id: 'outcome', type: 'outcome', label: 'Outcome', summary: 'Outcome', owner: 'pagoda' }
  ],
  edges: [],
  traceContract: {
    requiredSources: ['transcript'],
    correlation: ['channel'],
    ordering: ['eventTime'],
    missingEvidenceStatus: 'OBSERVABILITY_FAILED'
  }
});

const seenPairs = (cases: ReturnType<typeof listPagodaInteractionCases>, left: string, right: string): Set<string> =>
  new Set(cases.map((item) => `${String(item.slots[left])}|${String(item.slots[right])}`));

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

  it('validates interaction specs and preserves legacy scenarios without interaction', () => {
    const scenario = scenarioWithInteraction();
    expect(validatePagodaScenario({ ...scenario, interaction: undefined }).errors).toEqual([]);
    expect(validatePagodaScenario(scenario).errors).toEqual([]);
    expect(validatePagodaScenario({
      ...scenario,
      interaction: {
        ...interaction,
        turns: [
          { id: 'ask', actor: 'user', templates: ['Use {missing}.'] },
          { id: 'ask', actor: 'user', templates: ['Duplicate id.'] }
        ]
      }
    }).errors).toEqual(expect.arrayContaining([
      'interaction.turns[0].templates references undeclared slot missing',
      'interaction.turns[1].id duplicates ask'
    ]));
    expect(validatePagodaScenario({
      ...scenario,
      interaction: {
        ...interaction,
        slots: null,
        turns: 'bad-turns'
      }
    }).errors).toEqual(expect.arrayContaining([
      'interaction.slots must be an object',
      'interaction.turns must be a non-empty array'
    ]));
  });

  it('materializes stable case identities with seeded ordering and template choice', () => {
    const firstSeed = listPagodaInteractionCases({
      scenarioId: 'PGD-CORE-INTERACTION-001',
      channel: 'browser-chat',
      seed: 'one',
      interaction
    });
    const secondSeed = listPagodaInteractionCases({
      scenarioId: 'PGD-CORE-INTERACTION-001',
      channel: 'browser-chat',
      seed: 'two',
      interaction
    });
    expect(new Set(firstSeed.map((item) => item.caseId))).toEqual(new Set(secondSeed.map((item) => item.caseId)));
    expect(firstSeed.map((item) => item.caseId)).not.toEqual(secondSeed.map((item) => item.caseId));
    expect(materializePagodaInteraction({
      scenarioId: 'PGD-CORE-INTERACTION-001',
      channel: 'browser-chat',
      seed: 'one',
      interaction,
      caseSelector: 'case-001'
    }).slots).toEqual(materializePagodaInteraction({
      scenarioId: 'PGD-CORE-INTERACTION-001',
      channel: 'browser-chat',
      seed: 'two',
      interaction,
      caseSelector: 'case-001'
    }).slots);
  });

  it('covers every pair of slot values and rejects unsafe caps', () => {
    const cases = listPagodaInteractionCases({
      scenarioId: 'PGD-CORE-INTERACTION-001',
      channel: 'browser-chat',
      seed: 'fixed',
      interaction
    });
    expect(seenPairs(cases, 'city', 'urgency')).toEqual(new Set(['Boston|normal', 'Boston|urgent', 'Austin|normal', 'Austin|urgent']));
    expect(seenPairs(cases, 'city', 'format')).toEqual(new Set(['Boston|short', 'Boston|detailed', 'Austin|short', 'Austin|detailed']));
    expect(seenPairs(cases, 'urgency', 'format')).toEqual(new Set(['normal|short', 'normal|detailed', 'urgent|short', 'urgent|detailed']));
    expect(() => listPagodaInteractionCases({
      scenarioId: 'PGD-CORE-INTERACTION-001',
      channel: 'browser-chat',
      seed: 'fixed',
      interaction: { ...interaction, coverage: { strategy: 'seeded-pairwise', maxCases: 1 } }
    })).toThrow(/lower than required pairwise case count/);
  });

  it('handles slot values with separator-like characters', () => {
    const trickyInteraction = {
      ...interaction,
      slots: {
        city: { values: ['A|B', 'C=D'] },
        urgency: { values: ['normal|fast', 'urgent=now'] },
        format: { values: ['short', 'detailed'] }
      }
    } satisfies PagodaInteractionSpec;
    const materialized = materializePagodaInteraction({
      scenarioId: 'PGD-CORE-INTERACTION-001',
      channel: 'browser-chat',
      seed: 'fixed',
      interaction: trickyInteraction,
      caseSelector: 'case-001'
    });
    expect(['A|B', 'C=D']).toContain(materialized.slots.city);
    expect(materialized.turns[0].text).toContain(String(materialized.slots.city));
  });

  it('projects interaction into outcome contracts', () => {
    const scenario = scenarioWithInteraction();
    const projected = projectScenarioToOutcomeContract(scenario, 'scenario.json', evidenceMapFor(scenario));
    expect(projected.interaction).toEqual(interaction);
  });

});
