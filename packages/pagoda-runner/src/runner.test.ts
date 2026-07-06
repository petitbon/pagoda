import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildRunArtifactDirectory,
  createPagodaRunPlan,
  readRunArtifactBundle,
  writeRunArtifactBundle
} from './index.js';
import type { CanonicalEvidenceObservationSet, PagodaMaterializedInteraction, PagodaOracleEvaluationResult } from '@petitbon/pagoda-core';

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
        missingCorrelation: []
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
        logs: { stderr: 'missing env' }
      });
      const bundle = await readRunArtifactBundle(directory);
      expect(Object.values(manifest.files).sort()).toContain('oracle-result.json');
      expect(bundle.manifest.runId).toBe(plan.runId);
      expect(bundle.oracleResult.status).toBe('SETUP_FAILED');
      expect(bundle.canonicalObservation.collectorStatus).toBe('SETUP_FAILED');
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
        missingCorrelation: []
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
});
