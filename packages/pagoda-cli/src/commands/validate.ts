import {
  assertValidPagodaEvidenceMaps,
  assertValidPagodaScenarios
} from '@petitbon/pagoda-core';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { stableJson } from '../shared/json.js';
import { loadAdapterManifests } from '../target-pack/adapters.js';
import { contractPathForScenario, projectContracts } from '../target-pack/contracts.js';
import { loadContracts, loadEvidenceMaps, loadScenarios } from '../target-pack/files.js';
import { loadTargetManifest } from '../target-pack/manifests.js';
import { validateEvidenceRegistry } from '../target-pack/registry.js';
import { validateTargetManifestStructure } from '../target-pack/validation.js';

function contractFreshnessJson(contract: unknown): string {
  const value = JSON.parse(stableJson(contract)) as {
    generatedFrom?: {
      pagodaCoreVersion?: string;
      [key: string]: unknown;
    };
  };
  if (value.generatedFrom) delete value.generatedFrom.pagodaCoreVersion;
  return stableJson(value);
}

export async function validateTarget(context: PagodaRootContext, io: PagodaCliIo): Promise<PagodaCommandResult> {
  const { root, manifest } = await loadTargetManifest(context);
  const scenarios = await loadScenarios(root, manifest);
  const maps = await loadEvidenceMaps(root, manifest);
  const contracts = await loadContracts(root, manifest);
  const adapters = await loadAdapterManifests(root, manifest);
  const errors = validateTargetManifestStructure({ targetRoot: root, manifest, scenarios, maps, adapters });
  errors.push(...await validateEvidenceRegistry({ targetRoot: root, manifest, scenarios, adapters }));
  assertValidPagodaScenarios(scenarios.map(({ scenario }) => scenario));
  assertValidPagodaEvidenceMaps(maps.map(({ evidenceMap }) => evidenceMap), scenarios.map(({ scenario }) => scenario));
  const projected = projectContracts(scenarios, maps);
  const projectedByPath = new Map(projected.map((contract) => [contractPathForScenario(manifest, contract), contract]));
  const loadedByPath = new Map(contracts.map(({ path, contract }) => [path, contract]));
  for (const [path, expected] of projectedByPath) {
    const actual = loadedByPath.get(path);
    if (!actual) errors.push(`${path}: missing outcome contract`);
    else if (contractFreshnessJson(actual) !== contractFreshnessJson(expected)) errors.push(`${path}: stale outcome contract; run pagoda compile`);
  }
  for (const path of loadedByPath.keys()) {
    if (!projectedByPath.has(path)) errors.push(`${path}: unexpected outcome contract`);
  }
  if (errors.length > 0) throw new Error(`Invalid Pagoda project ${context.targetId}:\n${errors.join('\n')}`);
  io.stdout(`Validated ${context.targetId}: ${scenarios.length} scenario(s), ${maps.length} evidence map(s), ${contracts.length} outcome contract(s).`);
  return { exitCode: 0 };
}
