# Security

Do not report security-sensitive issues in public issues.

Until a dedicated disclosure address is published, open a private advisory in
the hosting platform or contact the maintainers through the repository owner.

Pagoda target packs may collect logs, traces, tool calls, and state snapshots.
Contributors must redact secrets and private data before committing fixtures,
traces, artifacts, screenshots, or reports.

Standalone `.pagoda/` packs should keep credentials outside committed files.
Generated artifacts under `.pagoda/artifacts/runs/**` are local evidence output
and should not be committed.

Adapter execution is trusted-code execution. Commands that load an adapter,
including `pagoda check`, `pagoda adapter check`, and `pagoda run`, import and
execute JavaScript from the target pack. Only run those commands against target
packs and observed repositories you trust, especially when reviewing third-party
pull requests or cloned projects.
