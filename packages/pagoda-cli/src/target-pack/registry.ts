import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PagodaScenario } from '@petitbon/pagoda-core';
import type { PagodaAdapterManifest, PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { LoadedAdapterManifest, LoadedScenario, PagodaEvidenceRegistry, PagodaEvidenceRegistryEntry } from '../types.js';
import { readJson, stableJson } from '../shared/json.js';
import { uniqueStrings } from '../shared/strings.js';
import { channelContractFor, requiredEvidenceCodesForScenario } from './capabilities.js';

export function evidenceRegistryPath(manifest: PagodaTargetManifest): string | null {
  return manifest.paths.evidenceRegistry ?? null;
}

function addRegistryCode(
  entries: Map<string, PagodaEvidenceRegistryEntry>,
  input: {
    code: string;
    kind: PagodaEvidenceRegistryEntry['kind'];
    description: string;
    scenarioId?: string;
    producedBy?: string;
    trustedSources?: readonly string[];
  }
): void {
  const existing = entries.get(input.code) ?? {
    code: input.code,
    kind: input.kind,
    description: input.description,
    scenarios: [],
    producedBy: [],
    trustedSources: []
  };
  existing.kind = existing.kind === 'adapter' ? input.kind : existing.kind;
  if (input.scenarioId) existing.scenarios = uniqueStrings([...(existing.scenarios ?? []), input.scenarioId]);
  if (input.producedBy) existing.producedBy = uniqueStrings([...(existing.producedBy ?? []), input.producedBy]);
  if (input.trustedSources) existing.trustedSources = uniqueStrings([...(existing.trustedSources ?? []), ...input.trustedSources]);
  entries.set(input.code, existing);
}

export function buildEvidenceRegistry(input: {
  targetId: string;
  scenarios: readonly PagodaScenario[];
  adapters: readonly PagodaAdapterManifest[];
}): PagodaEvidenceRegistry {
  const entries = new Map<string, PagodaEvidenceRegistryEntry>();
  for (const scenario of input.scenarios) {
    for (const code of scenario.fixture.setupEvidenceCodes) {
      addRegistryCode(entries, { code, kind: 'setup', description: `Setup evidence for ${scenario.id}.`, scenarioId: scenario.id, trustedSources: ['adapter'] });
    }
    for (const code of scenario.channelContracts.commonEvidenceCodes) {
      addRegistryCode(entries, { code, kind: 'context', description: `Common context evidence for ${scenario.id}.`, scenarioId: scenario.id, trustedSources: ['adapter'] });
    }
    for (const code of scenario.evidence.acceptedEvidenceCodes) {
      addRegistryCode(entries, { code, kind: 'outcome', description: `Accepted outcome evidence for ${scenario.id}.`, scenarioId: scenario.id, trustedSources: ['adapter'] });
    }
    for (const code of scenario.evidence.requiredWorkflowOutcomes) {
      addRegistryCode(entries, { code, kind: 'workflow', description: `Required workflow evidence for ${scenario.id}.`, scenarioId: scenario.id, trustedSources: ['adapter'] });
    }
    for (const code of scenario.evidence.rejectedEvidenceCodes) {
      addRegistryCode(entries, { code, kind: 'rejected', description: `Rejected or unsafe evidence for ${scenario.id}.`, scenarioId: scenario.id, trustedSources: ['adapter'] });
    }
    for (const code of scenario.evidence.repairCodes) {
      addRegistryCode(entries, { code, kind: 'repair', description: `Repair evidence for ${scenario.id}.`, scenarioId: scenario.id, trustedSources: ['adapter'] });
    }
    for (const channel of scenario.labels.channels) {
      for (const code of channelContractFor(scenario, channel)?.requiredEvidenceCodes ?? []) {
        addRegistryCode(entries, { code, kind: 'channel', description: `${channel} evidence for ${scenario.id}.`, scenarioId: scenario.id, trustedSources: ['adapter'] });
      }
    }
  }
  for (const adapter of input.adapters) {
    for (const code of adapter.producesEvidenceCodes ?? []) {
      if (code === '*') continue;
      addRegistryCode(entries, {
        code,
        kind: 'adapter',
        description: `Evidence produced by adapter ${adapter.id}.`,
        producedBy: adapter.id,
        trustedSources: [adapter.id]
      });
    }
  }
  return {
    schemaVersion: 'pagoda.evidence-registry',
    targetId: input.targetId,
    codes: [...entries.values()].sort((left, right) => left.code.localeCompare(right.code))
  };
}

export async function writeEvidenceRegistry(input: {
  targetRoot: string;
  manifest: PagodaTargetManifest;
  scenarios: readonly PagodaScenario[];
  adapters: readonly PagodaAdapterManifest[];
}): Promise<string | null> {
  const path = evidenceRegistryPath(input.manifest);
  if (!path) return null;
  const registry = buildEvidenceRegistry({
    targetId: input.manifest.id,
    scenarios: input.scenarios,
    adapters: input.adapters
  });
  const fullPath = join(input.targetRoot, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${stableJson(registry)}\n`, 'utf8');
  return path;
}

export async function validateEvidenceRegistry(input: {
  targetRoot: string;
  manifest: PagodaTargetManifest;
  scenarios: readonly LoadedScenario[];
  adapters: readonly LoadedAdapterManifest[];
}): Promise<string[]> {
  const path = evidenceRegistryPath(input.manifest);
  if (!path) return [];
  const fullPath = join(input.targetRoot, path);
  if (!existsSync(fullPath)) return [`${path}: evidence registry is missing`];
  const { value } = await readJson<PagodaEvidenceRegistry>(fullPath);
  const errors: string[] = [];
  if (value.schemaVersion !== 'pagoda.evidence-registry') errors.push(`${path}: schemaVersion must be pagoda.evidence-registry`);
  if (value.targetId !== input.manifest.id) errors.push(`${path}: targetId must match ${input.manifest.id}`);
  if (!Array.isArray(value.codes)) errors.push(`${path}: codes must be an array`);
  const declared = new Set<string>();
  for (const [index, entry] of (value.codes ?? []).entries()) {
    if (!entry.code?.trim()) errors.push(`${path}: codes[${index}].code must be non-empty`);
    if (declared.has(entry.code)) errors.push(`${path}: duplicate evidence code ${entry.code}`);
    declared.add(entry.code);
  }
  const required = new Set<string>();
  for (const { scenario } of input.scenarios) {
    for (const channel of scenario.labels.channels) {
      for (const code of requiredEvidenceCodesForScenario(scenario, channel)) required.add(code);
    }
    for (const code of scenario.evidence.rejectedEvidenceCodes) required.add(code);
    for (const code of scenario.evidence.repairCodes) required.add(code);
  }
  for (const code of required) {
    if (!declared.has(code)) errors.push(`${path}: missing evidence code ${code}`);
  }
  return errors;
}
