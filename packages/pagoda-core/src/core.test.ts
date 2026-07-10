import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  canonicalEvidenceObservation,
  evaluatePagodaOutcomeContract,
  listPagodaInteractionCases,
  materializePagodaInteraction,
  projectScenarioToOutcomeContract,
  validatePagodaEvidenceMap,
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
    ordering: ['eventTime'],
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
  observedOrdering: ['eventTime'],
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

const agenticInteraction = {
  mode: 'agentic',
  persona: {
    id: 'booking-caller',
    traits: ['natural', 'specific']
  },
  slots: {
    flexibility: { values: ['strict', 'nearby'] }
  },
  goal: {
    summary: 'Book a barber haircut with Norman tomorrow around 2 PM.',
    facts: {
      service: 'barber haircut',
      staff: 'Norman'
    },
    acceptableAlternatives: ['Norman within one hour of 2 PM.'],
    successCriteria: ['A bookable option is explicitly offered.', 'The option uses Norman.']
  },
  knowledge: {
    knownFacts: ['The caller wants Norman.'],
    unknownFacts: ['The caller does not know backend availability.'],
    disclosureRules: ['Only accept explicit bookable options.']
  },
  interventionPolicy: {
    triggers: ['answer-question', 'ask-clarification', 'correct-conflicting-fact', 'accept-valid-option', 'verify-confirmation'],
    patience: 'medium'
  },
  termination: {
    maxTurns: 6,
    maxDurationMs: 90000,
    stopOn: ['goal-satisfied']
  },
  coverage: { strategy: 'seeded-pairwise' }
} satisfies PagodaInteractionSpec;

