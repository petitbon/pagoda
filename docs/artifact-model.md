# Artifact Model

Pagoda run artifacts are reproducible proof bundles. They answer what was
tested, against which target, what evidence was observed, what the oracle
decided, and whether the decision can be replayed.

## Files

A run writes a directory named:

```text
<timestamp>_<target>_<scenario>_<channel>/
```

Interaction runs append the stable interaction case id:

```text
<timestamp>_<target>_<scenario>_<channel>_<case-id>/
```

The parent directory depends on the project-pack mode:

- standalone observed repo: `.pagoda/artifacts/runs/`
- Pagoda development workspace: `artifacts/runs/`

Passing `--artifact-directory <path>` overrides the generated location.

Each run artifact contains:

- `run.json`: run manifest, aggregate final status, oracle status, and agentic
  session status when applicable.
- `target.json`: target manifest used for the run.
- `scenario.json`: scenario source at run time.
- `evidence-map.json`: evidence map source at run time.
- `outcome-contract.json`: generated contract used by the oracle.
- `interaction.json`: materialized interaction, only when the scenario defines
  generated or agentic interaction.
- `caller-session.json`: realized caller-agent decisions and turns, only when
  an agentic run records a frozen caller session.
- `raw-observations.json`: adapter-level raw result metadata.
- `canonical-observation.json`: normalized evidence observations.
- `oracle-result.json`: deterministic oracle decision.
- `report.md`: human-readable report.
- `hashes.json`: SHA-256 hashes for artifact files.
- `logs/stdout.log` and `logs/stderr.log`: adapter execution logs.

`run.json` uses `status` for the final run status. For non-agentic runs this is
normally the same as `oracleStatus`. For agentic runs, `status` is `FAIL` when
the oracle passes but the caller session stops before `completed`;
`oracleStatus` preserves the deterministic oracle decision used by replay, and
`agentic.stopReason` records why the caller session ended. Lifecycle diagnostics
take precedence in the aggregate status: any setup-class failure produces
`SETUP_FAILED`, otherwise an observability-class failure produces
`OBSERVABILITY_FAILED`. `adapterFailures` is the sole ordered lifecycle-failure
contract and records every such failure.

An individual adapter execution result may expose one diagnostic as
`metadata.adapterFailure`; that adapter-local result is the input from which the
CLI builds the aggregate `adapterFailures` list. It is not a second serialized
run-artifact contract.

## Canonical Observation

Canonical observations contain accepted evidence, rejected evidence, setup
evidence, observed trace sources, correlation fields, observed ordering fields,
and forbidden side effects. Adapters may collect evidence from APIs, logs,
traces, events, tool calls, or state changes, but they must normalize it into
this structure before oracle evaluation. An ordering requirement is proven only
when its name appears in `observedOrdering`.

## Integrity Boundary

Artifact reads are fail-closed. Pagoda first requires `run.json.files` to use
the canonical filenames, then rejects paths outside the artifact directory,
symbolic links, non-regular files, missing or unexpected hash entries, malformed
SHA-256 values, and byte/hash mismatches. Proof JSON is parsed only after those
checks pass. `hashes.json` contains hashes for every declared artifact file
except itself. These hashes detect internal inconsistency; they are not a
signature or an assertion of who produced the bundle.

`pagoda report` is the one controlled repair path: it may ignore the existing
`report.md` bytes, but it still verifies every proof source and its hash before
regenerating the report and atomically updating the report hash. It cannot be
used to bless a modified contract, observation, oracle result, manifest, or log.

## Replay

Replay reads the saved outcome contract and canonical observation, reruns the
oracle with the original interaction case id when present, and compares the
replayed result with `oracle-result.json`. Replay never regenerates agentic
caller turns; `caller-session.json` is preserved as run context.

```bash
pagoda replay --artifact .pagoda/artifacts/runs/<run-dir>
pagoda report --artifact .pagoda/artifacts/runs/<run-dir>
```

From the Pagoda development workspace, use `artifacts/runs/<run-dir>` instead.
