import type { PagodaTargetAdapter } from '@petitbon/pagoda-adapter-sdk';

export async function checkAdapterHealth(adapter: PagodaTargetAdapter): Promise<void> {
  const health = await adapter.healthCheck();
  if (health.status === 'unavailable') {
    throw new Error(health.message ?? `${adapter.targetId} adapter is unavailable.`);
  }
}
