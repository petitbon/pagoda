import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  canonicalEvidenceObservation,
  evaluatePagodaOutcomeContract,
  assertValidPagodaEvidenceMaps,
  assertValidPagodaScenarios,
  listPagodaInteractionCases,
  materializePagodaInteraction,
  type PagodaCallerSession,
  type PagodaEvidenceMap,
  type PagodaMaterializedInteraction,
  type PagodaOutcomeContract,
  type PagodaScenario
} from '@petitbon/pagoda-core';
import type {
  PagodaInteractiveTargetAdapter,
  PagodaRunPlan,
  PagodaTargetAdapter,
  PagodaTargetManifest,
  PreparedRun,
  TargetRunResult
} from '@petitbon/pagoda-adapter-sdk';
import {
  buildRunArtifactDirectory,
  createPagodaRunPlan,
  startAndRunPagodaAgenticCallerSession,
  writeRunArtifactBundle,
  type PagodaAdapterFailureDiagnostic
} from '@petitbon/pagoda-runner';
import { runPagodaBatch, type PagodaBatchCoordinates } from './run-batch.js';
import type { PagodaCliIo, PagodaCliReporter, PagodaCommandResult, PagodaRootContext, PagodaRunCliResult, PagodaRunCliSummary } from '../types.js';
import {
  missingAdapterEvidenceCapabilities,
  missingAdapterInteractionCapabilities
} from '../target-pack/capabilities.js';
import {
  importTargetAdapter,
  resolveTargetAdapter,
  type ResolvedTargetAdapter
} from '../target-pack/adapters.js';
import { loadContracts, loadEvidenceMaps, loadScenarios } from '../target-pack/files.js';
import { contractFreshnessErrors } from '../target-pack/contracts.js';
import { loadTargetManifest } from '../target-pack/manifests.js';
import {
  formatRunProgress,
  formatRunResult,
  formatRunSummaryFooter,
  formatRunSummaryHeader
} from '../reporting/terminal.js';

const isSuccessfulRun = (run: PagodaRunCliResult): boolean =>
  run.status === 'PASS';

const adapterFailurePhases = new Set<PagodaAdapterFailureDiagnostic['phase']>([
  'loadAdapter',
  'healthCheck',
  'prepare',
  'callerProvider',
  'startInteractive',
  'observeTarget',
  'sendCallerTurn',
  'finishInteractive',
  'execute',
  'collectObservations',
  'cleanup'
]);

const adapterFailureStatuses = new Set<PagodaAdapterFailureDiagnostic['status']>([
  'SETUP_FAILED',
  'OBSERVABILITY_FAILED'
]);

