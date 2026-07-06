# @petitbon/pagoda-cli

Command-line entry point for validating, compiling, running, replaying, and
reporting Pagoda project packs.

## Install

Install the published CLI with Homebrew without adding Pagoda dependencies to
the observed project:

```bash
brew tap petitbon/pagoda https://github.com/petitbon/pagoda
brew trust petitbon/pagoda
brew install pagoda
```

Then run Pagoda from the observed repo:

```bash
pagoda init
pagoda validate
```

`pagoda init` derives the project id from the current repo directory name.

From the repository root:

```bash
corepack enable
yarn install
yarn build
```

During development, run the CLI through the workspace script:

```bash
yarn workspace @petitbon/pagoda-cli pagoda validate
```

## Commands

```bash
pagoda --help
pagoda --version
pagoda init
pagoda init --channel phone
pagoda update
pagoda codex install --root .pagoda
pagoda scenario create --root .pagoda --id PRODUCT-AGENT-LOCATION-ANSWER-001 --title "Location answer" --channel browser-chat
pagoda scenario create --root .pagoda --id PRODUCT-AGENT-LEGACY-001 --title "Legacy" --interaction none
pagoda adapter create --root .pagoda --id product-agent-experimental --channel browser-chat
pagoda validate
pagoda compile
pagoda check
pagoda adapter list
pagoda adapter check --adapter deterministic --scenario DEMO-PROPOSAL-PRESENTED-001
pagoda run --scenario DEMO-PROPOSAL-PRESENTED-001 --adapter deterministic
pagoda run --scenario DEMO-PROPOSAL-PRESENTED-001 --interaction-case case-001
pagoda run --scenario DEMO-PROPOSAL-PRESENTED-001 --interaction-cases all
pagoda run --adapter deterministic
pagoda run --adapter deterministic --reporter json
pagoda replay --artifact artifacts/runs/<run-dir>
pagoda report --artifact artifacts/runs/<run-dir>
```

For an observed repo, run commands from anywhere under the repo after creating
`.pagoda/`:

```bash
pagoda init
pagoda validate
pagoda check
pagoda adapter list
pagoda adapter check --adapter product-agent-local --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001
pagoda run --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter product-agent-local
pagoda run --adapter product-agent-local
```

Use `pagoda init --channel phone` for phone project packs. The generated starter
requires `*_AUDIBLE_RESPONSE` evidence instead of browser `*_VISIBLE_RESPONSE`
evidence.

Use `--root /path/to/project/.pagoda` or `PAGODA_ROOT=/path/to/project/.pagoda`
when running from outside the observed repo.

Root resolution order is `--root`, then `PAGODA_ROOT`, then the nearest
`.pagoda/pagoda.target.json`, then the Pagoda development workspace.

## Behavior

- `init` creates a package-free `.pagoda/` project pack in an observed repo.
  It also creates `.agents/skills/pagoda/` when missing so Codex can author
  scenarios from local Pagoda guidance. Re-running it against an existing pack
  performs the same non-destructive refresh as `update`.
- `update` refreshes an existing pack with the current CLI release. It updates
  generated contracts, the evidence registry, manifest Pagoda version metadata,
  support directories, and missing `.gitignore` patterns without replacing
  scenarios, evidence maps, adapters, fixtures, env files, traces, reports, run
  artifacts, or customized Codex skills.
- `codex install` installs the Pagoda Codex skill into an existing observed
  repo. It preserves existing skill files unless `--force` is passed.
- `validate` checks project-pack structure, scenario/evidence-map consistency,
  and generated contract freshness.
- `compile` generates outcome contracts from scenarios and evidence maps.
- `check` loads the configured adapter and reports health.
- `adapter list` lists modular adapter bundles.
- `adapter check` reports adapter health, missing environment variables, and
  missing evidence capabilities for a specific scenario.
- `scenario create` creates a bundled scenario, optional generated
  interaction, evidence map, outcome contract, and evidence-registry entries.
- `adapter create` creates a package-free adapter bundle and updates the
  evidence registry.
- `run` executes every active scenario by default, or one scenario with
  `--scenario <id>`, then writes reproducible artifact bundles.
  Generated interaction scenarios run one deterministic case by default. Use
  `--interaction-case <case-id|index>` for repros and `--interaction-cases all`
  for pairwise coverage.
  The default reporter prints Vitest-style run lines and a summary. Use
  `--reporter json` or `--json` for automation.
- `replay` reruns oracle evaluation from a saved artifact.
- `report` regenerates the Markdown report for a saved artifact.
