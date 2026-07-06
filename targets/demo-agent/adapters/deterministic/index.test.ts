import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { materializePagodaInteraction, type PagodaScenario } from '@petitbon/pagoda-core';
import type { PagodaRunPlan } from '@petitbon/pagoda-adapter-sdk';
import { pagodaTargetAdapter } from './index.js';

describe('@petitbon/pagoda-target-demo-agent deterministic adapter', () => {
  it('reports ready health', async () => {
    await expect(pagodaTargetAdapter.healthCheck()).resolves.toMatchObject({
      status: 'ready'
    });
  });

  it('materializes the bundled interaction deterministically for a fixed seed', async () => {
    const scenario = JSON.parse(await readFile(
      '../../targets/demo-agent/docs/pagoda/scenarios/demo-proposal-presented-001.scenario.json',
      'utf8'
    )) as PagodaScenario;
    const first = materializePagodaInteraction({
      scenarioId: scenario.id,
      channel: 'browser-chat',
      seed: 'fixed',
      interaction: scenario.interaction as never,
      caseSelector: 'case-001'
    });
    const second = materializePagodaInteraction({
      scenarioId: scenario.id,
      channel: 'browser-chat',
      seed: 'fixed',
      interaction: scenario.interaction as never,
      caseSelector: 'case-001'
    });
    expect(second).toEqual(first);
    expect(first.turns[0].text).toContain(String(first.slots.urgency));
  });

  it('preserves run interaction in metadata and stdout', async () => {
    const run = {
      runId: 'pagoda-run:test',
      targetId: 'demo-agent',
      projectRoot: '/repo',
      targetRoot: '/repo/targets/demo-agent',
      artifactDirectory: '/repo/artifacts/test',
      scenario: { id: 'DEMO-PROPOSAL-PRESENTED-001' },
      evidenceMap: {},
      contract: {},
      channel: 'browser-chat',
      interaction: {
        caseId: 'case-001',
        seed: 'fixed',
        slots: { urgency: 'standard' },
        turns: [{
          id: 'request-proposal',
          actor: 'user',
          text: 'Please give me a standard safe proposal.',
          template: 'Please give me a {urgency} safe proposal.'
        }]
      }
    } as PagodaRunPlan;
    const prepared = await pagodaTargetAdapter.prepare(run);
    const result = await pagodaTargetAdapter.execute(prepared);
    expect(prepared.metadata).toMatchObject({ interaction: run.interaction });
    expect(result.metadata).toMatchObject({ interaction: run.interaction });
    expect(result.stdout).toContain('case-001');
    expect(result.stdout).toContain('Please give me a standard safe proposal.');
    await pagodaTargetAdapter.cleanup?.(prepared);
  });
});
