import type {
  PagodaCallerSession,
  PagodaCallerTurn,
  PagodaMaterializedAgenticInteraction,
  PagodaTargetTurn
} from '@petitbon/pagoda-core';
import type {
  PagodaAdapterOperationOptions,
  PagodaInteractiveTargetAdapter,
  PagodaRunPlan,
  PreparedRun,
  TargetRunResult
} from '@petitbon/pagoda-adapter-sdk';
import { DeterministicCallerAgentProvider, type PagodaCallerAgentProvider } from '../caller-agent.js';

export type PagodaAgenticSessionRunResult = {
  result: TargetRunResult;
  callerSession: PagodaCallerSession;
};

export type PagodaAgenticLifecycleRunResult = PagodaAgenticSessionRunResult & {
  prepared?: PreparedRun;
};

type AgenticStopReason = PagodaCallerSession['stopReason'];

type AgenticSessionErrorKind = Extract<AgenticStopReason, 'timeout' | 'adapter-failed' | 'provider-failed'>;
type AgenticFailurePhase = 'callerProvider' | 'startInteractive' | 'observeTarget' | 'sendCallerTurn' | 'finishInteractive';

class AgenticSessionError extends Error {
  constructor(
    readonly kind: AgenticSessionErrorKind,
    readonly phase: AgenticFailurePhase,
    message: string
  ) {
    super(message);
  }
}

const remainingDurationMs = (startedMs: number, maxDurationMs: number | undefined): number | undefined => {
  if (maxDurationMs === undefined) return undefined;
  return maxDurationMs - (Date.now() - startedMs);
};

const syntheticResult = (
  prepared: PreparedRun,
  stopReason: AgenticStopReason,
  message: string,
  phase?: AgenticFailurePhase
): TargetRunResult => ({
  runId: prepared.runId,
  status: stopReason === 'completed' ? 'completed' : 'failed',
  stdout: '',
  stderr: message,
  exitCode: stopReason === 'completed' ? 0 : 1,
  metadata: {
    ...prepared.metadata,
    agenticStopReason: stopReason,
    ...(phase ? { agenticFailurePhase: phase, adapterFailurePhase: phase } : {})
  }
});

const preparedRunForPlan = (run: PagodaRunPlan): PreparedRun => ({
  runId: run.runId,
  targetId: run.targetId,
  artifactDirectory: run.artifactDirectory
});

const callerSessionFor = (input: {
  interaction: PagodaMaterializedAgenticInteraction;
  provider: PagodaCallerAgentProvider;
  startedAt: string;
  stopReason: AgenticStopReason;
  turns?: PagodaCallerSession['turns'];
  decisions?: PagodaCallerSession['decisions'];
}): PagodaCallerSession => ({
  schemaVersion: 'pagoda.caller-session',
  interactionCaseId: input.interaction.caseId,
  provider: {
    id: input.provider.id,
    model: input.provider.model,
    deterministic: input.provider.deterministic
  },
  startedAt: input.startedAt,
  completedAt: new Date().toISOString(),
  stopReason: input.stopReason,
  turns: input.turns ?? [],
  decisions: input.decisions ?? []
});

