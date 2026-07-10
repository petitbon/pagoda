import type {
  PagodaAgenticInterventionTrigger,
  PagodaInteractionSpec,
  PagodaChannel,
  PagodaEvidenceMap,
  PagodaEvidenceMapEdgeType,
  PagodaEvidenceMapNodeType,
  PagodaEvidenceScenarioStatus,
  PagodaScenario,
  PagodaTraceSource
} from './types.js';

export type PagodaScenarioValidationResult = {
  scenarioId: string;
  errors: string[];
};

const scenarioIdPattern = /^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
const retiredEddIdPattern = /\bEDD-\d{3}[A-Z]?\b/;
const retiredPathPattern = /\bdocs\/eventstorming\b|\bstorm-current\.json\b|\bedd-registry\.json\b/;

const allowedChannels = new Set<PagodaChannel>(['browser-chat', 'phone']);
const allowedTraceSources = new Set<PagodaTraceSource>([
  'transcript',
  'runtime_tool_calls',
  'dependency_calls',
  'session_ledger',
  'workflow_events',
  'domain_events',
  'adapter_logs',
  'runtime_audit_events'
]);
const allowedEvidenceMapNodeTypes = new Set<PagodaEvidenceMapNodeType>([
  'outcome',
  'actor',
  'intent',
  'authority',
  'decision',
  'fact',
  'evidence',
  'side_effect',
  'oracle',
  'recovery'
]);
const allowedEvidenceMapEdgeTypes = new Set<PagodaEvidenceMapEdgeType>([
  'initiates',
  'authorizes',
  'decides',
  'proves',
  'requires',
  'allows',
  'forbids',
  'classifies',
  'recovers'
]);
const allowedScenarioResultStatuses = new Set<PagodaEvidenceScenarioStatus>([
  'PASS',
  'FAIL',
  'SETUP_FAILED',
  'OBSERVABILITY_FAILED',
  'SCENARIO_INVALID'
]);

const requiredString = (errors: string[], path: string, value: unknown): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredStringArray = (errors: string[], path: string, value: unknown): string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    errors.push(`${path} must be a non-empty string array`);
    return [];
  }
  return value as string[];
};

const optionalStringArray = (errors: string[], path: string, value: unknown): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    errors.push(`${path} must be a string array`);
    return [];
  }
  return value as string[];
};

