#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'petitbon/pagoda';
const assetName = 'pagoda-cli-standalone.tgz';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, '..');
const formulaPath = resolve(repoRoot, 'Formula', 'pagoda.rb');

function usage() {
  const command = basename(process.argv[1] ?? 'update-homebrew-formula.mjs');
  return `Usage: node scripts/${command} vMAJOR.MINOR.PATCH [path/to/pagoda-cli-standalone.tgz]`;
}

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(usage());
  process.exit(1);
}

const version = tag.slice(1);
const url = `https://github.com/${repository}/releases/download/${tag}/${assetName}`;
const localAssetPath = process.argv[3];

let bytes;
if (localAssetPath) {
  bytes = await readFile(localAssetPath);
} else {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  bytes = Buffer.from(await response.arrayBuffer());
}

const sha256 = createHash('sha256').update(bytes).digest('hex');
const current = await readFile(formulaPath, 'utf8');

const updated = current
  .replace(/^  url ".*"$/m, `  url "${url}"`)
  .replace(/^  version ".*"$/m, `  version "${version}"`)
  .replace(/^  sha256 .*$|^  sha256 ".*"$/m, `  sha256 "${sha256}"`);

if (updated === current) {
  throw new Error(`No changes made to ${formulaPath}`);
}

await writeFile(formulaPath, updated, 'utf8');
console.log(`Updated ${formulaPath}`);
console.log(`version: ${version}`);
console.log(`sha256: ${sha256}`);
