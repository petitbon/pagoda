import { join } from 'node:path';
import { projectScenarioToOutcomeContract, type PagodaOutcomeContract, type PagodaScenario } from '@petitbon/pagoda-core';
import type { PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { LoadedEvidenceMap, LoadedScenario } from '../types.js';
import { pagodaVersion } from '../shared/version.js';

export function contractPathForScenario(manifest: PagodaTargetManifest, scenario: Pick<PagodaScenario, 'id'>): string {
  return join(manifest.paths.contracts, `${scenario.id}.outcome-contract.json`);
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
