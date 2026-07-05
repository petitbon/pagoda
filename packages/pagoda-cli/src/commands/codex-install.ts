import type { PagodaCliIo, PagodaCommandResult, PagodaRootContext } from '../types.js';
import { hasArg } from '../cli/args.js';
import { writePagodaAgentSkill } from '../generators/codex-skill.js';

export async function installCodexSkill(context: PagodaRootContext, args: readonly string[], io: PagodaCliIo): Promise<PagodaCommandResult> {
  const result = await writePagodaAgentSkill(context.projectRoot, { force: hasArg(args, '--force') });
  io.stdout(JSON.stringify({
    projectId: context.targetId,
    projectRoot: context.projectRoot,
    agentSkill: result.skillPath,
    openAiYaml: result.openAiYamlPath,
    status: result.written ? 'installed' : 'already-exists'
  }, null, 2));
  return { exitCode: 0 };
}
