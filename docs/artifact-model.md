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
the same as `oracleStatus`. For agentic runs, `status` is `FAIL` when the oracle
passes but the caller session stops before `completed`; `oracleStatus` preserves
the deterministic oracle decision used by replay, and `agentic.stopReason`
records why the caller session ended.

## Canonical Observation

Canonical observations contain accepted evidence, rejected evidence, setup
evidence, observed trace sources, correlation fields, and forbidden side effects.
Adapters may collect evidence from APIs, logs, traces, events, tool calls, or
state changes, but they must normalize it into this structure before oracle
evaluation.

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
