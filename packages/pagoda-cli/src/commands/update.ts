import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
  assertValidPagodaEvidenceMaps,
  assertValidPagodaScenarios
} from '@petitbon/pagoda-core';
import type { PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { PagodaCliIo, PagodaCommandResult } from '../types.js';
import { argValue } from '../cli/args.js';
import { writePagodaAgentSkill } from '../generators/codex-skill.js';
import { targetPackGitignore } from '../generators/target-pack-assets.js';
import { stableJson } from '../shared/json.js';
import { pagodaVersion } from '../shared/version.js';
import { loadAdapterManifests } from '../target-pack/adapters.js';
import {
  contractPathForScenario,
  projectContracts,
  removeUnexpectedOutcomeContracts,
  resolveContainedTargetPath
} from '../target-pack/contracts.js';
import { resolveRootContext } from '../target-pack/context.js';
import { loadEvidenceMaps, loadScenarios } from '../target-pack/files.js';
import { buildEvidenceRegistry } from '../target-pack/registry.js';

type UpdateSummary = {
  updated: string[];
  created: string[];
  removed: string[];
  skipped: string[];
};

async function writeTextIfChanged(path: string, text: string, summary: UpdateSummary, label: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
    summary.created.push(label);
    return;
  }
  const existing = await readFile(path, 'utf8');
  if (existing === text) {
    summary.skipped.push(label);
    return;
  }
  await writeFile(path, text, 'utf8');
  summary.updated.push(label);
}

async function mkdirIfMissing(path: string, summary: UpdateSummary, label: string): Promise<void> {
  if (existsSync(path)) return;
  await mkdir(path, { recursive: true });
  summary.created.push(label);
}

function patchManifest(manifest: PagodaTargetManifest): PagodaTargetManifest {
  return {
    ...manifest,
    pagodaVersion,
    paths: {
      ...manifest.paths,
      adapters: manifest.paths.adapters ?? 'adapters',
      fixtures: manifest.paths.fixtures ?? 'fixtures',
      evidenceRegistry: manifest.paths.evidenceRegistry ?? 'evidence/registry.json',
      traces: manifest.paths.traces ?? 'traces',
      reports: manifest.paths.reports ?? 'reports'
    }
  };
}

function mergeGitignore(existing: string): string {
  const requiredPatterns = targetPackGitignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  const existingLines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missing = requiredPatterns.filter((line) => !existingLines.has(line));
  if (missing.length === 0) return existing;
  const prefix = existing.length === 0 ? '' : existing.endsWith('\n') ? existing : `${existing}\n`;
  const separator = prefix.length === 0 ? '' : '\n';
  return `${prefix}${separator}# Pagoda local outputs\n${missing.join('\n')}\n`;
}

export async function updateTargetPack(
  args: readonly string[],
  io: PagodaCliIo,
  input: { ignoredOptions?: readonly string[] } = {}
): Promise<PagodaCommandResult> {
  let context;
  try {
    context = resolveRootContext({
      root: argValue(args, '--root')
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('neither a target pack nor a workspace root') && !message.includes('target manifest does not exist')) {
      throw error;
    }
    throw new Error('Pagoda target pack does not exist. Run pagoda init first.');
  }
  const { projectRoot, targetRoot: root, manifestPath, targetId } = context;
  const summary: UpdateSummary = { updated: [], created: [], removed: [], skipped: [] };
  const manifest = patchManifest(context.manifest);
  const manifestText = `${stableJson(manifest)}\n`;
  await writeTextIfChanged(manifestPath, manifestText, summary, relative(projectRoot, manifestPath));

  await mkdirIfMissing(join(root, manifest.paths.contracts), summary, relative(projectRoot, join(root, manifest.paths.contracts)));
  if (manifest.paths.adapters) await mkdirIfMissing(join(root, manifest.paths.adapters), summary, relative(projectRoot, join(root, manifest.paths.adapters)));
  if (manifest.paths.fixtures) await mkdirIfMissing(join(root, manifest.paths.fixtures), summary, relative(projectRoot, join(root, manifest.paths.fixtures)));
  if (manifest.paths.traces) await mkdirIfMissing(join(root, manifest.paths.traces), summary, relative(projectRoot, join(root, manifest.paths.traces)));
  if (manifest.paths.reports) await mkdirIfMissing(join(root, manifest.paths.reports), summary, relative(projectRoot, join(root, manifest.paths.reports)));
  if (manifest.paths.evidenceRegistry) {
    await mkdirIfMissing(dirname(join(root, manifest.paths.evidenceRegistry)), summary, relative(projectRoot, dirname(join(root, manifest.paths.evidenceRegistry))));
  }

  const scenarios = await loadScenarios(root, manifest);
  const maps = await loadEvidenceMaps(root, manifest);
  assertValidPagodaScenarios(scenarios.map(({ scenario }) => scenario));
  assertValidPagodaEvidenceMaps(maps.map(({ evidenceMap }) => evidenceMap), scenarios.map(({ scenario }) => scenario));
  const projectedContracts = projectContracts(scenarios, maps);
  for (const contract of projectedContracts) {
    const path = resolveContainedTargetPath(root, contractPathForScenario(manifest, contract));
    await writeTextIfChanged(path, `${stableJson(contract)}\n`, summary, relative(projectRoot, path));
  }
  const removedContracts = await removeUnexpectedOutcomeContracts({
    targetRoot: root,
    manifest,
    projected: projectedContracts
  });
  summary.removed.push(...removedContracts.map((path) =>
    relative(projectRoot, resolveContainedTargetPath(root, path))
  ));

  const adapters = await loadAdapterManifests(root, manifest);
  if (manifest.paths.evidenceRegistry) {
    const registryPath = join(root, manifest.paths.evidenceRegistry);
    const registry = buildEvidenceRegistry({
      targetId: manifest.id,
      scenarios: scenarios.map((entry) => entry.scenario),
      adapters: adapters.map((adapter) => adapter.manifest)
    });
    await writeTextIfChanged(registryPath, `${stableJson(registry)}\n`, summary, relative(projectRoot, registryPath));
  }

  const gitignorePath = join(root, '.gitignore');
  const gitignoreText = existsSync(gitignorePath)
    ? mergeGitignore(await readFile(gitignorePath, 'utf8'))
    : targetPackGitignore;
  await writeTextIfChanged(gitignorePath, gitignoreText, summary, relative(projectRoot, gitignorePath));

  const agentSkill = await writePagodaAgentSkill(projectRoot);
  if (agentSkill.written) {
    summary.created.push(relative(projectRoot, agentSkill.skillPath), relative(projectRoot, agentSkill.openAiYamlPath));
  } else {
    summary.skipped.push(relative(projectRoot, agentSkill.skillPath));
  }

  io.stdout(JSON.stringify({
    root,
    projectId: targetId,
    pagodaVersion,
    status: summary.updated.length > 0 || summary.created.length > 0 || summary.removed.length > 0 ? 'updated' : 'up-to-date',
    updated: summary.updated,
    created: summary.created,
    removed: summary.removed,
    skipped: summary.skipped,
    ignoredOptions: [...(input.ignoredOptions ?? [])]
  }, null, 2));
  return { exitCode: 0 };
}
