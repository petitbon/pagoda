import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PagodaEvidenceMap, PagodaOutcomeContract, PagodaScenario } from '@petitbon/pagoda-core';
import type { PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { LoadedContract, LoadedEvidenceMap, LoadedScenario } from '../types.js';
import { sha256 } from '../shared/hashing.js';
import { readJson } from '../shared/json.js';

export async function listFilesRecursive(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return (await listFilesRecursive(path)).map((file) => join(entry.name, file));
    }
    return [entry.name];
  }));
  return nested.flat().sort();
}

const isScenarioFile = (path: string): boolean =>
  path.endsWith('.scenario.json') || path.endsWith('/scenario.json') || path === 'scenario.json';

const isEvidenceMapFile = (path: string): boolean =>
  path.endsWith('.evidence-map.json') || path.endsWith('/evidence-map.json') || path === 'evidence-map.json';

export async function loadScenarios(targetRoot: string, manifest: PagodaTargetManifest): Promise<LoadedScenario[]> {
  const scenarioRoot = join(targetRoot, manifest.paths.scenarios);
  const files = (await listFilesRecursive(scenarioRoot)).filter(isScenarioFile);
  return Promise.all(files.map(async (file) => {
    const path = join(manifest.paths.scenarios, file);
    const fullPath = join(targetRoot, path);
    const { value, raw } = await readJson<PagodaScenario>(fullPath);
    return { path, scenario: value, hash: sha256(raw) };
  }));
}

export async function loadEvidenceMaps(targetRoot: string, manifest: PagodaTargetManifest): Promise<LoadedEvidenceMap[]> {
  const mapRoot = join(targetRoot, manifest.paths.evidenceMaps);
  const files = (await listFilesRecursive(mapRoot)).filter(isEvidenceMapFile);
  return Promise.all(files.map(async (file) => {
    const path = join(manifest.paths.evidenceMaps, file);
    const fullPath = join(targetRoot, path);
    const { value, raw } = await readJson<PagodaEvidenceMap>(fullPath);
    return { path, evidenceMap: value, hash: sha256(raw) };
  }));
}

export async function loadContracts(targetRoot: string, manifest: PagodaTargetManifest): Promise<LoadedContract[]> {
  const contractRoot = join(targetRoot, manifest.paths.contracts);
  const files = existsSync(contractRoot)
    ? (await readdir(contractRoot)).filter((file) => file.endsWith('.outcome-contract.json')).sort()
    : [];
  return Promise.all(files.map(async (file) => {
    const path = join(manifest.paths.contracts, file);
    const { value } = await readJson<PagodaOutcomeContract>(join(targetRoot, path));
    return { path, contract: value };
  }));
}
