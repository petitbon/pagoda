import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
  assertValidPagodaEvidenceMaps,
  assertValidPagodaScenarios,
  projectScenarioToOutcomeContract
} from '@petitbon/pagoda-core';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { argValue } from '../cli/args.js';
import { genericEvidenceMap, scenarioFromInput } from '../generators/scenario.js';
import { sha256 } from '../shared/hashing.js';
import { stableJson } from '../shared/json.js';
import { scenarioIdSlug, titleFromScenarioId } from '../shared/strings.js';
import { pagodaVersion } from '../shared/version.js';
import { loadAdapterManifests } from '../target-pack/adapters.js';
import { contractPathForScenario } from '../target-pack/contracts.js';
import { loadScenarios } from '../target-pack/files.js';
import { loadTargetManifest } from '../target-pack/manifests.js';
import { writeEvidenceRegistry } from '../target-pack/registry.js';

export async function createScenarioBundle(context: PagodaRootContext, args: readonly string[], io: PagodaCliIo): Promise<PagodaCommandResult> {
  const scenarioId = argValue(args, '--id');
  if (!scenarioId) throw new Error('pagoda scenario create requires --id <id>.');
  const { root, manifest } = await loadTargetManifest(context);
  const channel = argValue(args, '--channel', manifest.channels[0] ?? 'browser-chat') ?? 'browser-chat';
  if (!manifest.channels.includes(channel as never)) throw new Error(`${context.targetId}: channel ${channel} is not declared by target manifest.`);
  const title = argValue(args, '--title', titleFromScenarioId(scenarioId)) ?? titleFromScenarioId(scenarioId);
  const outcome = argValue(args, '--outcome', scenarioIdSlug(scenarioId).replace(/-\d{3}$/, '')) ?? scenarioIdSlug(scenarioId).replace(/-\d{3}$/, '');
  const domain = argValue(args, '--domain', 'product') ?? 'product';
  const risk = argValue(args, '--risk', 'medium') ?? 'medium';
  const interaction = argValue(args, '--interaction', 'generated') ?? 'generated';
  if (interaction !== 'none' && interaction !== 'generated') {
    throw new Error('pagoda scenario create --interaction must be none or generated.');
  }
  const existingScenarios = await loadScenarios(root, manifest);
  if (existingScenarios.some((entry) => entry.scenario.id === scenarioId)) throw new Error(`${context.targetId}: scenario ${scenarioId} already exists.`);

  const scenario = scenarioFromInput({ targetId: context.targetId, scenarioId, title, channel, outcome, domain, risk, interaction });
  const evidenceMap = genericEvidenceMap(context.targetId, scenario);
  assertValidPagodaScenarios([scenario]);
  assertValidPagodaEvidenceMaps([evidenceMap], [scenario]);
  const bundle = scenarioIdSlug(scenario.id);
  const scenarioPath = join(root, manifest.paths.scenarios, bundle, 'scenario.json');
  const mapPath = join(root, manifest.paths.evidenceMaps, bundle, 'evidence-map.json');
  if (existsSync(scenarioPath) || existsSync(mapPath)) throw new Error(`${context.targetId}: scenario bundle ${bundle} already exists.`);
  await mkdir(dirname(scenarioPath), { recursive: true });
  await mkdir(dirname(mapPath), { recursive: true });
  const scenarioText = `${stableJson(scenario)}\n`;
  const evidenceMapText = `${stableJson(evidenceMap)}\n`;
  const contract = {
    ...projectScenarioToOutcomeContract(scenario, join(manifest.paths.scenarios, bundle, 'scenario.json'), evidenceMap),
    generatedFrom: {
      scenarioHash: sha256(scenarioText),
      evidenceMapHash: sha256(evidenceMapText),
      pagodaCoreVersion: pagodaVersion
    }
  };
  await writeFile(scenarioPath, scenarioText, 'utf8');
  await writeFile(mapPath, evidenceMapText, 'utf8');
  await mkdir(join(root, manifest.paths.contracts), { recursive: true });
  await writeFile(join(root, contractPathForScenario(manifest, scenario)), `${stableJson(contract)}\n`, 'utf8');
  const adapters = await loadAdapterManifests(root, manifest);
  const registryPath = await writeEvidenceRegistry({
    targetRoot: root,
    manifest,
    scenarios: [...existingScenarios.map((entry) => entry.scenario), scenario],
    adapters: adapters.map((adapter) => adapter.manifest)
  });
  io.stdout(JSON.stringify({
    projectId: context.targetId,
    scenarioId: scenario.id,
    scenario: relative(context.projectRoot, scenarioPath),
    evidenceMap: relative(context.projectRoot, mapPath),
    contract: relative(context.projectRoot, join(root, contractPathForScenario(manifest, scenario))),
    evidenceRegistry: registryPath
  }, null, 2));
  return { exitCode: 0 };
}
