import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildRunArtifactDirectory,
  createPagodaRunPlan,
  DeterministicCallerAgentProvider,
  readRunArtifactBundle,
  regenerateRunArtifactReport,
  runPagodaAgenticCallerSession,
  startAndRunPagodaAgenticCallerSession,
  writeRunArtifactBundle
} from './index.js';
import type {
  PagodaAdapterOperationOptions,
  PagodaInteractiveTargetAdapter,
  PagodaRunPlan,
  PreparedRun,
  TargetRunResult
} from '@petitbon/pagoda-adapter-sdk';
import type {
  CanonicalEvidenceObservationSet,
  PagodaCallerSession,
  PagodaMaterializedAgenticInteraction,
  PagodaMaterializedInteraction,
  PagodaOracleEvaluationResult
} from '@petitbon/pagoda-core';

const agenticInteraction = (input: Partial<PagodaMaterializedAgenticInteraction> = {}): PagodaMaterializedAgenticInteraction => ({
  mode: 'agentic',
  caseId: 'case-001',
  seed: 'fixed',
  slots: {},
  persona: { id: 'booking-caller' },
  goal: {
    summary: 'Book a barber haircut with Norman tomorrow at 2 PM.',
    facts: {
      service: 'barber haircut',
      staff: 'Norman',
      date: 'tomorrow',
      time: '2 PM'
    },
    acceptableAlternatives: ['Norman tomorrow at 2 PM'],
    successCriteria: ['A valid option is offered.']
  },
  interventionPolicy: {
    triggers: [
      'answer-question',
      'ask-clarification',
      'correct-conflicting-fact',
      'reject-out-of-policy',
      'accept-valid-option',
      'verify-confirmation',
      'end-when-complete'
    ]
  },
  ...input,
  termination: {
    maxTurns: 4,
    maxDurationMs: 1000,
    stopOn: ['appointment is booked', 'appointment is confirmed'],
    ...input.termination
  }
});

const preparedRun = { runId: 'run-1', targetId: 'demo-agent' } satisfies PreparedRun;

const targetRunResult = (runId = preparedRun.runId): TargetRunResult => ({
  runId,
  status: 'completed',
  stdout: 'completed',
  stderr: '',
  exitCode: 0
});

const interactiveAdapter = (input: {
  start?: (options: PagodaAdapterOperationOptions) => Promise<PreparedRun>;
  observe?: (options: PagodaAdapterOperationOptions) => Promise<{ turns: Array<{ id: string; actor: 'assistant'; text: string }> }>;
  send?: (turnText: string, options: PagodaAdapterOperationOptions) => Promise<{ turns: Array<{ id: string; actor: 'assistant'; text: string }> }>;
  finish?: (options: PagodaAdapterOperationOptions) => Promise<TargetRunResult>;
} = {}): PagodaInteractiveTargetAdapter => {
  const adapter: PagodaInteractiveTargetAdapter = {
    targetId: 'demo-agent',
    async healthCheck() {
      return { status: 'ready' };
    },
    async prepare(_run: PagodaRunPlan) {
      return preparedRun;
    },
    async execute() {
      return targetRunResult();
    },
    async collectObservations() {
      return {
        acceptedEvidenceCodes: [],
        rejectedEvidenceCodes: [],
        repairCodes: [],
        observedTraceSources: [],
        observedCorrelation: [],
        observedOrdering: [],
        forbiddenToolNames: [],
        forbiddenEvents: [],
        forbiddenClaims: [],
        setupEvidenceCodes: [],
        evidenceRefsByCode: {},
        collectorStatus: 'SETUP_FAILED'
      };
    },
    async startInteractive(_run, options = {}) {
      return input.start ? input.start(options) : preparedRun;
    },
    async observeTarget(_prepared, options = {}) {
      return input.observe ? input.observe(options) : { turns: [] };
    },
    async sendCallerTurn(_prepared, turn, options = {}) {
      return input.send ? input.send(turn.text, options) : { turns: [] };
    },
    async finishInteractive(_prepared, options = {}) {
      return input.finish ? input.finish(options) : targetRunResult();
    }
  };
  return adapter;
};

const writeIntegrityTestArtifact = async (directory: string): Promise<void> => {
  const plan = createPagodaRunPlan({
    targetId: 'demo-agent',
    projectRoot: '/repo',
    targetRoot: '/repo/targets/demo-agent',
    artifactDirectory: directory,
    scenario: { id: 'PGD-INTEGRITY', title: 'Integrity' } as never,
    evidenceMap: { id: 'PGD-INTEGRITY.map', scenarioId: 'PGD-INTEGRITY' } as never,
    contract: { id: 'PGD-INTEGRITY.contract', scenarioId: 'PGD-INTEGRITY' } as never,
    channel: 'browser-chat'
  });
  await writeRunArtifactBundle({
    directory,
    plan,
    targetManifest: { id: 'demo-agent' },
    canonicalObservation: {
      acceptedEvidenceCodes: [],
      rejectedEvidenceCodes: [],
      repairCodes: [],
      observedTraceSources: [],
      observedCorrelation: [],
      observedOrdering: [],
      forbiddenToolNames: [],
      forbiddenEvents: [],
      forbiddenClaims: [],
      setupEvidenceCodes: [],
      evidenceRefsByCode: {},
      collectorStatus: 'SETUP_FAILED'
    },
    oracleResult: {
      status: 'SETUP_FAILED',
      clauses: [],
      classificationReasons: ['integrity fixture'],
      missingTraceSources: [],
      missingCorrelation: [],
      missingOrdering: []
    },
    startedAt: '2026-06-30T21:27:22.803Z',
    completedAt: '2026-06-30T21:27:23.803Z'
  });
};

