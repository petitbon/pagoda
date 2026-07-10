import { relative } from 'node:path';
import type { PagodaRootContext, PagodaRunCliResult, PagodaRunCliSummary } from '../types.js';

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
};

const shouldUseColor = (): boolean =>
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb' &&
  (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY === true);

const color = (text: string, code: number): string =>
  shouldUseColor() ? `\u001b[${code}m${text}\u001b[0m` : text;

const green = (text: string): string => color(text, 32);
const red = (text: string): string => color(text, 31);
const yellow = (text: string): string => color(text, 33);
const gray = (text: string): string => color(text, 90);
const bold = (text: string): string => color(text, 1);

const isSuccessfulRun = (run: PagodaRunCliResult): boolean =>
  run.status === 'PASS';

const statusMarker = (run: PagodaRunCliResult): string => {
  if (isSuccessfulRun(run)) return green('✓');
  const status = run.status;
  if (status === 'FAIL') return red('×');
  if (status === 'OBSERVABILITY_FAILED') return yellow('!');
  return red('!');
};

const countClauses = (run: PagodaRunCliResult): { passed: number; failed: number; missing: number; total: number } => {
  const clauses = run.oracle.clauses;
  return {
    passed: clauses.filter((clause) => clause.status === 'PASSED').length,
    failed: clauses.filter((clause) => clause.status === 'FAILED').length,
    missing: clauses.filter((clause) => clause.status === 'MISSING').length,
    total: clauses.length
  };
};

const formatRunLine = (run: PagodaRunCliResult, context: PagodaRootContext): string => {
  const clauses = countClauses(run);
  const artifact = relative(context.projectRoot, run.artifactDirectory);
  const clauseWord = clauses.total === 1 ? 'clause' : 'clauses';
  const caseText = run.interactionCaseId ? ` ${gray(run.interactionCaseId)}` : '';
  return [
    ` ${statusMarker(run)} ${run.scenarioId}${caseText}`,
    `(${clauses.passed}/${clauses.total} ${clauseWord}, ${run.evidence.accepted} accepted evidence)`,
    formatDuration(run.durationMs),
    gray(`adapter ${run.adapterRunStatus}`),
    gray(artifact)
  ].join('  ');
};

const formatRunDetails = (run: PagodaRunCliResult): string[] => {
  const agenticFailure = run.agentic?.completed === false
    ? [`  Agentic session did not complete: ${run.agentic.stopReason}`]
    : [];
  const adapterFailure = (run.adapterFailures ?? (run.adapterFailure ? [run.adapterFailure] : []))
    .map((failure) => [
      `  Adapter: ${failure.phase}`,
      `status=${failure.status}`,
      `category=${failure.category}`,
      failure.dependency ? `dependency=${failure.dependency}` : null,
      failure.message
    ].filter((part): part is string => part !== null).join('  '));
  if (run.status === 'PASS') return agenticFailure;
  const missingClauses = run.oracle.clauses.filter((clause) => clause.status === 'MISSING');
  const failedClauses = run.oracle.clauses.filter((clause) => clause.status === 'FAILED');
  return [
    ...agenticFailure,
    ...adapterFailure,
    ...run.oracle.classificationReasons.map((reason) => `  Reason: ${reason}`),
    run.interactionCaseId ? `  Interaction case: ${run.interactionCaseId}` : null,
    ...missingClauses.map((clause) => `  MISSING: ${clause.clause}`),
    ...failedClauses.map((clause) => {
      const refs = clause.evidenceRefs.length > 0 ? ` (${clause.evidenceRefs.join(', ')})` : '';
      return `  FAILED: ${clause.clause}${refs}`;
    }),
    run.oracle.missingTraceSources.length > 0
      ? `  Missing trace sources: ${run.oracle.missingTraceSources.join(', ')}`
      : null,
    run.oracle.missingCorrelation.length > 0
      ? `  Missing correlation: ${run.oracle.missingCorrelation.join(', ')}`
      : null,
    run.oracle.missingOrdering.length > 0
      ? `  Missing ordering: ${run.oracle.missingOrdering.join(', ')}`
      : null
  ].filter((line): line is string => line !== null);
};

