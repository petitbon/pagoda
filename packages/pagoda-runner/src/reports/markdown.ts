import type { PagodaOracleEvaluationResult } from '@petitbon/pagoda-core';
import type { PagodaRunArtifactManifest } from '../artifacts/manifest.js';

export function renderRunReport(input: {
  manifest: PagodaRunArtifactManifest;
  oracleResult: PagodaOracleEvaluationResult;
}): string {
  const clauses = input.oracleResult.clauses
    .map((clause) => `- ${clause.status} ${clause.clause}${clause.evidenceRefs.length > 0 ? ` (${clause.evidenceRefs.join(', ')})` : ''}`)
    .join('\n');
  const reasons = input.oracleResult.classificationReasons.map((reason) => `- ${reason}`).join('\n');
  return `# Pagoda Run Report

- Run: ${input.manifest.runId}
- Target: ${input.manifest.targetId}
- Scenario: ${input.manifest.scenarioId}
- Channel: ${input.manifest.channel}
- Status: ${input.manifest.status}
- Started: ${input.manifest.startedAt}
- Completed: ${input.manifest.completedAt}

## Classification Reasons

${reasons || '- None'}

## Clauses

${clauses || '- None'}
`;
}
