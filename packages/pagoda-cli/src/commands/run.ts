import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  canonicalEvidenceObservation,
  evaluatePagodaOutcomeContract,
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
  PagodaTargetAdapter,
  PagodaTargetManifest,
  PreparedRun,
  TargetRunResult
} from '@petitbon/pagoda-adapter-sdk';
import {
  buildRunArtifactDirectory,
  createPagodaRunPlan,
  startAndRunPagodaAgenticCallerSession,
  writeRunArtifactBundle
} from '@petitbon/pagoda-runner';
import type { PagodaCliIo, PagodaCliReporter, PagodaCommandResult, PagodaRootContext, PagodaRunCliResult, PagodaRunCliSummary } from '../types.js';
import {
  missingAdapterEvidenceCapabilities,
  missingAdapterInteractionCapabilities
} from '../target-pack/capabilities.js';
import { loadTargetAdapter } from '../target-pack/adapters.js';
import { loadContracts, loadEvidenceMaps, loadScenarios } from '../target-pack/files.js';
import { loadTargetManifest } from '../target-pack/manifests.js';
import {
  formatRunProgress,
  formatRunResult,
  formatRunSummaryFooter,
  formatRunSummaryHeader
} from '../reporting/terminal.js';

const isSuccessfulRun = (run: PagodaRunCliResult): boolean =>
  run.oracle.status === 'PASS' && run.agentic?.completed !== false;

const isSyntheticAgenticFailureResult = (result: TargetRunResult): boolean =>
  result.status === 'failed' && typeof result.metadata?.agenticStopReason === 'string';

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

  const runOne = async (selectedScenarioId: string, selectedChannel: string, interaction: PagodaMaterializedInteraction | undefined) => {
    const scenario = scenarios.find((entry) => entry.scenario.id === selectedScenarioId)?.scenario;
    if (!scenario) throw new Error(`${context.targetId}: scenario ${selectedScenarioId} does not exist.`);
    const evidenceMap = maps.find((entry) => entry.evidenceMap.scenarioId === selectedScenarioId)?.evidenceMap;
    if (!evidenceMap) throw new Error(`${context.targetId}: scenario ${selectedScenarioId} has no evidence map.`);
    const contract = contracts.find((entry) => entry.contract.scenarioId === selectedScenarioId)?.contract;
    if (!contract) throw new Error(`${context.targetId}: scenario ${selectedScenarioId} has no outcome contract.`);
    if (!scenario.labels.channels.includes(selectedChannel as never)) {
      throw new Error(`${context.targetId}: scenario ${selectedScenarioId} does not declare channel ${selectedChannel}.`);
    }
    const loadedAdapter = await loadTargetAdapter({
      targetRoot: root,
      manifest,
      adapterId: input.adapterId,
      channel: selectedChannel
    });
    const health = await loadedAdapter.adapter.healthCheck();
    if (health.status === 'unavailable') throw new Error(health.message ?? `${context.targetId}: adapter unavailable.`);
    const missingCapabilities = missingAdapterEvidenceCapabilities(loadedAdapter.manifest, scenario, selectedChannel);
    if (missingCapabilities.length > 0) {
      throw new Error([
        `${context.targetId}: adapter ${loadedAdapter.adapterId} cannot run ${selectedScenarioId} on ${selectedChannel}.`,
        `Missing produced evidence code(s): ${missingCapabilities.join(', ')}.`,
        'Update the adapter pagoda.adapter.json producesEvidenceCodes or choose a different adapter.'
      ].join('\n'));
    }
    const missingInteractionModes = missingAdapterInteractionCapabilities(loadedAdapter.manifest, scenario);
    if (missingInteractionModes.length > 0) {
      throw new Error([
        `${context.targetId}: adapter ${loadedAdapter.adapterId} cannot run ${selectedScenarioId} with ${missingInteractionModes.join(', ')} interaction.`,
        'Update the adapter pagoda.adapter.json interactionModes or choose an interactive adapter.'
      ].join('\n'));
    }

    return runLoadedTargetScenario({
      context,
      root,
      manifest,
      adapter: loadedAdapter.adapter,
      scenario,
      evidenceMap,
      contract,
      selectedChannel,
      seed: input.seed,
      interaction,
      artifactDirectory: input.artifactDirectory
    });
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
    const runs: PagodaRunCliResult[] = [];
    if (input.reporter !== 'json') {
      input.io.stdout(formatRunSummaryHeader({ projectId: context.targetId, channel: channel ?? null }, context));
    }
    for (const job of runnableJobs) {
      const run = await runOne(job.scenarioId, job.channel, job.interaction);
      runs.push(run);
      if (input.reporter !== 'json') input.io.stdout(formatRunProgress(run, context));
    }
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
  if (input.artifactDirectory && runnableJobs.length > 1) {
    throw new Error(`${context.targetId}: --artifact-directory requires a single scenario/channel/interaction case run.`);
  }
  if (runnableJobs.length === 1) {
    const job = runnableJobs[0];
    const run = await runOne(job.scenarioId, job.channel, job.interaction);
    input.io.stdout(input.reporter === 'json' ? JSON.stringify(run, null, 2) : formatRunResult(run, context));
    return { exitCode: isSuccessfulRun(run) ? 0 : 1 };
  }

  const summaryStartedAt = new Date().toISOString();
  const summaryStartedMs = Date.now();
  const runs: PagodaRunCliResult[] = [];
  if (input.reporter !== 'json') {
    input.io.stdout(formatRunSummaryHeader({ projectId: context.targetId, channel: null }, context));
  }
  for (const job of runnableJobs) {
    const run = await runOne(job.scenarioId, job.channel, job.interaction);
    runs.push(run);
    if (input.reporter !== 'json') input.io.stdout(formatRunProgress(run, context));
  }
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
    runs
  };
  input.io.stdout(input.reporter === 'json' ? JSON.stringify(summary, null, 2) : formatRunSummaryFooter(summary));
  return { exitCode: failed === 0 ? 0 : 1 };
}

