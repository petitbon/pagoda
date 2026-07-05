export type PagodaAdapterManifest = {
  schemaVersion: 'pagoda.adapter';
  id: string;
  targetId?: string;
  name?: string;
  description?: string;
  channel?: string;
  kind: 'node';
  entrypoint: string;
  producesEvidenceCodes?: readonly string[];
  requiresEnv?: readonly string[];
};
