# Oracle Semantics

The oracle compares an outcome contract with canonical evidence observations.
It is deterministic and uses strict status priority.

## Status Priority

1. `SCENARIO_INVALID`: scenario, evidence map, generated contract, fixture
   declaration, or channel is contradictory or unsupported.
2. `SETUP_FAILED`: the scenario is valid, but the target, fixture, credential,
   seed data, or harness setup failed before evaluation.
3. `OBSERVABILITY_FAILED`: the run may have happened, but Pagoda cannot observe
   required trusted evidence or correlation.
4. `FAIL`: the run is valid and observable, but evidence proves a violation or
   fails to prove the expected outcome.
5. `PASS`: trusted evidence proves the expected outcome and no forbidden side
   effect is observed.

## Evidence Rules

- Missing setup evidence is `SETUP_FAILED`.
- Missing trace source or correlation evidence is `OBSERVABILITY_FAILED`.
- Observed forbidden tools, events, claims, or rejected evidence are `FAIL`.
- Missing accepted evidence is `FAIL`.
- Required workflow outcomes and channel-specific evidence are part of the pass
  proof.
- Missing proof is never a pass.