const rejectDuplicateStrings = (errors: string[], path: string, values: readonly string[]): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${path} contains duplicate value: ${value}`);
    seen.add(value);
  }
};

const requiredUniqueStringArray = (errors: string[], path: string, value: unknown): string[] => {
  const values = requiredStringArray(errors, path, value);
  rejectDuplicateStrings(errors, path, values);
  return values;
};

const sameStringSet = (left: readonly string[], right: unknown): boolean =>
  Array.isArray(right)
  && right.every((value) => typeof value === 'string')
  && left.length === right.length
  && left.every((value) => right.includes(value));

const rejectRetiredReferences = (errors: string[], path: string, values: readonly unknown[]): void => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    if (retiredEddIdPattern.test(value)) errors.push(`${path} must not use EDD ids: ${value}`);
    if (retiredPathPattern.test(value)) errors.push(`${path} must not reference EventStorming files: ${value}`);
  }
};

const validateChannels = (errors: string[], path: string, values: unknown): string[] => {
  const channels = requiredStringArray(errors, path, values);
  for (const channel of channels) {
    if (!allowedChannels.has(channel as PagodaChannel)) {
      errors.push(`${path} contains unsupported channel: ${channel}`);
    }
  }
  return channels;
};

const validateTraceSources = (errors: string[], path: string, values: unknown): string[] => {
  const sources = requiredUniqueStringArray(errors, path, values);
  for (const source of sources) {
    if (!allowedTraceSources.has(source as PagodaTraceSource)) {
      errors.push(`${path} contains unsupported source: ${source}`);
    }
  }
  return sources;
};

const validateChannelContracts = (errors: string[], scenario: Partial<PagodaScenario>, channels: readonly string[]): string[] => {
  const contracts = scenario.channelContracts;
  const texts: string[] = [];
  if (!isRecord(contracts)) {
    errors.push('channelContracts must be an object');
    return texts;
  }
  const commonEvidenceCodes = requiredStringArray(errors, 'channelContracts.commonEvidenceCodes', contracts.commonEvidenceCodes);
  texts.push(...commonEvidenceCodes);
  for (const channel of channels) {
    const channelContract = contracts.channels?.[channel as PagodaChannel];
    if (!channelContract) {
      errors.push(`channelContracts.channels.${channel} must be defined`);
      continue;
    }
    const requiredEvidenceCodes = requiredStringArray(errors, `channelContracts.channels.${channel}.requiredEvidenceCodes`, channelContract.requiredEvidenceCodes);
    const oracleClauses = requiredStringArray(errors, `channelContracts.channels.${channel}.oracleClauses`, channelContract.oracleClauses);
    texts.push(...requiredEvidenceCodes, ...oracleClauses);
  }
  if (!contracts.parity || typeof contracts.parity !== 'object') {
    errors.push('channelContracts.parity must be an object');
  } else {
    if (typeof contracts.parity.required !== 'boolean') {
      errors.push('channelContracts.parity.required must be a boolean');
    }
    texts.push(...requiredStringArray(errors, 'channelContracts.parity.compare', contracts.parity.compare));
  }
  return texts;
};

const slotTokenPattern = /\{([A-Za-z0-9_-]+)\}/g;

const validateSlotReferences = (
  errors: string[],
  path: string,
  value: string,
  slotNames: Set<string>
): void => {
  for (const match of value.matchAll(slotTokenPattern)) {
    const slotName = match[1];
    if (!slotNames.has(slotName)) errors.push(`${path} references undeclared slot ${slotName}`);
  }
};

const validateStringArraySlotReferences = (
  errors: string[],
  path: string,
  values: readonly string[],
  slotNames: Set<string>
): void => {
  for (const [index, value] of values.entries()) {
    validateSlotReferences(errors, `${path}[${index}]`, value, slotNames);
  }
};

type PartialInteraction = Partial<PagodaInteractionSpec> & {
  mode?: unknown;
  persona?: unknown;
  slots?: unknown;
  turns?: unknown;
  coverage?: unknown;
  goal?: unknown;
  knowledge?: unknown;
  interventionPolicy?: unknown;
  termination?: unknown;
};

const allowedAgenticInterventionTriggers = new Set<PagodaAgenticInterventionTrigger>([
  'answer-question',
  'ask-clarification',
  'correct-conflicting-fact',
  'reject-out-of-policy',
  'accept-valid-option',
  'verify-confirmation',
  'end-when-complete'
]);
const retiredFactCorrectionTriggers = new Set([
  'correct-wrong-service',
  'correct-wrong-staff',
  'correct-wrong-date',
  'correct-wrong-time'
]);

const validateInteractionPersona = (
  errors: string[],
  path: string,
  value: unknown,
  required: boolean,
  slotNames?: Set<string>
): string[] => {
  const texts: string[] = [];
  if (value === undefined) {
    if (required) errors.push(`${path} must be an object`);
    return texts;
  }
  const persona = value as { id?: string; traits?: unknown };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return texts;
  }
  requiredString(errors, `${path}.id`, persona.id);
  const traits = optionalStringArray(errors, `${path}.traits`, persona.traits);
  if (slotNames) validateStringArraySlotReferences(errors, `${path}.traits`, traits, slotNames);
  texts.push(persona.id ?? '', ...traits);
  return texts;
};

const validateInteractionSlots = (
  errors: string[],
  value: PartialInteraction
): { slotNames: Set<string>; texts: string[] } => {
  const texts: string[] = [];
  const slots = value.slots;
  if (slots !== undefined && (!slots || typeof slots !== 'object' || Array.isArray(slots))) {
    errors.push('interaction.slots must be an object');
  }
  const slotNames = new Set<string>();
  if (slots && typeof slots === 'object' && !Array.isArray(slots)) {
    for (const [slotName, slot] of Object.entries(slots)) {
      if (!slotName.trim()) errors.push('interaction.slots keys must be non-empty strings');
      slotNames.add(slotName);
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
        errors.push(`interaction.slots.${slotName} must be an object`);
        continue;
      }
      if (!Array.isArray(slot.values) || slot.values.length === 0) {
        errors.push(`interaction.slots.${slotName}.values must be a non-empty array`);
        continue;
      }
      for (const [index, slotValue] of slot.values.entries()) {
        if (!['string', 'number', 'boolean'].includes(typeof slotValue) && slotValue !== null) {
          errors.push(`interaction.slots.${slotName}.values[${index}] must be a string, number, boolean, or null`);
        }
        if (typeof slotValue === 'string') texts.push(slotValue);
      }
    }
  }
  return { slotNames, texts };
};

const validateInteractionCoverage = (errors: string[], value: PartialInteraction): void => {
  const coverage = value.coverage;
  if (coverage !== undefined) {
    if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
      errors.push('interaction.coverage must be an object');
    } else {
      const parsedCoverage = coverage as Record<string, unknown>;
      if (parsedCoverage.strategy !== 'seeded-pairwise') {
        errors.push('interaction.coverage.strategy must be seeded-pairwise');
      }
      if (parsedCoverage.maxCases !== undefined && (!Number.isInteger(parsedCoverage.maxCases) || Number(parsedCoverage.maxCases) <= 0)) {
        errors.push('interaction.coverage.maxCases must be a positive integer');
      }
    }
  }
};

const validateGeneratedInteraction = (
  errors: string[],
  interaction: PartialInteraction,
  slotNames: Set<string>
): string[] => {
  const texts: string[] = [];
  texts.push(...validateInteractionPersona(errors, 'interaction.persona', interaction.persona, false));

  if (!Array.isArray(interaction.turns) || interaction.turns.length === 0) {
    errors.push('interaction.turns must be a non-empty array');
  }
  const turnIds = new Set<string>();
  const turns = Array.isArray(interaction.turns) ? interaction.turns as Array<Record<string, unknown>> : [];
  for (const [index, turn] of turns.entries()) {
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
      errors.push(`interaction.turns[${index}] must be an object`);
      continue;
    }
    requiredString(errors, `interaction.turns[${index}].id`, turn.id);
    if (typeof turn.id === 'string') {
      if (turnIds.has(turn.id)) errors.push(`interaction.turns[${index}].id duplicates ${turn.id}`);
      turnIds.add(turn.id);
    }
    if (turn.actor !== 'user') errors.push(`interaction.turns[${index}].actor must be user`);
    if (turn.after !== undefined && turn.after !== 'channel-ready' && turn.after !== 'assistant-response') {
      errors.push(`interaction.turns[${index}].after must be channel-ready or assistant-response`);
    }
    if (turn.delayMs !== undefined && (!Number.isInteger(turn.delayMs) || Number(turn.delayMs) < 0)) {
      errors.push(`interaction.turns[${index}].delayMs must be a non-negative integer`);
    }
    if (!Array.isArray(turn.templates) || turn.templates.length === 0 || turn.templates.some((template: unknown) => typeof template !== 'string' || template.trim().length === 0)) {
      errors.push(`interaction.turns[${index}].templates must be a non-empty string array`);
      continue;
    }
    const templates = turn.templates as string[];
    texts.push(...templates);
    for (const template of templates) validateSlotReferences(errors, `interaction.turns[${index}].templates`, template, slotNames);
  }

  return texts;
};

const validateAgenticInteraction = (
  errors: string[],
  interaction: PartialInteraction,
  slotNames: Set<string>
): string[] => {
  const texts: string[] = [];
  texts.push(...validateInteractionPersona(errors, 'interaction.persona', interaction.persona, true, slotNames));

  const goal = interaction.goal;
  if (!goal || typeof goal !== 'object' || Array.isArray(goal)) {
    errors.push('interaction.goal must be an object');
  } else {
    const parsedGoal = goal as Record<string, unknown>;
    requiredString(errors, 'interaction.goal.summary', parsedGoal.summary);
    if (typeof parsedGoal.summary === 'string') validateSlotReferences(errors, 'interaction.goal.summary', parsedGoal.summary, slotNames);
    texts.push(typeof parsedGoal.summary === 'string' ? parsedGoal.summary : '');
    if (parsedGoal.facts !== undefined && (!parsedGoal.facts || typeof parsedGoal.facts !== 'object' || Array.isArray(parsedGoal.facts))) {
      errors.push('interaction.goal.facts must be an object');
    } else if (parsedGoal.facts && typeof parsedGoal.facts === 'object') {
      for (const [name, value] of Object.entries(parsedGoal.facts)) {
        if (!name.trim()) errors.push('interaction.goal.facts keys must be non-empty strings');
        if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
          errors.push(`interaction.goal.facts.${name} must be a string, number, boolean, or null`);
        }
        if (typeof value === 'string') {
          validateSlotReferences(errors, `interaction.goal.facts.${name}`, value, slotNames);
          texts.push(value);
        }
      }
    }
    const acceptableAlternatives = optionalStringArray(errors, 'interaction.goal.acceptableAlternatives', parsedGoal.acceptableAlternatives);
    validateStringArraySlotReferences(errors, 'interaction.goal.acceptableAlternatives', acceptableAlternatives, slotNames);
    texts.push(...acceptableAlternatives);
    const successCriteria = requiredStringArray(errors, 'interaction.goal.successCriteria', parsedGoal.successCriteria);
    validateStringArraySlotReferences(errors, 'interaction.goal.successCriteria', successCriteria, slotNames);
    texts.push(...successCriteria);
  }

  const knowledge = interaction.knowledge;
  if (knowledge !== undefined) {
    if (!knowledge || typeof knowledge !== 'object' || Array.isArray(knowledge)) {
      errors.push('interaction.knowledge must be an object');
    } else {
      const parsedKnowledge = knowledge as Record<string, unknown>;
      const knownFacts = optionalStringArray(errors, 'interaction.knowledge.knownFacts', parsedKnowledge.knownFacts);
      const unknownFacts = optionalStringArray(errors, 'interaction.knowledge.unknownFacts', parsedKnowledge.unknownFacts);
      const disclosureRules = optionalStringArray(errors, 'interaction.knowledge.disclosureRules', parsedKnowledge.disclosureRules);
      validateStringArraySlotReferences(errors, 'interaction.knowledge.knownFacts', knownFacts, slotNames);
      validateStringArraySlotReferences(errors, 'interaction.knowledge.unknownFacts', unknownFacts, slotNames);
      validateStringArraySlotReferences(errors, 'interaction.knowledge.disclosureRules', disclosureRules, slotNames);
      texts.push(...knownFacts, ...unknownFacts, ...disclosureRules);
    }
  }

  const policy = interaction.interventionPolicy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    errors.push('interaction.interventionPolicy must be an object');
  } else {
    const parsedPolicy = policy as Record<string, unknown>;
    if (!Array.isArray(parsedPolicy.triggers) || parsedPolicy.triggers.length === 0) {
      errors.push('interaction.interventionPolicy.triggers must be a non-empty array');
    } else {
      const triggerStrings = parsedPolicy.triggers.filter((trigger): trigger is string => typeof trigger === 'string');
      rejectDuplicateStrings(errors, 'interaction.interventionPolicy.triggers', triggerStrings);
      for (const [index, trigger] of parsedPolicy.triggers.entries()) {
        if (typeof trigger === 'string' && retiredFactCorrectionTriggers.has(trigger)) {
          errors.push(
            `interaction.interventionPolicy.triggers[${index}] ${trigger} was removed in Pagoda 0.3.0; use correct-conflicting-fact`
          );
          continue;
        }
        if (!allowedAgenticInterventionTriggers.has(trigger as PagodaAgenticInterventionTrigger)) {
          errors.push(`interaction.interventionPolicy.triggers[${index}] contains unsupported trigger: ${String(trigger)}`);
        }
      }
    }
    if (parsedPolicy.patience !== undefined && !['low', 'medium', 'high'].includes(String(parsedPolicy.patience))) {
      errors.push('interaction.interventionPolicy.patience must be low, medium, or high');
    }
  }

  const termination = interaction.termination;
  if (!termination || typeof termination !== 'object' || Array.isArray(termination)) {
    errors.push('interaction.termination must be an object');
  } else {
    const parsedTermination = termination as Record<string, unknown>;
    if (!Number.isInteger(parsedTermination.maxTurns) || Number(parsedTermination.maxTurns) <= 0) {
      errors.push('interaction.termination.maxTurns must be a positive integer');
    }
    if (parsedTermination.maxDurationMs !== undefined && (!Number.isInteger(parsedTermination.maxDurationMs) || Number(parsedTermination.maxDurationMs) <= 0)) {
      errors.push('interaction.termination.maxDurationMs must be a positive integer');
    }
    texts.push(...optionalStringArray(errors, 'interaction.termination.stopOn', parsedTermination.stopOn));
  }

  return texts;
};

const validateInteraction = (errors: string[], value: unknown): string[] => {
  const texts: string[] = [];
  if (value === undefined) return texts;
  const interaction = value as PartialInteraction;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('interaction must be an object');
    return texts;
  }

  if (interaction.mode !== 'generated' && interaction.mode !== 'agentic') {
    errors.push('interaction.mode must be generated or agentic');
  }

  const slots = validateInteractionSlots(errors, interaction);
  texts.push(...slots.texts);
  if (interaction.mode === 'generated') {
    texts.push(...validateGeneratedInteraction(errors, interaction, slots.slotNames));
  } else if (interaction.mode === 'agentic') {
    texts.push(...validateAgenticInteraction(errors, interaction, slots.slotNames));
  }
  validateInteractionCoverage(errors, interaction);

  return texts;
};

export function validatePagodaScenario(value: unknown): PagodaScenarioValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { scenarioId: '<unknown>', errors: ['scenario must be an object'] };
  }
  const scenario = value as Partial<PagodaScenario>;
  const scenarioId = typeof scenario.id === 'string' ? scenario.id : '<unknown>';

  if (scenario.schemaVersion !== 'pagoda.scenario') errors.push('schemaVersion must be pagoda.scenario');
  requiredString(errors, 'id', scenario.id);
  if (typeof scenario.id === 'string' && !scenarioIdPattern.test(scenario.id)) {
    errors.push(`id must match ${scenarioIdPattern.source}`);
  }
  if (!['draft', 'active', 'retired'].includes(String(scenario.status))) {
    errors.push('status must be draft, active, or retired');
  }
  requiredString(errors, 'title', scenario.title);
  requiredString(errors, 'owner', scenario.owner);

  requiredString(errors, 'labels.domain', scenario.labels?.domain);
  requiredString(errors, 'labels.outcome', scenario.labels?.outcome);
  requiredString(errors, 'labels.risk', scenario.labels?.risk);
  const channels = validateChannels(errors, 'labels.channels', scenario.labels?.channels);

  requiredString(errors, 'intent.actor', scenario.intent?.actor);
  requiredString(errors, 'intent.kind', scenario.intent?.kind);
  requiredString(errors, 'intent.summary', scenario.intent?.summary);

  const requiredState = requiredStringArray(errors, 'fixture.requiredState', scenario.fixture?.requiredState);
  const requiredFixtures = requiredStringArray(errors, 'fixture.requiredFixtures', scenario.fixture?.requiredFixtures);
  const setupEvidenceCodes = requiredStringArray(errors, 'fixture.setupEvidenceCodes', scenario.fixture?.setupEvidenceCodes);

  const requiredTraceSources = validateTraceSources(errors, 'evidence.requiredTraceSources', scenario.evidence?.requiredTraceSources);
  const acceptedEvidenceCodes = requiredStringArray(errors, 'evidence.acceptedEvidenceCodes', scenario.evidence?.acceptedEvidenceCodes);
  const requiredWorkflowOutcomes = requiredStringArray(errors, 'evidence.requiredWorkflowOutcomes', scenario.evidence?.requiredWorkflowOutcomes);
  const rejectedEvidenceCodes = optionalStringArray(errors, 'evidence.rejectedEvidenceCodes', scenario.evidence?.rejectedEvidenceCodes);
  const repairCodes = optionalStringArray(errors, 'evidence.repairCodes', scenario.evidence?.repairCodes);

  const forbiddenToolNames = optionalStringArray(errors, 'forbiddenSideEffects.forbiddenToolNames', scenario.forbiddenSideEffects?.forbiddenToolNames);
  const forbiddenEvents = optionalStringArray(errors, 'forbiddenSideEffects.forbiddenEvents', scenario.forbiddenSideEffects?.forbiddenEvents);
  const forbiddenClaims = optionalStringArray(errors, 'forbiddenSideEffects.forbiddenClaims', scenario.forbiddenSideEffects?.forbiddenClaims);
  const channelContractTexts = validateChannelContracts(errors, scenario, channels);

  requiredString(errors, 'harness.suite', scenario.harness?.suite);
  requiredString(errors, 'harness.scenario', scenario.harness?.scenario);
  const interactionTexts = validateInteraction(errors, scenario.interaction);

  rejectRetiredReferences(errors, 'scenario text', [
    scenario.id ?? '',
    scenario.title ?? '',
    scenario.owner ?? '',
    scenario.labels?.domain ?? '',
    scenario.labels?.outcome ?? '',
    scenario.labels?.risk ?? '',
    scenario.intent?.kind ?? '',
    scenario.intent?.summary ?? '',
    scenario.harness?.suite ?? '',
    scenario.harness?.scenario ?? '',
    scenario.harness?.selectedCase ?? '',
    ...requiredState,
    ...requiredFixtures,
    ...setupEvidenceCodes,
    ...requiredTraceSources,
    ...acceptedEvidenceCodes,
    ...rejectedEvidenceCodes,
    ...repairCodes,
    ...requiredWorkflowOutcomes,
    ...forbiddenToolNames,
    ...forbiddenEvents,
    ...forbiddenClaims,
    ...channelContractTexts,
    ...interactionTexts
  ]);

  return { scenarioId, errors };
}

export function assertValidPagodaScenarios(scenarios: readonly PagodaScenario[]): void {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const scenario of scenarios) {
    const result = validatePagodaScenario(scenario);
    errors.push(...result.errors.map((error) => `${result.scenarioId}: ${error}`));
    const id = isRecord(scenario) && typeof scenario.id === 'string' ? scenario.id : undefined;
    if (id && ids.has(id)) errors.push(`${id}: duplicate scenario id`);
    if (id) ids.add(id);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Pagoda scenario model:\n${errors.join('\n')}`);
  }
}

