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
  const interactionLine = input.manifest.interactionCaseId
    ? `- Interaction Case: ${input.manifest.interactionCaseId}`
    : '';
  const oracleStatus = input.manifest.oracleStatus ?? input.oracleResult.status;
  const agenticLine = input.manifest.agentic
    ? `- Agentic Session: ${input.manifest.agentic.completed ? 'completed' : `incomplete (${input.manifest.agentic.stopReason})`}`
    : '';
  const header = [
    `- Run: ${input.manifest.runId}`,
    `- Target: ${input.manifest.targetId}`,
    `- Scenario: ${input.manifest.scenarioId}`,
    `- Channel: ${input.manifest.channel}`,
    interactionLine || null,
    `- Status: ${input.manifest.status}`,
    `- Oracle Status: ${oracleStatus}`,
    agenticLine || null,
    `- Started: ${input.manifest.startedAt}`,
    `- Completed: ${input.manifest.completedAt}`
  ].filter((line): line is string => line !== null).join('\n');
  return `# Pagoda Run Report

${header}

## Classification Reasons

${reasons || '- None'}

## Clauses

${clauses || '- None'}
`;
}
