import { describe, expect, it } from 'vitest';
import type {
  PagodaAdapterManifest,
  PagodaTargetAdapter,
  PagodaTargetManifest,
  TargetRunResult
} from './index.js';

describe('@petitbon/pagoda-adapter-sdk', () => {
  it('defines the target manifest and adapter contract shape used by target packs', async () => {
    const manifest = {
      schemaVersion: 'pagoda.target',
      id: 'test-target',
      name: 'Test Target',
      paths: {
        scenarios: 'docs/pagoda/scenarios',
        evidenceMaps: 'docs/pagoda/evidence-maps',
        contracts: 'docs/pagoda/contracts',
        adapters: 'adapters'
      },
      channels: ['browser-chat'],
      defaultAdapter: 'test-local'
    } satisfies PagodaTargetManifest;
    const adapterManifest = {
      schemaVersion: 'pagoda.adapter',
      id: 'test-local',
      targetId: manifest.id,
      kind: 'node',
      entrypoint: './index.ts'
    } satisfies PagodaAdapterManifest;
    const adapter = {
      targetId: manifest.id,
      async healthCheck() {
        return { status: 'ready' as const };
      },
      async prepare(run) {
        return { runId: run.runId, targetId: run.targetId };
      },
      async execute(prepared): Promise<TargetRunResult> {
        return { runId: prepared.runId, status: 'completed' };
      },
      async collectObservations() {
        return {
          acceptedEvidenceCodes: [],
          rejectedEvidenceCodes: [],
          repairCodes: [],
          observedTraceSources: [],
          observedCorrelation: [],
          observedOrdering: [],
          forbiddenToolNames: [],
          forbiddenEvents: [],
          forbiddenClaims: [],
          setupEvidenceCodes: [],
          evidenceRefsByCode: {},
          collectorStatus: null
        };
      }
    } satisfies PagodaTargetAdapter;
    await expect(adapter.healthCheck()).resolves.toEqual({ status: 'ready' });
    expect(manifest.defaultAdapter).toBe(adapterManifest.id);
    expect(adapterManifest.entrypoint).toBe('./index.ts');
  });
});
