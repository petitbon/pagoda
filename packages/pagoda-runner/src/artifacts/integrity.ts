import { randomUUID } from 'node:crypto';
import {
  lstat,
  open,
  readFile,
  realpath,
  rename,
  unlink
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { PagodaRunArtifactManifest } from './manifest.js';
import { runArtifactFiles } from './manifest.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalFileKeys = new Set(['interaction', 'callerSession']);

export function assertValidRunArtifactManifest(value: unknown): PagodaRunArtifactManifest {
  if (!isRecord(value)) throw new Error('Invalid Pagoda artifact: run.json must contain an object.');
  if (value.schemaVersion !== 'pagoda.run-artifact') {
    throw new Error('Invalid Pagoda artifact: run.json schemaVersion must be pagoda.run-artifact.');
  }
  if (!isRecord(value.files)) throw new Error('Invalid Pagoda artifact: run.json files must be an object.');

  const canonicalFiles = runArtifactFiles as Record<string, string>;
  const actualKeys = Object.keys(value.files);
  for (const key of actualKeys) {
    if (!Object.hasOwn(canonicalFiles, key)) throw new Error(`Invalid Pagoda artifact: unexpected files key ${key}.`);
    if (value.files[key] !== canonicalFiles[key]) {
      throw new Error(`Invalid Pagoda artifact: files.${key} must be ${canonicalFiles[key]}.`);
    }
  }
  for (const key of Object.keys(canonicalFiles)) {
    if (!optionalFileKeys.has(key) && !Object.hasOwn(value.files, key)) {
      throw new Error(`Invalid Pagoda artifact: files.${key} is required.`);
    }
  }

  return value as PagodaRunArtifactManifest;
}

const isWithin = (root: string, candidate: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
};

export async function artifactRootRealPath(directory: string): Promise<string> {
  const root = await realpath(directory);
  const stats = await lstat(root);
  if (!stats.isDirectory()) throw new Error(`Invalid Pagoda artifact: ${directory} is not a directory.`);
  return root;
}

export async function readRegularArtifactFile(
  directory: string,
  relativePath: string
): Promise<string> {
  const root = await artifactRootRealPath(directory);
  const candidate = resolve(root, relativePath);
  if (!isWithin(root, candidate)) {
    throw new Error(`Invalid Pagoda artifact: ${relativePath} escapes the artifact directory.`);
  }
  const stats = await lstat(candidate).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Invalid Pagoda artifact: ${relativePath} must be a regular file.`);
  }
  const resolvedFile = await realpath(candidate);
  if (!isWithin(root, resolvedFile)) {
    throw new Error(`Invalid Pagoda artifact: ${relativePath} resolves outside the artifact directory.`);
  }
  return readFile(resolvedFile, 'utf8');
}

export async function atomicWriteArtifactFile(
  directory: string,
  relativePath: string,
  text: string
): Promise<void> {
  const root = await artifactRootRealPath(directory);
  const target = resolve(root, relativePath);
  if (!isWithin(root, target)) {
    throw new Error(`Invalid Pagoda artifact path: ${relativePath} escapes the artifact directory.`);
  }
  const parent = await realpath(dirname(target));
  if (!isWithin(root, parent)) {
    throw new Error(`Invalid Pagoda artifact path: ${relativePath} has an unsafe parent directory.`);
  }
  const existing = await lstat(target).catch(() => null);
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) {
    throw new Error(`Invalid Pagoda artifact path: ${relativePath} must be a regular file.`);
  }

  const temporary = `${target}.tmp-${randomUUID()}`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(text, 'utf8');
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Invalid Pagoda artifact: ${label} is not valid JSON.`, { cause: error });
  }
  if (!isRecord(value)) throw new Error(`Invalid Pagoda artifact: ${label} must contain an object.`);
  return value;
}
