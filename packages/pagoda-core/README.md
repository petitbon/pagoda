# @petitbon/pagoda-core

Canonical Pagoda validation model, projection, validators, oracle, and evidence
helpers.

## Install

For package consumers:

```bash
export GITHUB_PACKAGES_TOKEN=<github-pat-classic-with-read:packages>
export PAGODA_YARN_RC="$HOME/.config/pagoda/yarnrc.yml"
mkdir -p "$(dirname "$PAGODA_YARN_RC")"
cat > "$PAGODA_YARN_RC" <<EOF
npmScopes:
  petitbon:
    npmRegistryServer: "https://npm.pkg.github.com"
    npmAlwaysAuth: true
    npmAuthToken: "$GITHUB_PACKAGES_TOKEN"
EOF
YARN_RC_FILENAME="$PAGODA_YARN_RC" yarn add @petitbon/pagoda-core
```

From the repository root for framework development:

```bash
corepack enable
yarn install
yarn workspace @petitbon/pagoda-core build
yarn workspace @petitbon/pagoda-core test
```

## Owns

- scenario, evidence-map, outcome-contract, and observation types;
- scenario and evidence-map validators;
- scenario-to-contract projection;
- canonical evidence observation helpers;
- deterministic oracle evaluation.

`@petitbon/pagoda-core` is the framework center of gravity. CLIs, runners, target
adapters, and replay tools consume this package instead of owning Pagoda
semantics locally.

## Boundary

This package has no knowledge of specific agentic platforms, observed
repositories, or target-pack layouts. It evaluates canonical scenarios,
evidence maps, outcome contracts, and observations after the CLI or runner has
loaded them from `.pagoda/` or `targets/*`.
