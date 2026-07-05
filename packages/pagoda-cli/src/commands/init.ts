import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { projectScenarioToOutcomeContract } from '@petitbon/pagoda-core';
import type { PagodaAdapterManifest, PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { PagodaCliIo, PagodaCommandResult } from '../types.js';
import { argValue } from '../cli/args.js';
import { starterAdapter } from '../generators/adapter.js';
import { replayAdapter } from '../generators/replay-adapter.js';
import { starterEvidenceMap, starterScenario, supportedInitChannels } from '../generators/scenario.js';
import { browserChatEnvFile, starterFixture, targetPackGitignore, targetPackReadme } from '../generators/target-pack-assets.js';
import { writePagodaAgentSkill } from '../generators/codex-skill.js';
import { sha256 } from '../shared/hashing.js';
import { stableJson } from '../shared/json.js';
import { targetSlug } from '../shared/strings.js';
import { pagodaVersion } from '../shared/version.js';
import { writeEvidenceRegistry } from '../target-pack/registry.js';
import { updateTargetPack } from './update.js';

export function defaultTargetId(rootArg = '.pagoda'): string {
  const root = resolve(rootArg);
  const observedRoot = basename(root) === '.pagoda' ? dirname(root) : root;
  return targetSlug(basename(observedRoot));
}

export async function initTargetPack(args: readonly string[], io: PagodaCliIo): Promise<PagodaCommandResult> {
  const rootArg = argValue(args, '--root', '.pagoda') ?? '.pagoda';
  const targetId = defaultTargetId(rootArg);
  const root = resolve(rootArg);
  const manifestPath = join(root, 'pagoda.target.json');
  if (existsSync(manifestPath)) {
    const ignoredOptions = [
      argValue(args, '--name') === undefined ? null : '--name',
      argValue(args, '--channel') === undefined ? null : '--channel'
    ].filter((option): option is string => option !== null);
    return updateTargetPack(args, io, { ignoredOptions });
  }
  const name = argValue(args, '--name', targetId) ?? targetId;
  const channel = argValue(args, '--channel', 'browser-chat') ?? 'browser-chat';
  if (!supportedInitChannels.has(channel)) throw new Error(`Unsupported init channel ${channel}. Expected browser-chat or phone.`);

  const slug = targetSlug(targetId);
  const adapterId = `${slug}-local`;
  const replayAdapterId = 'replay';
  const scenario = starterScenario(targetId, channel);
  const evidenceMap = starterEvidenceMap(targetId, scenario);
  const scenarioBundle = targetSlug(scenario.id);
  const adapterManifest: PagodaAdapterManifest = {
    schemaVersion: 'pagoda.adapter',
    id: adapterId,
    targetId,
    name: `${name} Local Adapter`,
    channel,
    kind: 'node',
    entrypoint: './index.mjs',
    producesEvidenceCodes: [
      ...scenario.evidence.acceptedEvidenceCodes,
      ...scenario.evidence.requiredWorkflowOutcomes,
      ...scenario.channelContracts.commonEvidenceCodes,
      ...((scenario.channelContracts.channels as Record<string, { requiredEvidenceCodes: string[] } | undefined>)[channel]?.requiredEvidenceCodes ?? []),
      ...scenario.fixture.setupEvidenceCodes
    ],
    requiresEnv: []
  };
  const replayAdapterManifest: PagodaAdapterManifest = {
    schemaVersion: 'pagoda.adapter',
    id: replayAdapterId,
    targetId,
    name: `${name} Replay Adapter`,
    description: 'Replays saved canonical observations without driving the target system.',
    kind: 'node',
    entrypoint: './index.mjs',
    producesEvidenceCodes: ['*'],
    requiresEnv: []
  };
  const manifest: PagodaTargetManifest = {
    schemaVersion: 'pagoda.target',
    id: targetId,
    name,
    pagodaVersion,
    description: `${name} Pagoda validation target pack.`,
    paths: {
      scenarios: 'scenarios',
      evidenceMaps: 'scenarios',
      contracts: 'contracts',
      adapters: 'adapters',
      fixtures: 'fixtures',
      evidenceRegistry: 'evidence/registry.json',
      traces: 'traces',
      reports: 'reports'
    },
    defaultAdapter: adapterId,
    scenarioMappings: [],
    channels: [channel],
    requiredEnv: {}
  };

  for (const path of [
    root,
    join(root, manifest.paths.scenarios),
    join(root, manifest.paths.evidenceMaps),
    join(root, manifest.paths.contracts),
    join(root, manifest.paths.fixtures ?? 'fixtures'),
    join(root, 'evidence'),
    join(root, manifest.paths.traces ?? 'traces'),
    join(root, manifest.paths.reports ?? 'reports'),
    join(root, manifest.paths.scenarios, scenarioBundle),
    join(root, 'adapters', adapterId),
    join(root, 'adapters', replayAdapterId)
  ]) {
    await mkdir(path, { recursive: true });
  }

  const scenarioText = `${stableJson(scenario)}\n`;
  const evidenceMapText = `${stableJson(evidenceMap)}\n`;
  const contract = {
    ...projectScenarioToOutcomeContract(scenario, join(manifest.paths.scenarios, scenarioBundle, 'scenario.json'), evidenceMap),
    generatedFrom: {
      scenarioHash: sha256(scenarioText),
      evidenceMapHash: sha256(evidenceMapText),
      pagodaCoreVersion: pagodaVersion
    }
  };

  await writeFile(manifestPath, `${stableJson(manifest)}\n`, 'utf8');
  await writeFile(join(root, '.gitignore'), targetPackGitignore, 'utf8');
  if (channel === 'browser-chat') {
    await writeFile(join(root, '.env'), browserChatEnvFile, 'utf8');
  }
  await writeFile(join(root, 'README.md'), targetPackReadme({ name, targetId, adapterId, scenarioId: scenario.id, channel }), 'utf8');
  await writeFile(join(root, manifest.paths.scenarios, scenarioBundle, 'scenario.json'), scenarioText, 'utf8');
  await writeFile(join(root, manifest.paths.scenarios, scenarioBundle, 'evidence-map.json'), evidenceMapText, 'utf8');
  await writeFile(join(root, manifest.paths.contracts, `${scenario.id}.outcome-contract.json`), `${stableJson(contract)}\n`, 'utf8');
  await writeFile(join(root, manifest.paths.fixtures ?? 'fixtures', 'starter.fixture.json'), `${stableJson(starterFixture(targetId))}\n`, 'utf8');
  await writeFile(join(root, 'traces', `${scenario.id}.trace.json`), `${stableJson({ scenarioId: scenario.id, expectedStatus: 'PASS' })}\n`, 'utf8');
  await writeFile(join(root, 'adapters', adapterId, 'pagoda.adapter.json'), `${stableJson(adapterManifest)}\n`, 'utf8');
  await writeFile(join(root, 'adapters', adapterId, 'index.mjs'), starterAdapter(targetId, channel), 'utf8');
  await writeFile(join(root, 'adapters', replayAdapterId, 'pagoda.adapter.json'), `${stableJson(replayAdapterManifest)}\n`, 'utf8');
  await writeFile(join(root, 'adapters', replayAdapterId, 'index.mjs'), replayAdapter(targetId), 'utf8');
  await writeEvidenceRegistry({ targetRoot: root, manifest, scenarios: [scenario], adapters: [adapterManifest, replayAdapterManifest] });
  const agentSkill = await writePagodaAgentSkill(dirname(root));

  io.stdout(JSON.stringify({
    root,
    projectId: targetId,
    pagodaVersion,
    scenarioId: scenario.id,
    manifest: manifestPath,
    agentSkill: agentSkill.skillPath
  }, null, 2));
  return { exitCode: 0 };
}