const withTimeout = async <T>(
  phase: AgenticFailurePhase,
  startedMs: number,
  maxDurationMs: number | undefined,
  task: (options: PagodaAdapterOperationOptions) => Promise<T>,
  onLateResolve?: (value: T) => void | Promise<void>
): Promise<T> => {
  const remaining = remainingDurationMs(startedMs, maxDurationMs);
  if (remaining !== undefined && remaining <= 0) {
    throw new AgenticSessionError('timeout', phase, `${phase} exceeded interaction.termination.maxDurationMs.`);
  }
  const controller = new AbortController();
  const taskPromise = task({ signal: controller.signal });
  if (remaining === undefined) return taskPromise;
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  if (onLateResolve) {
    taskPromise.then(
      (value) => {
        if (timedOut) {
          void Promise.resolve(onLateResolve(value)).catch(() => undefined);
        }
      },
      () => undefined
    );
  }
  try {
    return await Promise.race([
      taskPromise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new AgenticSessionError('timeout', phase, `${phase} exceeded interaction.termination.maxDurationMs.`));
        }, remaining);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const callerTurnFor = (index: number, text: string, decision: string): PagodaCallerTurn => ({
  id: `caller-${String(index + 1).padStart(3, '0')}`,
  actor: 'caller',
  text,
  decision,
  occurredAt: new Date().toISOString()
});

const newTargetTurns = (
  turns: readonly PagodaTargetTurn[],
  seenTargetTurnIds: Set<string>
): PagodaTargetTurn[] => {
  const next: PagodaTargetTurn[] = [];
  for (const turn of turns) {
    if (seenTargetTurnIds.has(turn.id)) continue;
    seenTargetTurnIds.add(turn.id);
    next.push(turn);
  }
  return next;
};

export async function runPagodaAgenticCallerSession(input: {
  adapter: PagodaInteractiveTargetAdapter;
  prepared: PreparedRun;
  interaction: PagodaMaterializedAgenticInteraction;
  startedAt: string;
  provider?: PagodaCallerAgentProvider;
}): Promise<PagodaAgenticSessionRunResult> {
  const { adapter, prepared, interaction, startedAt } = input;
  const provider = input.provider ?? new DeterministicCallerAgentProvider();
  const startedMs = Date.parse(startedAt);
  const maxDurationMs = interaction.termination.maxDurationMs;
  const turns: PagodaCallerSession['turns'] = [];
  const decisions: PagodaCallerSession['decisions'] = [];
  const observedTurns: PagodaTargetTurn[] = [];
  const seenTargetTurnIds = new Set<string>();
  let stopReason: AgenticStopReason = 'max-turns';
  let result: TargetRunResult | undefined;
  const waitsForCompletion = interaction.interventionPolicy.triggers.includes('end-when-complete');

  try {
    for (let index = 0; index < interaction.termination.maxTurns; index += 1) {
      const observed = await withTimeout('observeTarget', startedMs, maxDurationMs, async (options) => adapter.observeTarget(prepared, options))
        .catch((error: unknown) => {
          if (error instanceof AgenticSessionError) throw error;
          throw new AgenticSessionError('adapter-failed', 'observeTarget', error instanceof Error ? error.message : 'observeTarget failed.');
        });
      const observedNewTurns = newTargetTurns(observed.turns, seenTargetTurnIds);
      turns.push(...observedNewTurns);
      observedTurns.push(...observedNewTurns);

      const decision = await withTimeout('callerProvider', startedMs, maxDurationMs, async () =>
        provider.decide({ interaction, observedTurns, previousDecisions: decisions })
      ).catch((error: unknown) => {
        if (error instanceof AgenticSessionError) throw error;
        throw new AgenticSessionError('provider-failed', 'callerProvider', error instanceof Error ? error.message : 'caller provider failed.');
      });
      decisions.push(decision);

      if (decision.action === 'end') {
        stopReason = 'completed';
        break;
      }
      if (!decision.text) continue;

      const callerTurn = callerTurnFor(index, decision.text, decision.action);
      turns.push(callerTurn);
      const response = await withTimeout('sendCallerTurn', startedMs, maxDurationMs, async (options) => adapter.sendCallerTurn(prepared, callerTurn, options))
        .catch((error: unknown) => {
          if (error instanceof AgenticSessionError) throw error;
          throw new AgenticSessionError('adapter-failed', 'sendCallerTurn', error instanceof Error ? error.message : 'sendCallerTurn failed.');
        });
      const responseNewTurns = newTargetTurns(response.turns, seenTargetTurnIds);
      turns.push(...responseNewTurns);
      observedTurns.push(...responseNewTurns);
      if (decision.action === 'accept' && waitsForCompletion && responseNewTurns.length > 0) {
        const completionDecision = await withTimeout('callerProvider', startedMs, maxDurationMs, async () =>
          provider.decide({ interaction, observedTurns, previousDecisions: decisions })
        ).catch((error: unknown) => {
          if (error instanceof AgenticSessionError) throw error;
          throw new AgenticSessionError('provider-failed', 'callerProvider', error instanceof Error ? error.message : 'caller provider failed.');
        });
        if (completionDecision.action === 'end') {
          decisions.push(completionDecision);
          stopReason = 'completed';
          break;
        }
      }
      if (decision.action === 'accept' && !waitsForCompletion) {
        stopReason = 'completed';
        break;
      }
    }

    result = await withTimeout('finishInteractive', startedMs, maxDurationMs, async (options) => adapter.finishInteractive(prepared, options))
      .catch((error: unknown) => {
        if (error instanceof AgenticSessionError) throw error;
        throw new AgenticSessionError('adapter-failed', 'finishInteractive', error instanceof Error ? error.message : 'finishInteractive failed.');
      });
  } catch (error) {
    if (error instanceof AgenticSessionError) {
      stopReason = error.kind;
      result = syntheticResult(prepared, stopReason, error.message, error.phase);
    } else {
      stopReason = 'adapter-failed';
      result = syntheticResult(prepared, stopReason, error instanceof Error ? error.message : 'agentic session failed.');
    }
  }

  return {
    result,
    callerSession: callerSessionFor({
      interaction,
      provider,
      startedAt,
      stopReason,
      turns,
      decisions
    })
  };
}

export async function startAndRunPagodaAgenticCallerSession(input: {
  adapter: PagodaInteractiveTargetAdapter;
  run: PagodaRunPlan;
  interaction: PagodaMaterializedAgenticInteraction;
  startedAt: string;
  provider?: PagodaCallerAgentProvider;
}): Promise<PagodaAgenticLifecycleRunResult> {
  const { adapter, run, interaction, startedAt } = input;
  let provider = input.provider ?? new DeterministicCallerAgentProvider();
  const startedMs = Date.parse(startedAt);
  const maxDurationMs = interaction.termination.maxDurationMs;
  try {
    if (!input.provider && adapter.createCallerAgentProvider) {
      provider = await withTimeout(
        'callerProvider',
        startedMs,
        maxDurationMs,
        async () => adapter.createCallerAgentProvider?.({ run, interaction }) as Promise<PagodaCallerAgentProvider>
      ).catch((error: unknown) => {
        if (error instanceof AgenticSessionError) throw error;
        throw new AgenticSessionError(
          'provider-failed',
          'callerProvider',
          error instanceof Error ? error.message : 'caller provider creation failed.'
        );
      });
    }
    const prepared = await withTimeout(
      'startInteractive',
      startedMs,
      maxDurationMs,
      async (options) => adapter.startInteractive(run, options),
      async (latePrepared) => {
        await adapter.cleanup?.(latePrepared);
      }
    )
      .catch((error: unknown) => {
        if (error instanceof AgenticSessionError) throw error;
        throw new AgenticSessionError('adapter-failed', 'startInteractive', error instanceof Error ? error.message : 'startInteractive failed.');
      });
    return {
      prepared,
      ...await runPagodaAgenticCallerSession({
        adapter,
        prepared,
        interaction,
        startedAt,
        provider
      })
    };
  } catch (error) {
    const stopReason: AgenticStopReason = error instanceof AgenticSessionError ? error.kind : 'adapter-failed';
    const message = error instanceof Error ? error.message : 'agentic session failed.';
    return {
      result: syntheticResult(
        preparedRunForPlan(run),
        stopReason,
        message,
        error instanceof AgenticSessionError ? error.phase : undefined
      ),
      callerSession: callerSessionFor({
        interaction,
        provider,
        startedAt,
        stopReason
      })
    };
  }
}
