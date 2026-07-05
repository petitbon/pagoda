import type {
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

const rejectRetiredReferences = (errors: string[], path: string, values: readonly string[]): void => {
  for (const value of values) {
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
  const sources = requiredStringArray(errors, path, values);
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
  if (!contracts || typeof contracts !== 'object') {
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

export function validatePagodaScenario(value: unknown): PagodaScenarioValidationResult {
  const scenario = value as Partial<PagodaScenario>;
  const scenarioId = typeof scenario.id === 'string' ? scenario.id : '<unknown>';
  const errors: string[] = [];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { scenarioId, errors: ['scenario must be an object'] };
  }

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
    ...channelContractTexts
  ]);

  return { scenarioId, errors };
}

export function assertValidPagodaScenarios(scenarios: readonly PagodaScenario[]): void {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const scenario of scenarios) {
    const result = validatePagodaScenario(scenario);
    errors.push(...result.errors.map((error) => `${result.scenarioId}: ${error}`));
    if (ids.has(scenario.id)) errors.push(`${scenario.id}: duplicate scenario id`);
    ids.add(scenario.id);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Pagoda scenario model:\n${errors.join('\n')}`);
  }
}

export function validatePagodaEvidenceMap(
  value: unknown,
  scenarioById: ReadonlyMap<string, PagodaScenario>
): PagodaScenarioValidationResult {
  const evidenceMap = value as Partial<PagodaEvidenceMap>;
  const scenarioId = typeof evidenceMap.scenarioId === 'string' ? evidenceMap.scenarioId : '<unknown>';
  const errors: string[] = [];
  const scenario = typeof evidenceMap.scenarioId === 'string'
    ? scenarioById.get(evidenceMap.scenarioId)
    : undefined;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { scenarioId, errors: ['evidence map must be an object'] };
  }
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

  if (!Array.isArray(evidenceMap.nodes) || evidenceMap.nodes.length === 0) {
    errors.push('nodes must be a non-empty array');
  }
  const nodeIds = new Set<string>();
  const nodeTypes = new Set<string>();
  for (const [index, node] of (evidenceMap.nodes ?? []).entries()) {
    requiredString(errors, `nodes[${index}].id`, node.id);
    requiredString(errors, `nodes[${index}].label`, node.label);
    requiredString(errors, `nodes[${index}].summary`, node.summary);
    requiredString(errors, `nodes[${index}].owner`, node.owner);
    if (typeof node.id === 'string') {
      if (nodeIds.has(node.id)) errors.push(`nodes[${index}].id duplicates ${node.id}`);
      nodeIds.add(node.id);
    }
    if (!allowedEvidenceMapNodeTypes.has(node.type)) {
      errors.push(`nodes[${index}].type contains unsupported type: ${node.type}`);
    } else {
      nodeTypes.add(node.type);
    }
    for (const source of node.traceSources ?? []) {
      if (!allowedTraceSources.has(source)) errors.push(`nodes[${index}].traceSources contains unsupported source: ${source}`);
    }
    for (const channel of node.channels ?? []) {
      if (!allowedChannels.has(channel)) errors.push(`nodes[${index}].channels contains unsupported channel: ${channel}`);
    }
  }
  for (const requiredNodeType of ['outcome', 'evidence', 'oracle']) {
    if (!nodeTypes.has(requiredNodeType)) errors.push(`nodes must contain at least one ${requiredNodeType} node`);
  }

  if (!Array.isArray(evidenceMap.edges) || evidenceMap.edges.length === 0) {
    errors.push('edges must be a non-empty array');
  }
  const edgeIds = new Set<string>();
  for (const [index, edge] of (evidenceMap.edges ?? []).entries()) {
    requiredString(errors, `edges[${index}].id`, edge.id);
    requiredString(errors, `edges[${index}].sourceId`, edge.sourceId);
    requiredString(errors, `edges[${index}].targetId`, edge.targetId);
    requiredString(errors, `edges[${index}].label`, edge.label);
    if (typeof edge.id === 'string') {
      if (edgeIds.has(edge.id)) errors.push(`edges[${index}].id duplicates ${edge.id}`);
      edgeIds.add(edge.id);
    }
    if (!allowedEvidenceMapEdgeTypes.has(edge.type)) errors.push(`edges[${index}].type contains unsupported type: ${edge.type}`);
    if (typeof edge.sourceId === 'string' && !nodeIds.has(edge.sourceId)) {
      errors.push(`edges[${index}].sourceId references missing node: ${edge.sourceId}`);
    }
    if (typeof edge.targetId === 'string' && !nodeIds.has(edge.targetId)) {
      errors.push(`edges[${index}].targetId references missing node: ${edge.targetId}`);
    }
  }

  const requiredSources = validateTraceSources(errors, 'traceContract.requiredSources', evidenceMap.traceContract?.requiredSources);
  const correlation = requiredStringArray(errors, 'traceContract.correlation', evidenceMap.traceContract?.correlation);
  const ordering = requiredStringArray(errors, 'traceContract.ordering', evidenceMap.traceContract?.ordering);
  if (evidenceMap.traceContract?.missingEvidenceStatus !== 'OBSERVABILITY_FAILED') {
    errors.push('traceContract.missingEvidenceStatus must be OBSERVABILITY_FAILED');
  }

  rejectRetiredReferences(errors, 'evidence map text', [
    evidenceMap.id ?? '',
    evidenceMap.scenarioId ?? '',
    evidenceMap.outcomeContractId ?? '',
    evidenceMap.title ?? '',
    evidenceMap.owner ?? '',
    ...(evidenceMap.nodes ?? []).flatMap((node) => [
      node.id ?? '',
      node.label ?? '',
      node.summary ?? '',
      node.owner ?? '',
      ...(node.evidenceCodes ?? []),
      ...(node.traceSources ?? []),
      ...(node.channels ?? [])
    ]),
    ...(evidenceMap.edges ?? []).flatMap((edge) => [
      edge.id ?? '',
      edge.sourceId ?? '',
      edge.targetId ?? '',
      edge.label ?? ''
    ]),
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
  const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const mapScenarioIds = new Set<string>();
  const errors: string[] = [];

  for (const evidenceMap of evidenceMaps) {
    const result = validatePagodaEvidenceMap(evidenceMap, scenarioById);
    errors.push(...result.errors.map((error) => `${result.scenarioId}: ${error}`));
    if (mapScenarioIds.has(evidenceMap.scenarioId)) {
      errors.push(`${evidenceMap.scenarioId}: duplicate evidence map for scenario`);
    }
    mapScenarioIds.add(evidenceMap.scenarioId);
  }

  for (const scenario of scenarios) {
    if (!mapScenarioIds.has(scenario.id)) {
      errors.push(`${scenario.id}: missing evidence map`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Pagoda evidence map model:\n${errors.join('\n')}`);
  }
}
