import { relative } from 'node:path';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { argValue } from '../cli/args.js';
import { loadTargetAdapter } from '../target-pack/adapters.js';
import { loadTargetManifest } from '../target-pack/manifests.js';

export async function checkTarget(context: PagodaRootContext, args: readonly string[], io: PagodaCliIo): Promise<PagodaCommandResult> {
  const { root, manifest } = await loadTargetManifest(context);
  const loaded = await loadTargetAdapter({
    targetRoot: root,
    manifest,
    adapterId: argValue(args, '--adapter'),
    channel: argValue(args, '--channel')
  });
  const health = await loaded.adapter.healthCheck();
  io.stdout(JSON.stringify({
    projectId: context.targetId,
    adapter: {
      id: loaded.adapterId,
      entrypoint: loaded.entrypoint,
      resolvedPath: relative(context.projectRoot, loaded.resolvedPath),
      manifest: loaded.manifest
    },
    health
  }, null, 2));
  return { exitCode: health.status === 'unavailable' ? 1 : 0 };
}
