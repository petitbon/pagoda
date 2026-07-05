import type { PagodaChannel } from './scenario.js';
import type { PagodaTraceContract, PagodaTraceSource } from './trace.js';

export type PagodaEvidenceMapNodeType =
  | 'outcome'
  | 'actor'
  | 'intent'
  | 'authority'
  | 'decision'
  | 'fact'
  | 'evidence'
  | 'side_effect'
  | 'oracle'
  | 'recovery';

export type PagodaEvidenceMapEdgeType =
  | 'initiates'
  | 'authorizes'
  | 'decides'
  | 'proves'
  | 'requires'
  | 'allows'
  | 'forbids'
  | 'classifies'
  | 'recovers';

export type PagodaEvidenceMapNode = {
  id: string;
  type: PagodaEvidenceMapNodeType;
  label: string;
  summary: string;
  owner: string;
  evidenceCodes?: string[];
  traceSources?: PagodaTraceSource[];
  channels?: PagodaChannel[];
};

export type PagodaEvidenceMapEdge = {
  id: string;
  type: PagodaEvidenceMapEdgeType;
  sourceId: string;
  targetId: string;
  label: string;
};

export type PagodaEvidenceMap = {
  schemaVersion: 'pagoda.evidence-map';
  id: string;
  scenarioId: string;
  outcomeContractId: string;
  title: string;
  owner: string;
  nodes: PagodaEvidenceMapNode[];
  edges: PagodaEvidenceMapEdge[];
  traceContract: PagodaTraceContract;
};
