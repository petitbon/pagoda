import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { PagodaTargetManifest } from '@petitbon/pagoda-adapter-sdk';
import type { PagodaRootContext } from '../types.js';

export function assertManifestValid(targetId: string, manifest: PagodaTargetManifest): void {
  if (manifest.schemaVersion !== 'pagoda.target') throw new Error(`${targetId}: invalid target schemaVersion.`);
  if (manifest.id !== targetId) throw new Error(`${targetId}: manifest id must match target id.`);
}

function readManifestSync(path: string): PagodaTargetManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PagodaTargetManifest;
}

function contextFromTargetPackRoot(root: string, requestedTargetId?: string): PagodaRootContext {
  const manifestPath = join(root, 'pagoda.target.json');
  const manifest = readManifestSync(manifestPath);
  const targetId = requestedTargetId ?? manifest.id;
  assertManifestValid(targetId, manifest);
  return {
    mode: 'target-pack',
    projectRoot: dirname(root),
    targetRoot: root,
    manifestPath,
    targetId,
    manifest
  };
}

function contextFromWorkspaceRoot(root: string, requestedTargetId?: string): PagodaRootContext {
  const targetId = requestedTargetId ?? 'demo-agent';
  const targetRoot = join(root, 'targets', targetId);
  const manifestPath = join(targetRoot, 'pagoda.target.json');
  if (!existsSync(manifestPath)) throw new Error(`${targetId}: target manifest does not exist at ${manifestPath}.`);
  const manifest = readManifestSync(manifestPath);
  assertManifestValid(targetId, manifest);
  return {
    mode: 'workspace',
    projectRoot: root,
    targetRoot,
    manifestPath,
    targetId,
    manifest
  };
}

export function resolveRootContext(input: {
  root?: string;
  targetId?: string;
}): PagodaRootContext {
  const configuredRoot = input.root ?? process.env.PAGODA_ROOT?.trim();
  if (configuredRoot) {
    const root = resolve(configuredRoot);
    if (existsSync(join(root, 'pagoda.target.json'))) return contextFromTargetPackRoot(root, input.targetId);
    if (existsSync(join(root, 'targets'))) return contextFromWorkspaceRoot(root, input.targetId);
    throw new Error(`Pagoda root ${root} is neither a target pack nor a workspace root.`);
  }

  let current = process.cwd();
  for (;;) {
    if (existsSync(join(current, 'pagoda.target.json'))) return contextFromTargetPackRoot(current, input.targetId);
    if (existsSync(join(current, '.pagoda', 'pagoda.target.json'))) {
      return contextFromTargetPackRoot(join(current, '.pagoda'), input.targetId);
    }
    if (existsSync(join(current, 'targets')) && existsSync(join(current, 'package.json'))) {
      return contextFromWorkspaceRoot(current, input.targetId);
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return contextFromWorkspaceRoot(process.cwd(), input.targetId);
}

export function resolveInputPath(path: string, context?: PagodaRootContext): string {
  const resolvedFromCwd = resolve(path);
  if (existsSync(resolvedFromCwd)) return resolvedFromCwd;
  if (context) return resolve(context.projectRoot, path);
  return resolve(resolveRootContext({}).projectRoot, path);
}