const slottedAgenticInteraction = {
  mode: 'agentic',
  persona: {
    id: 'booking-caller',
    traits: ['{flexibility}', 'natural']
  },
  slots: {
    flexibility: { values: ['strict', 'nearby'] },
    maxDistance: { values: [15] },
    optionalNote: { values: [null] },
    remote: { values: [false] },
    service: { values: ['barber haircut', 'beard trim'] }
  },
  goal: {
    summary: 'Book a {flexibility} {service}.',
    facts: {
      service: '{service}',
      remote: false,
      maxDistance: 15,
      optionalNote: null
    },
    acceptableAlternatives: ['{service} within {maxDistance} minutes.'],
    successCriteria: ['The target offers a {flexibility} {service}.']
  },
  knowledge: {
    knownFacts: ['The caller wants a {service}.'],
    unknownFacts: ['The caller does not know whether remote is {remote}.'],
    disclosureRules: ['Treat {optionalNote} as unavailable unless the target asks.']
  },
  interventionPolicy: {
    triggers: ['answer-question', 'ask-clarification', 'accept-valid-option'],
    patience: 'medium'
  },
  termination: {
    maxTurns: 6,
    maxDurationMs: 90000
  },
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
  it('preserves and deduplicates structured collector diagnostics', () => {
    const diagnostic = {
      code: 'TRACE_QUERY_FAILED',
      message: 'The trace backend did not return an observable row.',
      category: 'observability',
      dependency: 'cloud-logging',
      phase: 'collect'
    };
    const observation = canonicalEvidenceObservation({
      collectorStatus: 'OBSERVABILITY_FAILED',
      collectorDiagnostics: [diagnostic, diagnostic]
    });

    expect(observation.collectorDiagnostics).toEqual([diagnostic]);
  });

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

  it('requires declared ordering evidence', () => {
    const result = evaluatePagodaOutcomeContract({
      contract,
      channel: 'browser-chat',
      caseId: 'case',
      observations: canonicalEvidenceObservation({
        ...passingObservation(),
        observedOrdering: []
      })
    });
    expect(result.status).toBe('OBSERVABILITY_FAILED');
    expect(result.missingOrdering).toEqual(['eventTime']);
    expect(result.clauses).toContainEqual(expect.objectContaining({
      clause: 'ordering.eventTime',
      status: 'MISSING'
    }));
  });

  it('returns validation errors for malformed maps and mismatched trace sources', () => {
    const scenario = scenarioWithInteraction();
    expect(validatePagodaEvidenceMap(null, new Map()).errors).toEqual([
      'evidence map must be an object'
    ]);
    const malformed = validatePagodaEvidenceMap({
      schemaVersion: 'pagoda.evidence-map',
      id: scenario.id,
      scenarioId: scenario.id,
      outcomeContractId: scenario.id,
      title: 'Malformed',
      owner: 'pagoda',
      nodes: {},
      edges: [null],
      traceContract: {
        requiredSources: ['adapter_logs'],
        correlation: ['channel'],
        ordering: ['eventTime'],
        missingEvidenceStatus: 'OBSERVABILITY_FAILED'
      }
    }, new Map([[scenario.id, scenario]]));
    expect(malformed.errors).toEqual(expect.arrayContaining([
      'nodes must be a non-empty array',
      'edges[0] must be an object',
      'traceContract.requiredSources must match scenario evidence.requiredTraceSources: transcript'
    ]));

    const malformedScenario = {
      ...scenario,
      evidence: { ...scenario.evidence, requiredTraceSources: { length: 1 } }
    } as unknown as PagodaScenario;
    expect(() => validatePagodaEvidenceMap(
      evidenceMapFor(scenario),
      new Map([[scenario.id, malformedScenario]])
    )).not.toThrow();
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

  it('validates and materializes agentic interaction specs', () => {
    const scenario = { ...scenarioWithInteraction(), interaction: agenticInteraction };
    expect(validatePagodaScenario(scenario).errors).toEqual([]);
    const materialized = materializePagodaInteraction({
      scenarioId: scenario.id,
      channel: 'browser-chat',
      seed: 'fixed',
      interaction: agenticInteraction,
      caseSelector: 'case-001'
    });
    expect(materialized).toMatchObject({
      mode: 'agentic',
      caseId: 'case-001',
      persona: { id: 'booking-caller' },
      goal: { summary: 'Book a barber haircut with Norman tomorrow around 2 PM.' },
      interventionPolicy: {
        triggers: expect.arrayContaining(['ask-clarification', 'correct-conflicting-fact'])
      }
    });
  });

  it('renders selected slots into agentic caller-plan strings', () => {
    const scenario = { ...scenarioWithInteraction(), interaction: slottedAgenticInteraction };
    expect(validatePagodaScenario(scenario).errors).toEqual([]);
    const materialized = materializePagodaInteraction({
      scenarioId: scenario.id,
      channel: 'browser-chat',
      seed: 'fixed',
      interaction: slottedAgenticInteraction,
      caseSelector: 'case-001'
    });
    if (materialized.mode !== 'agentic') throw new Error('expected agentic materialization');
    const service = String(materialized.slots.service);
    const flexibility = String(materialized.slots.flexibility);
    expect(materialized.persona).toEqual({
      id: 'booking-caller',
      traits: [flexibility, 'natural']
    });
    expect(materialized.goal.summary).toBe(`Book a ${flexibility} ${service}.`);
    expect(materialized.goal.facts).toMatchObject({
      service,
      remote: false,
      maxDistance: 15,
      optionalNote: null
    });
    expect(materialized.goal.acceptableAlternatives).toEqual([`${service} within 15 minutes.`]);
    expect(materialized.goal.successCriteria).toEqual([`The target offers a ${flexibility} ${service}.`]);
    expect(materialized.knowledge).toEqual({
      knownFacts: [`The caller wants a ${service}.`],
      unknownFacts: ['The caller does not know whether remote is false.'],
      disclosureRules: ['Treat null as unavailable unless the target asks.']
    });

    const cases = listPagodaInteractionCases({
      scenarioId: scenario.id,
      channel: 'browser-chat',
      seed: 'fixed',
      interaction: slottedAgenticInteraction
    });
    const summaries = cases.map((item) => {
      if (item.mode !== 'agentic') throw new Error('expected agentic materialization');
      return item.goal.summary;
    });
    expect(new Set(summaries).size).toBeGreaterThan(1);
  });

  it('rejects incomplete agentic interaction specs', () => {
    const scenario = {
      ...scenarioWithInteraction(),
      interaction: {
        ...agenticInteraction,
        goal: { summary: '', successCriteria: [] },
        interventionPolicy: { triggers: ['unsupported-trigger'] },
        termination: { maxTurns: 0 }
      }
    };
    expect(validatePagodaScenario(scenario).errors).toEqual(expect.arrayContaining([
      'interaction.goal.summary must be a non-empty string',
      'interaction.goal.successCriteria must be a non-empty string array',
      'interaction.interventionPolicy.triggers[0] contains unsupported trigger: unsupported-trigger',
      'interaction.termination.maxTurns must be a positive integer'
    ]));
  });

  it('reports the 0.3 migration for retired fact-correction triggers', () => {
    const scenario = {
      ...scenarioWithInteraction(),
      interaction: {
        ...agenticInteraction,
        interventionPolicy: { triggers: ['correct-wrong-staff'] }
      }
    };
    expect(validatePagodaScenario(scenario).errors).toContain(
      'interaction.interventionPolicy.triggers[0] correct-wrong-staff was removed in Pagoda 0.3.0; use correct-conflicting-fact'
    );
  });

  it('rejects undeclared slot references in agentic renderable fields', () => {
    const scenario = {
      ...scenarioWithInteraction(),
      interaction: {
        ...slottedAgenticInteraction,
        persona: {
          id: 'booking-caller',
          traits: ['{missingTrait}']
        },
        goal: {
          ...slottedAgenticInteraction.goal,
          summary: 'Book a {missingSummary}.',
          facts: {
            service: '{missingFact}',
            remote: false
          },
          acceptableAlternatives: ['Offer {missingAlternative}.'],
          successCriteria: ['Complete {missingCriterion}.']
        },
        knowledge: {
          knownFacts: ['Known {missingKnown}.'],
          unknownFacts: ['Unknown {missingUnknown}.'],
          disclosureRules: ['Rule {missingRule}.']
        }
      }
    };
    expect(validatePagodaScenario(scenario).errors).toEqual(expect.arrayContaining([
      'interaction.persona.traits[0] references undeclared slot missingTrait',
      'interaction.goal.summary references undeclared slot missingSummary',
      'interaction.goal.facts.service references undeclared slot missingFact',
      'interaction.goal.acceptableAlternatives[0] references undeclared slot missingAlternative',
      'interaction.goal.successCriteria[0] references undeclared slot missingCriterion',
      'interaction.knowledge.knownFacts[0] references undeclared slot missingKnown',
      'interaction.knowledge.unknownFacts[0] references undeclared slot missingUnknown',
      'interaction.knowledge.disclosureRules[0] references undeclared slot missingRule'
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
