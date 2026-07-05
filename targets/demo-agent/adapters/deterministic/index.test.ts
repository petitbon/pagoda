import { describe, expect, it } from 'vitest';
import { pagodaTargetAdapter } from './index.js';

describe('@petitbon/pagoda-target-demo-agent deterministic adapter', () => {
  it('reports ready health', async () => {
    await expect(pagodaTargetAdapter.healthCheck()).resolves.toMatchObject({
      status: 'ready'
    });
  });
});
