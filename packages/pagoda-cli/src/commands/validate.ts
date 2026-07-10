import {
  assertValidPagodaEvidenceMaps,
  assertValidPagodaScenarios
} from '@petitbon/pagoda-core';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { loadAdapterManifests } from '../target-pack/adapters.js';
import { contractFreshnessErrors } from '../target-pack/contracts.js';
import { loadContracts, loadEvidenceMaps, loadScenarios } from '../target-pack/files.js';
import { loadTargetManifest } from '../target-pack/manifests.js';
import { validateEvidenceRegistry } from '../target-pack/registry.js';
import { validateTargetManifestStructure } from '../target-pack/validation.js';

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
  errors.push(...contractFreshnessErrors({ manifest, scenarios, maps, contracts }));
  if (errors.length > 0) throw new Error(`Invalid Pagoda project ${context.targetId}:\n${errors.join('\n')}`);
  io.stdout(`Validated ${context.targetId}: ${scenarios.length} scenario(s), ${maps.length} evidence map(s), ${contracts.length} outcome contract(s).`);
  return { exitCode: 0 };
}
