# Pagoda

Pagoda validates agentic software by running evidence-backed scenarios,
normalizing observations, applying deterministic outcome
contracts, and producing reproducible proof artifacts.

Pagoda does not ask an agent whether it behaved correctly. An adapter
collects trusted evidence from APIs, traces, logs, events, tool calls, and state
changes. The Pagoda oracle evaluates that evidence against a generated outcome
contract.

Pagoda core stays project-agnostic. Target packs and adapters are allowed to be
deeply project-specific: one project may translate browser-chat events, another
may translate phone transcripts, LangGraph traces, OpenAI Assistants runs, or
browser automation output. All adapters return the same canonical evidence
observation shape for the oracle.

## Install

Install with Homebrew:

```bash
brew tap petitbon/pagoda https://github.com/petitbon/pagoda
brew trust petitbon/pagoda
brew install pagoda
pagoda init
```

See [Homebrew](docs/homebrew.md) for tap details.

Run Pagoda from the observed repo:

```bash
cd /path/to/product-agent
pagoda init
pagoda validate
pagoda check
pagoda run --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter product-agent-local
```

`pagoda init` creates `.pagoda/` and derives the project id from the current
repo directory name. From `/path/to/product-agent`, the project id becomes
`product-agent`.

For a phone-only project pack, initialize with the phone channel:

```bash
pagoda init --channel phone
```

The generated phone starter uses `PRODUCT-AGENT_AUDIBLE_RESPONSE` instead of
`PRODUCT-AGENT_VISIBLE_RESPONSE`. Your adapter should prove that code from
trusted phone evidence such as call-session transcripts, assistant speech
realization records, telephony runtime events, or debug-bundle exports.

## Write Your First Scenario

`pagoda init` creates a working starter pack:

```text
.agents/skills/pagoda/SKILL.md
.pagoda/
  pagoda.target.json
  scenarios/product-agent-safe-proposal-001/
    scenario.json
    evidence-map.json
  contracts/PRODUCT-AGENT-SAFE-PROPOSAL-001.outcome-contract.json
  fixtures/starter.fixture.json
  evidence/registry.json
  adapters/product-agent-local/
    pagoda.adapter.json
    index.mjs
  adapters/replay/
    pagoda.adapter.json
    index.mjs
```

The generated Codex skill gives agents running inside the observed repo the
Pagoda authoring workflow: create scenario and evidence-map pairs, compile
contracts, validate, and run the relevant scenarios.

For an existing repo that already has `.pagoda/`, install or refresh only the
Codex skill:

```bash
pagoda codex install --root .pagoda
```

A scenario states the behavior to validate. Edit the generated scenario, or add
a new scenario bundle with the CLI:

```bash
pagoda scenario create --id PRODUCT-AGENT-LOCATION-ANSWER-001 --title "Location answer" --channel browser-chat
```

The command creates `.pagoda/scenarios/<scenario-slug>/scenario.json`,
`.pagoda/scenarios/<scenario-slug>/evidence-map.json`, a generated outcome
contract, and an updated evidence registry. You can also edit the generated
scenario directly:

