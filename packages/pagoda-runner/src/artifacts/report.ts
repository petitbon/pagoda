import { renderRunReport } from '../reports/markdown.js';
import { sha256, stableJson } from './hashes.js';
import { atomicWriteArtifactFile } from './integrity.js';
import { runArtifactFiles } from './manifest.js';
import { readRunArtifactBundle } from './reader.js';

export async function regenerateRunArtifactReport(directory: string): Promise<string> {
  const bundle = await readRunArtifactBundle(directory, { verifyReport: false });
  const report = renderRunReport({
    manifest: bundle.manifest,
    oracleResult: bundle.oracleResult
  });
  const hashes = {
    ...bundle.hashes,
    [runArtifactFiles.report]: sha256(report)
  };
  await atomicWriteArtifactFile(directory, runArtifactFiles.report, report);
  await atomicWriteArtifactFile(
    directory,
    runArtifactFiles.hashes,
    `${stableJson(hashes)}\n`
  );
  return runArtifactFiles.report;
}
