import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PagodaAdapterManifest, PagodaTargetAdapter, PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { LoadedAdapterManifest } from '../types.js';
import { readJson } from '../shared/json.js';

export async function importTargetAdapter(input: {
  targetId: string;
  adapterPath: string;
  label: string;
}): Promise<PagodaTargetAdapter> {
  const { targetId, adapterPath, label } = input;
  if (!existsSync(adapterPath)) throw new Error(`${targetId}: adapter entrypoint does not exist: ${label}`);
  const adapterModule = await import(pathToFileURL(adapterPath).href) as {
    default?: PagodaTargetAdapter;
    pagodaTargetAdapter?: PagodaTargetAdapter;
  };
  const adapter = adapterModule.default ?? adapterModule.pagodaTargetAdapter;
  if (!adapter) throw new Error(`${targetId}: adapter ${label} did not export a PagodaTargetAdapter.`);
  if (adapter.targetId !== targetId) throw new Error(`${targetId}: adapter targetId must match target manifest id.`);
  return adapter;
}

export async function loadAdapterManifests(targetRoot: string, manifest: PagodaTargetManifest): Promise<LoadedAdapterManifest[]> {
  const adaptersRoot = join(targetRoot, manifest.paths.adapters ?? 'adapters');
  if (!existsSync(adaptersRoot)) return [];
  const entries = await readdir(adaptersRoot, { withFileTypes: true });
  const manifests = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const adapterRoot = join(adaptersRoot, entry.name);
      const path = join(manifest.paths.adapters ?? 'adapters', entry.name, 'pagoda.adapter.json');
      const fullPath = join(targetRoot, path);
      if (!existsSync(fullPath)) return null;
      const { value } = await readJson<PagodaAdapterManifest>(fullPath);
      return { path, root: adapterRoot, manifest: value };
    }));
  return manifests.filter((entry): entry is LoadedAdapterManifest => entry !== null)
    .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
}

export function validateAdapterManifest(targetId: string, adapter: LoadedAdapterManifest): string[] {
  const errors: string[] = [];
  const manifest = adapter.manifest;
  if (manifest.schemaVersion !== 'pagoda.adapter') errors.push(`${adapter.path}: schemaVersion must be pagoda.adapter`);
  if (!manifest.id?.trim()) errors.push(`${adapter.path}: id must be non-empty`);
  if (manifest.targetId && manifest.targetId !== targetId) errors.push(`${adapter.path}: targetId must match ${targetId}`);
  if (manifest.kind !== 'node') errors.push(`${adapter.path}: kind must be node`);
  if (!manifest.entrypoint?.trim()) errors.push(`${adapter.path}: entrypoint must be non-empty`);
  for (const [index, mode] of (manifest.interactionModes ?? []).entries()) {
    if (mode !== 'generated' && mode !== 'agentic') {
      errors.push(`${adapter.path}: interactionModes[${index}] must be generated or agentic`);
    }
  }
  if (manifest.entrypoint && !existsSync(join(adapter.root, manifest.entrypoint))) {
    errors.push(`${adapter.path}: entrypoint ${manifest.entrypoint} does not exist`);
  }
  return errors;
}

export function resolveAdapterManifest(input: {
  targetId: string;
  manifest: PagodaTargetManifest;
  adapters: readonly LoadedAdapterManifest[];
  adapterId?: string;
  channel?: string;
}): LoadedAdapterManifest | null {
  const { targetId, manifest, adapters, adapterId, channel } = input;
  if (adapterId) {
    const adapter = adapters.find((entry) => entry.manifest.id === adapterId);
    if (!adapter) throw new Error(`${targetId}: adapter ${adapterId} does not exist.`);
    return adapter;
  }
  if (channel) {
    const channelAdapters = adapters.filter((entry) => entry.manifest.channel === channel);
    if (channelAdapters.length === 1) return channelAdapters[0] ?? null;
    if (channelAdapters.length > 1) {
      throw new Error(`${targetId}: multiple adapters declare channel ${channel}; pass --adapter <id>.`);
    }
  }
  if (manifest.defaultAdapter) {
    const adapter = adapters.find((entry) => entry.manifest.id === manifest.defaultAdapter);
    if (!adapter) throw new Error(`${targetId}: defaultAdapter ${manifest.defaultAdapter} does not exist.`);
    return adapter;
  }
  return adapters.length === 1 ? adapters[0] ?? null : null;
}

export async function loadTargetAdapter(input: {
  targetRoot: string;
  manifest: PagodaTargetManifest;
  adapterId?: string;
  channel?: string;
}): Promise<{
  adapter: PagodaTargetAdapter;
  adapterId: string;
  entrypoint: string;
  resolvedPath: string;
  manifest?: PagodaAdapterManifest;
}> {
  const { targetRoot, manifest, adapterId, channel } = input;
  const adapterManifests = await loadAdapterManifests(targetRoot, manifest);
  const selected = resolveAdapterManifest({
    targetId: manifest.id,
    manifest,
    adapters: adapterManifests,
    adapterId,
    channel
  });
  if (selected) {
    const adapterPath = join(selected.root, selected.manifest.entrypoint);
    return {
      adapter: await importTargetAdapter({
        targetId: manifest.id,
        adapterPath,
        label: `${selected.manifest.id}:${selected.manifest.entrypoint}`
      }),
      adapterId: selected.manifest.id,
      entrypoint: selected.manifest.entrypoint,
      resolvedPath: adapterPath,
      manifest: selected.manifest
    };
  }

  if (!manifest.adapter?.entrypoint) {
    throw new Error(`${manifest.id}: target manifest must declare adapter.entrypoint or adapters/<id>/pagoda.adapter.json.`);
  }
  const adapterPath = join(targetRoot, manifest.adapter.entrypoint);
  return {
    adapter: await importTargetAdapter({
      targetId: manifest.id,
      adapterPath,
      label: manifest.adapter.entrypoint
    }),
    adapterId: 'legacy',
    entrypoint: manifest.adapter.entrypoint,
    resolvedPath: adapterPath
  };
}
