# Architecture

Pagoda is a validation framework. Shared packages are target-agnostic; target
packs contain platform-specific scenarios, fixtures, adapters, and traces.

```text
@petitbon/pagoda-core
  -> @petitbon/pagoda-adapter-sdk
  -> @petitbon/pagoda-runner
  -> @petitbon/pagoda-cli
  -> .pagoda project packs or targets/*
```

## Packages

- `@petitbon/pagoda-core` owns the canonical validation types, scenario/evidence-map
  validation, contract projection, canonical observations, and oracle.
- `@petitbon/pagoda-adapter-sdk` defines the target manifest and adapter lifecycle.
- `@petitbon/pagoda-runner` creates run plans, writes artifact bundles, reads artifacts,
  and renders reports.
- `@petitbon/pagoda-cli` wires the packages into validation, compile, health,
  adapter capability checks, scenario/adapter generation, run, replay, and
  report commands.

## Data Flow

1. A project pack provides human-authored scenarios and evidence maps.
2. `pagoda compile` projects those files into generated outcome contracts.
3. `pagoda run` loads a target adapter and checks that its manifest can
   produce the scenario's required evidence codes.
4. The runner creates a run plan.
5. The adapter prepares and executes the target scenario. For generated
   interaction this means deterministic user turns; for agentic interaction it
   means a materialized caller plan and, when supported, an interactive caller
   session.
6. The adapter returns canonical evidence observations.
7. The core oracle compares observations to the outcome contract.
8. The runner writes a reproducible artifact bundle.

## Root Modes

Pagoda supports two project-pack root modes.

Standalone observed repo:

```text
observed-repo/
  .pagoda/
    pagoda.target.json
    scenarios/
      <scenario-slug>/
        scenario.json
        evidence-map.json
    contracts/
    fixtures/
    evidence/
      registry.json
    adapters/
      <adapter-id>/
        pagoda.adapter.json
        index.mjs
      replay/
        pagoda.adapter.json
        index.mjs
```

This is the recommended integration path for products that should not be
converted into Pagoda workspaces. The CLI discovers `.pagoda/` automatically
from nested directories and writes run artifacts under
`.pagoda/artifacts/runs/`.

Pagoda development workspace:

```text
pagoda/
  targets/<target-id>/
    pagoda.target.json
    docs/pagoda/scenarios/
    docs/pagoda/evidence-maps/
    docs/pagoda/contracts/
    adapters/
      <adapter-id>/
        pagoda.adapter.json
        index.ts
```

This layout is used by the bundled demo target and by framework contributors.

## Boundaries

- The target adapter collects evidence; it does not decide pass or fail.
- Adapter manifests declare evidence capabilities; Pagoda checks them before
  driving the target.
- Adapter manifests declare supported interaction modes. Existing adapters are
  generated-only unless they opt into `agentic`.
- Agentic caller turns are execution input and artifact context; trusted
  observations still come from adapters and the oracle remains deterministic.
- The oracle decides status; it does not call target systems.
- Outcome contracts are generated; scenarios and evidence maps are the source
  of truth.
- The evidence registry documents target-local evidence codes; it does not
  replace scenario or oracle semantics.
- Run artifacts are durable evidence output; they are not committed by default.
