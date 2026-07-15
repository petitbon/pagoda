export type PagodaBatchCoordinates = {
  lane: number;
  laneCount: number;
  iteration: number;
  iterationCount: number;
};

export type PagodaBatchAttempt<TJob> = {
  job: TJob;
  batch?: PagodaBatchCoordinates;
};

const assertPositiveInteger = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
};

export async function runPagodaBatch<TJob, TResult>(input: {
  jobs: readonly TJob[];
  concurrency: number;
  sequential?: number;
  run: (attempt: PagodaBatchAttempt<TJob>) => Promise<TResult>;
  onResult?: (result: TResult, attempt: PagodaBatchAttempt<TJob>) => void | Promise<void>;
}): Promise<TResult[]> {
  assertPositiveInteger(input.concurrency, 'concurrency');
  if (input.sequential !== undefined) assertPositiveInteger(input.sequential, 'sequential');
  if (input.jobs.length === 0) return [];

  let resultIndex = 0;
  const lanes = input.jobs.flatMap((job) => {
    const laneCount = input.sequential === undefined ? 1 : input.concurrency;
    const iterationCount = input.sequential ?? 1;
    return Array.from({ length: laneCount }, (_, laneIndex) =>
      Array.from({ length: iterationCount }, (_, iterationIndex) => ({
        attempt: {
          job,
          ...(input.sequential === undefined
            ? {}
            : {
                batch: {
                  lane: laneIndex + 1,
                  laneCount,
                  iteration: iterationIndex + 1,
                  iterationCount
                }
              })
        } satisfies PagodaBatchAttempt<TJob>,
        resultIndex: resultIndex++
      }))
    );
  });

  const results = new Array<TResult>(resultIndex);
  let nextLaneIndex = 0;
  const workerCount = Math.min(input.concurrency, lanes.length);
  const worker = async (): Promise<void> => {
    while (nextLaneIndex < lanes.length) {
      const laneIndex = nextLaneIndex;
      nextLaneIndex += 1;
      for (const entry of lanes[laneIndex]) {
        const result = await input.run(entry.attempt);
        results[entry.resultIndex] = result;
        await input.onResult?.(result, entry.attempt);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