export function validatePagodaEvidenceMap(
  value: unknown,
  scenarioById: ReadonlyMap<string, PagodaScenario>
): PagodaScenarioValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { scenarioId: '<unknown>', errors: ['evidence map must be an object'] };
  }
  const evidenceMap = value as Partial<PagodaEvidenceMap>;
  const scenarioId = typeof evidenceMap.scenarioId === 'string' ? evidenceMap.scenarioId : '<unknown>';
  const scenario = typeof evidenceMap.scenarioId === 'string'
    ? scenarioById.get(evidenceMap.scenarioId)
    : undefined;
  if (evidenceMap.schemaVersion !== 'pagoda.evidence-map') errors.push('schemaVersion must be pagoda.evidence-map');
  requiredString(errors, 'id', evidenceMap.id);
  requiredString(errors, 'scenarioId', evidenceMap.scenarioId);
  requiredString(errors, 'outcomeContractId', evidenceMap.outcomeContractId);
  requiredString(errors, 'title', evidenceMap.title);
  requiredString(errors, 'owner', evidenceMap.owner);
  if (typeof evidenceMap.scenarioId === 'string' && !scenario) {
    errors.push(`scenarioId references missing Pagoda scenario: ${evidenceMap.scenarioId}`);
  }
  if (
    typeof evidenceMap.scenarioId === 'string' &&
    typeof evidenceMap.outcomeContractId === 'string' &&
    evidenceMap.outcomeContractId !== evidenceMap.scenarioId
  ) {
    errors.push('outcomeContractId must match scenarioId');
  }

  const rawNodes = value.nodes;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    errors.push('nodes must be a non-empty array');
  }
  const nodes = Array.isArray(rawNodes) ? rawNodes : [];
  const nodeIds = new Set<string>();
  const nodeTypes = new Set<string>();
  const nodeTexts: string[] = [];
  for (const [index, rawNode] of nodes.entries()) {
    if (!isRecord(rawNode)) {
      errors.push(`nodes[${index}] must be an object`);
      continue;
    }
    const node = rawNode;
    requiredString(errors, `nodes[${index}].id`, node.id);
    requiredString(errors, `nodes[${index}].label`, node.label);
    requiredString(errors, `nodes[${index}].summary`, node.summary);
    requiredString(errors, `nodes[${index}].owner`, node.owner);
    if (typeof node.id === 'string') {
      if (nodeIds.has(node.id)) errors.push(`nodes[${index}].id duplicates ${node.id}`);
      nodeIds.add(node.id);
    }
    if (!allowedEvidenceMapNodeTypes.has(node.type as PagodaEvidenceMapNodeType)) {
      errors.push(`nodes[${index}].type contains unsupported type: ${String(node.type)}`);
    } else {
      nodeTypes.add(node.type as string);
    }
    const evidenceCodes = optionalStringArray(errors, `nodes[${index}].evidenceCodes`, node.evidenceCodes);
    const traceSources = optionalStringArray(errors, `nodes[${index}].traceSources`, node.traceSources);
    const channels = optionalStringArray(errors, `nodes[${index}].channels`, node.channels);
    rejectDuplicateStrings(errors, `nodes[${index}].evidenceCodes`, evidenceCodes);
    rejectDuplicateStrings(errors, `nodes[${index}].traceSources`, traceSources);
    rejectDuplicateStrings(errors, `nodes[${index}].channels`, channels);
    for (const source of traceSources) {
      if (!allowedTraceSources.has(source as PagodaTraceSource)) errors.push(`nodes[${index}].traceSources contains unsupported source: ${source}`);
    }
    for (const channel of channels) {
      if (!allowedChannels.has(channel as PagodaChannel)) errors.push(`nodes[${index}].channels contains unsupported channel: ${channel}`);
    }
    nodeTexts.push(
      typeof node.id === 'string' ? node.id : '',
      typeof node.label === 'string' ? node.label : '',
      typeof node.summary === 'string' ? node.summary : '',
      typeof node.owner === 'string' ? node.owner : '',
      ...evidenceCodes,
      ...traceSources,
      ...channels
    );
  }
  for (const requiredNodeType of ['outcome', 'evidence', 'oracle']) {
    if (!nodeTypes.has(requiredNodeType)) errors.push(`nodes must contain at least one ${requiredNodeType} node`);
  }

  const rawEdges = value.edges;
  if (!Array.isArray(rawEdges) || rawEdges.length === 0) {
    errors.push('edges must be a non-empty array');
  }
  const edges = Array.isArray(rawEdges) ? rawEdges : [];
  const edgeIds = new Set<string>();
  const edgeTexts: string[] = [];
  for (const [index, rawEdge] of edges.entries()) {
    if (!isRecord(rawEdge)) {
      errors.push(`edges[${index}] must be an object`);
      continue;
    }
    const edge = rawEdge;
    requiredString(errors, `edges[${index}].id`, edge.id);
    requiredString(errors, `edges[${index}].sourceId`, edge.sourceId);
    requiredString(errors, `edges[${index}].targetId`, edge.targetId);
    requiredString(errors, `edges[${index}].label`, edge.label);
    if (typeof edge.id === 'string') {
      if (edgeIds.has(edge.id)) errors.push(`edges[${index}].id duplicates ${edge.id}`);
      edgeIds.add(edge.id);
    }
    if (!allowedEvidenceMapEdgeTypes.has(edge.type as PagodaEvidenceMapEdgeType)) errors.push(`edges[${index}].type contains unsupported type: ${String(edge.type)}`);
    if (typeof edge.sourceId === 'string' && !nodeIds.has(edge.sourceId)) {
      errors.push(`edges[${index}].sourceId references missing node: ${edge.sourceId}`);
    }
    if (typeof edge.targetId === 'string' && !nodeIds.has(edge.targetId)) {
      errors.push(`edges[${index}].targetId references missing node: ${edge.targetId}`);
    }
    edgeTexts.push(
      typeof edge.id === 'string' ? edge.id : '',
      typeof edge.sourceId === 'string' ? edge.sourceId : '',
      typeof edge.targetId === 'string' ? edge.targetId : '',
      typeof edge.label === 'string' ? edge.label : ''
    );
  }

  const rawTraceContract = value.traceContract;
  if (!isRecord(rawTraceContract)) errors.push('traceContract must be an object');
  const traceContract = isRecord(rawTraceContract) ? rawTraceContract : {};
  const requiredSources = validateTraceSources(errors, 'traceContract.requiredSources', traceContract.requiredSources);
  const correlation = requiredUniqueStringArray(errors, 'traceContract.correlation', traceContract.correlation);
  const ordering = requiredUniqueStringArray(errors, 'traceContract.ordering', traceContract.ordering);
  if (traceContract.missingEvidenceStatus !== 'OBSERVABILITY_FAILED') {
    errors.push('traceContract.missingEvidenceStatus must be OBSERVABILITY_FAILED');
  }
  const rawScenarioTraceSources = scenario?.evidence?.requiredTraceSources;
  const scenarioTraceSources = Array.isArray(rawScenarioTraceSources)
    ? rawScenarioTraceSources.filter((source) => typeof source === 'string')
    : [];
  if (scenario && !sameStringSet(requiredSources, scenarioTraceSources)) {
    errors.push(
      `traceContract.requiredSources must match scenario evidence.requiredTraceSources: ${scenarioTraceSources.join(', ')}`
    );
  }

  rejectRetiredReferences(errors, 'evidence map text', [
    evidenceMap.id ?? '',
    evidenceMap.scenarioId ?? '',
    evidenceMap.outcomeContractId ?? '',
    evidenceMap.title ?? '',
    evidenceMap.owner ?? '',
    ...nodeTexts,
    ...edgeTexts,
    ...requiredSources,
    ...correlation,
    ...ordering
  ]);

  return { scenarioId, errors };
}

