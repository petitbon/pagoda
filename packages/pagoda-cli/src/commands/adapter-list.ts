import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { loadAdapterManifests } from '../target-pack/adapters.js';
import { loadTargetManifest } from '../target-pack/manifests.js';

export async function listAdapters(context: PagodaRootContext, io: PagodaCliIo): Promise<PagodaCommandResult> {
  const { root, manifest } = await loadTargetManifest(context);
  const adapters = await loadAdapterManifests(root, manifest);
  io.stdout(JSON.stringify({
    projectId: context.targetId,
    defaultAdapter: manifest.defaultAdapter ?? null,
    legacyAdapter: manifest.adapter ?? null,
    adapters: adapters.map((adapter) => ({
      id: adapter.manifest.id,
      channel: adapter.manifest.channel ?? null,
      path: adapter.path,
      entrypoint: adapter.manifest.entrypoint,
      interactionModes: adapter.manifest.interactionModes ?? ['generated'],
      producesEvidenceCodes: adapter.manifest.producesEvidenceCodes ?? [],
      requiresEnv: adapter.manifest.requiresEnv ?? []
    }))
  }, null, 2));
  return { exitCode: 0 };
}
