# Migration

Pagoda has been narrowed into a validation-only framework for agentic software.
The active project now contains only the scenario, evidence, contract,
observation, oracle, adapter, CLI, and artifact surfaces required to run
validations.

## 0.5.0 Retired Target Metadata

Version 0.5.0 removes the unused target-manifest fields `observedSystem` and
`evidenceAdapters`. No Pagoda loader, validator, adapter, or tracked target pack
consumed them, so retaining the fields implied configuration behavior that did
not exist.

This is an intentional breaking pre-1.0 release. Target packs must remove those
fields. Runtime environment requirements belong in `requiredEnv` and adapter
manifests; adapter selection belongs in `defaultAdapter`, `--adapter`, or the
channel match.

## 0.4.0 Adapter Manifest Boundary

Version 0.4.0 removes the pre-0.3 target-level `adapter.entrypoint` form.
Every supported target pack must declare one or more
`adapters/<id>/pagoda.adapter.json` manifests and select an adapter with
`defaultAdapter`, `--adapter`, or an unambiguous channel match.

This is an intentional breaking pre-1.0 release under the strict compatibility
policy below. The removed form had no tracked current target-pack consumer; it
survived only as a transition fallback and test fixture while current target
packs already used adapter bundles.

To upgrade a target pack:

1. Create `adapters/<id>/pagoda.adapter.json` beside the adapter entrypoint.
2. Move the adapter id, channel, entrypoint, interaction modes, evidence codes,
   and environment requirements into that manifest.
3. Remove target-level `adapter` and set `defaultAdapter` when the pack has a
   default.
4. Upgrade the CLI and all four public packages together, then run `pagoda
   validate` and the target smoke scenarios.

## 0.3.0 Strict Pre-1.0 Migration

Pagoda uses strict compatibility before 1.0: a minor release may intentionally
change TypeScript contracts and serialized proof formats without a compatibility
shim. Upgrade the CLI and all four `@petitbon/pagoda-*` packages together. Their
published dependencies remain pinned to the same fixed release version.

Version 0.3.0 makes these breaking changes:

- `pagoda run` now validates scenarios and evidence maps and refuses missing,
  stale, version-mismatched, or unexpected generated outcome contracts before
  loading an adapter. `pagoda compile` is the repair operation and removes
  orphaned generated contracts.
- Canonical observations require `observedOrdering`. Adapters should report the
  ordering fields they actually established, such as `eventTime`; an empty
  array is an explicit absence of ordering proof. Missing contract ordering is
  `OBSERVABILITY_FAILED` and appears in `missingOrdering` on oracle results.
- The domain-specific `correct-wrong-service`, `correct-wrong-staff`,
  `correct-wrong-date`, and `correct-wrong-time` agentic triggers are removed.
  Replace any of them with `correct-conflicting-fact`.
- Interactive target packs can implement `createCallerAgentProvider` to own
  target-specific caller policy. The shared deterministic provider is now
  deliberately target-neutral.
- Artifact readers verify the canonical file map, regular-file containment, and
  every declared SHA-256 hash before parsing proof payloads. Artifacts missing
  the new observation or oracle fields are rejected.
- Adapter lifecycle failures, including thrown startup/execution errors and
  cleanup errors, are written as diagnostic artifacts. `run.json.status` is the
  aggregate run status, `oracleStatus` remains the deterministic oracle result,
  and `adapterFailures` preserves every recorded lifecycle failure.

For an existing target pack:

1. Replace retired caller triggers with `correct-conflicting-fact`.
2. Add `observedOrdering` to every live, replay, and test adapter observation.
3. Run `pagoda update --root .pagoda` or run `pagoda compile --root .pagoda`
   followed by `pagoda validate --root .pagoda`.
4. Run the target's smoke scenarios and create new 0.3.0 proof artifacts.

There is no automatic in-place conversion for 0.2.x run artifacts. Keep the
matching 0.2.x CLI available if those historical bundles must be replayed, or
retain them as immutable archival evidence. `pagoda report` in 0.3.0 can repair
only `report.md`; every other source file and hash must already pass 0.3.0
integrity validation.

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
