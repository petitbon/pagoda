import { targetPrefix, targetSlug } from '../shared/strings.js';

export const targetPackGitignore = `# Pagoda run outputs
artifacts/
reports/

# Local traces/debug exports
traces/*.local.json
traces/*.debug.json
traces/*.tmp.json

# Local env files
.env
.env.*
`;

export const browserChatEnvFile = `# Fill these in before running the browser-chat adapter.
AGENTIS_BROWSER_CHAT_BASE_URL=http://localhost:8080
AGENTIS_BROWSER_CHAT_LOCATION_ID=<location-id>
AGENTIS_BROWSER_CHAT_PAGE_URL=https://<allowed-origin>/
`;

export function starterFixture(targetId: string): unknown {
  return {
    schemaVersion: 'pagoda.fixture',
    id: 'starter',
    targetId,
    description: 'Starter fixture used by generated Pagoda scenarios.',
    requiredState: [
      'Target system is reachable.',
      'Adapter can collect trusted transcript evidence.'
    ],
    setupEvidenceCodes: [`${targetPrefix(targetId)}_SETUP_READY`]
  };
}

export function targetPackReadme(input: {
  name: string;
  targetId: string;
  adapterId: string;
  scenarioId: string;
  channel: string;
}): string {
  const additionalAdapterId = input.channel === 'phone'
    ? `${targetSlug(input.targetId)}-phone-v2`
    : `${targetSlug(input.targetId)}-experimental`;
  return `# ${input.name} Pagoda Project Pack

This directory contains Pagoda validation assets for ${input.name}.

Pagoda keeps scenarios, evidence maps, adapters, fixtures, and generated
artifacts separate so each part can be reviewed and swapped independently.

## Layout

\`\`\`text
.
├── pagoda.target.json
├── scenarios/
│   └── <scenario-slug>/
│       ├── scenario.json
│       └── evidence-map.json
├── contracts/
├── adapters/
│   ├── ${input.adapterId}/
│   │   ├── pagoda.adapter.json
│   │   └── index.mjs
│   └── replay/
│       ├── pagoda.adapter.json
│       └── index.mjs
├── fixtures/
├── evidence/
│   └── registry.json
├── traces/
└── artifacts/
\`\`\`

Commit scenarios, evidence maps, contracts, adapters, fixtures, registry files,
and project metadata. Do not commit generated run artifacts under
\`artifacts/\`.

## Security

Adapter commands execute target-pack JavaScript. Run \`pagoda check\`,
\`pagoda adapter check\`, and \`pagoda run\` only against repositories and
target packs you trust.

## Commands

\`\`\`bash
pagoda validate --root .
pagoda compile --root .
pagoda adapter list --root .
pagoda adapter check --root . --adapter ${input.adapterId} --scenario ${input.scenarioId}
pagoda run --root . --scenario ${input.scenarioId} --adapter ${input.adapterId} --channel ${input.channel}
pagoda run --root . --adapter ${input.adapterId} --channel ${input.channel}
\`\`\`

If Pagoda is not installed globally, install it with Homebrew:

\`\`\`bash
brew tap petitbon/pagoda https://github.com/petitbon/pagoda
brew trust petitbon/pagoda
brew install pagoda
\`\`\`

## Add A Scenario

\`\`\`bash
pagoda scenario create --root . --id ${targetPrefix(input.targetId)}-NEW-OUTCOME-001 --title "New outcome" --channel ${input.channel}
pagoda compile --root .
pagoda validate --root .
\`\`\`

Then update the selected adapter's \`producesEvidenceCodes\` and observation
translation if the scenario requires new evidence codes.

## Add An Adapter

\`\`\`bash
pagoda adapter create --root . --id ${additionalAdapterId} --channel ${input.channel}
pagoda adapter check --root . --adapter ${additionalAdapterId}
\`\`\`

Adapters translate raw platform behavior into canonical Pagoda evidence. The
oracle, not the adapter, decides PASS or FAIL.

## Replay

The generated \`replay\` adapter can re-run oracle evaluation from saved
canonical observations:

\`\`\`bash
PAGODA_REPLAY_ARTIFACT=./artifacts/runs/<run-dir> \\
  pagoda run --root . --scenario ${input.scenarioId} --adapter replay --channel ${input.channel}
\`\`\`
`;
}
