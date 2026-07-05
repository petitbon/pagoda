# Migration

Pagoda has been narrowed into a validation-only framework for agentic software.
The active project now contains only the scenario, evidence, contract,
observation, oracle, adapter, CLI, and artifact surfaces required to run
validations.

## Current State

- External product integrations live under `.pagoda/` inside the observed repo.
- Pagoda development fixtures live under `targets/*`.
- Target-specific mappings live in target manifests.
- Outcome contracts are generated from scenarios and evidence maps.
- Generated contracts include source hashes for freshness checks.
- Generated run artifacts remain ignored under `.pagoda/artifacts/runs/**` for
  standalone packs and `artifacts/runs/**` for the Pagoda workspace.

## Removed Surfaces

The active workspace no longer includes non-validation product surfaces. Those
concerns can be added later as separate tools if they directly support
validation workflows.

## Migration Rule

For project packs, treat scenarios and evidence maps as source of truth. Run
`pagoda compile` after editing them, then run `pagoda validate` to check
structure and contract freshness. In the Pagoda development workspace, use
`yarn compile` and `yarn validate` for the bundled demo target and package
checks.

Observed repositories should not be converted into Pagoda package workspaces.
Create `.pagoda/`, keep adapters and scenario assets there, and run Pagoda from
the external CLI.
