import { readdir, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { projectScenarioToOutcomeContract, type PagodaOutcomeContract, type PagodaScenario } from '@petitbon/pagoda-core';
import type { PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { LoadedContract, LoadedEvidenceMap, LoadedScenario } from '../types.js';
import { stableJson } from '../shared/json.js';
import { pagodaVersion } from '../shared/version.js';

export function contractPathForScenario(manifest: PagodaTargetManifest, scenario: Pick<PagodaScenario, 'id'>): string {
  return join(manifest.paths.contracts, `${scenario.id}.outcome-contract.json`);
}

export function resolveContainedTargetPath(targetRoot: string, path: string): string {
  const root = resolve(targetRoot);
  const candidate = resolve(root, path);
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error(`${path}: configured path escapes target root ${root}`);
  }
  return candidate;
}

function contractFreshnessJson(contract: unknown): string {
  return stableJson(contract);
}

export function contractFreshnessErrors(input: {
  manifest: PagodaTargetManifest;
  scenarios: readonly LoadedScenario[];
  maps: readonly LoadedEvidenceMap[];
  contracts: readonly LoadedContract[];
}): string[] {
  const projected = projectContracts(input.scenarios, input.maps);
  const projectedByPath = new Map(projected.map((contract) => [
    contractPathForScenario(input.manifest, contract),
    contract
  ]));
  const loadedByPath = new Map(input.contracts.map(({ path, contract }) => [path, contract]));
  const errors: string[] = [];
  for (const [path, expected] of projectedByPath) {
    const actual = loadedByPath.get(path);
    if (!actual) errors.push(`${path}: missing outcome contract; run pagoda compile`);
    else if (contractFreshnessJson(actual) !== contractFreshnessJson(expected)) {
      errors.push(`${path}: stale outcome contract; run pagoda compile`);
    }
  }
  for (const path of loadedByPath.keys()) {
    if (!projectedByPath.has(path)) errors.push(`${path}: unexpected outcome contract; run pagoda compile`);
  }
  return errors;
}

export async function removeUnexpectedOutcomeContracts(input: {
  targetRoot: string;
  manifest: PagodaTargetManifest;
  projected: readonly PagodaOutcomeContract[];
}): Promise<string[]> {
  const contractsRoot = resolveContainedTargetPath(input.targetRoot, input.manifest.paths.contracts);
  const expected = new Set(input.projected.map((contract) =>
    `${contract.id}.outcome-contract.json`
  ));
  const entries = await readdir(contractsRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.outcome-contract.json') || expected.has(entry.name)) continue;
    const relativePath = join(input.manifest.paths.contracts, entry.name);
    await unlink(resolveContainedTargetPath(input.targetRoot, relativePath));
    removed.push(relativePath);
  }
  return removed.sort();
}

export function projectContracts(scenarios: readonly LoadedScenario[], maps: readonly LoadedEvidenceMap[]): PagodaOutcomeContract[] {
  const mapsByScenarioId = new Map(maps.map(({ evidenceMap }) => [evidenceMap.scenarioId, evidenceMap]));
  const projected = scenarios.map(({ path, scenario }) => {
    const evidenceMap = mapsByScenarioId.get(scenario.id);
    if (!evidenceMap) throw new Error(`Pagoda evidence map is missing for ${scenario.id}.`);
    return projectScenarioToOutcomeContract(scenario, path, evidenceMap);
  });
  const scenarioHashById = new Map(scenarios.map(({ scenario, hash }) => [scenario.id, hash]));
  const mapHashByScenarioId = new Map(maps.map(({ evidenceMap, hash }) => [evidenceMap.scenarioId, hash]));
  return projected.map((contract) => ({
    ...contract,
    generatedFrom: {
      scenarioHash: scenarioHashById.get(contract.scenarioId),
      evidenceMapHash: mapHashByScenarioId.get(contract.scenarioId),
      pagodaCoreVersion: pagodaVersion
    }
  } as PagodaOutcomeContract & {
    generatedFrom: {
      scenarioHash?: string;
      evidenceMapHash?: string;
      pagodaCoreVersion: string;
    };
  }));
}
