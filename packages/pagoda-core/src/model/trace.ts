export type PagodaTraceSource =
  | 'transcript'
  | 'runtime_tool_calls'
  | 'dependency_calls'
  | 'session_ledger'
  | 'workflow_events'
  | 'domain_events'
  | 'adapter_logs'
  | 'runtime_audit_events';

export type PagodaTraceContract = {
  requiredSources: PagodaTraceSource[];
  correlation: string[];
  ordering: string[];
  missingEvidenceStatus: 'OBSERVABILITY_FAILED';
};
