import { join } from 'node:path';
import { regenerateRunArtifactReport } from '@petitbon/pagoda-runner';
import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { resolveInputPath } from '../target-pack/context.js';

export async function reportArtifact(context: PagodaRootContext, artifactPath: string | undefined, io: PagodaCliIo): Promise<PagodaCommandResult> {
  if (!artifactPath) throw new Error('pagoda report requires --artifact <path>.');
  const directory = resolveInputPath(artifactPath, context);
  const reportPath = await regenerateRunArtifactReport(directory);
  io.stdout(join(directory, reportPath));
  return { exitCode: 0 };
}