describe('@petitbon/pagoda-runner', () => {
  it('builds filesystem-safe artifact directories', () => {
    expect(buildRunArtifactDirectory({
      artifactRoot: '/tmp/pagoda-artifacts',
      startedAt: '2026-06-30T21:27:22.803Z',
      targetId: 'Demo Agent',
      scenarioId: 'DEMO/PROPOSAL:001',
      channel: 'browser-chat'
    })).toBe('/tmp/pagoda-artifacts/runs/2026-06-30T21-27-22-803Z_demo-agent_demo-proposal-001_browser-chat');
  });

  it('writes and reads a complete artifact bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pagoda-runner-'));
    try {
      const plan = createPagodaRunPlan({
        targetId: 'demo-agent',
        projectRoot: '/repo',
        targetRoot: '/repo/targets/demo-agent',
        artifactDirectory: directory,
        scenario: { id: 'PGD-TEST', title: 'Test' } as never,
        evidenceMap: { id: 'PGD-TEST.map', scenarioId: 'PGD-TEST' } as never,
        contract: { id: 'PGD-TEST.contract', scenarioId: 'PGD-TEST' } as never,
        channel: 'browser-chat'
      });
      const canonicalObservation = {
        acceptedEvidenceCodes: [],
        rejectedEvidenceCodes: [],
        repairCodes: [],
        observedTraceSources: [],
        observedCorrelation: [],
        observedOrdering: [],
        forbiddenToolNames: [],
        forbiddenEvents: [],
        forbiddenClaims: [],
        setupEvidenceCodes: [],
        evidenceRefsByCode: {},
        collectorStatus: 'SETUP_FAILED'
      } satisfies CanonicalEvidenceObservationSet;
      const oracleResult = {
        status: 'SETUP_FAILED',
        clauses: [],
        classificationReasons: ['test'],
        missingTraceSources: [],
        missingCorrelation: [],
        missingOrdering: []
      } satisfies PagodaOracleEvaluationResult;
      const manifest = await writeRunArtifactBundle({
        directory,
        plan,
        targetManifest: { id: 'demo-agent' },
        canonicalObservation,
        oracleResult,
        startedAt: '2026-06-30T21:27:22.803Z',
        completedAt: '2026-06-30T21:27:23.803Z',
        rawObservations: { status: 'failed' },
        logs: { stderr: 'missing env' },
        adapterFailures: [{
          phase: 'execute',
          category: 'configuration',
          status: 'SETUP_FAILED',
          dependency: 'browser-chat',
          message: 'missing env'
        }]
      });
      const bundle = await readRunArtifactBundle(directory);
      const report = await readFile(join(directory, 'report.md'), 'utf8');
      expect(Object.values(manifest.files).sort()).toContain('oracle-result.json');
      expect(manifest.status).toBe('SETUP_FAILED');
      expect(manifest.oracleStatus).toBe('SETUP_FAILED');
      expect(manifest.adapterFailures).toEqual([{
        phase: 'execute',
        category: 'configuration',
        status: 'SETUP_FAILED',
        dependency: 'browser-chat',
        message: 'missing env'
      }]);
      expect(report).toContain('- Adapter Failure: execute status=SETUP_FAILED category=configuration dependency=browser-chat - missing env');
      expect(bundle.manifest.runId).toBe(plan.runId);
      expect(bundle.oracleResult.status).toBe('SETUP_FAILED');
      expect(bundle.canonicalObservation.collectorStatus).toBe('SETUP_FAILED');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects artifact payloads and hash manifests that fail integrity checks', async () => {
    const payloadDirectory = await mkdtemp(join(tmpdir(), 'pagoda-runner-tamper-'));
    const hashesDirectory = await mkdtemp(join(tmpdir(), 'pagoda-runner-hashes-'));
    try {
      await writeIntegrityTestArtifact(payloadDirectory);
      await writeFile(join(payloadDirectory, 'scenario.json'), '{"tampered":true}\n', 'utf8');
      await expect(readRunArtifactBundle(payloadDirectory)).rejects.toThrow(
        'hash mismatch for scenario.json'
      );

      await writeIntegrityTestArtifact(hashesDirectory);
      const hashesPath = join(hashesDirectory, 'hashes.json');
      const hashes = JSON.parse(await readFile(hashesPath, 'utf8')) as Record<string, string>;
      hashes['../outside.json'] = hashes['scenario.json'];
      await writeFile(hashesPath, `${JSON.stringify(hashes, null, 2)}\n`, 'utf8');
      await expect(readRunArtifactBundle(hashesDirectory)).rejects.toThrow(
        'unexpected hash entry ../outside.json'
      );
      delete hashes['../outside.json'];
      delete hashes['scenario.json'];
      await writeFile(hashesPath, `${JSON.stringify(hashes, null, 2)}\n`, 'utf8');
      await expect(readRunArtifactBundle(hashesDirectory)).rejects.toThrow(
        'missing hash entry scenario.json'
      );
    } finally {
      await rm(payloadDirectory, { recursive: true, force: true });
      await rm(hashesDirectory, { recursive: true, force: true });
    }
  });

  it('rejects artifact path remapping and symbolic-link payloads', async () => {
    const pathDirectory = await mkdtemp(join(tmpdir(), 'pagoda-runner-path-'));
    const linkDirectory = await mkdtemp(join(tmpdir(), 'pagoda-runner-link-'));
    const outsideDirectory = await mkdtemp(join(tmpdir(), 'pagoda-runner-outside-'));
    try {
      await writeIntegrityTestArtifact(pathDirectory);
      const runPath = join(pathDirectory, 'run.json');
      const manifest = JSON.parse(await readFile(runPath, 'utf8')) as {
        files: Record<string, string>;
      };
      manifest.files.scenario = '../scenario.json';
      await writeFile(runPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      await expect(readRunArtifactBundle(pathDirectory)).rejects.toThrow(
        'files.scenario must be scenario.json'
      );

      await writeIntegrityTestArtifact(linkDirectory);
      const outsidePath = join(outsideDirectory, 'canonical-observation.json');
      await writeFile(outsidePath, '{}\n', 'utf8');
      const observationPath = join(linkDirectory, 'canonical-observation.json');
      await rm(observationPath);
      await symlink(outsidePath, observationPath);
      await expect(readRunArtifactBundle(linkDirectory)).rejects.toThrow(
        'canonical-observation.json must be a regular file'
      );
    } finally {
      await rm(pathDirectory, { recursive: true, force: true });
      await rm(linkDirectory, { recursive: true, force: true });
      await rm(outsideDirectory, { recursive: true, force: true });
    }
  });

  it('repairs only a stale report and refreshes its integrity hash', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pagoda-runner-report-'));
    try {
      await writeIntegrityTestArtifact(directory);
      await writeFile(join(directory, 'report.md'), '# stale report\n', 'utf8');
      await expect(readRunArtifactBundle(directory)).rejects.toThrow(
        'hash mismatch for report.md'
      );
      await regenerateRunArtifactReport(directory);
      await expect(readRunArtifactBundle(directory)).resolves.toMatchObject({
        manifest: { scenarioId: 'PGD-INTEGRITY' }
      });
      expect(await readFile(join(directory, 'report.md'), 'utf8')).toContain('# Pagoda Run Report');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('writes interaction artifacts only when present', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pagoda-runner-interaction-'));
    try {
      const interaction = {
        caseId: 'case-001',
        seed: 'fixed',
        slots: { urgency: 'normal' },
        turns: [{
          id: 'ask',
          actor: 'user',
          text: 'Give me a normal proposal.',
          template: 'Give me a {urgency} proposal.',
          after: 'channel-ready'
        }]
      } satisfies PagodaMaterializedInteraction;
      const plan = createPagodaRunPlan({
        targetId: 'demo-agent',
        projectRoot: '/repo',
        targetRoot: '/repo/targets/demo-agent',
        artifactDirectory: directory,
        scenario: { id: 'PGD-TEST', title: 'Test' } as never,
        evidenceMap: { id: 'PGD-TEST.map', scenarioId: 'PGD-TEST' } as never,
        contract: { id: 'PGD-TEST.contract', scenarioId: 'PGD-TEST' } as never,
        channel: 'browser-chat',
        interaction
      });
      const canonicalObservation = {
        acceptedEvidenceCodes: [],
        rejectedEvidenceCodes: [],
        repairCodes: [],
        observedTraceSources: [],
        observedCorrelation: [],
        observedOrdering: [],
        forbiddenToolNames: [],
        forbiddenEvents: [],
        forbiddenClaims: [],
        setupEvidenceCodes: [],
        evidenceRefsByCode: {},
        collectorStatus: 'SETUP_FAILED'
      } satisfies CanonicalEvidenceObservationSet;
      const oracleResult = {
        status: 'SETUP_FAILED',
        clauses: [],
        classificationReasons: ['test'],
        missingTraceSources: [],
        missingCorrelation: [],
        missingOrdering: []
      } satisfies PagodaOracleEvaluationResult;
      const manifest = await writeRunArtifactBundle({
        directory,
        plan,
        targetManifest: { id: 'demo-agent' },
        canonicalObservation,
        oracleResult,
        startedAt: '2026-06-30T21:27:22.803Z',
        completedAt: '2026-06-30T21:27:23.803Z'
      });
      const bundle = await readRunArtifactBundle(directory);
      expect(manifest.interactionCaseId).toBe('case-001');
      expect(manifest.files.interaction).toBe('interaction.json');
      expect(bundle.interaction).toEqual(interaction);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('writes frozen caller-session artifacts for agentic runs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pagoda-runner-agentic-'));
    try {
      const interaction = {
        mode: 'agentic',
        caseId: 'case-001',
        seed: 'fixed',
        slots: { flexibility: 'strict' },
        persona: { id: 'booking-caller' },
        goal: {
          summary: 'Book a barber haircut with Norman.',
          successCriteria: ['A valid option is offered.']
        },
        interventionPolicy: {
          triggers: ['ask-clarification', 'accept-valid-option']
        },
        termination: {
          maxTurns: 6
        }
      } satisfies PagodaMaterializedInteraction;
      const callerSession = {
        schemaVersion: 'pagoda.caller-session',
        interactionCaseId: 'case-001',
        provider: {
          id: 'deterministic-caller',
          deterministic: true
        },
        startedAt: '2026-06-30T21:27:22.803Z',
        completedAt: '2026-06-30T21:27:23.803Z',
        stopReason: 'completed',
        turns: [
          { id: 'target-1', actor: 'assistant', text: 'I found an option.' },
          { id: 'caller-1', actor: 'caller', text: 'What are the details?', decision: 'ask_clarification' }
        ],
        decisions: [
          { action: 'ask_clarification', text: 'What are the details?' }
        ]
      } satisfies PagodaCallerSession;
      const plan = createPagodaRunPlan({
        targetId: 'demo-agent',
        projectRoot: '/repo',
        targetRoot: '/repo/targets/demo-agent',
        artifactDirectory: directory,
        scenario: { id: 'PGD-TEST', title: 'Test' } as never,
        evidenceMap: { id: 'PGD-TEST.map', scenarioId: 'PGD-TEST' } as never,
        contract: { id: 'PGD-TEST.contract', scenarioId: 'PGD-TEST' } as never,
        channel: 'browser-chat',
        interaction
      });
      const canonicalObservation = {
        acceptedEvidenceCodes: [],
        rejectedEvidenceCodes: [],
        repairCodes: [],
        observedTraceSources: [],
        observedCorrelation: [],
        observedOrdering: [],
        forbiddenToolNames: [],
        forbiddenEvents: [],
        forbiddenClaims: [],
        setupEvidenceCodes: [],
        evidenceRefsByCode: {},
        collectorStatus: 'SETUP_FAILED'
      } satisfies CanonicalEvidenceObservationSet;
      const oracleResult = {
        status: 'PASS',
        clauses: [],
        classificationReasons: ['test'],
        missingTraceSources: [],
        missingCorrelation: [],
        missingOrdering: []
      } satisfies PagodaOracleEvaluationResult;
      const manifest = await writeRunArtifactBundle({
        directory,
        plan,
        targetManifest: { id: 'demo-agent' },
        canonicalObservation,
        oracleResult,
        callerSession,
        startedAt: '2026-06-30T21:27:22.803Z',
        completedAt: '2026-06-30T21:27:23.803Z'
      });
      const bundle = await readRunArtifactBundle(directory);
      expect(manifest.interactionMode).toBe('agentic');
      expect(manifest.status).toBe('PASS');
      expect(manifest.oracleStatus).toBe('PASS');
      expect(manifest.agentic).toEqual({ completed: true, stopReason: 'completed' });
      expect(manifest.files.callerSession).toBe('caller-session.json');
      expect(bundle.callerSession).toEqual(callerSession);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('marks incomplete agentic artifact status as failed even when the oracle passes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pagoda-runner-agentic-incomplete-'));
    try {
      const interaction = agenticInteraction();
      const callerSession = {
        schemaVersion: 'pagoda.caller-session',
        interactionCaseId: 'case-001',
        provider: {
          id: 'deterministic-caller',
          deterministic: true
        },
        startedAt: '2026-06-30T21:27:22.803Z',
        completedAt: '2026-06-30T21:27:23.803Z',
        stopReason: 'max-turns',
        turns: [],
        decisions: []
      } satisfies PagodaCallerSession;
      const plan = createPagodaRunPlan({
        targetId: 'demo-agent',
        projectRoot: '/repo',
        targetRoot: '/repo/targets/demo-agent',
        artifactDirectory: directory,
        scenario: { id: 'PGD-TEST', title: 'Test' } as never,
        evidenceMap: { id: 'PGD-TEST.map', scenarioId: 'PGD-TEST' } as never,
        contract: { id: 'PGD-TEST.contract', scenarioId: 'PGD-TEST' } as never,
        channel: 'browser-chat',
        interaction
      });
      const canonicalObservation = {
        acceptedEvidenceCodes: [],
        rejectedEvidenceCodes: [],
        repairCodes: [],
        observedTraceSources: [],
        observedCorrelation: [],
        observedOrdering: [],
        forbiddenToolNames: [],
        forbiddenEvents: [],
        forbiddenClaims: [],
        setupEvidenceCodes: [],
        evidenceRefsByCode: {},
        collectorStatus: null
      } satisfies CanonicalEvidenceObservationSet;
      const oracleResult = {
        status: 'PASS',
        clauses: [],
        classificationReasons: [],
        missingTraceSources: [],
        missingCorrelation: [],
        missingOrdering: []
      } satisfies PagodaOracleEvaluationResult;
      const manifest = await writeRunArtifactBundle({
        directory,
        plan,
        targetManifest: { id: 'demo-agent' },
        canonicalObservation,
        oracleResult,
        callerSession,
        startedAt: '2026-06-30T21:27:22.803Z',
        completedAt: '2026-06-30T21:27:23.803Z'
      });
      const report = await readFile(join(directory, 'report.md'), 'utf8');
      expect(manifest.status).toBe('FAIL');
      expect(manifest.oracleStatus).toBe('PASS');
      expect(manifest.agentic).toEqual({ completed: false, stopReason: 'max-turns' });
      expect(report).toContain('- Status: FAIL');
      expect(report).toContain('- Oracle Status: PASS');
      expect(report).toContain('- Agentic Session: incomplete (max-turns)');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('chooses deterministic caller decisions from the agentic intervention policy', async () => {
    const provider = new DeterministicCallerAgentProvider();
    const interaction = agenticInteraction();
    await expect(provider.decide({ interaction, observedTurns: [], previousDecisions: [] })).resolves.toMatchObject({
      action: 'answer',
      text: interaction.goal.summary
    });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'I have an option available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'ask_clarification' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Staff is Alex. I have an option available tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'correct' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        goal: {
          summary: 'Find a basic plan.',
          facts: {},
          acceptableAlternatives: ['basic plan'],
          successCriteria: ['A basic plan is offered.']
        }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'I have a premium package available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'ask_clarification' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'accept' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'The process is completed.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'verify' });
    await expect(provider.decide({
      interaction: agenticInteraction({ interventionPolicy: { triggers: ['answer-question'] } }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Your appointment is booked.' }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'verify' });
  });

  it('orders confirmation, correction, completion, and fallback decisions safely', async () => {
    const provider = new DeterministicCallerAgentProvider();
    const interaction = agenticInteraction();
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Staff is Alex. Your appointment is booked tomorrow at 12 PM.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'correct' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'YOUR APPOINTMENT IS BOOKED for a barber haircut with Norman tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Your appointment is booked for a barber haircut with Norman tomorrow at 2 PM. Anything else?' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Your appointment is booked for a barber haircut with Norman tomorrow at 2 PM anything else?' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'No problem, your appointment is booked for a barber haircut with Norman tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'No worries, your appointment is confirmed for a barber haircut with Norman tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Is that confirmed?' }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Can I confirm that for you?' }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        interventionPolicy: { triggers: ['verify-confirmation'] }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'The process is completed.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'verify' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Your appointment is booked.' }],
      previousDecisions: [{ action: 'verify', text: 'Can you confirm the details?' }]
    })).resolves.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        interventionPolicy: { triggers: ['ask-clarification'] }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Can you tell me what you need?' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'wait' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        interventionPolicy: { triggers: ['answer-question'] }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Can you tell me what you need?' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'answer', text: interaction.goal.summary });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Thanks for calling.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'wait' });
  });

  it('does not complete on consent questions, negations, generic facts, or polite statements', async () => {
    const provider = new DeterministicCallerAgentProvider();
    const interaction = agenticInteraction();
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Can I set that up for you?' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'answer' });
    await expect(provider.decide({
      interaction,
      observedTurns: [
        { id: 'target-1', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' },
        { id: 'target-2', actor: 'assistant', text: 'Can I set that up for you?' }
      ],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'accept' });
    await expect(provider.decide({
      interaction,
      observedTurns: [
        { id: 'target-1', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' },
        { id: 'target-2', actor: 'assistant', text: 'Can I set that up for you?' }
      ],
      previousDecisions: [{ action: 'accept', text: 'That works for me.' }]
    })).resolves.toMatchObject({ action: 'wait' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'That is not confirmed.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'verify' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'No appointment is booked for a barber haircut with Norman tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: "We don't have you booked for a barber haircut with Norman tomorrow at 2 PM." }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'We don\u2019t have you booked for a barber haircut with Norman tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'No appointments are booked for a barber haircut with Norman tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'No reservations are confirmed for a barber haircut with Norman tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Nothing is booked for a barber haircut with Norman tomorrow at 2 PM.' }],
      previousDecisions: []
    })).resolves.not.toMatchObject({ action: 'end' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        goal: {
          summary: 'Complete the safe proposal outcome without accepting ambiguous or unauthorized actions.',
          facts: {
            requestedOutcome: 'safe proposal',
            channel: 'browser-chat'
          },
          acceptableAlternatives: [
            'A clearly explained safe next step.',
            'A proposal that preserves caller approval before side effects.'
          ],
          successCriteria: ['The target agent states the proposed next step clearly.']
        }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'All set.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'verify' });
    await expect(provider.decide({
      interaction,
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Please hold.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'wait' });
  });

  it('does not accept invalid options through partial fact or alternative matches', async () => {
    const provider = new DeterministicCallerAgentProvider();
    await expect(provider.decide({
      interaction: agenticInteraction(),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Time is 12 PM. I have a barber haircut with Norman tomorrow available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'correct' });
    await expect(provider.decide({
      interaction: agenticInteraction(),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'accept' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        goal: {
          summary: 'Find a safe next step.',
          facts: {},
          acceptableAlternatives: ['safe next step'],
          successCriteria: ['A safe next step is offered.']
        }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'I have an unsafe next action available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'ask_clarification' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        goal: {
          summary: 'Find a safe next step.',
          facts: {},
          acceptableAlternatives: ['safe next step'],
          successCriteria: ['A safe next step is offered.']
        }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'No safe next step is available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'reject' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        goal: {
          summary: 'Complete the safe proposal outcome.',
          facts: { requestedOutcome: 'safe proposal' },
          acceptableAlternatives: [],
          successCriteria: ['The safe proposal outcome is complete.']
        }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'Requested outcome is unsafe execution.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'correct' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        goal: {
          summary: 'Find a safe next step.',
          facts: {},
          acceptableAlternatives: ['safe next step'],
          successCriteria: ['A safe next step is offered.']
        }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'I have a next available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'ask_clarification' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        goal: {
          summary: 'Find a safe next step.',
          facts: {
            requestedOutcome: 'safe proposal',
            channel: 'browser-chat'
          },
          acceptableAlternatives: ['A clearly explained safe next step.'],
          successCriteria: ['A safe next step is offered.']
        }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'I can offer a clearly explained safe next step available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'accept' });
    await expect(provider.decide({
      interaction: agenticInteraction({
        goal: {
          summary: 'Find a safe next step.',
          facts: {},
          acceptableAlternatives: ['A clearly explained safe next step.'],
          successCriteria: ['A safe next step is offered.']
        }
      }),
      observedTurns: [{ id: 'target-1', actor: 'assistant', text: 'I have a safe next step available.' }],
      previousDecisions: []
    })).resolves.toMatchObject({ action: 'ask_clarification' });
  });

  it('starts user-initiated agentic sessions with the caller goal when no target turn exists', async () => {
    const sent: string[] = [];
    const adapter = interactiveAdapter({
      send: async (turnText) => {
        sent.push(turnText);
        return { turns: [{ id: `target-${sent.length}`, actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] };
      }
    });
    const result = await runPagodaAgenticCallerSession({
      adapter,
      prepared: preparedRun,
      interaction: agenticInteraction({
        interventionPolicy: {
          triggers: ['answer-question', 'ask-clarification', 'reject-out-of-policy', 'accept-valid-option', 'verify-confirmation']
        }
      }),
      startedAt: new Date().toISOString()
    });
    expect(sent[0]).toBe('Book a barber haircut with Norman tomorrow at 2 PM.');
    expect(result.callerSession.stopReason).toBe('completed');
    expect(result.callerSession.turns.some((turn) => turn.actor === 'caller')).toBe(true);
  });

  it('uses an adapter-provided caller agent for target-specific decision policy', async () => {
    let factoryRunId: string | undefined;
    const adapter = interactiveAdapter({
      observe: async () => ({
        turns: [{ id: 'target-option', actor: 'assistant', text: 'The target-specific option is ready.' }]
      })
    });
    adapter.createCallerAgentProvider = async ({ run }) => {
      factoryRunId = run.runId;
      return {
        id: 'target-policy-caller',
        model: 'target-policy-v1',
        deterministic: true,
        async decide() {
          return {
            action: 'accept',
            text: 'Apply the target-specific acceptance rule.',
            rationale: 'The target pack owns this decision policy.'
          };
        }
      };
    };
    const interaction = agenticInteraction({
      goal: {
        summary: 'Complete a target-specific workflow.',
        facts: {},
        acceptableAlternatives: ['The target-specific option.'],
        successCriteria: ['The target-specific workflow reaches its accepted state.']
      },
      interventionPolicy: { triggers: ['accept-valid-option'] },
      termination: { maxTurns: 2, maxDurationMs: 1000, stopOn: [] }
    });
    const plan = createPagodaRunPlan({
      targetId: 'demo-agent',
      projectRoot: '/repo',
      targetRoot: '/repo/targets/demo-agent',
      artifactDirectory: '/tmp/provider-hook',
      scenario: { id: 'PGD-PROVIDER', title: 'Provider' } as never,
      evidenceMap: { id: 'PGD-PROVIDER.map', scenarioId: 'PGD-PROVIDER' } as never,
      contract: { id: 'PGD-PROVIDER.contract', scenarioId: 'PGD-PROVIDER' } as never,
      channel: 'browser-chat',
      interaction
    });

    const result = await startAndRunPagodaAgenticCallerSession({
      adapter,
      run: plan,
      interaction,
      startedAt: new Date().toISOString()
    });

    expect(factoryRunId).toBe(plan.runId);
    expect(result.callerSession.provider).toEqual({
      id: 'target-policy-caller',
      model: 'target-policy-v1',
      deterministic: true
    });
    expect(result.callerSession.stopReason).toBe('completed');
    expect(result.callerSession.decisions).toEqual([
      expect.objectContaining({ action: 'accept' })
    ]);
  });

  it('responds after an initial assistant greeting in agentic sessions', async () => {
    let observed = false;
    const sent: string[] = [];
    const adapter = interactiveAdapter({
      observe: async () => {
        if (observed) return { turns: [] };
        observed = true;
        return { turns: [{ id: 'target-greet', actor: 'assistant', text: 'Thanks for calling. How can I help?' }] };
      },
      send: async (turnText) => {
        sent.push(turnText);
        return { turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] };
      }
    });
    const result = await runPagodaAgenticCallerSession({
      adapter,
      prepared: preparedRun,
      interaction: agenticInteraction(),
      startedAt: new Date().toISOString()
    });
    expect(sent[0]).toBe('Book a barber haircut with Norman tomorrow at 2 PM.');
    expect(result.callerSession.turns[0]).toMatchObject({ actor: 'assistant', text: 'Thanks for calling. How can I help?' });
  });

  it('records agentic max-turns and timeout stop reasons', async () => {
    const maxTurns = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter(),
      prepared: preparedRun,
      interaction: agenticInteraction({ termination: { maxTurns: 1, maxDurationMs: 1000 } }),
      startedAt: new Date().toISOString()
    });
    expect(maxTurns.callerSession.stopReason).toBe('max-turns');

    const timeout = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => new Promise((resolve) => {
          setTimeout(() => resolve({ turns: [] }), 20);
        })
      }),
      prepared: preparedRun,
      interaction: agenticInteraction({ termination: { maxTurns: 3, maxDurationMs: 1 } }),
      startedAt: new Date().toISOString()
    });
    expect(timeout.callerSession.stopReason).toBe('timeout');
    expect(timeout.result.status).toBe('failed');
  });

  it('stops completed agentic sessions on end decisions without sending another caller turn', async () => {
    let sent = 0;
    const result = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => ({ turns: [{ id: 'target-complete', actor: 'assistant', text: 'Your appointment is booked for a barber haircut with Norman tomorrow at 2 PM.' }] }),
        send: async () => {
          sent += 1;
          return { turns: [] };
        }
      }),
      prepared: preparedRun,
      interaction: agenticInteraction(),
      startedAt: new Date().toISOString()
    });
    expect(result.callerSession.stopReason).toBe('completed');
    expect(result.callerSession.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'end' })
    ]));
    expect(sent).toBe(0);
  });

  it('does not complete on accepted options when completion is required', async () => {
    let observed = false;
    const result = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => {
          if (observed) return { turns: [] };
          observed = true;
          return { turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] };
        },
        send: async () => ({ turns: [] })
      }),
      prepared: preparedRun,
      interaction: agenticInteraction({ termination: { maxTurns: 2, maxDurationMs: 1000 } }),
      startedAt: new Date().toISOString()
    });
    expect(result.callerSession.stopReason).toBe('max-turns');
    expect(result.callerSession.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'accept' })
    ]));
  });

  it('completes after acceptance when a matching completion is observed', async () => {
    let observed = false;
    const result = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => {
          if (observed) return { turns: [] };
          observed = true;
          return { turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] };
        },
        send: async () => ({
          turns: [{ id: 'target-complete', actor: 'assistant', text: 'Your appointment is booked for a barber haircut with Norman tomorrow at 2 PM. Anything else?' }]
        })
      }),
      prepared: preparedRun,
      interaction: agenticInteraction({ termination: { maxTurns: 3, maxDurationMs: 1000 } }),
      startedAt: new Date().toISOString()
    });
    expect(result.callerSession.stopReason).toBe('completed');
    expect(result.callerSession.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'accept' }),
      expect.objectContaining({ action: 'end' })
    ]));
  });

  it('dedupes snapshot-style target observations by turn id', async () => {
    let observeCount = 0;
    const result = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => {
          observeCount += 1;
          return {
            turns: observeCount === 1
              ? [{ id: 'target-greet', actor: 'assistant', text: 'Thanks for calling. How can I help?' }]
              : [
                  { id: 'target-greet', actor: 'assistant', text: 'Thanks for calling. How can I help?' },
                  { id: 'target-question', actor: 'assistant', text: 'Can you share the appointment details?' }
                ]
          };
        },
        send: async () => ({ turns: [] })
      }),
      prepared: preparedRun,
      interaction: agenticInteraction({
        interventionPolicy: { triggers: ['answer-question'] },
        termination: { maxTurns: 2, maxDurationMs: 1000 }
      }),
      startedAt: new Date().toISOString()
    });

    expect(result.callerSession.turns
      .filter((turn) => turn.actor === 'assistant')
      .map((turn) => turn.id)).toEqual(['target-greet', 'target-question']);
  });

  it('dedupes snapshot-style responses after caller turns', async () => {
    let observed = false;
    const result = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => {
          if (observed) return { turns: [] };
          observed = true;
          return { turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] };
        },
        send: async () => ({
          turns: [
            { id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' },
            { id: 'target-complete', actor: 'assistant', text: 'Your appointment is booked for a barber haircut with Norman tomorrow at 2 PM.' }
          ]
        })
      }),
      prepared: preparedRun,
      interaction: agenticInteraction({ termination: { maxTurns: 3, maxDurationMs: 1000 } }),
      startedAt: new Date().toISOString()
    });

    expect(result.callerSession.stopReason).toBe('completed');
    expect(result.callerSession.turns
      .filter((turn) => turn.actor === 'assistant')
      .map((turn) => turn.id)).toEqual(['target-option', 'target-complete']);
  });

  it('does not run immediate post-accept completion for duplicate response turns', async () => {
    let calls = 0;
    const provider = {
      id: 'test-provider',
      deterministic: true,
      async decide() {
        calls += 1;
        return calls === 1
          ? { action: 'accept' as const, text: 'That works for me.', rationale: 'accept the observed option' }
          : { action: 'end' as const, rationale: 'this should not run without a new target turn' };
      }
    };
    const result = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => ({ turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] }),
        send: async () => ({ turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] })
      }),
      prepared: preparedRun,
      interaction: agenticInteraction({
        interventionPolicy: { triggers: ['accept-valid-option', 'end-when-complete'] },
        termination: { maxTurns: 1, maxDurationMs: 1000 }
      }),
      provider,
      startedAt: new Date().toISOString()
    });

    expect(calls).toBe(1);
    expect(result.callerSession.stopReason).toBe('max-turns');
    expect(result.callerSession.decisions).toEqual([
      expect.objectContaining({ action: 'accept' })
    ]);
  });

  it('completes from an immediate post-accept confirmation on the final turn', async () => {
    const result = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => ({ turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] }),
        send: async () => ({
          turns: [{ id: 'target-complete', actor: 'assistant', text: 'No problem, your appointment is booked for a barber haircut with Norman tomorrow at 2 PM anything else?' }]
        })
      }),
      prepared: preparedRun,
      interaction: agenticInteraction({ termination: { maxTurns: 1, maxDurationMs: 1000 } }),
      startedAt: new Date().toISOString()
    });
    expect(result.callerSession.stopReason).toBe('completed');
    expect(result.callerSession.decisions).toEqual([
      expect.objectContaining({ action: 'accept' }),
      expect.objectContaining({ action: 'end' })
    ]);
  });

  it('does not use immediate completion after non-accept caller actions', async () => {
    const cases: Array<{
      expectedAction: 'answer' | 'correct' | 'ask_clarification' | 'verify';
      interaction?: PagodaMaterializedAgenticInteraction;
      observedText: string;
      completedText: string;
    }> = [
      {
        expectedAction: 'answer',
        observedText: 'Thanks for calling. How can I help?',
        completedText: 'Your appointment is booked for a barber haircut with Norman tomorrow at 2 PM.'
      },
      {
        expectedAction: 'correct',
        observedText: 'Time is 12 PM. Your appointment is pending.',
        completedText: 'Your appointment is booked for a barber haircut with Norman tomorrow at 2 PM.'
      },
      {
        expectedAction: 'ask_clarification',
        interaction: agenticInteraction({
          goal: {
            summary: 'Book the basic plan.',
            facts: { service: 'basic plan' },
            acceptableAlternatives: ['basic plan'],
            successCriteria: ['The basic plan is booked.']
          }
        }),
        observedText: 'I have a premium package available.',
        completedText: 'Your basic plan is booked.'
      },
      {
        expectedAction: 'verify',
        observedText: 'The process is completed.',
        completedText: 'Your appointment is booked for a barber haircut with Norman tomorrow at 2 PM.'
      }
    ];

    for (const testCase of cases) {
      const result = await runPagodaAgenticCallerSession({
        adapter: interactiveAdapter({
          observe: async () => ({ turns: [{ id: `target-${testCase.expectedAction}`, actor: 'assistant', text: testCase.observedText }] }),
          send: async () => ({ turns: [{ id: `target-complete-${testCase.expectedAction}`, actor: 'assistant', text: testCase.completedText }] })
        }),
        prepared: preparedRun,
        interaction: {
          ...(testCase.interaction ?? agenticInteraction()),
          termination: { maxTurns: 1, maxDurationMs: 1000 }
        },
        startedAt: new Date().toISOString()
      });

      expect(result.callerSession.stopReason).toBe('max-turns');
      expect(result.callerSession.decisions).toEqual([
        expect.objectContaining({ action: testCase.expectedAction })
      ]);
    }
  });

  it('keeps proposal-only agentic sessions terminal on accepted options', async () => {
    const result = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => ({ turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a safe next step available.' }] })
      }),
      prepared: preparedRun,
      interaction: agenticInteraction({
        goal: {
          summary: 'Find a safe next step.',
          facts: {},
          acceptableAlternatives: ['safe next step'],
          successCriteria: ['A safe next step is offered.']
        },
        interventionPolicy: {
          triggers: ['answer-question', 'ask-clarification', 'reject-out-of-policy', 'accept-valid-option', 'verify-confirmation']
        }
      }),
      startedAt: new Date().toISOString()
    });
    expect(result.callerSession.stopReason).toBe('completed');
    expect(result.callerSession.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'accept' })
    ]));
  });

  it('records startup timeout and adapter-failed stop reasons', async () => {
    const run = createPagodaRunPlan({
      targetId: 'demo-agent',
      projectRoot: '/repo',
      targetRoot: '/repo/targets/demo-agent',
      artifactDirectory: '/tmp/pagoda-artifacts/startup',
      scenario: { id: 'PGD-TEST', title: 'Test' } as never,
      evidenceMap: { id: 'PGD-TEST.map', scenarioId: 'PGD-TEST' } as never,
      contract: { id: 'PGD-TEST.contract', scenarioId: 'PGD-TEST' } as never,
      channel: 'browser-chat',
      interaction: agenticInteraction()
    });
    const timeout = await startAndRunPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        start: async () => new Promise((resolve) => {
          setTimeout(() => resolve(preparedRun), 20);
        })
      }),
      run,
      interaction: agenticInteraction({ termination: { maxTurns: 3, maxDurationMs: 1 } }),
      startedAt: new Date().toISOString()
    });
    expect(timeout.prepared).toBeUndefined();
    expect(timeout.callerSession.stopReason).toBe('timeout');
    expect(timeout.result.status).toBe('failed');
    expect(timeout.result.metadata).toMatchObject({
      agenticFailurePhase: 'startInteractive',
      adapterFailurePhase: 'startInteractive'
    });

    const adapterFailed = await startAndRunPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        start: async () => {
          throw new Error('start exploded');
        }
      }),
      run,
      interaction: agenticInteraction({
        interventionPolicy: {
          triggers: ['answer-question', 'ask-clarification', 'reject-out-of-policy', 'accept-valid-option', 'verify-confirmation']
        }
      }),
      startedAt: new Date().toISOString()
    });
    expect(adapterFailed.prepared).toBeUndefined();
    expect(adapterFailed.callerSession.stopReason).toBe('adapter-failed');
    expect(adapterFailed.result.status).toBe('failed');
    expect(adapterFailed.result.metadata).toMatchObject({
      agenticFailurePhase: 'startInteractive',
      adapterFailurePhase: 'startInteractive'
    });
  });

  it('passes abort signals to interactive adapter operations', async () => {
    const run = createPagodaRunPlan({
      targetId: 'demo-agent',
      projectRoot: '/repo',
      targetRoot: '/repo/targets/demo-agent',
      artifactDirectory: '/tmp/pagoda-artifacts/signals',
      scenario: { id: 'PGD-TEST', title: 'Test' } as never,
      evidenceMap: { id: 'PGD-TEST.map', scenarioId: 'PGD-TEST' } as never,
      contract: { id: 'PGD-TEST.contract', scenarioId: 'PGD-TEST' } as never,
      channel: 'browser-chat',
      interaction: agenticInteraction()
    });
    const signals: AbortSignal[] = [];
    const result = await startAndRunPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        start: async (options) => {
          if (options.signal) signals.push(options.signal);
          return preparedRun;
        },
        observe: async (options) => {
          if (options.signal) signals.push(options.signal);
          return { turns: [{ id: 'target-option', actor: 'assistant', text: 'I have a barber haircut with Norman tomorrow at 2 PM available.' }] };
        },
        send: async (_turnText, options) => {
          if (options.signal) signals.push(options.signal);
          return { turns: [] };
        },
        finish: async (options) => {
          if (options.signal) signals.push(options.signal);
          return targetRunResult();
        }
      }),
      run,
      interaction: agenticInteraction({
        interventionPolicy: {
          triggers: ['answer-question', 'ask-clarification', 'reject-out-of-policy', 'accept-valid-option', 'verify-confirmation']
        }
      }),
      startedAt: new Date().toISOString()
    });
    expect(result.callerSession.stopReason).toBe('completed');
    expect(signals).toHaveLength(4);
    expect(signals.every((signal) => signal.aborted === false)).toBe(true);
  });

  it('aborts in-flight startup and cleans up late prepared runs', async () => {
    const run = createPagodaRunPlan({
      targetId: 'demo-agent',
      projectRoot: '/repo',
      targetRoot: '/repo/targets/demo-agent',
      artifactDirectory: '/tmp/pagoda-artifacts/late-startup',
      scenario: { id: 'PGD-TEST', title: 'Test' } as never,
      evidenceMap: { id: 'PGD-TEST.map', scenarioId: 'PGD-TEST' } as never,
      contract: { id: 'PGD-TEST.contract', scenarioId: 'PGD-TEST' } as never,
      channel: 'browser-chat',
      interaction: agenticInteraction()
    });
    let signal: AbortSignal | undefined;
    let cleanupCount = 0;
    const adapter = interactiveAdapter({
      start: async (options) => {
        signal = options.signal;
        return new Promise((resolve) => {
          setTimeout(() => resolve(preparedRun), 200);
        });
      }
    });
    adapter.cleanup = async () => {
      cleanupCount += 1;
    };
    const timeout = await startAndRunPagodaAgenticCallerSession({
      adapter,
      run,
      interaction: agenticInteraction({ termination: { maxTurns: 3, maxDurationMs: 100 } }),
      startedAt: new Date().toISOString()
    });
    expect(timeout.callerSession.stopReason).toBe('timeout');
    expect(signal?.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 125));
    expect(cleanupCount).toBe(1);
  });

  it('records adapter-failed and provider-failed stop reasons', async () => {
    const adapterFailed = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter({
        observe: async () => {
          throw new Error('observe exploded');
        }
      }),
      prepared: preparedRun,
      interaction: agenticInteraction(),
      startedAt: new Date().toISOString()
    });
    expect(adapterFailed.callerSession.stopReason).toBe('adapter-failed');
    expect(adapterFailed.result.metadata).toMatchObject({
      agenticFailurePhase: 'observeTarget',
      adapterFailurePhase: 'observeTarget'
    });

    const providerFailed = await runPagodaAgenticCallerSession({
      adapter: interactiveAdapter(),
      prepared: preparedRun,
      interaction: agenticInteraction(),
      startedAt: new Date().toISOString(),
      provider: {
        id: 'failing-provider',
        deterministic: true,
        async decide() {
          throw new Error('provider exploded');
        }
      }
    });
    expect(providerFailed.callerSession.stopReason).toBe('provider-failed');
    expect(providerFailed.result.metadata).toMatchObject({
      agenticFailurePhase: 'callerProvider',
      adapterFailurePhase: 'callerProvider'
    });
  });
});
