import type { PagodaCliIo, PagodaCommandResult } from '../types.js';
import { argValue, hasArg, runReporter } from './args.js';
import { usage } from './usage.js';
import { readCliVersion } from '../shared/version.js';
import { resolveRootContext } from '../target-pack/context.js';
import { initTargetPack } from '../commands/init.js';
import { updateTargetPack } from '../commands/update.js';
import { validateTarget } from '../commands/validate.js';
import { compileTarget } from '../commands/compile.js';
import { checkTarget } from '../commands/target-check.js';
import { listAdapters } from '../commands/adapter-list.js';
import { checkAdapter } from '../commands/adapter-check.js';
import { createAdapterBundle } from '../commands/adapter-create.js';
import { createScenarioBundle } from '../commands/scenario-create.js';
import { installCodexSkill } from '../commands/codex-install.js';
import { runTargetScenario } from '../commands/run.js';
import { replayArtifact } from '../commands/replay.js';
import { reportArtifact } from '../commands/report.js';

export { readCliVersion };

const cliVersion = readCliVersion();

export const consoleIo: PagodaCliIo = {
  stdout(message: string): void {
    console.log(message);
  },
  stderr(message: string): void {
    console.error(message);
  }
};

export async function main(args = process.argv.slice(2), io: PagodaCliIo = consoleIo): Promise<PagodaCommandResult> {
  const command = args[0];
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    io.stdout(usage);
    return { exitCode: 0 };
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    io.stdout(cliVersion);
    return { exitCode: 0 };
  }
  if (command === 'init') return initTargetPack(args, io);
  if (command === 'update') return updateTargetPack(args, io);

  const context = resolveRootContext({
    root: argValue(args, '--root')
  });
  if (command === 'validate') return validateTarget(context, io);
  if (command === 'compile') return compileTarget(context, io);
  if (command === 'check') return checkTarget(context, args, io);
  if (command === 'adapter' && args[1] === 'list') return listAdapters(context, io);
  if (command === 'adapter' && args[1] === 'check') return checkAdapter(context, args, io);
  if (command === 'adapter' && args[1] === 'create') return createAdapterBundle(context, args, io);
  if (command === 'scenario' && args[1] === 'create') return createScenarioBundle(context, args, io);
  if (command === 'codex' && args[1] === 'install') return installCodexSkill(context, args, io);
  if (command === 'run') {
    return runTargetScenario({
      context,
      scenarioId: argValue(args, '--scenario'),
      all: hasArg(args, '--all'),
      adapterId: argValue(args, '--adapter'),
      channel: argValue(args, '--channel'),
      seed: argValue(args, '--seed'),
      interactionCase: argValue(args, '--interaction-case'),
      interactionCases: argValue(args, '--interaction-cases'),
      artifactDirectory: argValue(args, '--artifact-directory'),
      reporter: runReporter(args),
      io
    });
  }
  if (command === 'replay') return replayArtifact(context, argValue(args, '--artifact'), io);
  if (command === 'report') return reportArtifact(context, argValue(args, '--artifact'), io);
  throw new Error(usage);
}