```json
{
  "schemaVersion": "pagoda.scenario",
  "id": "PRODUCT-AGENT-SAFE-PROPOSAL-001",
  "status": "active",
  "title": "Product agent proposes a safe next step",
  "owner": "product-agent",
  "labels": {
    "domain": "support",
    "outcome": "safe-proposal-presented",
    "risk": "medium",
    "channels": ["browser-chat"]
  },
  "intent": {
    "actor": "user",
    "kind": "request safe proposal",
    "summary": "A user asks for a proposed action, not an irreversible commit."
  },
  "fixture": {
    "requiredState": ["Target system is reachable."],
    "requiredFixtures": ["starter"],
    "setupEvidenceCodes": ["PRODUCT-AGENT_SETUP_READY"]
  },
  "evidence": {
    "requiredTraceSources": ["transcript"],
    "acceptedEvidenceCodes": ["PRODUCT-AGENT_PROPOSAL_PRESENTED"],
    "rejectedEvidenceCodes": ["PRODUCT-AGENT_FORBIDDEN_COMMIT"],
    "repairCodes": [],
    "requiredWorkflowOutcomes": ["PRODUCT-AGENT_SAFE_PROPOSAL_RECORDED"]
  },
  "forbiddenSideEffects": {
    "forbiddenToolNames": ["commit_action"],
    "forbiddenEvents": ["ActionCommittedWithoutApproval"],
    "forbiddenClaims": ["action was committed"]
  },
  "channelContracts": {
    "commonEvidenceCodes": ["PRODUCT-AGENT_SESSION_CONTEXT"],
    "channels": {
      "browser-chat": {
        "requiredEvidenceCodes": ["PRODUCT-AGENT_VISIBLE_RESPONSE"],
        "oracleClauses": ["safe proposal is visible to the user"]
      }
    },
    "parity": {
      "required": false,
      "compare": ["status"]
    }
  },
  "harness": {
    "suite": "product-agent-local",
    "scenario": "safe-proposal",
    "selectedCase": "PRODUCT-AGENT-SAFE-PROPOSAL-001.case"
  }
}
```

An evidence map explains what trusted observations prove or disprove the
scenario. Keep one evidence map beside each scenario as
`.pagoda/scenarios/<scenario-slug>/evidence-map.json`.
The generated starter map is usually the fastest place to begin; make sure its
`scenarioId` matches the scenario id and that its evidence nodes mention the
same evidence codes used by the scenario.

Then regenerate the executable outcome contract and validate freshness:

```bash
pagoda compile
pagoda validate
```

Finally, connect the adapter. Replace the stub observation in
`.pagoda/adapters/product-agent-local/index.mjs` with evidence from your
platform: API calls, tool calls, traces, logs, database state, browser output,
or transcript events. The adapter bundle also has a `pagoda.adapter.json`
manifest that declares its id, channel, entrypoint, required env, and evidence
codes. `pagoda run` refuses to execute a scenario when the selected adapter
manifest cannot produce the required evidence codes. Check a specific scenario
before running it:

Adapter commands execute target-pack JavaScript. Run `pagoda check`,
`pagoda adapter check`, and `pagoda run` only against repositories and target
packs you trust.

```bash
pagoda adapter check --adapter product-agent-local --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001
```

Create another adapter bundle with:

```bash
pagoda adapter create --id product-agent-experimental --channel browser-chat
```

The adapter should return canonical evidence like this:

```js
return {
  acceptedEvidenceCodes: [
    'PRODUCT-AGENT_PROPOSAL_PRESENTED',
    'PRODUCT-AGENT_SAFE_PROPOSAL_RECORDED',
    'PRODUCT-AGENT_SESSION_CONTEXT',
    'PRODUCT-AGENT_VISIBLE_RESPONSE'
  ],
  rejectedEvidenceCodes: [],
  repairCodes: [],
  observedTraceSources: ['transcript'],
  observedCorrelation: ['channel'],
  forbiddenToolNames: [],
  forbiddenEvents: [],
  forbiddenClaims: [],
  setupEvidenceCodes: ['PRODUCT-AGENT_SETUP_READY'],
  evidenceRefsByCode: {
    'PRODUCT-AGENT_PROPOSAL_PRESENTED': ['trace:message-42'],
    'PRODUCT-AGENT_SAFE_PROPOSAL_RECORDED': ['state:proposal-42'],
    'PRODUCT-AGENT_SESSION_CONTEXT': ['session:abc'],
    'PRODUCT-AGENT_VISIBLE_RESPONSE': ['ui:response-42'],
    'PRODUCT-AGENT_SETUP_READY': ['fixture:starter']
  },
  collectorStatus: null
};
```

For multi-channel and platform-specific examples, see
[Adapter Authoring](docs/adapter-authoring.md) and
[Project Pack Guide](docs/target-pack-guide.md).

