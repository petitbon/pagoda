import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readRunArtifactBundle, renderRunReport } from '@petitbon/pagoda-runner';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { resolveInputPath } from '../target-pack/context.js';

export async function reportArtifact(context: PagodaRootContext, artifactPath: string | undefined, io: PagodaCliIo): Promise<PagodaCommandResult> {
  if (!artifactPath) throw new Error('pagoda report requires --artifact <path>.');
  const directory = resolveInputPath(artifactPath, context);
  const bundle = await readRunArtifactBundle(directory);
  const report = renderRunReport({
    manifest: bundle.manifest,
    oracleResult: bundle.oracleResult
  });
  await writeFile(join(directory, bundle.manifest.files.report), report, 'utf8');
  io.stdout(join(directory, bundle.manifest.files.report));
  return { exitCode: 0 };
}
