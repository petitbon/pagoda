export type TargetHealthStatus = 'ready' | 'degraded' | 'unavailable';

export type TargetHealth = {
  status: TargetHealthStatus;
  message?: string;
  evidenceSources?: readonly string[];
};