export function assertValidPagodaEvidenceMaps(
  evidenceMaps: readonly PagodaEvidenceMap[],
  scenarios: readonly PagodaScenario[]
): void {
  const scenarioById = new Map(
    scenarios
      .filter((scenario) => isRecord(scenario) && typeof scenario.id === 'string')
      .map((scenario) => [scenario.id, scenario])
  );
  const mapScenarioIds = new Set<string>();
  const errors: string[] = [];

  for (const evidenceMap of evidenceMaps) {
    const result = validatePagodaEvidenceMap(evidenceMap, scenarioById);
    errors.push(...result.errors.map((error) => `${result.scenarioId}: ${error}`));
    const mapScenarioId = isRecord(evidenceMap) && typeof evidenceMap.scenarioId === 'string'
      ? evidenceMap.scenarioId
      : undefined;
    if (mapScenarioId && mapScenarioIds.has(mapScenarioId)) {
      errors.push(`${mapScenarioId}: duplicate evidence map for scenario`);
    }
    if (mapScenarioId) mapScenarioIds.add(mapScenarioId);
  }

  for (const scenario of scenarios) {
    const scenarioId = isRecord(scenario) && typeof scenario.id === 'string' ? scenario.id : undefined;
    if (scenarioId && !mapScenarioIds.has(scenarioId)) {
      errors.push(`${scenarioId}: missing evidence map`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Pagoda evidence map model:\n${errors.join('\n')}`);
  }
}
