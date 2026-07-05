import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pagodaCodexSkillAsset = 'templates/agents/skills/pagoda/SKILL.md';
const pagodaCodexOpenAiYamlAsset = 'templates/agents/skills/pagoda/agents/openai.yaml';

async function readCliAsset(assetPath: string): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDirectory, '..', '..', assetPath),
    join(moduleDirectory, '..', assetPath)
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  throw new Error(`Missing Pagoda CLI asset ${assetPath}. Looked in:\n${candidates.join('\n')}`);
}

export async function readPagodaCodexSkillTemplate(): Promise<string> {
  return readCliAsset(pagodaCodexSkillAsset);
}

export async function readPagodaCodexOpenAiYamlTemplate(): Promise<string> {
  return readCliAsset(pagodaCodexOpenAiYamlAsset);
}

export async function writePagodaAgentSkill(observedProjectRoot: string, input: { force?: boolean } = {}): Promise<{
  skillPath: string;
  openAiYamlPath: string;
  written: boolean;
}> {
  const skillRoot = join(observedProjectRoot, '.agents', 'skills', 'pagoda');
  const skillPath = join(skillRoot, 'SKILL.md');
  const agentsRoot = join(skillRoot, 'agents');
  const openAiYamlPath = join(agentsRoot, 'openai.yaml');
  if (existsSync(skillPath) && !input.force) {
    return { skillPath, openAiYamlPath, written: false };
  }

  const [skillText, openAiYamlText] = await Promise.all([
    readPagodaCodexSkillTemplate(),
    readPagodaCodexOpenAiYamlTemplate()
  ]);

  await mkdir(agentsRoot, { recursive: true });
  await writeFile(skillPath, skillText, 'utf8');
  await writeFile(openAiYamlPath, openAiYamlText, 'utf8');
  return { skillPath, openAiYamlPath, written: true };
}
