import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { LoadedAdapterManifest, LoadedEvidenceMap, LoadedScenario } from '../types.js';
import { validateAdapterManifest } from './adapters.js';

export function validateTargetManifestStructure(input: {
  targetRoot: string;
  manifest: PagodaTargetManifest;
  scenarios: readonly LoadedScenario[];
  maps: readonly LoadedEvidenceMap[];
  adapters?: readonly LoadedAdapterManifest[];
}): string[] {
  const errors: string[] = [];
  const { targetRoot, manifest, scenarios, maps, adapters = [] } = input;
  const requiredPaths: Array<[string, string | undefined]> = [
    ['paths.scenarios', manifest.paths.scenarios],
    ['paths.evidenceMaps', manifest.paths.evidenceMaps],
    ['paths.contracts', manifest.paths.contracts]
  ];
  for (const [label, path] of requiredPaths) {
    if (!path || !existsSync(join(targetRoot, path))) errors.push(`${label}: path does not exist`);
  }
  if (!manifest.adapter?.entrypoint) {
    if (adapters.length === 0) errors.push('adapter.entrypoint: missing target adapter entrypoint or adapter manifest');
  } else if (!existsSync(join(targetRoot, manifest.adapter.entrypoint))) {
    errors.push(`adapter.entrypoint: ${manifest.adapter.entrypoint} does not exist`);
  }
  const adapterIds = new Set<string>();
  for (const adapter of adapters) {
    errors.push(...validateAdapterManifest(manifest.id, adapter));
    if (adapterIds.has(adapter.manifest.id)) errors.push(`${adapter.path}: duplicate adapter id ${adapter.manifest.id}`);
    adapterIds.add(adapter.manifest.id);
    if (adapter.manifest.channel && !manifest.channels.includes(adapter.manifest.channel)) {
      errors.push(`${adapter.path}: adapter channel ${adapter.manifest.channel} is not declared by target manifest`);
    }
  }
  if (manifest.defaultAdapter && !adapterIds.has(manifest.defaultAdapter)) {
    errors.push(`defaultAdapter: ${manifest.defaultAdapter} does not exist`);
  }
  const declaredChannels = new Set(manifest.channels);
  if (declaredChannels.size !== manifest.channels.length) errors.push('channels: duplicate channel declaration');
  for (const channel of manifest.channels) {
    if (typeof channel !== 'string' || channel.trim().length === 0) errors.push('channels: channel values must be non-empty strings');
  }
  const scenarioIds = new Set(scenarios.map(({ scenario }) => scenario.id));
  const mapScenarioIds = new Set(maps.map(({ evidenceMap }) => evidenceMap.scenarioId));
  for (const { scenario } of scenarios) {
    for (const channel of scenario.labels.channels) {
      if (!declaredChannels.has(channel)) errors.push(`${scenario.id}: scenario channel ${channel} is not declared by target manifest`);
    }
    const matchingMaps = maps.filter(({ evidenceMap }) => evidenceMap.scenarioId === scenario.id);
    if (matchingMaps.length !== 1) errors.push(`${scenario.id}: expected exactly one evidence map, found ${matchingMaps.length}`);
  }
  for (const scenarioId of mapScenarioIds) {
    if (!scenarioIds.has(scenarioId)) errors.push(`${scenarioId}: evidence map references missing scenario`);
  }
  const mappingIds = new Set<string>();
  for (const [index, mapping] of (manifest.scenarioMappings ?? []).entries()) {
    if (!scenarioIds.has(mapping.pagodaScenarioId)) {
      errors.push(`scenarioMappings[${index}].pagodaScenarioId references missing scenario ${mapping.pagodaScenarioId}`);
    }
    if (mappingIds.has(mapping.pagodaScenarioId)) {
      errors.push(`scenarioMappings[${index}].pagodaScenarioId duplicates ${mapping.pagodaScenarioId}`);
    }
    mappingIds.add(mapping.pagodaScenarioId);
    if (!mapping.targetEvaluatorId?.trim()) errors.push(`scenarioMappings[${index}].targetEvaluatorId must be non-empty`);
  }
  for (const [group, keys] of Object.entries(manifest.requiredEnv ?? {})) {
    if (!Array.isArray(keys)) {
      errors.push(`requiredEnv.${group}: must be an array`);
      continue;
    }
    const seen = new Set<string>();
    for (const key of keys) {
      if (typeof key !== 'string' || key.trim().length === 0) errors.push(`requiredEnv.${group}: values must be non-empty strings`);
      if (seen.has(key)) errors.push(`requiredEnv.${group}: duplicate ${key}`);
      seen.add(key);
    }
  }
  return errors;
}
