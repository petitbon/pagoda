import { describe, expect, it } from 'vitest';
import { runPagodaBatch } from './run-batch.js';

describe('runPagodaBatch', () => {
  it('runs batch lanes concurrently and iterations sequentially', async () => {
    let active = 0;
    let peakActive = 0;
    let firstWaveStarted = 0;
    let releaseFirstWave = (): void => undefined;
    let markFirstWaveStarted = (): void => undefined;
    const firstWaveGate = new Promise<void>((resolve) => {
      releaseFirstWave = resolve;
    });
    const allFirstWaveStarted = new Promise<void>((resolve) => {
      markFirstWaveStarted = resolve;
    });
    const completed = new Set<string>();

    const execution = runPagodaBatch({
      jobs: ['scenario'],
      concurrency: 3,
      sequential: 2,
      run: async ({ job, batch }) => {
        expect(batch).toBeDefined();
        const coordinates = batch as NonNullable<typeof batch>;
        if (coordinates.iteration > 1) {
          expect(completed.has(`${coordinates.lane}:${coordinates.iteration - 1}`)).toBe(true);
        }
        active += 1;
        peakActive = Math.max(peakActive, active);
        if (coordinates.iteration === 1) {
          firstWaveStarted += 1;
          if (firstWaveStarted === coordinates.laneCount) markFirstWaveStarted();
          await firstWaveGate;
        }
        active -= 1;
        completed.add(`${coordinates.lane}:${coordinates.iteration}`);
        return `${job}:${coordinates.lane}:${coordinates.iteration}`;
      }
    });

    await allFirstWaveStarted;
    expect(active).toBe(3);
    expect(peakActive).toBe(3);
    releaseFirstWave();
    await expect(execution).resolves.toEqual([
      'scenario:1:1',
      'scenario:1:2',
      'scenario:2:1',
      'scenario:2:2',
      'scenario:3:1',
      'scenario:3:2'
    ]);
    expect(completed.size).toBe(6);
  });

  it('keeps concurrency as a worker limit when sequential is omitted', async () => {
    const attempts: Array<{ job: string; hasBatch: boolean }> = [];
    const results = await runPagodaBatch({
      jobs: ['one', 'two', 'three'],
      concurrency: 2,
      run: async ({ job, batch }) => {
        attempts.push({ job, hasBatch: batch !== undefined });
        return job;
      }
    });

    expect(results).toEqual(['one', 'two', 'three']);
    expect(attempts).toHaveLength(3);
    expect(attempts.every((attempt) => attempt.hasBatch === false)).toBe(true);
  });
});
