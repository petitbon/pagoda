# Agent Guide - Pagoda

`/Users/jlp/pagoda` is the canonical Pagoda validation-framework monorepo.

## Workspace Routing

- `packages/pagoda-core/` owns the canonical validation model, validation,
  projection, oracle, and canonical evidence helpers.
- `packages/pagoda-runner/` owns target-neutral run plans, reports, and artifact
  bundles.
- `packages/pagoda-adapter-sdk/` owns target adapter contracts and manifests.
- `packages/pagoda-cli/` owns validate, compile, run, replay, report, and
  target check workflows.
- `targets/demo-agent/` owns the self-contained demo target pack, scenarios,
  evidence maps, generated contracts, traces, and deterministic adapter.

## Install

Run from the monorepo root:

```bash
corepack enable
yarn install
yarn compile
yarn validate
yarn test
yarn build
```

## Target Packs

Pagoda framework code must remain target-agnostic. Put platform-specific
fixtures, mappings, adapters, traces, and docs in target packs.

- For external observed repositories, the target pack lives at `.pagoda/` in
  that repository. Do not add Pagoda package-manager files or workspace
  membership to the observed repo.
- For Pagoda framework development, use `targets/<target-id>/`. The bundled
  `demo-agent` target is the default local validation fixture.

## Smoke Checks

```bash
yarn workspace @petitbon/pagoda-cli pagoda check --target demo-agent
yarn workspace @petitbon/pagoda-cli pagoda run --target demo-agent --scenario DEMO-PROPOSAL-PRESENTED-001 --channel browser-chat
```

Generated run artifacts under `artifacts/runs/**` are local output and should
not be committed. In standalone observed repos, generated run artifacts under
`.pagoda/artifacts/runs/**` are also local output.

## Release Notes

Public package manifests under `packages/*` must remain npm-publishable. Keep
their internal dependencies on fixed released versions, keep package-local
`LICENSE` files, and do not replace publishable dependency ranges with
`workspace:*`. See `docs/deployment.md` before changing release behavior.
