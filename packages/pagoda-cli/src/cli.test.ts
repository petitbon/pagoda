import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { chdir, cwd } from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { main, readCliVersion } from './cli/main.js';
import { defaultTargetId } from './commands/init.js';
import { resolveInputPath, resolveRootContext } from './target-pack/context.js';
import { validateTargetManifestStructure } from './target-pack/validation.js';
import { starterAdapter } from './generators/adapter.js';
import { starterEvidenceMap, starterScenario } from './generators/scenario.js';
import { missingAdapterInteractionCapabilities } from './target-pack/capabilities.js';

async function withTempDir<T>(fn: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'pagoda-cli-'));
  try {
    return await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
    process.exitCode = undefined;
  }
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (value?: unknown) => {
    logs.push(String(value));
  };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return logs;
}

describe('@petitbon/pagoda-cli', () => {
  it('prints help and version without requiring a target pack', async () => {
    await withTempDir(async (directory) => {
      const previous = cwd();
      chdir(directory);
      try {
        const helpLogs = await captureLogs(async () => {
          await main(['--help']);
        });
        expect(helpLogs.join('\n')).toContain('pagoda init [--root <path>] [--name <name>]');

        const versionLogs = await captureLogs(async () => {
          await main(['--version']);
        });
        expect(versionLogs.join('\n')).toMatch(/^\d+\.\d+\.\d+/);
      } finally {
        chdir(previous);
      }
    });
  });

  it('reads CLI version in workspace and standalone bundle layouts', async () => {
    await withTempDir(async (directory) => {
      const workspacePackage = join(directory, 'workspace-package.json');
      await writeFile(workspacePackage, JSON.stringify({ version: '1.2.3' }), 'utf8');
      await mkdir(join(directory, 'dist', 'cli'), { recursive: true });
      await rename(workspacePackage, join(directory, 'package.json'));
      expect(readCliVersion(pathToFileURL(join(directory, 'dist', 'cli', 'main.js')).href)).toBe('1.2.3');

      const standaloneRoot = join(directory, 'standalone');
      await mkdir(join(standaloneRoot, 'dist'), { recursive: true });
      await writeFile(join(standaloneRoot, 'package.json'), JSON.stringify({ version: '2.3.4' }), 'utf8');
      expect(readCliVersion(pathToFileURL(join(standaloneRoot, 'dist', 'index.js')).href)).toBe('2.3.4');
    });
  });

  it('resolves root-relative paths when invoked from the CLI workspace', () => {
    const previous = cwd();
    chdir(fileURLToPath(new URL('..', import.meta.url)));
    try {
      expect(resolveInputPath('targets/demo-agent/pagoda.target.json')).toMatch(/\/pagoda\/targets\/demo-agent\/pagoda\.target\.json$/);
      expect(resolveInputPath('package.json')).toMatch(/\/pagoda\/packages\/pagoda-cli\/package\.json$/);
    } finally {
      chdir(previous);
    }
  });

  it('defaults init project id from the observed repo directory', async () => {
    await withTempDir(async (directory) => {
      expect(defaultTargetId(join(directory, 'Product Agent', '.pagoda'))).toBe('product-agent');

      const root = join(directory, 'Product Agent', '.pagoda');
      const logs = await captureLogs(async () => {
        await main(['init', '--root', root]);
      });
      expect(JSON.parse(logs.join('\n'))).toMatchObject({
        projectId: 'product-agent',
        scenarioId: 'PRODUCT-AGENT-SAFE-PROPOSAL-001'
      });
      await expect(readFile(join(root, 'pagoda.target.json'), 'utf8')).resolves.toContain('"id": "product-agent"');

      const cwdRoot = join(directory, 'No Target App');
      await mkdir(cwdRoot, { recursive: true });
      const previous = cwd();
      chdir(cwdRoot);
      try {
        const cwdLogs = await captureLogs(async () => {
          await main(['init']);
        });
        expect(JSON.parse(cwdLogs.join('\n'))).toMatchObject({
          projectId: 'no-target-app',
          scenarioId: 'NO-TARGET-APP-SAFE-PROPOSAL-001'
        });
        await expect(readFile(join(cwdRoot, '.pagoda', 'pagoda.target.json'), 'utf8')).resolves.toContain('"id": "no-target-app"');
      } finally {
        chdir(previous);
      }
    });
  });

  it('detects duplicate target mappings and undeclared channels', () => {
    const errors = validateTargetManifestStructure({
      targetRoot: '/missing',
      manifest: {
        schemaVersion: 'pagoda.target',
        id: 'test',
        name: 'Test',
        paths: {
          scenarios: 'scenarios',
          evidenceMaps: 'maps',
          contracts: 'contracts'
        },
        channels: ['browser-chat'],
        adapter: {
          kind: 'node',
          entrypoint: 'adapter.ts'
        },
        scenarioMappings: [
          { pagodaScenarioId: 'PGD-1', targetEvaluatorId: 'EDD-1' },
          { pagodaScenarioId: 'PGD-1', targetEvaluatorId: 'EDD-2' }
        ]
      },
      scenarios: [{
        path: 'scenarios/pgd-1.scenario.json',
        hash: 'sha256:test',
        scenario: { id: 'PGD-1', labels: { channels: ['phone'] } } as never
      }],
      maps: [{
        path: 'maps/pgd-1.evidence-map.json',
        hash: 'sha256:test',
        evidenceMap: { scenarioId: 'PGD-1' } as never
      }]
    });
    expect(errors).toContain('PGD-1: scenario channel phone is not declared by target manifest');
    expect(errors).toContain('scenarioMappings[1].pagodaScenarioId duplicates PGD-1');
  });

  it('reports adapter health for the workspace demo project', async () => {
    const logs = await captureLogs(async () => {
      await main(['check']);
    });
    expect(JSON.parse(logs.join('\n'))).toMatchObject({
      projectId: 'demo-agent',
      health: {
        status: 'ready'
      }
    });

    await expect(main(['check', '--target', 'missing-target'])).rejects.toThrow(/missing-target: target manifest does not exist/);
  });

  it('initializes, validates, runs, replays, and reports a direct .pagoda target pack', async () => {
    await withTempDir(async (directory) => {
      const projectRoot = join(directory, 'sample-agent');
      const root = join(projectRoot, '.pagoda');
      const initLogs = await captureLogs(async () => {
        await main(['init', '--root', root, '--name', 'Sample Agent']);
      });
      expect(JSON.parse(initLogs.join('\n'))).toMatchObject({
        projectId: 'sample-agent',
        pagodaVersion: expect.stringMatching(/^\d+\.\d+\.\d+/),
        scenarioId: 'SAMPLE-AGENT-SAFE-PROPOSAL-001',
        agentSkill: join(projectRoot, '.agents', 'skills', 'pagoda', 'SKILL.md')
      });
      await expect(readFile(join(root, 'pagoda.target.json'), 'utf8')).resolves.toContain('"id": "sample-agent"');
      await expect(readFile(join(root, 'pagoda.target.json'), 'utf8')).resolves.toMatch(/"pagodaVersion": "\d+\.\d+\.\d+"/);
      await expect(readFile(join(root, 'adapters/sample-agent-local/index.mjs'), 'utf8')).resolves.toContain("targetId: 'sample-agent'");
      await expect(readFile(join(root, 'adapters/sample-agent-local/pagoda.adapter.json'), 'utf8')).resolves.toContain('"schemaVersion": "pagoda.adapter"');
      await expect(readFile(join(root, 'scenarios/sample-agent-safe-proposal-001/scenario.json'), 'utf8')).resolves.toContain('"id": "SAMPLE-AGENT-SAFE-PROPOSAL-001"');
      await expect(readFile(join(root, 'scenarios/sample-agent-safe-proposal-001/scenario.json'), 'utf8')).resolves.toContain('"interaction"');
      await expect(readFile(join(root, 'scenarios/sample-agent-safe-proposal-001/evidence-map.json'), 'utf8')).resolves.toContain('"scenarioId": "SAMPLE-AGENT-SAFE-PROPOSAL-001"');
      const skillText = await readFile(join(projectRoot, '.agents', 'skills', 'pagoda', 'SKILL.md'), 'utf8');
      const templateSkillText = await readFile(fileURLToPath(new URL('../templates/agents/skills/pagoda/SKILL.md', import.meta.url)), 'utf8');
      expect(skillText).toBe(templateSkillText);
      expect(skillText).toContain('name: pagoda');
      expect(skillText).toContain('pagoda compile --root .pagoda');
      expect(skillText).toContain('AUDIBLE_RESPONSE');
      const skillUiText = await readFile(join(projectRoot, '.agents', 'skills', 'pagoda', 'agents', 'openai.yaml'), 'utf8');
      const templateSkillUiText = await readFile(fileURLToPath(new URL('../templates/agents/skills/pagoda/agents/openai.yaml', import.meta.url)), 'utf8');
      expect(skillUiText).toBe(templateSkillUiText);
      expect(skillUiText).toContain('display_name: "Pagoda"');
      const envFile = await readFile(join(root, '.env'), 'utf8');
      expect(envFile).toContain('AGENTIS_BROWSER_CHAT_BASE_URL=http://localhost:8080');
      expect(envFile).toContain('AGENTIS_BROWSER_CHAT_LOCATION_ID=<location-id>');
      expect(envFile).toContain('AGENTIS_BROWSER_CHAT_PAGE_URL=https://<allowed-origin>/');
      const gitignore = await readFile(join(root, '.gitignore'), 'utf8');
      expect(gitignore).toContain('artifacts/');
      expect(gitignore).toContain('reports/');
      expect(gitignore).toContain('traces/*.debug.json');
      expect(gitignore).toContain('.env.*');
      const contractPath = join(root, 'contracts/SAMPLE-AGENT-SAFE-PROPOSAL-001.outcome-contract.json');
      const contract = JSON.parse(await readFile(contractPath, 'utf8'));
      contract.generatedFrom.pagodaCoreVersion = '0.0.0';
      await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');

      const validateLogs = await captureLogs(async () => {
        await main(['validate', '--root', root]);
      });
      expect(validateLogs.join('\n')).toContain('Validated sample-agent: 1 scenario(s), 1 evidence map(s), 1 outcome contract(s).');

      const healthLogs = await captureLogs(async () => {
        await main(['check', '--root', root]);
      });
      expect(JSON.parse(healthLogs.join('\n'))).toMatchObject({
        projectId: 'sample-agent',
        adapter: {
          id: 'sample-agent-local'
        },
        health: { status: 'ready' }
      });

      const adapterListLogs = await captureLogs(async () => {
        await main(['adapter', 'list', '--root', root]);
      });
      expect(JSON.parse(adapterListLogs.join('\n'))).toMatchObject({
        projectId: 'sample-agent',
        defaultAdapter: 'sample-agent-local',
        adapters: expect.arrayContaining([
          expect.objectContaining({ id: 'replay', channel: null }),
          expect.objectContaining({ id: 'sample-agent-local', channel: 'browser-chat' })
        ])
      });

      await writeFile(join(projectRoot, '.agents', 'skills', 'pagoda', 'SKILL.md'), 'custom skill\n', 'utf8');
      const preservedSkillLogs = await captureLogs(async () => {
        await main(['codex', 'install', '--root', root]);
      });
      expect(JSON.parse(preservedSkillLogs.join('\n'))).toMatchObject({
        projectId: 'sample-agent',
        status: 'already-exists'
      });
      await expect(readFile(join(projectRoot, '.agents', 'skills', 'pagoda', 'SKILL.md'), 'utf8')).resolves.toBe('custom skill\n');

      const forcedSkillLogs = await captureLogs(async () => {
        await main(['codex', 'install', '--root', root, '--force']);
      });
      expect(JSON.parse(forcedSkillLogs.join('\n'))).toMatchObject({
        projectId: 'sample-agent',
        status: 'installed'
      });
      await expect(readFile(join(projectRoot, '.agents', 'skills', 'pagoda', 'SKILL.md'), 'utf8')).resolves.toBe(templateSkillText);

      const runLogs = await captureLogs(async () => {
        await main(['run', '--root', root, '--scenario', 'SAMPLE-AGENT-SAFE-PROPOSAL-001', '--channel', 'browser-chat', '--reporter', 'json']);
      });
      const run = JSON.parse(runLogs.join('\n')) as { artifactDirectory: string; interactionCaseId?: string; oracle: { status: string } };
      expect(run.oracle.status).toBe('PASS');
      expect(run.interactionCaseId).toMatch(/^case-\d{3}$/);
      expect(run.artifactDirectory).toContain(join(root, 'artifacts/runs'));
      await expect(readFile(join(run.artifactDirectory, 'interaction.json'), 'utf8')).resolves.toContain(run.interactionCaseId as string);

      const replayLogs = await captureLogs(async () => {
        await main(['replay', '--root', root, '--artifact', run.artifactDirectory]);
      });
      expect(JSON.parse(replayLogs.join('\n'))).toMatchObject({
        savedStatus: 'PASS',
        replayedStatus: 'PASS',
        matches: true
      });

      const reportLogs = await captureLogs(async () => {
        await main(['report', '--root', root, '--artifact', run.artifactDirectory]);
      });
      expect(reportLogs.join('\n')).toContain('report.md');
    });
  });

  it('runs all active scenarios in a target pack', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root, '--name', 'Sample Agent']);
      });

      const scenarioPath = join(root, 'scenarios', 'sample-agent-safe-proposal-001', 'scenario.json');
      const evidenceMapPath = join(root, 'scenarios', 'sample-agent-safe-proposal-001', 'evidence-map.json');
      const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
      const evidenceMap = JSON.parse(await readFile(evidenceMapPath, 'utf8'));
      scenario.id = 'SAMPLE-AGENT-SAFE-PROPOSAL-002';
      scenario.title = 'sample-agent presents a second safe proposal';
      scenario.harness.selectedCase = 'SAMPLE-AGENT-SAFE-PROPOSAL-002.case';
      evidenceMap.id = scenario.id;
      evidenceMap.scenarioId = scenario.id;
      evidenceMap.outcomeContractId = scenario.id;
      evidenceMap.title = 'sample-agent second safe proposal evidence map';
      await import('node:fs/promises').then(({ mkdir }) => mkdir(join(root, 'scenarios', 'sample-agent-safe-proposal-002'), { recursive: true }));
      await writeFile(join(root, 'scenarios', 'sample-agent-safe-proposal-002', 'scenario.json'), `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');
      await writeFile(join(root, 'scenarios', 'sample-agent-safe-proposal-002', 'evidence-map.json'), `${JSON.stringify(evidenceMap, null, 2)}\n`, 'utf8');

      await captureLogs(async () => {
        await main(['compile', '--root', root]);
      });
      const logs = await captureLogs(async () => {
        await main(['run', '--root', root, '--channel', 'browser-chat', '--concurrency', '2', '--reporter', 'json']);
      });
      const summary = JSON.parse(logs.join('\n')) as {
        projectId: string;
        total: number;
        passed: number;
        failed: number;
        runs: Array<{ scenarioId: string; oracle: { status: string } }>;
      };
      expect(summary.projectId).toBe('sample-agent');
      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(0);
      expect(summary.runs.map((run) => run.scenarioId)).toEqual([
        'SAMPLE-AGENT-SAFE-PROPOSAL-001',
        'SAMPLE-AGENT-SAFE-PROPOSAL-002'
      ]);
      expect(summary.runs.every((run) => run.oracle.status === 'PASS')).toBe(true);

      const reporterLogs = await captureLogs(async () => {
        await main(['run', '--root', root, '--channel', 'browser-chat']);
      });
      expect(reporterLogs.length).toBeGreaterThan(1);
      expect(reporterLogs[0]).toContain('RUN  sample-agent');
      expect(reporterLogs[1]).toContain('✓ SAMPLE-AGENT-SAFE-PROPOSAL-001');
      expect(reporterLogs[2]).toContain('✓ SAMPLE-AGENT-SAFE-PROPOSAL-002');
      expect(reporterLogs.join('\n')).toContain('RUN  sample-agent');
      expect(reporterLogs.join('\n')).toContain('✓ SAMPLE-AGENT-SAFE-PROPOSAL-001');
      expect(reporterLogs.join('\n')).toContain('adapter completed');
      expect(reporterLogs.join('\n')).toContain('(4/4 clauses, 4 accepted evidence)');
      expect(reporterLogs[reporterLogs.length - 1]).toContain('Scenarios  2 passed (2)');
      expect(reporterLogs[reporterLogs.length - 1]).toContain('Evidence  8 accepted | 0 rejected | 2 setup');
    });
  });

  it('reports adapter failure diagnostics in json, terminal output, and artifacts', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root, '--name', 'Sample Agent']);
      });

      await writeFile(join(root, 'adapters/sample-agent-local/index.mjs'), `
const runs = new Map();

const adapter = {
  targetId: 'sample-agent',
  async healthCheck() {
    return { status: 'ready', message: 'diagnostic adapter ready', evidenceSources: ['transcript'] };
  },
  async prepare(run) {
    runs.set(run.runId, run);
    return { runId: run.runId, targetId: run.targetId, artifactDirectory: run.artifactDirectory };
  },
  async execute(prepared) {
    return {
      runId: prepared.runId,
      status: 'failed',
      stdout: '',
      stderr: 'create browser chat session failed with HTTP 502: Session Ledger request failed',
      exitCode: 1,
      metadata: {
        adapterFailure: {
          phase: 'execute',
          category: 'dependency',
          dependency: 'session-ledger',
          message: 'Session Ledger request failed: 500 Internal Server Error'
        }
      }
    };
  },
  async collectObservations() {
    return {
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
    };
  },
  async cleanup(prepared) {
    runs.delete(prepared.runId);
  }
};

export default adapter;
`, 'utf8');

      const jsonLogs = await captureLogs(async () => {
        const result = await main(['run', '--root', root, '--scenario', 'SAMPLE-AGENT-SAFE-PROPOSAL-001', '--channel', 'browser-chat', '--reporter', 'json']);
        expect(result.exitCode).toBe(1);
      });
      const run = JSON.parse(jsonLogs.join('\n')) as {
        artifactDirectory: string;
        adapterFailure: { phase: string; category: string; dependency: string; message: string };
        oracle: { status: string };
      };
      expect(run.oracle.status).toBe('SETUP_FAILED');
      expect(run.adapterFailure).toMatchObject({
        phase: 'execute',
        category: 'dependency',
        dependency: 'session-ledger',
        message: 'Session Ledger request failed: 500 Internal Server Error'
      });

      const manifest = JSON.parse(await readFile(join(run.artifactDirectory, 'run.json'), 'utf8'));
      expect(manifest.adapterFailure).toMatchObject(run.adapterFailure);
      const report = await readFile(join(run.artifactDirectory, 'report.md'), 'utf8');
      expect(report).toContain('- Adapter Failure: execute category=dependency dependency=session-ledger - Session Ledger request failed: 500 Internal Server Error');

      const terminalLogs = await captureLogs(async () => {
        const result = await main(['run', '--root', root, '--scenario', 'SAMPLE-AGENT-SAFE-PROPOSAL-001', '--channel', 'browser-chat']);
        expect(result.exitCode).toBe(1);
      });
      expect(terminalLogs.join('\n')).toContain('Adapter: execute  category=dependency  dependency=session-ledger  Session Ledger request failed: 500 Internal Server Error');
    });
  });

  it('runs active browser-chat and phone scenarios when channel is omitted', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root, '--name', 'Sample Agent']);
      });

      const manifestPath = join(root, 'pagoda.target.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.channels = ['browser-chat', 'phone'];
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      const phoneScenario = starterScenario('sample-agent', 'phone');
      phoneScenario.id = 'SAMPLE-AGENT-PHONE-SAFE-PROPOSAL-001';
      phoneScenario.title = 'sample-agent presents a phone safe proposal';
      phoneScenario.harness.selectedCase = 'SAMPLE-AGENT-PHONE-SAFE-PROPOSAL-001.case';
      const phoneEvidenceMap = starterEvidenceMap('sample-agent', phoneScenario);
      const phoneScenarioRoot = join(root, 'scenarios', 'sample-agent-phone-safe-proposal-001');
      await mkdir(phoneScenarioRoot, { recursive: true });
      await writeFile(join(phoneScenarioRoot, 'scenario.json'), `${JSON.stringify(phoneScenario, null, 2)}\n`, 'utf8');
      await writeFile(join(phoneScenarioRoot, 'evidence-map.json'), `${JSON.stringify(phoneEvidenceMap, null, 2)}\n`, 'utf8');

      const phoneAdapterRoot = join(root, 'adapters', 'sample-agent-phone');
      await mkdir(phoneAdapterRoot, { recursive: true });
      await writeFile(join(phoneAdapterRoot, 'index.mjs'), starterAdapter('sample-agent', 'phone'), 'utf8');
      await writeFile(join(phoneAdapterRoot, 'pagoda.adapter.json'), `${JSON.stringify({
        schemaVersion: 'pagoda.adapter',
        id: 'sample-agent-phone',
        targetId: 'sample-agent',
        name: 'Sample Agent Phone Adapter',
        channel: 'phone',
        kind: 'node',
        entrypoint: './index.mjs',
        producesEvidenceCodes: [
          'SAMPLE-AGENT_PROPOSAL_PRESENTED',
          'SAMPLE-AGENT_SAFE_PROPOSAL_RECORDED',
          'SAMPLE-AGENT_SESSION_CONTEXT',
          'SAMPLE-AGENT_AUDIBLE_RESPONSE',
          'SAMPLE-AGENT_SETUP_READY'
        ],
        requiresEnv: []
      }, null, 2)}\n`, 'utf8');

      await captureLogs(async () => {
        await main(['compile', '--root', root]);
      });
      const logs = await captureLogs(async () => {
        await main(['run', '--root', root, '--reporter', 'json']);
      });
      const summary = JSON.parse(logs.join('\n')) as {
        channel: string | null;
        total: number;
        passed: number;
        failed: number;
        runs: Array<{ scenarioId: string; channel: string; oracle: { status: string } }>;
      };
      expect(summary.channel).toBeNull();
      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(0);
      expect(summary.runs.map((run) => `${run.scenarioId}:${run.channel}`)).toEqual([
        'SAMPLE-AGENT-PHONE-SAFE-PROPOSAL-001:phone',
        'SAMPLE-AGENT-SAFE-PROPOSAL-001:browser-chat'
      ]);
      expect(summary.runs.every((run) => run.oracle.status === 'PASS')).toBe(true);
    });
  });

  it('runs every declared channel for a selected scenario when channel is omitted', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root, '--name', 'Sample Agent']);
      });

      const manifestPath = join(root, 'pagoda.target.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.channels = ['browser-chat', 'phone'];
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      const scenarioPath = join(root, 'scenarios', 'sample-agent-safe-proposal-001', 'scenario.json');
      const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
      scenario.labels.channels = ['browser-chat', 'phone'];
      scenario.channelContracts.channels.phone = {
        requiredEvidenceCodes: ['SAMPLE-AGENT_AUDIBLE_RESPONSE'],
        oracleClauses: ['safe proposal is audible to the caller']
      };
      await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');

      const phoneAdapterRoot = join(root, 'adapters', 'sample-agent-phone');
      await mkdir(phoneAdapterRoot, { recursive: true });
      await writeFile(join(phoneAdapterRoot, 'index.mjs'), starterAdapter('sample-agent', 'phone'), 'utf8');
      await writeFile(join(phoneAdapterRoot, 'pagoda.adapter.json'), `${JSON.stringify({
        schemaVersion: 'pagoda.adapter',
        id: 'sample-agent-phone',
        targetId: 'sample-agent',
        name: 'Sample Agent Phone Adapter',
        channel: 'phone',
        kind: 'node',
        entrypoint: './index.mjs',
        producesEvidenceCodes: [
          'SAMPLE-AGENT_PROPOSAL_PRESENTED',
          'SAMPLE-AGENT_SAFE_PROPOSAL_RECORDED',
          'SAMPLE-AGENT_SESSION_CONTEXT',
          'SAMPLE-AGENT_AUDIBLE_RESPONSE',
          'SAMPLE-AGENT_SETUP_READY'
        ],
        requiresEnv: []
      }, null, 2)}\n`, 'utf8');

      await captureLogs(async () => {
        await main(['compile', '--root', root]);
      });
      const logs = await captureLogs(async () => {
        await main(['run', '--root', root, '--scenario', 'SAMPLE-AGENT-SAFE-PROPOSAL-001', '--reporter', 'json']);
      });
      const summary = JSON.parse(logs.join('\n')) as {
        channel: string | null;
        total: number;
        passed: number;
        failed: number;
        runs: Array<{ scenarioId: string; channel: string; oracle: { status: string } }>;
      };
      expect(summary.channel).toBeNull();
      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(0);
      expect(summary.runs.map((run) => `${run.scenarioId}:${run.channel}`)).toEqual([
        'SAMPLE-AGENT-SAFE-PROPOSAL-001:browser-chat',
        'SAMPLE-AGENT-SAFE-PROPOSAL-001:phone'
      ]);
      expect(summary.runs.every((run) => run.oracle.status === 'PASS')).toBe(true);
    });
  });

  it('creates scenario bundles and reports adapter capability gaps', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root]);
      });

      const createLogs = await captureLogs(async () => {
        await main([
          'scenario',
          'create',
          '--root',
          root,
          '--id',
          'SAMPLE-AGENT-LOCATION-ANSWER-001',
          '--title',
          'Location answer',
          '--channel',
          'browser-chat'
        ]);
      });
      expect(JSON.parse(createLogs.join('\n'))).toMatchObject({
        projectId: 'sample-agent',
        scenarioId: 'SAMPLE-AGENT-LOCATION-ANSWER-001',
        evidenceRegistry: 'evidence/registry.json'
      });
      await expect(readFile(join(root, 'scenarios/sample-agent-location-answer-001/scenario.json'), 'utf8')).resolves.toContain('SAMPLE-AGENT_LOCATION_ANSWER_PROVEN');
      await expect(readFile(join(root, 'scenarios/sample-agent-location-answer-001/scenario.json'), 'utf8')).resolves.toContain('"interaction"');
      await expect(readFile(join(root, 'contracts/SAMPLE-AGENT-LOCATION-ANSWER-001.outcome-contract.json'), 'utf8')).resolves.toContain('SAMPLE-AGENT_LOCATION_ANSWER_PROVEN');
      await expect(readFile(join(root, 'contracts/SAMPLE-AGENT-LOCATION-ANSWER-001.outcome-contract.json'), 'utf8')).resolves.toContain('"interaction"');
      await expect(readFile(join(root, 'contracts/SAMPLE-AGENT-LOCATION-ANSWER-001.outcome-contract.json'), 'utf8')).resolves.toMatch(/"pagodaCoreVersion": "\d+\.\d+\.\d+"/);
      await expect(readFile(join(root, 'evidence/registry.json'), 'utf8')).resolves.toContain('SAMPLE-AGENT_LOCATION_ANSWER_PROVEN');

      const validateLogs = await captureLogs(async () => {
        await main(['validate', '--root', root]);
      });
      expect(validateLogs.join('\n')).toContain('Validated sample-agent: 2 scenario(s), 2 evidence map(s), 2 outcome contract(s).');

      let failingCheckExitCode = 0;
      const failingCheckLogs = await captureLogs(async () => {
        const result = await main(['adapter', 'check', '--root', root, '--adapter', 'sample-agent-local', '--scenario', 'SAMPLE-AGENT-LOCATION-ANSWER-001']);
        failingCheckExitCode = result.exitCode;
      });
      const failingCheck = JSON.parse(failingCheckLogs.join('\n'));
      expect(failingCheck.capability).toMatchObject({
        status: 'missing-capabilities',
        missingEvidenceCodes: [
          'SAMPLE-AGENT_LOCATION_ANSWER_PROVEN',
          'SAMPLE-AGENT_LOCATION_ANSWER_RECORDED'
        ]
      });
      expect(failingCheckExitCode).toBe(1);

      const replayCheckLogs = await captureLogs(async () => {
        await main(['adapter', 'check', '--root', root, '--adapter', 'replay', '--scenario', 'SAMPLE-AGENT-LOCATION-ANSWER-001']);
      });
      expect(JSON.parse(replayCheckLogs.join('\n')).capability).toMatchObject({
        status: 'ready',
        missingEvidenceCodes: []
      });
    });
  });

  it('can create legacy-style scenarios without generated interaction', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root]);
      });

      await captureLogs(async () => {
        await main([
          'scenario',
          'create',
          '--root',
          root,
          '--id',
          'SAMPLE-AGENT-LEGACY-001',
          '--title',
          'Legacy scenario',
          '--channel',
          'browser-chat',
          '--interaction',
          'none'
        ]);
      });
      const scenarioText = await readFile(join(root, 'scenarios/sample-agent-legacy-001/scenario.json'), 'utf8');
      expect(scenarioText).not.toContain('"interaction"');
      await expect(captureLogs(async () => {
        await main(['run', '--root', root, '--scenario', 'SAMPLE-AGENT-LEGACY-001', '--interaction-case', 'case-001', '--reporter', 'json']);
      })).rejects.toThrow(/has no interaction/);
    });
  });

  it('can create agentic scenarios and reports missing interactive adapter support', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root]);
      });

      await captureLogs(async () => {
        await main([
          'scenario',
          'create',
          '--root',
          root,
          '--id',
          'SAMPLE-AGENT-AGENTIC-CALLER-001',
          '--title',
          'Agentic caller',
          '--channel',
          'browser-chat',
          '--interaction',
          'agentic'
        ]);
      });
      const scenarioText = await readFile(join(root, 'scenarios/sample-agent-agentic-caller-001/scenario.json'), 'utf8');
      expect(scenarioText).toContain('"mode": "agentic"');
      expect(scenarioText).toContain('"interventionPolicy"');
      expect(scenarioText).toContain('{urgency}');
      expect(scenarioText).toContain('{flexibility}');
      expect(scenarioText).not.toContain('"stopOn"');

      let checkExitCode = 0;
      const checkLogs = await captureLogs(async () => {
        const result = await main(['adapter', 'check', '--root', root, '--adapter', 'replay', '--scenario', 'SAMPLE-AGENT-AGENTIC-CALLER-001']);
        checkExitCode = result.exitCode;
      });
      const check = JSON.parse(checkLogs.join('\n'));
      expect(check.capability).toMatchObject({
        status: 'missing-capabilities',
        requiredInteractionMode: 'agentic',
        missingInteractionModes: ['agentic']
      });
      expect(checkExitCode).toBe(1);

      const scenario = JSON.parse(scenarioText);
      expect(scenario.interaction.goal.facts).toBeUndefined();
      expect(missingAdapterInteractionCapabilities(undefined, scenario)).toEqual(['agentic']);

      const replayManifestPath = join(root, 'adapters', 'replay', 'pagoda.adapter.json');
      const replayManifest = JSON.parse(await readFile(replayManifestPath, 'utf8'));
      replayManifest.interactionModes = ['agentic'];
      await writeFile(replayManifestPath, `${JSON.stringify(replayManifest, null, 2)}\n`, 'utf8');
      let implementationCheckExitCode = 0;
      const implementationCheckLogs = await captureLogs(async () => {
        const result = await main(['adapter', 'check', '--root', root, '--adapter', 'replay', '--scenario', 'SAMPLE-AGENT-AGENTIC-CALLER-001']);
        implementationCheckExitCode = result.exitCode;
      });
      const implementationCheck = JSON.parse(implementationCheckLogs.join('\n'));
      expect(implementationCheck.capability).toMatchObject({
        status: 'missing-capabilities',
        missingInteractionModes: [],
        missingInteractionImplementation: true
      });
      expect(implementationCheckExitCode).toBe(1);
    });
  });

  it('runs an agentic scenario with an interactive adapter and freezes the caller session', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root]);
      });
      await captureLogs(async () => {
        await main([
          'scenario',
          'create',
          '--root',
          root,
          '--id',
          'SAMPLE-AGENT-AGENTIC-RUN-001',
          '--title',
          'Agentic run',
          '--channel',
          'browser-chat',
          '--interaction',
          'agentic'
        ]);
      });

      const adapterRoot = join(root, 'adapters', 'agentic-local');
      await mkdir(adapterRoot, { recursive: true });
      await writeFile(join(adapterRoot, 'pagoda.adapter.json'), `${JSON.stringify({
        schemaVersion: 'pagoda.adapter',
        id: 'agentic-local',
        targetId: 'sample-agent',
        channel: 'browser-chat',
        kind: 'node',
        entrypoint: './index.mjs',
        interactionModes: ['generated', 'agentic'],
        producesEvidenceCodes: ['*'],
        requiresEnv: []
      }, null, 2)}\n`, 'utf8');
      await writeFile(join(adapterRoot, 'index.mjs'), `
const runs = new Map();
const sentTurns = new Map();

const adapter = {
  targetId: 'sample-agent',
  async healthCheck() {
    return { status: 'ready', message: 'agentic local ready', evidenceSources: ['transcript'] };
  },
  async prepare(run) {
    runs.set(run.runId, run);
    return { runId: run.runId, targetId: run.targetId, artifactDirectory: run.artifactDirectory };
  },
  async execute(prepared) {
    return { runId: prepared.runId, status: 'completed', exitCode: 0 };
  },
  async startInteractive(run) {
    runs.set(run.runId, run);
    sentTurns.set(run.runId, []);
    return { runId: run.runId, targetId: run.targetId, artifactDirectory: run.artifactDirectory };
  },
  async observeTarget() {
    return { turns: [] };
  },
  async sendCallerTurn(prepared, turn) {
    const turns = sentTurns.get(prepared.runId) ?? [];
    turns.push(turn);
    sentTurns.set(prepared.runId, turns);
    if (turn.decision === 'accept') return { turns: [] };
    return {
      turns: [{
        id: \`target-\${turn.id}\`,
        actor: 'assistant',
        text: 'I have a safe next step available.'
      }]
    };
  },
  async finishInteractive(prepared) {
    return {
      runId: prepared.runId,
      status: 'completed',
      exitCode: 0,
      stdout: 'agentic completed',
      stderr: '',
      metadata: { sentTurns: sentTurns.get(prepared.runId) ?? [] }
    };
  },
  async collectObservations(result) {
    const run = runs.get(result.runId);
    const channelContract = run.channelContracts?.channels?.[run.channel] ?? run.scenario.channelContracts.channels[run.channel];
    const acceptedEvidenceCodes = [
      ...run.scenario.evidence.acceptedEvidenceCodes,
      ...run.scenario.evidence.requiredWorkflowOutcomes,
      ...run.scenario.channelContracts.commonEvidenceCodes,
      ...(channelContract?.requiredEvidenceCodes ?? [])
    ];
    return {
      acceptedEvidenceCodes,
      rejectedEvidenceCodes: [],
      repairCodes: [],
      observedTraceSources: ['transcript'],
      observedCorrelation: ['channel'],
      forbiddenToolNames: [],
      forbiddenEvents: [],
      forbiddenClaims: [],
      setupEvidenceCodes: run.scenario.fixture.setupEvidenceCodes,
      evidenceRefsByCode: Object.fromEntries([...acceptedEvidenceCodes, ...run.scenario.fixture.setupEvidenceCodes].map((code) => [code, [\`agentic:\${code}\`]])),
      collectorStatus: null
    };
  },
  async cleanup(prepared) {
    runs.delete(prepared.runId);
    sentTurns.delete(prepared.runId);
  }
};

export default adapter;
`, 'utf8');

      const checkLogs = await captureLogs(async () => {
        const result = await main(['adapter', 'check', '--root', root, '--adapter', 'agentic-local', '--scenario', 'SAMPLE-AGENT-AGENTIC-RUN-001']);
        expect(result.exitCode).toBe(0);
      });
      expect(JSON.parse(checkLogs.join('\n')).capability).toMatchObject({
        status: 'ready',
        requiredInteractionMode: 'agentic',
        missingInteractionModes: [],
        missingInteractionImplementation: false
      });

      const runLogs = await captureLogs(async () => {
        const result = await main(['run', '--root', root, '--adapter', 'agentic-local', '--scenario', 'SAMPLE-AGENT-AGENTIC-RUN-001', '--reporter', 'json']);
        expect(result.exitCode).toBe(0);
      });
      const run = JSON.parse(runLogs.join('\n')) as {
        artifactDirectory: string;
        agentic: { completed: boolean; stopReason: string };
        oracle: { status: string };
      };
      expect(run.oracle.status).toBe('PASS');
      expect(run.agentic).toEqual({ completed: true, stopReason: 'completed' });
      const interaction = JSON.parse(await readFile(join(run.artifactDirectory, 'interaction.json'), 'utf8'));
      expect(interaction.goal.summary).toContain('Complete the sample-agent-agentic-run outcome');
      expect(interaction.goal.summary).toContain(String(interaction.slots.urgency));
      expect(interaction.goal.summary).toContain(String(interaction.slots.flexibility));
      expect(interaction.goal.summary).not.toContain('{urgency}');
      expect(interaction.goal.summary).not.toContain('{flexibility}');
      const callerSession = JSON.parse(await readFile(join(run.artifactDirectory, 'caller-session.json'), 'utf8'));
      expect(callerSession.stopReason).toBe('completed');
      expect(callerSession.turns).toEqual(expect.arrayContaining([
        expect.objectContaining({
          actor: 'caller',
          text: expect.stringContaining('Complete the sample-agent-agentic-run outcome')
        })
      ]));
      const callerTurn = callerSession.turns.find((turn: { actor: string }) => turn.actor === 'caller');
      expect(callerTurn.text).toContain(String(interaction.slots.urgency));
      expect(callerTurn.text).toContain(String(interaction.slots.flexibility));
      expect(callerTurn.text).not.toContain('{urgency}');
      expect(callerTurn.text).not.toContain('{flexibility}');
    });
  });

  it('fails an incomplete agentic session even when collected evidence passes', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root]);
      });
      await captureLogs(async () => {
        await main([
          'scenario',
          'create',
          '--root',
          root,
          '--id',
          'SAMPLE-AGENT-AGENTIC-INCOMPLETE-001',
          '--title',
          'Agentic incomplete',
          '--channel',
          'browser-chat',
          '--interaction',
          'agentic'
        ]);
      });

      const scenarioPath = join(root, 'scenarios/sample-agent-agentic-incomplete-001/scenario.json');
      const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
      scenario.interaction.termination.maxTurns = 1;
      await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');

      const adapterRoot = join(root, 'adapters', 'agentic-incomplete');
      await mkdir(adapterRoot, { recursive: true });
      await writeFile(join(adapterRoot, 'pagoda.adapter.json'), `${JSON.stringify({
        schemaVersion: 'pagoda.adapter',
        id: 'agentic-incomplete',
        targetId: 'sample-agent',
        channel: 'browser-chat',
        kind: 'node',
        entrypoint: './index.mjs',
        interactionModes: ['agentic'],
        producesEvidenceCodes: ['*'],
        requiresEnv: []
      }, null, 2)}\n`, 'utf8');
      await writeFile(join(adapterRoot, 'index.mjs'), `
const runs = new Map();

const adapter = {
  targetId: 'sample-agent',
  async healthCheck() {
    return { status: 'ready', message: 'agentic incomplete ready', evidenceSources: ['transcript'] };
  },
  async prepare(run) {
    runs.set(run.runId, run);
    return { runId: run.runId, targetId: run.targetId, artifactDirectory: run.artifactDirectory };
  },
  async execute(prepared) {
    return { runId: prepared.runId, status: 'completed', exitCode: 0 };
  },
  async startInteractive(run) {
    runs.set(run.runId, run);
    return { runId: run.runId, targetId: run.targetId, artifactDirectory: run.artifactDirectory };
  },
  async observeTarget() {
    return { turns: [] };
  },
  async sendCallerTurn() {
    return { turns: [] };
  },
  async finishInteractive(prepared) {
    return { runId: prepared.runId, status: 'completed', exitCode: 0, stdout: 'finished', stderr: '' };
  },
  async collectObservations(result) {
    const run = runs.get(result.runId);
    const channelContract = run.channelContracts?.channels?.[run.channel] ?? run.scenario.channelContracts.channels[run.channel];
    const acceptedEvidenceCodes = [
      ...run.scenario.evidence.acceptedEvidenceCodes,
      ...run.scenario.evidence.requiredWorkflowOutcomes,
      ...run.scenario.channelContracts.commonEvidenceCodes,
      ...(channelContract?.requiredEvidenceCodes ?? [])
    ];
    return {
      acceptedEvidenceCodes,
      rejectedEvidenceCodes: [],
      repairCodes: [],
      observedTraceSources: ['transcript'],
      observedCorrelation: ['channel'],
      forbiddenToolNames: [],
      forbiddenEvents: [],
      forbiddenClaims: [],
      setupEvidenceCodes: run.scenario.fixture.setupEvidenceCodes,
      evidenceRefsByCode: Object.fromEntries([...acceptedEvidenceCodes, ...run.scenario.fixture.setupEvidenceCodes].map((code) => [code, [\`incomplete:\${code}\`]])),
      collectorStatus: null
    };
  },
  async cleanup(prepared) {
    runs.delete(prepared.runId);
  }
};

export default adapter;
`, 'utf8');

      const runLogs = await captureLogs(async () => {
        const result = await main(['run', '--root', root, '--adapter', 'agentic-incomplete', '--scenario', 'SAMPLE-AGENT-AGENTIC-INCOMPLETE-001', '--reporter', 'json']);
        expect(result.exitCode).toBe(1);
      });
      const run = JSON.parse(runLogs.join('\n')) as {
        artifactDirectory: string;
        agentic: { completed: boolean; stopReason: string };
        oracle: { status: string };
      };
      expect(run.oracle.status).toBe('PASS');
      expect(run.agentic).toEqual({ completed: false, stopReason: 'max-turns' });
      const callerSession = JSON.parse(await readFile(join(run.artifactDirectory, 'caller-session.json'), 'utf8'));
      expect(callerSession.stopReason).toBe('max-turns');
      const manifest = JSON.parse(await readFile(join(run.artifactDirectory, 'run.json'), 'utf8'));
      expect(manifest.status).toBe('FAIL');
      expect(manifest.oracleStatus).toBe('PASS');
      expect(manifest.agentic).toEqual({ completed: false, stopReason: 'max-turns' });
      const report = await readFile(join(run.artifactDirectory, 'report.md'), 'utf8');
      expect(report).toContain('- Status: FAIL');
      expect(report).toContain('- Oracle Status: PASS');
      expect(report).toContain('- Agentic Session: incomplete (max-turns)');
    });
  });

  it('writes failed artifacts for agentic startup timeout and startup adapter failure', async () => {
    await withTempDir(async (directory) => {
      for (const mode of ['timeout', 'adapter-failed'] as const) {
        const root = join(directory, `sample-agent-${mode}`, '.pagoda');
        await captureLogs(async () => {
          await main(['init', '--root', root]);
        });
        await captureLogs(async () => {
          await main([
            'scenario',
            'create',
            '--root',
            root,
            '--id',
            `SAMPLE-AGENT-${mode.toUpperCase()}-001`,
            '--title',
            `Agentic ${mode}`,
            '--channel',
            'browser-chat',
            '--interaction',
            'agentic'
          ]);
        });

        const scenarioPath = join(root, `scenarios/sample-agent-${mode}-001/scenario.json`);
        const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
        scenario.interaction.termination.maxDurationMs = mode === 'timeout' ? 1 : 1000;
        await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');

        const adapterRoot = join(root, 'adapters', `agentic-${mode}`);
        await mkdir(adapterRoot, { recursive: true });
        await writeFile(join(adapterRoot, 'pagoda.adapter.json'), `${JSON.stringify({
          schemaVersion: 'pagoda.adapter',
          id: `agentic-${mode}`,
          targetId: `sample-agent-${mode}`,
          channel: 'browser-chat',
          kind: 'node',
          entrypoint: './index.mjs',
          interactionModes: ['agentic'],
          producesEvidenceCodes: ['*'],
          requiresEnv: []
        }, null, 2)}\n`, 'utf8');
        await writeFile(join(adapterRoot, 'index.mjs'), `
const runs = new Map();
const mode = ${JSON.stringify(mode)};

const adapter = {
  targetId: ${JSON.stringify(`sample-agent-${mode}`)},
  async healthCheck() {
    return { status: 'ready', message: 'agentic startup failure ready', evidenceSources: ['transcript'] };
  },
  async prepare(run) {
    runs.set(run.runId, run);
    return { runId: run.runId, targetId: run.targetId, artifactDirectory: run.artifactDirectory };
  },
  async execute(prepared) {
    return { runId: prepared.runId, status: 'completed', exitCode: 0 };
  },
  async startInteractive(run) {
    if (mode === 'adapter-failed') throw new Error('startup exploded');
    return new Promise((resolve) => setTimeout(() => {
      runs.set(run.runId, run);
      resolve({ runId: run.runId, targetId: run.targetId, artifactDirectory: run.artifactDirectory });
    }, 20));
  },
  async observeTarget() {
    return { turns: [] };
  },
  async sendCallerTurn() {
    return { turns: [] };
  },
  async finishInteractive(prepared) {
    return { runId: prepared.runId, status: 'completed', exitCode: 0, stdout: 'finished', stderr: '' };
  },
  async collectObservations(result) {
    const run = runs.get(result.runId);
    if (!run) throw new Error('run never started');
    return {
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
    };
  },
  async cleanup(prepared) {
    runs.delete(prepared.runId);
  }
};

export default adapter;
`, 'utf8');

        const runLogs = await captureLogs(async () => {
          const result = await main(['run', '--root', root, '--adapter', `agentic-${mode}`, '--scenario', `SAMPLE-AGENT-${mode.toUpperCase()}-001`, '--reporter', 'json']);
          expect(result.exitCode).toBe(1);
        });
        const run = JSON.parse(runLogs.join('\n')) as {
          artifactDirectory: string;
          agentic: { completed: boolean; stopReason: string };
          oracle: { status: string };
        };
        expect(run.oracle.status).toBe('SETUP_FAILED');
        expect(run.agentic).toEqual({ completed: false, stopReason: mode });
        const callerSession = JSON.parse(await readFile(join(run.artifactDirectory, 'caller-session.json'), 'utf8'));
        expect(callerSession.stopReason).toBe(mode);
        const manifest = JSON.parse(await readFile(join(run.artifactDirectory, 'run.json'), 'utf8'));
        expect(manifest.status).toBe('SETUP_FAILED');
        expect(manifest.oracleStatus).toBe('SETUP_FAILED');
        expect(manifest.agentic).toEqual({ completed: false, stopReason: mode });
      }
    });
  });

  it('runs all generated interaction cases and selects stable case ids', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root]);
      });

      const allLogs = await captureLogs(async () => {
        await main(['run', '--root', root, '--scenario', 'SAMPLE-AGENT-SAFE-PROPOSAL-001', '--interaction-cases', 'all', '--reporter', 'json']);
      });
      const summary = JSON.parse(allLogs.join('\n')) as {
        total: number;
        runs: Array<{ interactionCaseId?: string; artifactDirectory: string; oracle: { status: string } }>;
      };
      expect(summary.total).toBeGreaterThan(1);
      expect(new Set(summary.runs.map((run) => run.interactionCaseId)).size).toBe(summary.total);
      expect(summary.runs.every((run) => run.oracle.status === 'PASS')).toBe(true);
      expect(summary.runs.every((run) => run.artifactDirectory.includes(run.interactionCaseId as string))).toBe(true);

      const selectedLogs = await captureLogs(async () => {
        await main(['run', '--root', root, '--scenario', 'SAMPLE-AGENT-SAFE-PROPOSAL-001', '--interaction-case', 'case-001', '--seed', 'fixed', '--reporter', 'json']);
      });
      const selected = JSON.parse(selectedLogs.join('\n')) as { interactionCaseId?: string; oracle: { status: string } };
      expect(selected.interactionCaseId).toBe('case-001');
      expect(selected.oracle.status).toBe('PASS');
    });
  });

  it('initializes a phone target pack with audible-response evidence', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'voice-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root, '--channel', 'phone']);
      });

      const scenarioText = await readFile(join(root, 'scenarios', 'voice-agent-safe-proposal-001', 'scenario.json'), 'utf8');
      const evidenceMapText = await readFile(join(root, 'scenarios', 'voice-agent-safe-proposal-001', 'evidence-map.json'), 'utf8');
      const adapterText = await readFile(join(root, 'adapters', 'voice-agent-local', 'index.mjs'), 'utf8');
      const adapterManifestText = await readFile(join(root, 'adapters', 'voice-agent-local', 'pagoda.adapter.json'), 'utf8');
      const contractText = await readFile(join(root, 'contracts', 'VOICE-AGENT-SAFE-PROPOSAL-001.outcome-contract.json'), 'utf8');

      expect(scenarioText).toContain('"channels": [\n      "phone"\n    ]');
      expect(scenarioText).toContain('VOICE-AGENT_AUDIBLE_RESPONSE');
      expect(scenarioText).not.toContain('VOICE-AGENT_VISIBLE_RESPONSE');
      expect(evidenceMapText).toContain('VOICE-AGENT_AUDIBLE_RESPONSE');
      expect(adapterText).toContain('VOICE-AGENT_AUDIBLE_RESPONSE');
      expect(adapterText).toContain('Starter voice-agent phone adapter is ready.');
      expect(adapterManifestText).toContain('"channel": "phone"');
      expect(adapterManifestText).toContain('VOICE-AGENT_AUDIBLE_RESPONSE');
      expect(contractText).toContain('VOICE-AGENT_AUDIBLE_RESPONSE');

      const runLogs = await captureLogs(async () => {
        await main(['run', '--root', root, '--scenario', 'VOICE-AGENT-SAFE-PROPOSAL-001', '--channel', 'phone', '--reporter', 'json']);
      });
      const run = JSON.parse(runLogs.join('\n')) as { oracle: { status: string } };
      expect(run.oracle.status).toBe('PASS');
    });
  });

  it('auto-discovers .pagoda from nested observed repo directories', async () => {
    await withTempDir(async (directory) => {
      const root = join(directory, 'sample-agent', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root]);
      });
      const nested = join(directory, 'sample-agent', 'src', 'features');
      await import('node:fs/promises').then(({ mkdir }) => mkdir(nested, { recursive: true }));
      const previous = cwd();
      chdir(nested);
      try {
        const context = resolveRootContext({});
        expect(context.mode).toBe('target-pack');
        expect(context.targetRoot).toMatch(/\.pagoda$/);
        const logs = await captureLogs(async () => {
          await main(['validate']);
        });
        expect(logs.join('\n')).toContain('Validated sample-agent: 1 scenario(s), 1 evidence map(s), 1 outcome contract(s).');
      } finally {
        chdir(previous);
      }
    });
  });

  it('prefers --root over PAGODA_ROOT', async () => {
    await withTempDir(async (directory) => {
      const rootA = join(directory, 'a', '.pagoda');
      const rootB = join(directory, 'b', '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', rootA]);
      });
      await captureLogs(async () => {
        await main(['init', '--root', rootB]);
      });
      const previous = process.env.PAGODA_ROOT;
      process.env.PAGODA_ROOT = rootA;
      try {
        expect(resolveRootContext({ root: rootB }).targetId).toBe('b');
      } finally {
        if (previous === undefined) delete process.env.PAGODA_ROOT;
        else process.env.PAGODA_ROOT = previous;
      }
    });
  });

  it('updates an existing target pack without overwriting user-authored files', async () => {
    await withTempDir(async (directory) => {
      const projectRoot = join(directory, 'sample-agent');
      const root = join(projectRoot, '.pagoda');
      await captureLogs(async () => {
        await main(['init', '--root', root]);
      });

      const manifestPath = join(root, 'pagoda.target.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      delete manifest.pagodaVersion;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      const scenarioPath = join(root, 'scenarios/sample-agent-safe-proposal-001/scenario.json');
      const scenarioText = (await readFile(scenarioPath, 'utf8')).replace('sample-agent presents a safe proposal', 'custom scenario title');
      await writeFile(scenarioPath, scenarioText, 'utf8');
      const evidenceMapPath = join(root, 'scenarios/sample-agent-safe-proposal-001/evidence-map.json');
      const evidenceMapText = await readFile(evidenceMapPath, 'utf8');
      const adapterSourcePath = join(root, 'adapters/sample-agent-local/index.mjs');
      const adapterSourceText = 'custom adapter source\n';
      await writeFile(adapterSourcePath, adapterSourceText, 'utf8');
      const adapterManifestPath = join(root, 'adapters/sample-agent-local/pagoda.adapter.json');
      const adapterManifestText = (await readFile(adapterManifestPath, 'utf8')).replace('"name": "sample-agent Local Adapter"', '"name": "Custom Local Adapter"');
      await writeFile(adapterManifestPath, adapterManifestText, 'utf8');
      const fixturePath = join(root, 'fixtures/starter.fixture.json');
      const fixtureText = '{"custom":true}\n';
      await writeFile(fixturePath, fixtureText, 'utf8');
      const envPath = join(root, '.env');
      const envText = 'CUSTOM_ENV=true\n';
      await writeFile(envPath, envText, 'utf8');
      const skillPath = join(projectRoot, '.agents', 'skills', 'pagoda', 'SKILL.md');
      const skillText = 'custom skill\n';
      await writeFile(skillPath, skillText, 'utf8');
      await writeFile(join(root, '.gitignore'), 'custom-rule\nartifacts/\n', 'utf8');

      const initLogs = await captureLogs(async () => {
        await main(['init', '--root', root, '--name', 'Ignored Name', '--channel', 'phone']);
      });
      const initUpdate = JSON.parse(initLogs.join('\n'));
      expect(initUpdate).toMatchObject({
        projectId: 'sample-agent',
        status: 'updated',
        ignoredOptions: ['--name', '--channel']
      });
      expect(initUpdate.updated).toContain('.pagoda/pagoda.target.json');
      expect(initUpdate.updated).toContain('.pagoda/.gitignore');
      expect(initUpdate.skipped).toContain('.agents/skills/pagoda/SKILL.md');

      await expect(readFile(scenarioPath, 'utf8')).resolves.toBe(scenarioText);
      await expect(readFile(evidenceMapPath, 'utf8')).resolves.toBe(evidenceMapText);
      await expect(readFile(adapterSourcePath, 'utf8')).resolves.toBe(adapterSourceText);
      await expect(readFile(adapterManifestPath, 'utf8')).resolves.toBe(adapterManifestText);
      await expect(readFile(fixturePath, 'utf8')).resolves.toBe(fixtureText);
      await expect(readFile(envPath, 'utf8')).resolves.toBe(envText);
      await expect(readFile(skillPath, 'utf8')).resolves.toBe(skillText);
      await expect(readFile(manifestPath, 'utf8')).resolves.toContain('"pagodaVersion"');
      await expect(readFile(manifestPath, 'utf8')).resolves.toContain('"channels": [\n    "browser-chat"\n  ]');
      const gitignore = await readFile(join(root, '.gitignore'), 'utf8');
      expect(gitignore).toContain('custom-rule');
      expect(gitignore).toContain('reports/');
      expect(gitignore).toContain('.env.*');
      await expect(readFile(join(root, 'contracts/SAMPLE-AGENT-SAFE-PROPOSAL-001.outcome-contract.json'), 'utf8')).resolves.toContain('custom scenario title');

      const updateLogs = await captureLogs(async () => {
        await main(['update', '--root', root]);
      });
      expect(JSON.parse(updateLogs.join('\n'))).toMatchObject({
        projectId: 'sample-agent',
        status: 'up-to-date'
      });

      await expect(main(['update', '--root', join(directory, 'missing', '.pagoda')])).rejects.toThrow(/Run pagoda init first/);
    });
  });
});
