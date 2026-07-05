import type { PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { PagodaRootContext } from '../types.js';
import { readJson } from '../shared/json.js';
import { assertManifestValid } from './context.js';

export async function loadTargetManifest(context: PagodaRootContext): Promise<{ root: string; manifest: PagodaTargetManifest }> {
  const { value } = await readJson<PagodaTargetManifest>(context.manifestPath);
  assertManifestValid(context.targetId, value);
  return { root: context.targetRoot, manifest: value };
}
