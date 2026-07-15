export type PagodaTargetManifest = {
  schemaVersion: 'pagoda.target';
  id: string;
  name: string;
  pagodaVersion?: string;
  description?: string;
  paths: {
    scenarios: string;
    evidenceMaps: string;
    contracts: string;
    adapters?: string;
    fixtures?: string;
    evidenceRegistry?: string;
    traces?: string;
    reports?: string;
  };
  channels: readonly string[];
  requiredEnv?: Record<string, readonly string[]>;
  defaultAdapter?: string;
  scenarioMappings?: readonly {
    pagodaScenarioId: string;
    targetEvaluatorId: string;
    harnessSuite?: string;
    selectedCase?: string;
  }[];
};
