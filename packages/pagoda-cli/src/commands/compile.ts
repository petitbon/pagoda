import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  assertValidPagodaEvidenceMaps,
  assertValidPagodaScenarios
} from '@petitbon/pagoda-core';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { stableJson } from '../shared/json.js';
import { contractPathForScenario, projectContracts } from '../target-pack/contracts.js';
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
    const path = join(root, contractPathForScenario(manifest, contract));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${stableJson(contract)}\n`, 'utf8');
    io.stdout(contractPathForScenario(manifest, contract));
  }
  return { exitCode: 0 };
}
