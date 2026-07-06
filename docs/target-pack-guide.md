# Project Pack Guide

A project pack contains everything Pagoda needs to validate one observed
agentic platform.

Install the published CLI with Homebrew before creating or updating packs:

```bash
brew tap petitbon/pagoda https://github.com/petitbon/pagoda
brew trust petitbon/pagoda
brew install pagoda
```

## Recommended Shape

```text
.pagoda/
  .gitignore
  pagoda.target.json
  README.md
  scenarios/
    <scenario-slug>/
      scenario.json
      evidence-map.json
  contracts/
  fixtures/
  evidence/
    registry.json
  traces/
  reports/
  adapters/
    <adapter-id>/
      pagoda.adapter.json
      index.mjs
    replay/
      pagoda.adapter.json
      index.mjs
```

Use this layout inside an observed product repo. It keeps Pagoda artifacts in
one directory and avoids adding package-manager files or framework dependencies
to the product.

`pagoda init` also creates a repo-local Codex skill:

```text
.agents/skills/pagoda/
  SKILL.md
  agents/openai.yaml
```

That skill helps Codex author new scenarios from inside the observed repo. It
is created only when missing, so teams can customize it without future
initialization overwriting their guidance. The source template lives at
`packages/pagoda-cli/templates/agents/skills/pagoda/` in the Pagoda repository.

For existing packs, refresh the pack with the current CLI release:

```bash
pagoda update --root .pagoda
```

`pagoda update` and re-running `pagoda init` against an existing pack perform
the same non-destructive refresh. They update generated contracts, the evidence
registry, manifest Pagoda version metadata, missing support directories, and
missing `.gitignore` patterns without replacing scenarios, evidence maps,
adapters, fixtures, env files, traces, reports, run artifacts, or customized
Codex skills.

To install only the skill without refreshing generated Pagoda files:

```bash
pagoda codex install --root .pagoda
```

The generated `.gitignore` keeps run artifacts, generated reports, local debug
traces, and local env files out of git while leaving project-pack source files
trackable.

New packs also include:

- `fixtures/starter.fixture.json`: the starter fixture declaration referenced
  by generated scenarios.
- `evidence/registry.json`: a registry of evidence codes required by scenarios
  and produced by adapters.
- `adapters/replay/`: a wildcard-capability adapter that replays saved
  canonical observations from a run artifact or trace file.

Pagoda's own repository also supports the development/demo layout:

```text
targets/<target-id>/
  pagoda.target.json
  README.md
  docs/pagoda/scenarios/
  docs/pagoda/evidence-maps/
  docs/pagoda/contracts/
  docs/pagoda/traces/
  docs/pagoda/reports/
  adapters/
    <adapter-id>/
      pagoda.adapter.json
      index.ts
```

Both shapes use the same manifest and canonical model.

## Create A Pack

From an observed repo:

```bash
pagoda init
```

The project id defaults to the current repo directory name.

For a phone-first project:

```bash
pagoda init --channel phone
```

The browser-chat starter requires `*_VISIBLE_RESPONSE`; the phone starter
requires `*_AUDIBLE_RESPONSE`.

The starter adapter is a package-free `.mjs` file. Replace its deterministic
observation with calls to the observed platform, logs, traces, APIs, or state
stores.

Generated starter scenarios include optional deterministic interaction input.
Run one seeded case by default, a specific stable case with
`--interaction-case case-001`, or every pairwise-generated case with
`--interaction-cases all`.

## Bundles

Scenario bundles own test intent and proof requirements:

```text
scenarios/location-answer/
  scenario.json
  evidence-map.json
```

Adapter bundles own target/channel execution and evidence translation:

```text
adapters/browser-chat/
  pagoda.adapter.json
  index.mjs
```

A scenario can run through multiple adapters as long as the selected channel is
declared by the scenario and the adapter can produce the required canonical
evidence codes. A single adapter can run many scenarios.

Create a scenario bundle with:

```bash
pagoda scenario create --id PRODUCT-AGENT-LOCATION-ANSWER-001 --title "Location answer" --channel browser-chat
```

Create an adapter bundle with:

```bash
pagoda adapter create --id product-agent-local-v2 --channel browser-chat
```

Both commands update the evidence registry when the target manifest declares
`paths.evidenceRegistry`.

## Manifest

`pagoda.target.json` declares:

- project id and name;
- scenario, evidence-map, contract, trace, and report paths;
- optional fixture and evidence-registry paths;
- adapter root path and default adapter id;
- supported channels;
- optional scenario mappings;
- optional required environment groups.

`pagoda.adapter.json` declares:

- adapter id and optional display name;
- channel;
- Node entrypoint relative to the adapter bundle;
- evidence codes the adapter can produce;
- environment variables the adapter requires.

Before running a scenario, Pagoda checks the selected adapter manifest. If the
adapter does not declare all required setup, outcome, workflow, common, and
channel evidence codes, the run fails before the target is driven:

