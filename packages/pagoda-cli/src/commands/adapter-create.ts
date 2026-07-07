import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { PagodaAdapterManifest } from '@petitbon/pagoda-adapter-sdk';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { argValue, hasArg } from '../cli/args.js';
import { generatedAdapter } from '../generators/adapter.js';
import { responseEvidenceCode } from '../generators/scenario.js';
import { stableJson } from '../shared/json.js';
import { targetPrefix } from '../shared/strings.js';
import { loadAdapterManifests } from '../target-pack/adapters.js';
import { loadScenarios } from '../target-pack/files.js';
import { loadTargetManifest } from '../target-pack/manifests.js';
import { writeEvidenceRegistry } from '../target-pack/registry.js';

export async function createAdapterBundle(context: PagodaRootContext, args: readonly string[], io: PagodaCliIo): Promise<PagodaCommandResult> {
  const adapterId = argValue(args, '--id');
  if (!adapterId) throw new Error('pagoda adapter create requires --id <id>.');
  const { root, manifest } = await loadTargetManifest(context);
  const channel = argValue(args, '--channel', manifest.channels[0] ?? 'browser-chat') ?? 'browser-chat';
  if (!manifest.channels.includes(channel as never)) throw new Error(`${context.targetId}: channel ${channel} is not declared by target manifest.`);
  const name = argValue(args, '--name', `${adapterId} Adapter`) ?? `${adapterId} Adapter`;
  const adapterRoot = join(root, manifest.paths.adapters ?? 'adapters', adapterId);
  const manifestPath = join(adapterRoot, 'pagoda.adapter.json');
  const entrypointPath = join(adapterRoot, 'index.mjs');
  if ((existsSync(manifestPath) || existsSync(entrypointPath)) && !hasArg(args, '--force')) {
    throw new Error(`${context.targetId}: adapter ${adapterId} already exists. Pass --force to overwrite.`);
  }
  const prefix = targetPrefix(context.targetId);
  const responseEvidence = responseEvidenceCode(prefix, channel);
  const baseEvidenceCodes = [`${prefix}_SESSION_CONTEXT`, responseEvidence];
  const adapterManifest: PagodaAdapterManifest = {
    schemaVersion: 'pagoda.adapter',
    id: adapterId,
    targetId: context.targetId,
    name,
    channel,
    kind: 'node',
    entrypoint: './index.mjs',
    interactionModes: ['generated'],
    producesEvidenceCodes: [...baseEvidenceCodes, `${prefix}_SETUP_READY`],
    requiresEnv: []
  };
  await mkdir(adapterRoot, { recursive: true });
  await writeFile(manifestPath, `${stableJson(adapterManifest)}\n`, 'utf8');
  await writeFile(entrypointPath, generatedAdapter(context.targetId, channel, baseEvidenceCodes), 'utf8');
  const scenarios = await loadScenarios(root, manifest);
  const adapters = await loadAdapterManifests(root, manifest);
  const registryPath = await writeEvidenceRegistry({
    targetRoot: root,
    manifest,
    scenarios: scenarios.map((entry) => entry.scenario),
    adapters: adapters.map((adapter) => adapter.manifest)
  });
  io.stdout(JSON.stringify({
    projectId: context.targetId,
    adapterId,
    adapter: relative(context.projectRoot, adapterRoot),
    manifest: relative(context.projectRoot, manifestPath),
    entrypoint: relative(context.projectRoot, entrypointPath),
    evidenceRegistry: registryPath
  }, null, 2));
  return { exitCode: 0 };
}
