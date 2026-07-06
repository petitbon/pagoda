# Contributing

Pagoda is organized as a target-agnostic validation framework. Keep core
behavior in `packages/*`, keep external product integrations in `.pagoda/`
target packs, and avoid adding target names, credentials, or private traces to
shared packages.

External product integrations should use a `.pagoda/` target pack in the
observed repo. Do not require those repos to install Pagoda packages, add Yarn
metadata, or join this workspace.

Use `targets/<target-id>/` only for Pagoda development fixtures such as the
bundled `demo-agent`.

## Install

```bash
git clone <repo-url> pagoda
cd pagoda
corepack enable
yarn install
```

## Development Checks

```bash
yarn compile
yarn validate
yarn test
yarn build
```

For release-related changes, also run package dry-runs for the public packages:

```bash
cd packages/pagoda-core && npm pack --dry-run && cd ../..
cd packages/pagoda-adapter-sdk && npm pack --dry-run && cd ../..
cd packages/pagoda-runner && npm pack --dry-run && cd ../..
cd packages/pagoda-cli && npm pack --dry-run && cd ../..
```

Use the bundled demo target for local smoke checks:

```bash
yarn workspace @petitbon/pagoda-cli pagoda check --target demo-agent
yarn workspace @petitbon/pagoda-cli pagoda run --target demo-agent --scenario DEMO-PROPOSAL-PRESENTED-001 --channel browser-chat
```

## Pull Requests

- Keep changes scoped to one framework concern or target pack.
- Add or update scenario, evidence-map, adapter, runner, CLI, and oracle tests
  when behavior changes.
- Run `yarn compile` after editing scenarios or evidence maps.
- Run `yarn validate` before opening a PR.
- Do not reintroduce `workspace:*` dependencies in public package manifests.
- Keep root and demo target packages private.
- Do not commit generated run artifacts under `artifacts/runs/**`.
- Do not commit generated run artifacts from external packs under
  `.pagoda/artifacts/runs/**`.
- Do not include secrets, proprietary fixtures, private traces, or customer data.