```bash
pagoda adapter check --adapter <adapter-id> --scenario <scenario-id>
```

The generated `replay` adapter declares `producesEvidenceCodes: ["*"]` because
it reuses already-normalized observations instead of collecting evidence from a
live target.

## Workflow

From an observed repo with `.pagoda/`:

```bash
pagoda compile
pagoda validate
pagoda check
pagoda adapter list
pagoda adapter check --adapter <adapter-id> --scenario <scenario-id>
pagoda run --scenario <scenario-id> --channel <channel-id>
pagoda run --adapter <adapter-id>
```

`pagoda run` prints a human-readable summary by default. Use `--reporter json`
or `--json` for machine-readable output.

From the Pagoda development workspace:

```bash
yarn workspace @petitbon/pagoda-cli pagoda compile
yarn workspace @petitbon/pagoda-cli pagoda validate
yarn workspace @petitbon/pagoda-cli pagoda check
yarn workspace @petitbon/pagoda-cli pagoda adapter list
yarn workspace @petitbon/pagoda-cli pagoda adapter check --adapter <adapter-id> --scenario <scenario-id>
yarn workspace @petitbon/pagoda-cli pagoda run --scenario <scenario-id> --adapter <adapter-id>
yarn workspace @petitbon/pagoda-cli pagoda run --adapter <adapter-id>
```

Target platforms remain Pagoda-agnostic. They expose ordinary APIs, logs,
events, traces, and facts. The adapter translates those into canonical Pagoda
evidence observations.

## Target-Specific Adapter Boundary

The project pack is where product-specific coupling belongs. Pagoda core does
not know whether the observed platform is a graph agent, hosted assistant app,
browser agent, voice agent, workflow engine, or custom internal platform.

```text
.pagoda/adapters/<adapter-id>/
  pagoda.adapter.json
  index.mjs

Adapter bundle
  owns product-specific calls, credentials, fixture setup, trace reads,
  transcript parsing, and state checks.

Pagoda core
  owns scenarios, evidence maps, generated contracts, canonical observations,
  oracle classifications, and artifacts.
```

For example, two project packs can prove the same outcome with different raw
platform evidence:

```text
browser-chat target
  assistant.final text
  HTTP session id
  browser-visible transcript
  -> LOCATION_ANSWERED + VISIBLE_RESPONSE

phone target
  call session id
  phone transcript
  telephony/runtime events
  -> LOCATION_ANSWERED + AUDIBLE_RESPONSE
```

Both observations are valid as long as they satisfy the scenario's generated
contract.

## Generic Scenario Example

A target-neutral scenario should describe evidence outcomes, not private
platform mechanics:

```json
{
  "id": "PRODUCT-LOCATION-ANSWER-001",
  "labels": {
    "domain": "business-info",
    "outcome": "location-answered",
    "risk": "low",
    "channels": ["browser-chat", "phone"]
  },
  "evidence": {
    "requiredTraceSources": ["transcript"],
    "acceptedEvidenceCodes": ["LOCATION_ANSWERED"],
    "rejectedEvidenceCodes": [],
    "repairCodes": [],
    "requiredWorkflowOutcomes": ["RESPONSE_RECORDED"]
  },
  "channelContracts": {
    "commonEvidenceCodes": ["SESSION_CONTEXT"],
    "channels": {
      "browser-chat": {
        "requiredEvidenceCodes": ["VISIBLE_RESPONSE"],
        "oracleClauses": ["location answer is visible to the user"]
      },
      "phone": {
        "requiredEvidenceCodes": ["AUDIBLE_RESPONSE"],
        "oracleClauses": ["location answer is audible to the caller"]
      }
    },
    "parity": {
      "required": false,
      "compare": ["status"]
    }
  }
}
```

The adapter decides how to translate its platform's raw behavior into
`LOCATION_ANSWERED`, `VISIBLE_RESPONSE`, or `AUDIBLE_RESPONSE`.

## Replay Adapter

The generated replay adapter reads a canonical observation from one of these
locations:

1. `PAGODA_REPLAY_OBSERVATION=/path/to/canonical-observation.json`
2. `PAGODA_REPLAY_ARTIFACT=/path/to/run-artifact`
3. `.pagoda/traces/<scenario-id>.canonical-observation.json`
4. `.pagoda/traces/<scenario-id>.trace.json` with a `canonicalObservation`
   property

Example:

```bash
PAGODA_REPLAY_ARTIFACT=.pagoda/artifacts/runs/<run-dir> \
  pagoda run --scenario <scenario-id> --adapter replay
```

## Root Discovery

Pagoda resolves project packs in this order:

1. `--root <path>`
2. `PAGODA_ROOT`
3. nearest ancestor containing `.pagoda/pagoda.target.json`
4. Pagoda development workspace containing the bundled demo project.
