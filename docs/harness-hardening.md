# Harness Hardening

Harness hardening belongs to project packs and adapters, not to Pagoda core.
Pagoda must classify harness failures separately from product behavior so a
broken test environment cannot masquerade as an outcome failure or pass.

## Priorities

- Separate adapter health from outcome proof.
- Make setup evidence explicit.
- Make observability requirements explicit.
- Capture enough logs and raw observations to debug failed runs.
- Keep deterministic fixtures deterministic.
- Avoid target-specific assumptions in shared packages.
- Keep observed-repo integration inside `.pagoda/` unless the product already
  exposes a stable harness entrypoint.
- Keep run artifacts out of commits; they may contain sensitive operational
  evidence even when the scenario is synthetic.

## Failure Mapping

- Missing fixture, credential, target session, or seed data:
  `SETUP_FAILED`.
- Missing trace source, missing correlation, or broken evidence collector:
  `OBSERVABILITY_FAILED`.
- Observable violation of required outcome or forbidden side effect:
  `FAIL`.
- Invalid scenario, map, contract, or unsupported channel:
  `SCENARIO_INVALID`.

## Standalone Packs

For external products, hardening work should happen in the local adapter under
`.pagoda/adapters/`. The adapter should make target availability, fixture
creation, evidence collection, and cleanup explicit. Pagoda core should remain
agnostic to the target's implementation details.
