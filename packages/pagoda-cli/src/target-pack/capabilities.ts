import type { PagodaScenario } from '@petitbon/pagoda-core';
import type { PagodaAdapterManifest } from '@petitbon/pagoda-adapter-sdk';
import { uniqueStrings } from '../shared/strings.js';

export function channelContractFor(
  scenario: PagodaScenario,
  channel: string
): { requiredEvidenceCodes: string[]; oracleClauses: string[] } | undefined {
  return (scenario.channelContracts.channels as Record<string, { requiredEvidenceCodes: string[]; oracleClauses: string[] } | undefined>)[channel];
}

export function requiredEvidenceCodesForScenario(scenario: PagodaScenario, channel: string): string[] {
  return uniqueStrings([
    ...scenario.fixture.setupEvidenceCodes,
    ...scenario.evidence.acceptedEvidenceCodes,
    ...scenario.evidence.requiredWorkflowOutcomes,
    ...scenario.channelContracts.commonEvidenceCodes,
    ...(channelContractFor(scenario, channel)?.requiredEvidenceCodes ?? [])
  ]);
}

export function missingAdapterEvidenceCapabilities(
  adapter: PagodaAdapterManifest | undefined,
  scenario: PagodaScenario,
  channel: string
): string[] {
  if (!adapter) return [];
  const produced = new Set(adapter.producesEvidenceCodes ?? []);
  if (produced.has('*')) return [];
  return requiredEvidenceCodesForScenario(scenario, channel).filter((code) => !produced.has(code));
}
