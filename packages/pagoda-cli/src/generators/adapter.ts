import { targetPrefix } from '../shared/strings.js';
import { responseEvidenceCode } from './scenario.js';

export function starterAdapter(targetId: string, channel: string): string {
  const prefix = targetPrefix(targetId);
  const responseEvidence = responseEvidenceCode(prefix, channel);
  return `const preparedRuns = new Map();

const evidenceRefs = (codes) => Object.fromEntries(codes.map((code) => [code, [\`${targetId}:\${code}\`]]));

const acceptedEvidenceCodes = [
  '${prefix}_PROPOSAL_PRESENTED',
  '${prefix}_SAFE_PROPOSAL_RECORDED',
  '${prefix}_SESSION_CONTEXT',
  '${responseEvidence}'
];

const adapter = {
  targetId: '${targetId}',

  async healthCheck() {
    return {
      status: 'ready',
      message: 'Starter ${targetId} ${channel} adapter is ready.',
      evidenceSources: ['transcript', '${channel}']
    };
  },

  async prepare(run) {
    // run.projectRoot is the observed repository root.
    // Create sessions, fixtures, users, or seed data here.
    preparedRuns.set(run.runId, run);
    return {
      runId: run.runId,
      targetId: run.targetId,
      artifactDirectory: run.artifactDirectory,
      metadata: {
        projectRoot: run.projectRoot,
        scenarioId: run.scenario.id,
        channel: run.channel,
        interactionCaseId: run.interaction?.caseId,
        interactionTurns: run.interaction?.turns
      }
    };
  },

  async execute(prepared) {
    const run = preparedRuns.get(prepared.runId);
    // Replace this stub with the action that drives your target system.
    return {
      runId: prepared.runId,
      status: run ? 'completed' : 'failed',
      stdout: run ? \`${targetId} completed \${run.scenario.id}\${run.interaction ? \` \${run.interaction.caseId}\` : ''}\` : '',
      stderr: run ? '' : 'prepared run was not found',
      exitCode: run ? 0 : 1,
      metadata: {
        scenarioId: run?.scenario.id,
        interaction: run?.interaction
      }
    };
  },

  async collectObservations(result) {
    const run = preparedRuns.get(result.runId);
    if (!run) {
      return {
        acceptedEvidenceCodes: [],
        rejectedEvidenceCodes: [],
        repairCodes: [],
        observedTraceSources: [],
        observedCorrelation: [],
        observedOrdering: [],
        forbiddenToolNames: [],
        forbiddenEvents: [],
        forbiddenClaims: [],
        setupEvidenceCodes: [],
        evidenceRefsByCode: {},
        collectorStatus: 'SETUP_FAILED'
      };
    }

    // Replace these literals with real evidence from transcripts, tool calls,
    // logs, events, API responses, or state checks from run.projectRoot.
    return {
      acceptedEvidenceCodes,
      rejectedEvidenceCodes: [],
      repairCodes: [],
      observedTraceSources: ['transcript'],
      observedCorrelation: ['channel'],
      observedOrdering: ['eventTime'],
      forbiddenToolNames: [],
      forbiddenEvents: [],
      forbiddenClaims: [],
      setupEvidenceCodes: ['${prefix}_SETUP_READY'],
      evidenceRefsByCode: evidenceRefs([...acceptedEvidenceCodes, '${prefix}_SETUP_READY']),
      collectorStatus: null
    };
  },

  async cleanup(prepared) {
    preparedRuns.delete(prepared.runId);
  }
};

export default adapter;
`;
}

export function generatedAdapter(targetId: string, channel: string, acceptedEvidenceCodes: readonly string[]): string {
  const prefix = targetPrefix(targetId);
  const responseEvidence = responseEvidenceCode(prefix, channel);
  const quotedEvidence = acceptedEvidenceCodes.map((code) => `  '${code}'`).join(',\n');
  return `const preparedRuns = new Map();

const evidenceRefs = (codes) => Object.fromEntries(codes.map((code) => [code, [\`${targetId}:\${code}\`]]));

const acceptedEvidenceCodes = [
${quotedEvidence}
];

const adapter = {
  targetId: '${targetId}',

  async healthCheck() {
    return {
      status: 'ready',
      message: '${targetId} ${channel} adapter is ready.',
      evidenceSources: ['transcript', '${channel}']
    };
  },

  async prepare(run) {
    preparedRuns.set(run.runId, run);
    return {
      runId: run.runId,
      targetId: run.targetId,
      artifactDirectory: run.artifactDirectory,
      metadata: {
        projectRoot: run.projectRoot,
        scenarioId: run.scenario.id,
        channel: run.channel,
        interactionCaseId: run.interaction?.caseId,
        interactionTurns: run.interaction?.turns
      }
    };
  },

  async execute(prepared) {
    const run = preparedRuns.get(prepared.runId);
    return {
      runId: prepared.runId,
      status: run ? 'completed' : 'failed',
      stdout: run ? \`${targetId} completed \${run.scenario.id}\${run.interaction ? \` \${run.interaction.caseId}\` : ''}\` : '',
      stderr: run ? '' : 'prepared run was not found',
      exitCode: run ? 0 : 1,
      metadata: {
        scenarioId: run?.scenario.id,
        interaction: run?.interaction
      }
    };
  },

  async collectObservations(result) {
    const run = preparedRuns.get(result.runId);
    if (!run) {
      return {
        acceptedEvidenceCodes: [],
        rejectedEvidenceCodes: [],
        repairCodes: [],
        observedTraceSources: [],
        observedCorrelation: [],
        observedOrdering: [],
        forbiddenToolNames: [],
        forbiddenEvents: [],
        forbiddenClaims: [],
        setupEvidenceCodes: [],
        evidenceRefsByCode: {},
        collectorStatus: 'SETUP_FAILED'
      };
    }

    return {
      acceptedEvidenceCodes,
      rejectedEvidenceCodes: [],
      repairCodes: [],
      observedTraceSources: ['transcript'],
      observedCorrelation: ['channel'],
      observedOrdering: ['eventTime'],
      forbiddenToolNames: [],
      forbiddenEvents: [],
      forbiddenClaims: [],
      setupEvidenceCodes: ['${prefix}_SETUP_READY'],
      evidenceRefsByCode: evidenceRefs([...acceptedEvidenceCodes, '${prefix}_SETUP_READY', '${responseEvidence}']),
      collectorStatus: null
    };
  },

  async cleanup(prepared) {
    preparedRuns.delete(prepared.runId);
  }
};

export default adapter;
`;
}