const adapterFailureCategories = new Set<PagodaAdapterFailureDiagnostic['category']>([
  'configuration',
  'dependency',
  'timeout',
  'setup',
  'observability',
  'unknown'
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanDiagnosticMessage = (message: string): string => {
  const singleLine = message.replace(/\s+/g, ' ').trim();
  return singleLine.length > 300 ? `${singleLine.slice(0, 297)}...` : singleLine;
};

const stringFromMetadata = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const failureStatusForPhase = (
  phase: PagodaAdapterFailureDiagnostic['phase']
): PagodaAdapterFailureDiagnostic['status'] =>
  phase === 'observeTarget' || phase === 'collectObservations'
    ? 'OBSERVABILITY_FAILED'
    : 'SETUP_FAILED';

const explicitAdapterFailureFromMetadata = (metadata: TargetRunResult['metadata']): PagodaAdapterFailureDiagnostic | undefined => {
  const candidate = isRecord(metadata?.adapterFailure) ? metadata.adapterFailure : null;
  if (!candidate) return undefined;
  const phase = stringFromMetadata(candidate.phase);
  const category = stringFromMetadata(candidate.category);
  const status = stringFromMetadata(candidate.status);
  const message = stringFromMetadata(candidate.message);
  if (!phase || !adapterFailurePhases.has(phase as PagodaAdapterFailureDiagnostic['phase']) || !message) return undefined;
  return {
    phase: phase as PagodaAdapterFailureDiagnostic['phase'],
    status: status && adapterFailureStatuses.has(status as PagodaAdapterFailureDiagnostic['status'])
      ? status as PagodaAdapterFailureDiagnostic['status']
      : failureStatusForPhase(phase as PagodaAdapterFailureDiagnostic['phase']),
    category: category && adapterFailureCategories.has(category as PagodaAdapterFailureDiagnostic['category'])
      ? category as PagodaAdapterFailureDiagnostic['category']
      : 'unknown',
    ...(stringFromMetadata(candidate.dependency) ? { dependency: stringFromMetadata(candidate.dependency) } : {}),
    message: cleanDiagnosticMessage(message)
  };
};

const inferAdapterFailureDependency = (message: string): string | undefined => {
  const normalized = message.toLowerCase();
  if (normalized.includes('session ledger')) return 'session-ledger';
  if (normalized.includes('phone voice webhook')) return 'phone-webhook';
  if (normalized.includes('twilio signature')) return 'twilio-signature';
  if (normalized.includes('firestore')) return 'firestore';
  if (normalized.includes('rules policy') || normalized.includes('dependency=rules')) return 'rules';
  if (normalized.includes('booking workflow') || normalized.includes('commit-booking')) return 'booking-workflow';
  if (normalized.includes('browser-chat') || normalized.includes('browser chat')) return 'browser-chat';
  if (normalized.includes('replay observation')) return 'replay-observation';
  return undefined;
};

const inferAdapterFailureCategory = (message: string): PagodaAdapterFailureDiagnostic['category'] => {
  const normalized = message.toLowerCase();
  if (normalized.includes('timed out') || normalized.includes('timeout')) return 'timeout';
  if (
    normalized.includes('requires ') ||
    normalized.includes('required ') ||
    normalized.includes('missing ') ||
    normalized.includes('must match') ||
    normalized.includes('is required')
  ) return 'configuration';
  if (
    normalized.includes('http 5') ||
    normalized.includes('upstream') ||
    normalized.includes('internal server error') ||
    normalized.includes('unavailable') ||
    normalized.includes('request failed')
  ) return 'dependency';
  if (normalized.includes('not ready') || normalized.includes('setup')) return 'setup';
  if (normalized.includes('observation') || normalized.includes('observable') || normalized.includes('evidence')) return 'observability';
  return 'unknown';
};

const inferAdapterFailurePhase = (
  result: TargetRunResult,
  callerSession: PagodaCallerSession | undefined
): PagodaAdapterFailureDiagnostic['phase'] => {
  const explicitPhase = stringFromMetadata(result.metadata?.adapterFailurePhase);
  if (explicitPhase && adapterFailurePhases.has(explicitPhase as PagodaAdapterFailureDiagnostic['phase'])) {
    return explicitPhase as PagodaAdapterFailureDiagnostic['phase'];
  }
  const agenticPhase = stringFromMetadata(result.metadata?.agenticFailurePhase);
  if (agenticPhase && adapterFailurePhases.has(agenticPhase as PagodaAdapterFailureDiagnostic['phase'])) {
    return agenticPhase as PagodaAdapterFailureDiagnostic['phase'];
  }
  if (callerSession?.stopReason === 'adapter-failed') {
    return callerSession.turns.length === 0 ? 'startInteractive' : 'sendCallerTurn';
  }
  if (typeof result.metadata?.agenticStopReason === 'string') return 'startInteractive';
  return 'execute';
};

const adapterFailureFromResult = (
  result: TargetRunResult,
  callerSession: PagodaCallerSession | undefined
): PagodaAdapterFailureDiagnostic | undefined => {
  const explicit = explicitAdapterFailureFromMetadata(result.metadata);
  if (explicit) return explicit;
  if (result.status !== 'failed' && result.status !== 'blocked') return undefined;
  const rawMessage =
    stringFromMetadata(result.stderr) ??
    stringFromMetadata(result.stdout) ??
    `adapter returned ${result.status}`;
  const message = cleanDiagnosticMessage(rawMessage);
  const phase = inferAdapterFailurePhase(result, callerSession);
  return {
    phase,
    status: failureStatusForPhase(phase),
    category: inferAdapterFailureCategory(message),
    ...(inferAdapterFailureDependency(message) ? { dependency: inferAdapterFailureDependency(message) } : {}),
    message
  };
};

const errorLogText = (error: unknown): string =>
  error instanceof Error ? error.stack ?? error.message : String(error);

const adapterFailureFromError = (
  phase: PagodaAdapterFailureDiagnostic['phase'],
  error: unknown,
  status = failureStatusForPhase(phase)
): PagodaAdapterFailureDiagnostic => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = cleanDiagnosticMessage(rawMessage || `${phase} failed`);
  return {
    phase,
    status,
    category: inferAdapterFailureCategory(message),
    ...(inferAdapterFailureDependency(message) ? { dependency: inferAdapterFailureDependency(message) } : {}),
    message
  };
};

const syntheticTargetRunResult = (
  plan: PagodaRunPlan,
  failure: PagodaAdapterFailureDiagnostic,
  error: unknown
): TargetRunResult => ({
  runId: plan.runId,
  status: 'failed',
  stdout: '',
  stderr: errorLogText(error),
  exitCode: 1,
  metadata: {
    adapterFailure: failure,
    adapterFailurePhase: failure.phase
  }
});

export async function runTargetScenario(input: {
  context: PagodaRootContext;
  scenarioId: string | undefined;
  all: boolean;
  adapterId: string | undefined;
  channel: string | undefined;
  seed: string | undefined;
  interactionCase: string | undefined;
  interactionCases: string | undefined;
  artifactDirectory: string | undefined;
  concurrency: number;
  sequential: number | undefined;
  reporter: PagodaCliReporter;
  io: PagodaCliIo;
}): Promise<PagodaCommandResult> {
  const { context, scenarioId, channel } = input;
  const runAll = input.all || !scenarioId;
  if (input.all && scenarioId) throw new Error('pagoda run accepts either --all or --scenario <id>, not both.');
  if (runAll && input.artifactDirectory) throw new Error('pagoda run does not accept --artifact-directory when running all scenarios; each scenario writes its own artifact directory.');
  if (input.interactionCase && input.interactionCases) throw new Error('pagoda run accepts either --interaction-case or --interaction-cases, not both.');
  if (input.interactionCases !== undefined && input.interactionCases !== 'all') {
    throw new Error('pagoda run --interaction-cases only accepts all.');
  }
  const { root, manifest } = await loadTargetManifest(context);
  const scenarios = await loadScenarios(root, manifest);
  const maps = await loadEvidenceMaps(root, manifest);
  const contracts = await loadContracts(root, manifest);
  assertValidPagodaScenarios(scenarios.map(({ scenario }) => scenario));
  assertValidPagodaEvidenceMaps(
    maps.map(({ evidenceMap }) => evidenceMap),
    scenarios.map(({ scenario }) => scenario)
  );
  const freshnessErrors = contractFreshnessErrors({ manifest, scenarios, maps, contracts });
  if (freshnessErrors.length > 0) {
    throw new Error(`Invalid Pagoda project ${context.targetId}:\n${freshnessErrors.join('\n')}`);
  }

  const interactionJobsFor = (scenario: PagodaScenario, selectedChannel: string): Array<PagodaMaterializedInteraction | undefined> => {
    if (!scenario.interaction) {
      if (input.interactionCase) {
        throw new Error(`${context.targetId}: scenario ${scenario.id} has no interaction; --interaction-case cannot be used.`);
      }
      return [undefined];
    }
    if (input.interactionCases === 'all') {
      return listPagodaInteractionCases({
        scenarioId: scenario.id,
        channel: selectedChannel,
        seed: input.seed,
        interaction: scenario.interaction
      });
    }
    return [materializePagodaInteraction({
      scenarioId: scenario.id,
      channel: selectedChannel,
      seed: input.seed,
      interaction: scenario.interaction,
      caseSelector: input.interactionCase
    })];
  };

  type PendingRunJob = {
    scenarioId: string;
    channel: string;
    interaction: PagodaMaterializedInteraction | undefined;
  };
  type PreparedRunJob = PendingRunJob & {
    scenario: PagodaScenario;
    evidenceMap: PagodaEvidenceMap;
    contract: PagodaOutcomeContract;
    adapter: ResolvedTargetAdapter;
  };

  const prepareJob = async (job: PendingRunJob): Promise<PreparedRunJob> => {
    const scenario = scenarios.find((entry) => entry.scenario.id === job.scenarioId)?.scenario;
    if (!scenario) throw new Error(`${context.targetId}: scenario ${job.scenarioId} does not exist.`);
    const evidenceMap = maps.find((entry) => entry.evidenceMap.scenarioId === job.scenarioId)?.evidenceMap;
    if (!evidenceMap) throw new Error(`${context.targetId}: scenario ${job.scenarioId} has no evidence map.`);
    const contract = contracts.find((entry) => entry.contract.scenarioId === job.scenarioId)?.contract;
    if (!contract) throw new Error(`${context.targetId}: scenario ${job.scenarioId} has no outcome contract.`);
    if (!scenario.labels.channels.includes(job.channel as never)) {
      throw new Error(`${context.targetId}: scenario ${job.scenarioId} does not declare channel ${job.channel}.`);
    }
    const adapter = await resolveTargetAdapter({
      targetRoot: root,
      manifest,
      adapterId: input.adapterId,
      channel: job.channel
    });
    const missingCapabilities = missingAdapterEvidenceCapabilities(adapter.manifest, scenario, job.channel);
    if (missingCapabilities.length > 0) {
      throw new Error([
        `${context.targetId}: adapter ${adapter.adapterId} cannot run ${job.scenarioId} on ${job.channel}.`,
        `Missing produced evidence code(s): ${missingCapabilities.join(', ')}.`,
        'Update the adapter pagoda.adapter.json producesEvidenceCodes or choose a different adapter.'
      ].join('\n'));
    }
    const missingInteractionModes = missingAdapterInteractionCapabilities(adapter.manifest, scenario);
    if (missingInteractionModes.length > 0) {
      throw new Error([
        `${context.targetId}: adapter ${adapter.adapterId} cannot run ${job.scenarioId} with ${missingInteractionModes.join(', ')} interaction.`,
        'Update the adapter pagoda.adapter.json interactionModes or choose an interactive adapter.'
      ].join('\n'));
    }
    return { ...job, scenario, evidenceMap, contract, adapter };
  };

  const runOne = async (
    job: PreparedRunJob,
    batch: PagodaBatchCoordinates | undefined
  ): Promise<PagodaRunCliResult> =>
    runLoadedTargetScenario({
      context,
      root,
      manifest,
      adapter: job.adapter,
      scenario: job.scenario,
      evidenceMap: job.evidenceMap,
      contract: job.contract,
      selectedChannel: job.channel,
      seed: input.seed,
      interaction: job.interaction,
      artifactDirectory: input.artifactDirectory,
      batch
    });

  const runJobs = async (jobs: PreparedRunJob[]): Promise<PagodaRunCliResult[]> => {
    return runPagodaBatch({
      jobs,
      concurrency: input.concurrency,
      sequential: input.sequential,
      run: ({ job, batch }) => runOne(job, batch),
      onResult: (run) => {
        if (input.reporter !== 'json') input.io.stdout(formatRunProgress(run, context));
      }
    });
  };

  const batchSummary = (jobs: number): Pick<PagodaRunCliSummary, 'batch'> =>
    input.sequential === undefined
      ? {}
      : {
          batch: {
            concurrency: input.concurrency,
            sequential: input.sequential,
            jobs
          }
        };

  if (runAll) {
    const summaryStartedAt = new Date().toISOString();
    const summaryStartedMs = Date.now();
    const runnableJobs = scenarios
      .map((entry) => entry.scenario)
      .filter((entry) => entry.status === 'active')
      .sort((left, right) => left.id.localeCompare(right.id))
      .flatMap((entry) => {
        const selectedChannels = channel ? [channel] : entry.labels.channels;
        return selectedChannels
          .filter((selectedChannel) => entry.labels.channels.includes(selectedChannel as never))
          .flatMap((selectedChannel) => interactionJobsFor(entry, selectedChannel)
            .map((interaction) => ({ scenarioId: entry.id, channel: selectedChannel, interaction })));
      });
    if (runnableJobs.length === 0) {
      throw new Error(`${context.targetId}: no active scenarios${channel ? ` declare channel ${channel}` : ''}.`);
    }
    const preparedJobs = await Promise.all(runnableJobs.map(prepareJob));
    if (input.reporter !== 'json') {
      input.io.stdout(formatRunSummaryHeader({ projectId: context.targetId, channel: channel ?? null }, context));
    }
    const runs = await runJobs(preparedJobs);
    const passed = runs.filter(isSuccessfulRun).length;
    const failed = runs.length - passed;
    const summary: PagodaRunCliSummary = {
      projectId: context.targetId,
      channel: channel ?? null,
      startedAt: summaryStartedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - summaryStartedMs,
      total: runs.length,
      passed,
      failed,
      ...batchSummary(preparedJobs.length),
      runs
    };
    input.io.stdout(input.reporter === 'json' ? JSON.stringify(summary, null, 2) : formatRunSummaryFooter(summary));
    return { exitCode: failed === 0 ? 0 : 1 };
  }

  const scenario = scenarios.find((entry) => entry.scenario.id === scenarioId)?.scenario;
  if (!scenario) throw new Error(`${context.targetId}: scenario ${scenarioId} does not exist.`);
  const selectedChannels = channel ? [channel] : scenario.labels.channels;
  if (selectedChannels.length === 0) throw new Error(`${context.targetId}: scenario ${scenarioId} declares no channel.`);
  const runnableJobs = selectedChannels
    .filter((selectedChannel) => scenario.labels.channels.includes(selectedChannel as never))
    .flatMap((selectedChannel) => interactionJobsFor(scenario, selectedChannel)
      .map((interaction) => ({ scenarioId: scenarioId as string, channel: selectedChannel, interaction })));
  if (runnableJobs.length === 0) {
    throw new Error(`${context.targetId}: scenario ${scenarioId} does not declare channel ${selectedChannels.join(', ')}.`);
  }
  const requestedRunCount = runnableJobs.length * (
    input.sequential === undefined ? 1 : input.concurrency * input.sequential
  );
  if (input.artifactDirectory && requestedRunCount > 1) {
    throw new Error(`${context.targetId}: --artifact-directory requires a single scenario/channel/interaction case run.`);
  }
  if (runnableJobs.length === 1 && input.sequential === undefined) {
    const job = runnableJobs[0];
    const run = await runOne(await prepareJob(job), undefined);
    input.io.stdout(input.reporter === 'json' ? JSON.stringify(run, null, 2) : formatRunResult(run, context));
    return { exitCode: isSuccessfulRun(run) ? 0 : 1 };
  }

  const summaryStartedAt = new Date().toISOString();
  const summaryStartedMs = Date.now();
  const preparedJobs = await Promise.all(runnableJobs.map(prepareJob));
  if (input.reporter !== 'json') {
    input.io.stdout(formatRunSummaryHeader({ projectId: context.targetId, channel: null }, context));
  }
  const runs = await runJobs(preparedJobs);
  const passed = runs.filter(isSuccessfulRun).length;
  const failed = runs.length - passed;
  const summary: PagodaRunCliSummary = {
    projectId: context.targetId,
    channel: null,
    startedAt: summaryStartedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - summaryStartedMs,
    total: runs.length,
    passed,
    failed,
    ...batchSummary(preparedJobs.length),
    runs
  };
  input.io.stdout(input.reporter === 'json' ? JSON.stringify(summary, null, 2) : formatRunSummaryFooter(summary));
  return { exitCode: failed === 0 ? 0 : 1 };
}

async function runLoadedTargetScenario(input: {
  context: PagodaRootContext;
  root: string;
  manifest: PagodaTargetManifest;
  adapter: ResolvedTargetAdapter;
  scenario: PagodaScenario;
  evidenceMap: PagodaEvidenceMap;
  contract: PagodaOutcomeContract;
  selectedChannel: string;
  seed: string | undefined;
  interaction: PagodaMaterializedInteraction | undefined;
  artifactDirectory: string | undefined;
  batch: PagodaBatchCoordinates | undefined;
}): Promise<PagodaRunCliResult> {
  const { context, root, manifest, scenario, evidenceMap, contract, selectedChannel } = input;
  const scenarioId = scenario.id;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const artifactRoot = context.mode === 'target-pack'
    ? join(context.targetRoot, 'artifacts')
    : join(context.projectRoot, 'artifacts');
  const defaultArtifactDirectory = buildRunArtifactDirectory({
    artifactRoot,
    startedAt,
    targetId: context.targetId,
    scenarioId,
    channel: selectedChannel,
    interactionCaseId: input.interaction?.caseId
  });
  const artifactDirectory = input.artifactDirectory
    ? resolve(context.projectRoot, input.artifactDirectory)
    : input.batch
      ? `${defaultArtifactDirectory}_lane-${input.batch.lane}-of-${input.batch.laneCount}_iteration-${input.batch.iteration}-of-${input.batch.iterationCount}`
      : defaultArtifactDirectory;
  const plan = createPagodaRunPlan({
    targetId: context.targetId,
    projectRoot: context.projectRoot,
    targetRoot: root,
    artifactDirectory,
    scenario,
    evidenceMap,
    contract,
    channel: selectedChannel,
    seed: input.interaction?.seed ?? input.seed,
    interaction: input.interaction
  });
  const failures: PagodaAdapterFailureDiagnostic[] = [];
  const lifecycleErrors: string[] = [];
  const addFailure = (failure: PagodaAdapterFailureDiagnostic, error?: unknown): void => {
    const existingIndex = failures.findIndex((existing) =>
      existing.phase === failure.phase && existing.message === failure.message
    );
    if (existingIndex === -1) failures.push(failure);
    else failures[existingIndex] = failure;
    if (error !== undefined) lifecycleErrors.push(errorLogText(error));
  };

  let adapter: PagodaTargetAdapter | undefined;
  let prepared: PreparedRun | undefined;
  let result: TargetRunResult | undefined;
  let callerSession: PagodaCallerSession | undefined;
  let observations: ReturnType<typeof canonicalEvidenceObservation> | undefined;

  try {
    adapter = await importTargetAdapter({
      targetId: manifest.id,
      adapterPath: input.adapter.resolvedPath,
      label: `${input.adapter.adapterId}:${input.adapter.entrypoint}`
    });
  } catch (error) {
    const failure = adapterFailureFromError('loadAdapter', error);
    addFailure(failure, error);
    result = syntheticTargetRunResult(plan, failure, error);
  }

  if (adapter && failures.length === 0) {
    try {
      const health = await adapter.healthCheck();
      if (health.status === 'unavailable') {
        throw new Error(health.message ?? `${context.targetId}: adapter unavailable.`);
      }
    } catch (error) {
      const failure = adapterFailureFromError('healthCheck', error);
      addFailure(failure, error);
      result = syntheticTargetRunResult(plan, failure, error);
    }
  }

  if (adapter && failures.length === 0) {
    if (plan.interaction?.mode === 'agentic') {
      if (!isInteractiveTargetAdapter(adapter)) {
        const error = new Error(
          `${context.targetId}: selected adapter declares agentic interaction but does not implement PagodaInteractiveTargetAdapter.`
        );
        const failure = adapterFailureFromError('startInteractive', error);
        addFailure(failure, error);
        result = syntheticTargetRunResult(plan, failure, error);
      } else {
        const agentic = await startAndRunPagodaAgenticCallerSession({
          adapter,
          run: plan,
          interaction: plan.interaction,
          startedAt
        });
        prepared = agentic.prepared;
        result = agentic.result;
        callerSession = agentic.callerSession;
      }
    } else {
      try {
        prepared = await adapter.prepare(plan);
      } catch (error) {
        const failure = adapterFailureFromError('prepare', error);
        addFailure(failure, error);
        result = syntheticTargetRunResult(plan, failure, error);
      }
      if (prepared) {
        try {
          result = await adapter.execute(prepared);
        } catch (error) {
          const failure = adapterFailureFromError('execute', error);
          addFailure(failure, error);
          result = syntheticTargetRunResult(plan, failure, error);
        }
      }
    }
  }

  if (!result) {
    const error = new Error('Adapter lifecycle ended without a target run result.');
    const failure = adapterFailureFromError('execute', error);
    addFailure(failure, error);
    result = syntheticTargetRunResult(plan, failure, error);
  }

  const preliminaryResultFailure = adapterFailureFromResult(result, callerSession);
  if (preliminaryResultFailure) addFailure(preliminaryResultFailure);

  if (adapter && prepared) {
    try {
      observations = canonicalEvidenceObservation(await adapter.collectObservations(result));
    } catch (error) {
      const failure = adapterFailureFromError('collectObservations', error);
      addFailure(failure, error);
      observations = canonicalEvidenceObservation({
        collectorStatus: 'OBSERVABILITY_FAILED',
        collectorDiagnostics: [{
          code: 'OBSERVATION_COLLECTION_FAILED',
          message: failure.message,
          category: failure.category,
          dependency: failure.dependency,
          phase: failure.phase
        }],
        evidenceRefsByCode: {
          OBSERVATION_COLLECTION_FAILED: [failure.message]
        }
      });
    }
  }

  if (!observations) {
    const collectorStatus = failures.some((failure) => failure.status === 'SETUP_FAILED')
      ? 'SETUP_FAILED'
      : 'OBSERVABILITY_FAILED';
    observations = canonicalEvidenceObservation({ collectorStatus });
  }

  const resultFailure = adapterFailureFromResult(result, callerSession);
  if (resultFailure) addFailure(resultFailure);

  const fallbackRawObservations = {
    runId: result.runId,
    status: result.status,
    exitCode: result.exitCode,
    reportFile: result.reportFile,
    metadata: result.metadata,
    stdout: result.stdout,
    stderr: result.stderr
  };
  let rawObservations: unknown = fallbackRawObservations;
  if (result.reportFile && existsSync(result.reportFile)) {
    try {
      rawObservations = JSON.parse(await readFile(result.reportFile, 'utf8')) as unknown;
    } catch (error) {
      const failure = adapterFailureFromError('collectObservations', error);
      addFailure(failure, error);
      rawObservations = {
        ...fallbackRawObservations,
        reportReadError: failure.message
      };
    }
  }

  if (adapter && prepared && adapter.cleanup) {
    try {
      await adapter.cleanup(prepared);
    } catch (error) {
      addFailure(adapterFailureFromError('cleanup', error), error);
    }
  }

  const evaluation = evaluatePagodaOutcomeContract({
    contract,
    channel: selectedChannel as never,
    caseId: plan.interaction?.caseId ?? scenario.harness.selectedCase ?? scenario.id,
    observations
  });
  const completedAt = new Date().toISOString();
  const stderr = [result.stderr, ...lifecycleErrors].filter(Boolean).join('\n');
  const artifactManifest = await writeRunArtifactBundle({
    directory: artifactDirectory,
    plan,
    targetManifest: manifest,
    canonicalObservation: observations,
    oracleResult: evaluation,
    rawObservations,
    callerSession,
    logs: { stdout: result.stdout, stderr },
    adapterFailures: failures,
    startedAt,
    completedAt
  });
  const agentic = callerSession
    ? {
        completed: callerSession.stopReason === 'completed',
        stopReason: callerSession.stopReason
      }
    : undefined;
  return {
    runId: plan.runId,
    artifactDirectory,
    projectId: context.targetId,
    scenarioId,
    channel: selectedChannel,
    interactionCaseId: plan.interaction?.caseId,
    ...(input.batch ? { batch: input.batch } : {}),
    status: artifactManifest.status,
    adapterRunStatus: result.status,
    evidence: {
      accepted: observations.acceptedEvidenceCodes.length,
      rejected: observations.rejectedEvidenceCodes.length,
      setup: observations.setupEvidenceCodes.length,
      traceSources: observations.observedTraceSources,
      correlation: observations.observedCorrelation,
      ordering: observations.observedOrdering
    },
    startedAt,
    completedAt,
    durationMs: Date.now() - startedMs,
    ...(agentic ? { agentic } : {}),
    ...(failures[0] ? { adapterFailure: failures[0], adapterFailures: failures } : {}),
    ...(observations.collectorDiagnostics.length > 0
      ? { collectorDiagnostics: observations.collectorDiagnostics }
      : {}),
    oracle: evaluation
  };
}

function isInteractiveTargetAdapter(adapter: PagodaTargetAdapter): adapter is PagodaInteractiveTargetAdapter {
  const candidate = adapter as Partial<PagodaInteractiveTargetAdapter>;
  return typeof candidate.startInteractive === 'function'
    && typeof candidate.observeTarget === 'function'
    && typeof candidate.sendCallerTurn === 'function'
    && typeof candidate.finishInteractive === 'function';
}
