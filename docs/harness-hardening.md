# Harness Hardening

Harness hardening belongs to project packs and adapters, not to Pagoda core.
Pagoda must classify harness failures separately from product behavior so a
broken test environment cannot masquerade as an outcome failure or pass.

## Priorities

- Separate adapter health from outcome proof.
- Make setup evidence explicit.
- Make observability requirements explicit.
- Capture enough logs and raw observations to debug failed runs.
- Preserve adapter failure diagnostics in CLI output and artifacts so setup or
  dependency failures are actionable without opening every log file.
- Keep deterministic fixtures deterministic.
- Avoid target-specific assumptions in shared packages.
- Keep observed-repo integration inside `.pagoda/` unless the product already
  exposes a stable harness entrypoint.
- Keep run artifacts out of commits; they may contain sensitive operational
  evidence even when the scenario is synthetic.

## Failure Mapping

- Missing fixture, credential, target session, or seed data:
  `SETUP_FAILED`.
- Missing trace source, correlation, ordering, or a broken evidence collector:
  `OBSERVABILITY_FAILED`.
- Observable violation of required outcome or forbidden side effect:
  `FAIL`.
- Invalid scenario, map, contract, or unsupported channel:
  `SCENARIO_INVALID`.

## Run Modes

- Use replay or deterministic adapter modes for fast contract regression.
- Use live browser, phone, or other transport adapters as smoke coverage for
  session setup, transport behavior, and evidence collection.
- Use `pagoda run --concurrency <n>` only when the target pack can isolate
  fixtures, sessions, and side effects across concurrent jobs. Keep live phone
  and other single-resource harnesses at `1`.
- Add `--sequential <n>` to create `--concurrency` lanes per selected job and
  repeat each lane in order. A command with `--concurrency 10 --sequential 2`
  executes 20 attempts with at most 10 active at once. Every attempt receives a
  separate run id and proof directory; adapters must also allocate independent
  target sessions and fixtures.

## Standalone Packs

For external products, hardening work should happen in the local adapter under
`.pagoda/adapters/`. The adapter should make target availability, fixture
creation, evidence collection, and cleanup explicit. Pagoda core should remain
agnostic to the target's implementation details.
