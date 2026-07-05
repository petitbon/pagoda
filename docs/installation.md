# Installation

This guide shows how to use the published Pagoda CLI beside an observed
agentic project and how to install the Pagoda repository for framework
development.

## Prerequisites

- Git.
- Homebrew for the published CLI.
- Node.js 22 or newer and Corepack only for Pagoda framework development.

Pagoda uses Yarn 4 with `node_modules` linking. The required Yarn version is
declared in the root `package.json`.

## Use The Published CLI

Install the published CLI with Homebrew:

```bash
brew tap petitbon/pagoda https://github.com/petitbon/pagoda
brew trust petitbon/pagoda
brew install pagoda
pagoda --version
```

Pagoda does not need to be installed into the observed project. Run the global
CLI from inside the observed repo:

```bash
cd /path/to/product-agent
pagoda init
pagoda validate
pagoda check
pagoda adapter list
pagoda adapter check --adapter product-agent-local --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001
pagoda run --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter product-agent-local
pagoda run --adapter product-agent-local
```

`pagoda init` creates `.pagoda/` and derives the project id from the current
repo directory name. From `/path/to/product-agent`, the project id becomes
`product-agent`.

To start with a phone validation pack instead, pass `--channel phone`:

```bash
pagoda init --channel phone
pagoda run --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter product-agent-local
```

The phone starter generates `*_AUDIBLE_RESPONSE` evidence. Replace the adapter
stub with calls to the observed product's phone transcript, call-session,
telephony, or runtime-observability surfaces.

## Fresh Clone For Development

```bash
git clone <repo-url> pagoda
cd pagoda
corepack enable
yarn install
```

## Verify The Install

Generate contracts, validate the project pack, run tests, and build packages:

```bash
yarn compile
yarn validate
yarn test
yarn build
```

Expected validation output:

```text
Validated demo-agent: 4 scenario(s), 4 evidence map(s), 4 outcome contract(s).
```

## Run The Demo Target

Check adapter health:

```bash
yarn workspace @petitbon/pagoda-cli pagoda check
yarn workspace @petitbon/pagoda-cli pagoda adapter list
```

Run the passing scenario:

```bash
yarn workspace @petitbon/pagoda-cli pagoda run --scenario DEMO-PROPOSAL-PRESENTED-001 --adapter deterministic
```

The command writes a run artifact under `artifacts/runs/` and exits with code
`0` when the oracle status is `PASS`.

Run non-pass examples:

```bash
yarn workspace @petitbon/pagoda-cli pagoda run --scenario DEMO-FORBIDDEN-COMMIT-001 --adapter deterministic || true
yarn workspace @petitbon/pagoda-cli pagoda run --scenario DEMO-OBSERVABILITY-MISSING-001 --adapter deterministic || true
yarn workspace @petitbon/pagoda-cli pagoda run --scenario DEMO-SETUP-MISSING-001 --adapter deterministic || true
```

Expected statuses:

- `DEMO-FORBIDDEN-COMMIT-001`: `FAIL`
- `DEMO-OBSERVABILITY-MISSING-001`: `OBSERVABILITY_FAILED`
- `DEMO-SETUP-MISSING-001`: `SETUP_FAILED`

## Replay A Run

After a run, replay the saved artifact:

```bash
yarn workspace @petitbon/pagoda-cli pagoda replay --artifact artifacts/runs/<run-dir>
```

Regenerate the Markdown report:

```bash
yarn workspace @petitbon/pagoda-cli pagoda report --artifact artifacts/runs/<run-dir>
```

## Local CLI Shortcut

During development, the CLI can be run through the workspace script. For
example:

```bash
yarn workspace @petitbon/pagoda-cli pagoda validate
```

For package consumers, install with Homebrew and use `pagoda`.

## Install Beside An Observed Repo

For a product repository that should not be converted to Yarn, npm, or a Pagoda
workspace, keep Pagoda as a separate checkout and place only a `.pagoda/` target
pack inside the observed repo.

Create the project pack from inside the observed repo:

```bash
cd /path/to/product-agent
pagoda init
```

The generated pack contains:

