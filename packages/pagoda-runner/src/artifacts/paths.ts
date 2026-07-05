import { join } from 'node:path';

export function artifactSafeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

export function buildRunArtifactDirectory(input: {
  artifactRoot: string;
  startedAt: string;
  targetId: string;
  scenarioId: string;
  channel: string;
}): string {
  const timestamp = input.startedAt.replace(/[:.]/g, '-');
  return join(
    input.artifactRoot,
    'runs',
    `${timestamp}_${artifactSafeSegment(input.targetId)}_${artifactSafeSegment(input.scenarioId)}_${artifactSafeSegment(input.channel)}`
  );
}