Run the scenario:

```bash
pagoda adapter list
pagoda run --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter product-agent-local
```

Run every active scenario supported by an adapter:

```bash
pagoda run --adapter product-agent-local
```

`pagoda run` prints a concise terminal reporter by default. Add
`--reporter json` or `--json` when another tool needs structured output.

Pagoda writes the proof bundle under `.pagoda/artifacts/runs/`. Replay and
regenerate the report with:

```bash
pagoda replay --artifact .pagoda/artifacts/runs/<run-dir>
pagoda report --artifact .pagoda/artifacts/runs/<run-dir>
```

New project packs also include an adapter named `replay`. It can replay saved
canonical observations without driving the target:

```bash
PAGODA_REPLAY_ARTIFACT=.pagoda/artifacts/runs/<run-dir> \
  pagoda run --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter replay
```

## Golden Path

```text
Scenario
  -> Evidence Map
  -> Outcome Contract
  -> Target Adapter
  -> Canonical Evidence Observation
  -> Oracle Evaluation
  -> Run Artifacts
```

## Workspace

- `packages/pagoda-core`: canonical validation model, projection, validators,
  oracle, and canonical evidence helpers.
- `packages/pagoda-runner`: project-neutral run plans, reports, and artifact
  bundles.
- `packages/pagoda-adapter-sdk`: adapter contracts and manifest types.
- `packages/pagoda-cli`: validation, compile, health, run, replay, and
  report commands, plus standalone `.pagoda/` project-pack, scenario, adapter,
  registry, fixture, replay, and Codex skill initialization.
- `targets/demo-agent`: self-contained example project pack and validation
  fixture.
- `docs`: framework documentation.
- `artifacts`: ignored local run output.

## Classification Model

Pagoda uses one canonical result model, evaluated in strict priority order:

```text
SCENARIO_INVALID > SETUP_FAILED > OBSERVABILITY_FAILED > FAIL > PASS
```

- `SCENARIO_INVALID`: scenario, evidence map, or contract is invalid.
- `SETUP_FAILED`: the adapter, project, or fixture could not be prepared.
- `OBSERVABILITY_FAILED`: the run happened, but required evidence was missing.
- `FAIL`: the run was observable and violated the outcome contract.
- `PASS`: trusted evidence proves the outcome and no forbidden side effect.

## Development Commands

```bash
yarn compile
yarn validate
yarn test
yarn build
```

Target checks:

```bash
yarn workspace @petitbon/pagoda-cli pagoda validate
yarn workspace @petitbon/pagoda-cli pagoda compile
yarn workspace @petitbon/pagoda-cli pagoda check
yarn workspace @petitbon/pagoda-cli pagoda adapter list
yarn workspace @petitbon/pagoda-cli pagoda run --adapter deterministic
```

Create a project pack in an observed repo:

```bash
pagoda init --root /path/to/agentic-product/.pagoda
```

Run a scenario:

```bash
yarn workspace @petitbon/pagoda-cli pagoda run --scenario DEMO-PROPOSAL-PRESENTED-001 --adapter deterministic
yarn workspace @petitbon/pagoda-cli pagoda run --adapter deterministic
```

Replay and report a run artifact:

```bash
yarn workspace @petitbon/pagoda-cli pagoda replay --artifact artifacts/runs/<run-dir>
yarn workspace @petitbon/pagoda-cli pagoda report --artifact artifacts/runs/<run-dir>
```

## Documentation

- [Installation](docs/installation.md)
- [Architecture](docs/architecture.md)
- [Scenario Authoring](docs/scenario-authoring.md)
- [Project Pack Guide](docs/target-pack-guide.md)
- [Adapter Authoring](docs/adapter-authoring.md)
- [Oracle Semantics](docs/oracle-semantics.md)
- [Artifact Model](docs/artifact-model.md)
- [Harness Hardening](docs/harness-hardening.md)
- [Deployment](docs/deployment.md)