```text
.agents/
  skills/
    pagoda/
      SKILL.md
      agents/openai.yaml
.pagoda/
  .gitignore
  pagoda.target.json
  README.md
  scenarios/
    product-agent-safe-proposal-001/
      scenario.json
      evidence-map.json
  contracts/
  fixtures/
    starter.fixture.json
  evidence/
    registry.json
  traces/
  reports/
  adapters/
    product-agent-local/
      pagoda.adapter.json
      index.mjs
    replay/
      pagoda.adapter.json
      index.mjs
  artifacts/runs/   # ignored local output, created by runs
```

`pagoda init` creates `.pagoda/.gitignore` so scenarios, evidence maps,
contracts, adapters, and project metadata can be committed while generated run
artifacts, reports, local debug traces, and local env files stay out of git.
It also creates `.agents/skills/pagoda/` so Codex sessions started inside the
observed repo have local Pagoda scenario-authoring guidance. If that skill
already exists, Pagoda leaves it untouched.

For an existing observed repo that already has `.pagoda/`, refresh the pack
with the current CLI release:

```bash
pagoda update --root .pagoda
```

Re-running `pagoda init` against an existing pack also performs the same
non-destructive update. The command updates generated contracts, the evidence
registry, manifest Pagoda version metadata, missing support directories, and
missing `.gitignore` patterns. It does not replace existing scenarios, evidence
maps, adapters, fixtures, env files, traces, reports, run artifacts, or
customized Codex skills.

To install only the Codex skill:

```bash
pagoda codex install --root .pagoda
```

Use `--force` only when you intentionally want to replace a customized local
Pagoda skill with the template from the current CLI release.

Validate and run the starter scenario:

```bash
pagoda validate
pagoda check
pagoda adapter list
pagoda adapter check --adapter product-agent-local --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001
pagoda run --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter product-agent-local
pagoda run --adapter product-agent-local
```

For phone targets, use `--channel phone` during `init`; the generated adapter
manifest declares the phone channel, so `pagoda run --adapter <adapter-id>` can
select it. The observed repo still does not need a package manager install;
only `.pagoda/` is added.

The run command uses a concise terminal reporter by default. Use
`--reporter json` or `--json` when invoking Pagoda from scripts.

Create additional scenario and adapter bundles with:

```bash
pagoda scenario create --id PRODUCT-AGENT-LOCATION-ANSWER-001 --title "Location answer" --channel browser-chat
pagoda adapter create --id product-agent-experimental --channel browser-chat
```

The generated replay adapter can evaluate a saved canonical observation without
driving the target:

```bash
PAGODA_REPLAY_ARTIFACT=.pagoda/artifacts/runs/<run-dir> \
  pagoda run --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter replay
```

Pagoda auto-discovers the nearest ancestor with `.pagoda/pagoda.target.json`.
From outside that tree, pass the root explicitly:

```bash
pagoda validate --root /path/to/agentic-product/.pagoda
pagoda run --root /path/to/agentic-product/.pagoda --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter product-agent-local
pagoda run --root /path/to/agentic-product/.pagoda --adapter product-agent-local
```

Edit `.pagoda/scenarios/<scenario-slug>/scenario.json`,
`.pagoda/scenarios/<scenario-slug>/evidence-map.json`, and the local adapter
bundle under `.pagoda/adapters/<adapter-id>/` to connect Pagoda to real product
behavior.
The observed repo does not need a `package.json`, dependency install, or
workspace membership.

## Troubleshooting

- If `pagoda` is missing, install it with `brew install pagoda` after tapping
  `petitbon/pagoda`.
- In the Pagoda development workspace, if `yarn` is missing, run
  `corepack enable` and retry.
- If validation reports stale contracts in the development workspace, run
  `yarn compile`.
- If a standalone project pack reports stale contracts, run
  `pagoda compile`
  from the observed repo or pass `--root /path/to/agentic-product/.pagoda`.
- If non-pass scenarios return a nonzero exit code, that is expected; Pagoda
  exits nonzero for statuses other than `PASS`.
- Generated run artifacts are local output and are ignored under
  `artifacts/runs/` in the Pagoda workspace or `.pagoda/artifacts/runs/` in an
  observed repo.