const formatEvidenceSummary = (run: PagodaRunCliResult): string => {
  const traceSources = run.evidence.traceSources.length > 0 ? run.evidence.traceSources.join(', ') : 'none';
  const correlation = run.evidence.correlation.length > 0 ? run.evidence.correlation.join(', ') : 'none';
  const ordering = run.evidence.ordering.length > 0 ? run.evidence.ordering.join(', ') : 'none';
  return `   Evidence  ${run.evidence.accepted} accepted | ${run.evidence.rejected} rejected | ${run.evidence.setup} setup | traces ${traceSources} | correlation ${correlation} | ordering ${ordering}`;
};

const sumEvidence = (runs: readonly PagodaRunCliResult[]): { accepted: number; rejected: number; setup: number } =>
  runs.reduce(
    (totals, run) => ({
      accepted: totals.accepted + run.evidence.accepted,
      rejected: totals.rejected + run.evidence.rejected,
      setup: totals.setup + run.evidence.setup
    }),
    { accepted: 0, rejected: 0, setup: 0 }
  );

export function formatRunResult(run: PagodaRunCliResult, context: PagodaRootContext): string {
  const clauses = countClauses(run);
  return [
    '',
    `${bold('RUN')}  ${run.projectId}  ${gray(context.projectRoot)}`,
    '',
    formatRunLine(run, context),
    ...formatRunDetails(run),
    '',
    `   Scenarios  ${isSuccessfulRun(run) ? green('1 passed') : red('1 failed')} (1)`,
    `      Clauses  ${green(`${clauses.passed} passed`)}${clauses.failed ? ` | ${red(`${clauses.failed} failed`)}` : ''}${clauses.missing ? ` | ${yellow(`${clauses.missing} missing`)}` : ''} (${clauses.total})`,
    formatEvidenceSummary(run),
    `   Start at  ${run.startedAt}`,
    `   Duration  ${formatDuration(run.durationMs)}`,
    ''
  ].join('\n');
}

export function formatRunSummaryHeader(
  summary: Pick<PagodaRunCliSummary, 'projectId' | 'channel'>,
  context: PagodaRootContext
): string {
  return [
    '',
    `${bold('RUN')}  ${summary.projectId}  ${gray(context.projectRoot)}`,
    summary.channel ? gray(`Channel  ${summary.channel}`) : null,
    ''
  ].filter((line): line is string => line !== null).join('\n');
}

export function formatRunProgress(run: PagodaRunCliResult, context: PagodaRootContext): string {
  return [formatRunLine(run, context), ...formatRunDetails(run)].join('\n');
}

export function formatRunSummaryFooter(summary: PagodaRunCliSummary): string {
  const clauseTotals = summary.runs.reduce(
    (totals, run) => {
      const clauses = countClauses(run);
      totals.passed += clauses.passed;
      totals.failed += clauses.failed;
      totals.missing += clauses.missing;
      totals.total += clauses.total;
      return totals;
    },
    { passed: 0, failed: 0, missing: 0, total: 0 }
  );
  const evidenceTotals = sumEvidence(summary.runs);
  return [
    '',
    `   Scenarios  ${green(`${summary.passed} passed`)}${summary.failed ? ` | ${red(`${summary.failed} failed`)}` : ''} (${summary.total})`,
    `      Clauses  ${green(`${clauseTotals.passed} passed`)}${clauseTotals.failed ? ` | ${red(`${clauseTotals.failed} failed`)}` : ''}${clauseTotals.missing ? ` | ${yellow(`${clauseTotals.missing} missing`)}` : ''} (${clauseTotals.total})`,
    `     Evidence  ${evidenceTotals.accepted} accepted | ${evidenceTotals.rejected} rejected | ${evidenceTotals.setup} setup`,
    `     Start at  ${summary.startedAt}`,
    `     Duration  ${formatDuration(summary.durationMs)}`,
    ''
  ].join('\n');
}

export function formatRunSummary(summary: PagodaRunCliSummary, context: PagodaRootContext): string {
  return [
    formatRunSummaryHeader(summary, context),
    ...summary.runs.map((run) => formatRunProgress(run, context)),
    formatRunSummaryFooter(summary)
  ].join('\n');
}
