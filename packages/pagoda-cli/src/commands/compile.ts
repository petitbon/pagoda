import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  assertValidPagodaEvidenceMaps,
  assertValidPagodaScenarios
} from '@petitbon/pagoda-core';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { stableJson } from '../shared/json.js';
import {
  contractPathForScenario,
  projectContracts,
  removeUnexpectedOutcomeContracts,
  resolveContainedTargetPath
} from '../target-pack/contracts.js';
import { loadEvidenceMaps, loadScenarios } from '../target-pack/files.js';
import { loadTargetManifest } from '../target-pack/manifests.js';

export async function compileTarget(context: PagodaRootContext, io: PagodaCliIo): Promise<PagodaCommandResult> {
  const { root, manifest } = await loadTargetManifest(context);
  const scenarios = await loadScenarios(root, manifest);
  const maps = await loadEvidenceMaps(root, manifest);
  assertValidPagodaScenarios(scenarios.map(({ scenario }) => scenario));
  assertValidPagodaEvidenceMaps(maps.map(({ evidenceMap }) => evidenceMap), scenarios.map(({ scenario }) => scenario));
  const contracts = projectContracts(scenarios, maps);
  for (const contract of contracts) {
    const path = resolveContainedTargetPath(root, contractPathForScenario(manifest, contract));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${stableJson(contract)}\n`, 'utf8');
    io.stdout(contractPathForScenario(manifest, contract));
  }
  const removed = await removeUnexpectedOutcomeContracts({ targetRoot: root, manifest, projected: contracts });
  for (const path of removed) io.stdout(`removed ${path}`);
  return { exitCode: 0 };
}
