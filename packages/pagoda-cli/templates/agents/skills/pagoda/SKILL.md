---
name: pagoda
description: Use when authoring, updating, compiling, validating, or running Pagoda scenarios, evidence maps, outcome contracts, adapters, project packs, or run artifacts in an observed agentic software repo.
---

# Pagoda

Use this skill when working with a repo that has a `.pagoda/` project pack.

## Workflow

1. Read `.pagoda/pagoda.target.json` first to identify paths, adapters, and supported channels.
2. Read `.pagoda/evidence/registry.json` and `.pagoda/adapters/*/pagoda.adapter.json` before changing evidence codes or adapter capabilities.
3. Read existing `.pagoda/scenarios/*/scenario.json` and `.pagoda/scenarios/*/evidence-map.json` before adding new scenarios. Legacy flat `*.scenario.json` and `*.evidence-map.json` files are still supported.
4. Prefer `pagoda scenario create --root .pagoda --id <SCENARIO-ID> --title "<title>" --channel <channel> --interaction generated|agentic|none` for new scenarios, then edit the generated scenario and evidence map. Choose the interaction mode deliberately; default to `generated` unless the scenario needs caller-agent behavior.
5. Run `pagoda compile --root .pagoda` after scenario or evidence-map changes. Outcome contracts are generated artifacts and should not be hand-edited.
6. Run `pagoda validate --root .pagoda` before finishing.
7. Run `pagoda adapter check --root .pagoda --adapter <adapter-id> --scenario <scenario-id>` before running a new or changed scenario.
8. Run the most relevant scenario command, usually `pagoda run --root .pagoda --scenario <scenario-id> --channel <channel>` or `pagoda run --root .pagoda --channel <channel>`.

If `pagoda` is not installed globally, install the published CLI with Homebrew:

```bash
brew tap petitbon/pagoda https://github.com/petitbon/pagoda
brew trust petitbon/pagoda
brew install pagoda
```

## Authoring Rules

- Keep Pagoda project-agnostic at the framework layer; product-specific details belong in `.pagoda/adapters/`.
- Prefer business evidence names such as `LOCATION_ANSWERED`, `CANCELLATION_POLICY_ANSWERED`, `VISIBLE_RESPONSE`, and `AUDIBLE_RESPONSE`.
- Use `VISIBLE_RESPONSE` for browser/chat UI evidence and `AUDIBLE_RESPONSE` for phone/heard-audio evidence.
- Do not infer PASS from assistant prose alone when the scenario requires trusted tool, API, state, transcript, or runtime evidence.
- For shared cross-channel scenarios, keep the business outcome shared but model channel-specific proof separately in `channelContracts`.
- Avoid exact assistant-response strings for cross-channel scenarios unless exact wording is the requirement. Prefer stable fact fragments, semantic business predicates, or source-backed evidence because voice runtimes naturally paraphrase.
- Use channel ids exactly as declared in `.pagoda/pagoda.target.json`; do not invent aliases such as `chat` when the manifest declares `browser-chat`.
- Keep `labels.channels`, `channelContracts.channels`, and manifest `channels` consistent.
- Keep `.pagoda/evidence/registry.json` aligned with scenario and adapter evidence codes.
- Keep adapter `producesEvidenceCodes` aligned with the required setup, outcome, workflow, common, and channel evidence for scenarios it runs.
- Use scenario `interaction` for generated user turns when present. Case ids are stable; `--seed` changes default ordering/template choice, not what `case-001` means.
- Generated run artifacts under `.pagoda/artifacts/` are local output and should not be committed.
- Do not hand-edit generated outcome contracts, reports, or run artifacts except while debugging generator output. Fix source scenarios, evidence maps, adapters, fixtures, or registries instead.

## Interaction Mode Selection

- Use `--interaction generated` by default for deterministic request/response scenarios where templated user turns are enough.
- Use `--interaction agentic` when the user or caller needs a persona, private goal, follow-up behavior, corrections, acceptance or rejection, or confirmation verification.
- Use `--interaction none` only for legacy scenarios, replay-only scenarios, or cases where the adapter supplies all execution input.
- Before choosing `agentic`, confirm the selected adapter manifest declares `interactionModes` including `agentic`.
- For generated scenarios, prefer slots and `seeded-pairwise` coverage over duplicating many near-identical scenarios.
- For agentic scenarios, keep oracle proof in trusted adapter evidence; caller turns are execution input and artifact context, not PASS proof.

## Live Adapter Rules

- Prefer platform-owned observations over harness-side approximations. For phone/voice runs, use the target system's persisted transcript, timeline, metrics, tool calls, and evidence rows when available; do not decide PASS/FAIL from a second STT pass over outbound audio.
- Harness-side transcription or screen/audio capture is useful for debugging, but should be fallback evidence only when the platform has no canonical transcript or observable evidence.
- Live adapters should wait for channel readiness before sending the user turn. For phone, wait for the initial greeting or session-ready signal so synthetic caller audio does not collide with startup audio.
- Live adapters should end sessions after collecting required evidence. Close chat sessions, send phone stop/end events, and include end status in metadata.
- Interactive adapter methods may receive an abort signal. Honor it during startup, observation, caller-turn sending, and finish work, and keep cleanup idempotent so late-created sessions can be released after timeout.
- Keep transport details separate from trust details. For webhook drivers, the URL used to POST may differ from the URL used for request signing or public verification; sign against the target service's configured public URL.
- Adapters may discover local env files, ADC, or repo-local harness config to make local validation ergonomic, but must fail closed with a concrete setup error when required trusted config cannot be resolved.
- Preserve useful raw platform observations in artifacts or metadata for debugging, but translate only trusted canonical evidence into oracle inputs.
- Adapter evidence translation should reference trusted source-of-truth facts, grounding metadata, transcript rows, tool outcomes, or state transitions. Text matching can be used for lightweight public-answer scenarios, but should be tolerant of channel-appropriate paraphrase and should not override contradictory platform evidence.

## Scenario Checklist

For each new scenario:

- Prefer the bundle layout: `.pagoda/scenarios/<scenario-slug>/scenario.json`.
- Add the paired map beside it: `.pagoda/scenarios/<scenario-slug>/evidence-map.json`.
- Include setup evidence in `fixture.setupEvidenceCodes`.
- Include accepted outcome evidence in `evidence.acceptedEvidenceCodes`.
- Include rejected evidence and forbidden side effects for unsafe behavior.
- Add a channel contract for every supported channel the scenario declares.
- Run `pagoda adapter check --root .pagoda --adapter <adapter-id> --scenario <scenario-id>` to find missing adapter capabilities.
- Update the adapter only when it cannot yet emit the required canonical evidence codes.
- For generated interaction scenarios, use `pagoda run --root .pagoda --scenario <scenario-id> --interaction-case case-001` to reproduce one case or `--interaction-cases all` for pairwise coverage.

## When Validation Fails

- `SCENARIO_INVALID`: fix scenario, evidence-map, contract, manifest, or registry structure and consistency first.
- `OBSERVABILITY_FAILED`: fix setup or adapter evidence collection; do not weaken the scenario outcome just because required evidence was unavailable.
- `FAIL`: inspect the observed canonical evidence and forbidden side effects before loosening assertions.

## Classification

Pagoda statuses are strict:

- `SCENARIO_INVALID`: scenario/map/contract is invalid.
- `SETUP_FAILED`: target or fixture setup failed.
- `OBSERVABILITY_FAILED`: the run happened but required evidence was unavailable.
- `FAIL`: evidence proves a violation or required outcome is missing.
- `PASS`: required evidence is proven and forbidden side effects are absent.
