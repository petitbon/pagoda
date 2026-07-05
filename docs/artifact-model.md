# Artifact Model

Pagoda run artifacts are reproducible proof bundles. They answer what was
tested, against which target, what evidence was observed, what the oracle
decided, and whether the decision can be replayed.

## Files

A run writes a directory named:

```text
<timestamp>_<target>_<scenario>_<channel>/
```

The parent directory depends on the project-pack mode:

- standalone observed repo: `.pagoda/artifacts/runs/`
- Pagoda development workspace: `artifacts/runs/`

Passing `--artifact-directory <path>` overrides the generated location.

Each run artifact contains:

- `run.json`: run manifest and final status.
- `target.json`: target manifest used for the run.
- `scenario.json`: scenario source at run time.
- `evidence-map.json`: evidence map source at run time.
- `outcome-contract.json`: generated contract used by the oracle.
- `raw-observations.json`: adapter-level raw result metadata.
- `canonical-observation.json`: normalized evidence observations.
- `oracle-result.json`: deterministic oracle decision.
- `report.md`: human-readable report.
- `hashes.json`: SHA-256 hashes for artifact files.
- `logs/stdout.log` and `logs/stderr.log`: adapter execution logs.

## Canonical Observation

Canonical observations contain accepted evidence, rejected evidence, setup
evidence, observed trace sources, correlation fields, and forbidden side effects.
Adapters may collect evidence from APIs, logs, traces, events, tool calls, or
state changes, but they must normalize it into this structure before oracle
evaluation.

## Replay

Replay reads the saved outcome contract and canonical observation, reruns the
oracle, and compares the replayed result with `oracle-result.json`.

```bash
pagoda replay --artifact .pagoda/artifacts/runs/<run-dir>
pagoda report --artifact .pagoda/artifacts/runs/<run-dir>
```

From the Pagoda development workspace, use `artifacts/runs/<run-dir>` instead.
