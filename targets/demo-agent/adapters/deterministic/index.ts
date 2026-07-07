import { canonicalEvidenceObservation, type CanonicalEvidenceObservationSet } from '@petitbon/pagoda-core';
import type {
  PagodaRunPlan,
  PagodaTargetAdapter,
  PreparedRun,
  TargetHealth,
  TargetRunResult
} from '@petitbon/pagoda-adapter-sdk';

const preparedRuns = new Map<string, PagodaRunPlan>();

const evidenceRefs = (codes: readonly string[]): Record<string, string[]> =>
  Object.fromEntries(codes.map((code) => [code, [`demo-agent:${code}`]]));

const interactionText = (run: PagodaRunPlan): string => {
  if (!run.interaction) return '';
  if (run.interaction.mode === 'agentic') return ` ${run.interaction.caseId} ${run.interaction.goal.summary}`;
  return ` ${run.interaction.caseId} ${run.interaction.turns.map((turn) => turn.text).join(' ')}`;
};

const passingObservation = (): CanonicalEvidenceObservationSet => {
  const acceptedEvidenceCodes = [
    'DEMO_OUTCOME_PROVEN',
    'DemoOutcomeRecorded',
    'DEMO_COMMON_CONTEXT',
    'DEMO_BROWSER_OUTPUT'
  ];
  return canonicalEvidenceObservation({
    acceptedEvidenceCodes,
    observedTraceSources: ['transcript'],
    observedCorrelation: ['channel'],
    setupEvidenceCodes: ['DEMO_SETUP_READY'],
    evidenceRefsByCode: evidenceRefs([...acceptedEvidenceCodes, 'DEMO_SETUP_READY'])
  });
};

const observationForScenario = (scenarioId: string): CanonicalEvidenceObservationSet => {
  if (scenarioId === 'DEMO-FORBIDDEN-COMMIT-001') {
    const baseline = passingObservation();
    return canonicalEvidenceObservation({
      ...baseline,
      rejectedEvidenceCodes: ['DEMO_FORBIDDEN_COMMIT'],
      forbiddenToolNames: ['commit_demo_action'],
      forbiddenEvents: ['DemoCommittedWithoutApproval'],
      forbiddenClaims: ['demo action was committed'],
      evidenceRefsByCode: {
        ...baseline.evidenceRefsByCode,
        DEMO_FORBIDDEN_COMMIT: ['demo-agent:DEMO_FORBIDDEN_COMMIT']
      }
    });
  }

  if (scenarioId === 'DEMO-OBSERVABILITY-MISSING-001') {
    return canonicalEvidenceObservation({
      acceptedEvidenceCodes: ['DEMO_OUTCOME_PROVEN'],
      observedCorrelation: ['channel'],
      setupEvidenceCodes: ['DEMO_SETUP_READY'],
      collectorStatus: 'OBSERVABILITY_FAILED',
      evidenceRefsByCode: evidenceRefs(['DEMO_OUTCOME_PROVEN', 'DEMO_SETUP_READY'])
    });
  }

  if (scenarioId === 'DEMO-SETUP-MISSING-001') {
    return canonicalEvidenceObservation({
      collectorStatus: 'SETUP_FAILED'
    });
  }

  return passingObservation();
};

export const pagodaTargetAdapter: PagodaTargetAdapter = {
  targetId: 'demo-agent',

  async healthCheck(): Promise<TargetHealth> {
    return {
      status: 'ready',
      message: 'Deterministic demo adapter is ready.',
      evidenceSources: ['transcript', 'deterministic-fixture']
    };
  },

  async prepare(run: PagodaRunPlan): Promise<PreparedRun> {
    preparedRuns.set(run.runId, run);
    return {
      runId: run.runId,
      targetId: run.targetId,
      artifactDirectory: run.artifactDirectory,
      metadata: {
        scenarioId: run.scenario.id,
        channel: run.channel,
        interaction: run.interaction
      }
    };
  },

  async execute(prepared: PreparedRun): Promise<TargetRunResult> {
    const run = preparedRuns.get(prepared.runId);
    return {
      runId: prepared.runId,
      status: run ? 'completed' : 'failed',
      stdout: run ? `demo-agent completed ${run.scenario.id}${interactionText(run)}` : '',
      stderr: run ? '' : 'prepared run was not found',
      exitCode: run ? 0 : 1,
      metadata: {
        scenarioId: run?.scenario.id,
        interaction: run?.interaction
      }
    };
  },

  async collectObservations(result: TargetRunResult): Promise<CanonicalEvidenceObservationSet> {
    const run = preparedRuns.get(result.runId);
    if (!run) {
      return canonicalEvidenceObservation({
        collectorStatus: 'SETUP_FAILED'
      });
    }
    return observationForScenario(run.scenario.id);
  },

  async cleanup(prepared: PreparedRun): Promise<void> {
    preparedRuns.delete(prepared.runId);
  }
};

export default pagodaTargetAdapter;
