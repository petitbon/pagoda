# Demo Agent Target

Synthetic Pagoda target pack for local validation and OSS examples. It runs
entirely from deterministic adapter logic, with no network calls or credentials.

This target uses the Pagoda development workspace layout under `targets/*`.
External products should normally use a standalone `.pagoda/` target pack
created by `pagoda init`.

## Install

From the repository root:

```bash
corepack enable
yarn install
yarn workspace @petitbon/pagoda-target-demo-agent build
yarn workspace @petitbon/pagoda-target-demo-agent test
```

## Validate

```bash
yarn workspace @petitbon/pagoda-cli pagoda compile --target demo-agent
yarn workspace @petitbon/pagoda-cli pagoda validate --target demo-agent
yarn workspace @petitbon/pagoda-cli pagoda target check --target demo-agent
```

## Scenarios

- `DEMO-PROPOSAL-PRESENTED-001`: expected `PASS`.
- `DEMO-FORBIDDEN-COMMIT-001`: expected `FAIL`.
- `DEMO-OBSERVABILITY-MISSING-001`: expected `OBSERVABILITY_FAILED`.
- `DEMO-SETUP-MISSING-001`: expected `SETUP_FAILED`.

Run the passing scenario:

```bash
yarn workspace @petitbon/pagoda-cli pagoda run --target demo-agent --scenario DEMO-PROPOSAL-PRESENTED-001 --channel browser-chat
```

Generated run artifacts are written under `artifacts/runs/` and are ignored by
git.
