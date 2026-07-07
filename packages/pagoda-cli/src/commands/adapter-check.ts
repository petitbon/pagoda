import { relative } from 'node:path';
import type { PagodaInteractiveTargetAdapter, PagodaTargetAdapter } from '@petitbon/pagoda-adapter-sdk';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { argValue } from '../cli/args.js';
import { loadAdapterManifests, loadTargetAdapter, validateAdapterManifest } from '../target-pack/adapters.js';
import {
  missingAdapterEvidenceCapabilities,
  missingAdapterInteractionCapabilities,
  requiredEvidenceCodesForScenario
} from '../target-pack/capabilities.js';
import { loadScenarios } from '../target-pack/files.js';
import { loadTargetManifest } from '../target-pack/manifests.js';

export async function checkAdapter(context: PagodaRootContext, args: readonly string[], io: PagodaCliIo): Promise<PagodaCommandResult> {
  const { root, manifest } = await loadTargetManifest(context);
  const adapterId = argValue(args, '--adapter');
  const channel = argValue(args, '--channel');
  const scenarioId = argValue(args, '--scenario');
  const adapters = await loadAdapterManifests(root, manifest);
  const loaded = await loadTargetAdapter({ targetRoot: root, manifest, adapterId, channel });
  const loadedManifest = adapters.find((adapter) => adapter.manifest.id === loaded.adapterId);
  const manifestErrors = loadedManifest ? validateAdapterManifest(manifest.id, loadedManifest) : [];
  const missingEnv = (loaded.manifest?.requiresEnv ?? []).filter((key) => !process.env[key]);
  const health = await loaded.adapter.healthCheck();
  let capability: {
    scenarioId: string;
    channel: string;
    requiredEvidenceCodes: string[];
    missingEvidenceCodes: string[];
    requiredInteractionMode?: 'generated' | 'agentic';
    missingInteractionModes: string[];
    missingInteractionImplementation: boolean;
    status: 'ready' | 'missing-capabilities';
  } | null = null;

  if (scenarioId) {
    const scenarios = await loadScenarios(root, manifest);
    const scenario = scenarios.find((entry) => entry.scenario.id === scenarioId)?.scenario;
    if (!scenario) throw new Error(`${context.targetId}: scenario ${scenarioId} does not exist.`);
    const selectedChannel = channel ?? loaded.manifest?.channel ?? scenario.labels.channels[0];
    if (!selectedChannel) throw new Error(`${context.targetId}: scenario ${scenarioId} declares no channel.`);
    if (!scenario.labels.channels.includes(selectedChannel as never)) {
      throw new Error(`${context.targetId}: scenario ${scenarioId} does not declare channel ${selectedChannel}.`);
    }
    const requiredEvidenceCodes = requiredEvidenceCodesForScenario(scenario, selectedChannel);
    const missingEvidenceCodes = missingAdapterEvidenceCapabilities(loaded.manifest, scenario, selectedChannel);
    const missingInteractionModes = missingAdapterInteractionCapabilities(loaded.manifest, scenario);
    const missingInteractionImplementation = scenario.interaction?.mode === 'agentic'
      && missingInteractionModes.length === 0
      && !isInteractiveTargetAdapter(loaded.adapter);
    capability = {
      scenarioId,
      channel: selectedChannel,
      requiredEvidenceCodes,
      missingEvidenceCodes,
      requiredInteractionMode: scenario.interaction?.mode,
      missingInteractionModes,
      missingInteractionImplementation,
      status: missingEvidenceCodes.length === 0 && missingInteractionModes.length === 0 && !missingInteractionImplementation ? 'ready' : 'missing-capabilities'
    };
  }

  io.stdout(JSON.stringify({
    projectId: context.targetId,
    adapter: {
      id: loaded.adapterId,
      entrypoint: loaded.entrypoint,
      resolvedPath: relative(context.projectRoot, loaded.resolvedPath),
      manifest: loaded.manifest ?? null,
      manifestErrors
    },
    requiredEnv: {
      declared: loaded.manifest?.requiresEnv ?? [],
      missing: missingEnv
    },
    health,
    capability
  }, null, 2));
  return {
    exitCode: health.status === 'unavailable' || missingEnv.length > 0 || manifestErrors.length > 0 || (capability?.missingEvidenceCodes.length ?? 0) > 0 || (capability?.missingInteractionModes.length ?? 0) > 0 || Boolean(capability?.missingInteractionImplementation)
      ? 1
      : 0
  };
}

function isInteractiveTargetAdapter(adapter: PagodaTargetAdapter): adapter is PagodaInteractiveTargetAdapter {
  const candidate = adapter as Partial<PagodaInteractiveTargetAdapter>;
  return typeof candidate.startInteractive === 'function'
    && typeof candidate.observeTarget === 'function'
    && typeof candidate.sendCallerTurn === 'function'
    && typeof candidate.finishInteractive === 'function';
}