async function runLoadedTargetScenario(input: {
  context: PagodaRootContext;
  root: string;
  manifest: PagodaTargetManifest;
  adapter: PagodaTargetAdapter;
  scenario: PagodaScenario;
  evidenceMap: PagodaEvidenceMap;
  contract: PagodaOutcomeContract;
  selectedChannel: string;
  seed: string | undefined;
  interaction: PagodaMaterializedInteraction | undefined;
  artifactDirectory: string | undefined;
}): Promise<PagodaRunCliResult> {
  const { context, root, manifest, adapter, scenario, evidenceMap, contract, selectedChannel } = input;
  const scenarioId = scenario.id;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const artifactRoot = context.mode === 'target-pack'
    ? join(context.targetRoot, 'artifacts')
    : join(context.projectRoot, 'artifacts');
  const artifactDirectory = input.artifactDirectory
    ? resolve(context.projectRoot, input.artifactDirectory)
    : buildRunArtifactDirectory({
        artifactRoot,
        startedAt,
        targetId: context.targetId,
        scenarioId,
        channel: selectedChannel,
        interactionCaseId: input.interaction?.caseId
      });
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
  const finishRun = async (result: TargetRunResult, callerSession?: PagodaCallerSession): Promise<PagodaRunCliResult> => {
    const observations = await adapter.collectObservations(result).catch((error: unknown) => {
      if (!callerSession || !isSyntheticAgenticFailureResult(result)) throw error;
      return canonicalEvidenceObservation({
        collectorStatus: 'SETUP_FAILED',
        evidenceRefsByCode: {
          AGENTIC_SESSION_FAILED: [
            error instanceof Error ? error.message : 'adapter could not collect observations for failed agentic session'
          ]
        }
      });
    });
    const evaluation = evaluatePagodaOutcomeContract({
      contract,
      channel: selectedChannel as never,
      caseId: plan.interaction?.caseId ?? scenario.harness.selectedCase ?? scenario.id,
      observations
    });
    const rawObservations = result.reportFile && existsSync(result.reportFile)
      ? JSON.parse(await readFile(result.reportFile, 'utf8')) as unknown
      : {
          runId: result.runId,
          status: result.status,
          exitCode: result.exitCode,
          reportFile: result.reportFile,
          metadata: result.metadata,
          stdout: result.stdout,
          stderr: result.stderr
        };
    const completedAt = new Date().toISOString();
    await writeRunArtifactBundle({
      directory: artifactDirectory,
      plan,
      targetManifest: manifest,
      canonicalObservation: observations,
      oracleResult: evaluation,
      rawObservations,
      callerSession,
      logs: { stdout: result.stdout, stderr: result.stderr },
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
      adapterRunStatus: result.status,
      evidence: {
        accepted: observations.acceptedEvidenceCodes.length,
        rejected: observations.rejectedEvidenceCodes.length,
        setup: observations.setupEvidenceCodes.length,
        traceSources: observations.observedTraceSources,
        correlation: observations.observedCorrelation
      },
      startedAt,
      completedAt,
      durationMs: Date.now() - startedMs,
      ...(agentic ? { agentic } : {}),
      oracle: evaluation
    };
  };

  let prepared: PreparedRun | undefined;
  try {
    if (plan.interaction?.mode === 'agentic') {
      if (!isInteractiveTargetAdapter(adapter)) {
        throw new Error(`${context.targetId}: selected adapter declares agentic interaction but does not implement PagodaInteractiveTargetAdapter.`);
      }
      const agentic = await startAndRunPagodaAgenticCallerSession({
        adapter,
        run: plan,
        interaction: plan.interaction,
        startedAt
      });
      prepared = agentic.prepared;
      return finishRun(agentic.result, agentic.callerSession);
    }

    prepared = await adapter.prepare(plan);
    return finishRun(await adapter.execute(prepared));
  } finally {
    if (prepared) await adapter.cleanup?.(prepared);
  }
}

function isInteractiveTargetAdapter(adapter: PagodaTargetAdapter): adapter is PagodaInteractiveTargetAdapter {
  const candidate = adapter as Partial<PagodaInteractiveTargetAdapter>;
  return typeof candidate.startInteractive === 'function'
    && typeof candidate.observeTarget === 'function'
    && typeof candidate.sendCallerTurn === 'function'
    && typeof candidate.finishInteractive === 'function';
}
