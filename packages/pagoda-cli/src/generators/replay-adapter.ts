export function replayAdapter(targetId: string): string {
  return `import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const preparedRuns = new Map();
const replayObservations = new Map();

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function resolveReplayObservation(run) {
  const explicitObservation = process.env.PAGODA_REPLAY_OBSERVATION;
  if (explicitObservation && existsSync(explicitObservation)) return readJson(explicitObservation);

  const artifact = process.env.PAGODA_REPLAY_ARTIFACT;
  if (artifact && existsSync(join(artifact, 'canonical-observation.json'))) {
    return readJson(join(artifact, 'canonical-observation.json'));
  }

  const canonicalTrace = join(run.targetRoot, 'traces', \`\${run.scenario.id}.canonical-observation.json\`);
  if (existsSync(canonicalTrace)) return readJson(canonicalTrace);

  const trace = join(run.targetRoot, 'traces', \`\${run.scenario.id}.trace.json\`);
  if (existsSync(trace)) {
    const value = await readJson(trace);
    if (value.canonicalObservation) return value.canonicalObservation;
  }

  return null;
}

const adapter = {
  targetId: '${targetId}',

  async healthCheck() {
    return {
      status: 'ready',
      message: 'Replay adapter is ready. Set PAGODA_REPLAY_OBSERVATION, PAGODA_REPLAY_ARTIFACT, or provide traces/<scenario-id>.canonical-observation.json.',
      evidenceSources: ['replay']
    };
  },

  async prepare(run) {
    preparedRuns.set(run.runId, run);
    const observation = await resolveReplayObservation(run);
    if (observation) replayObservations.set(run.runId, observation);
    return {
      runId: run.runId,
      targetId: run.targetId,
      artifactDirectory: run.artifactDirectory,
      metadata: {
        scenarioId: run.scenario.id,
        replayObservationFound: Boolean(observation)
      }
    };
  },

  async execute(prepared) {
    return {
      runId: prepared.runId,
      status: replayObservations.has(prepared.runId) ? 'completed' : 'failed',
      stdout: replayObservations.has(prepared.runId) ? 'replay observation loaded' : '',
      stderr: replayObservations.has(prepared.runId) ? '' : 'no replay observation found',
      exitCode: replayObservations.has(prepared.runId) ? 0 : 1,
      metadata: prepared.metadata
    };
  },

  async collectObservations(result) {
    const observation = replayObservations.get(result.runId);
    if (observation) return observation;
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
  },

  async cleanup(prepared) {
    preparedRuns.delete(prepared.runId);
    replayObservations.delete(prepared.runId);
  }
};

export default adapter;
`;
}
