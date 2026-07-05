# Scenario Authoring

Author scenarios around evidence-backed outcomes, not transcript strings.

## Scenario Fields

Each scenario should define:

- identity, status, title, owner, and labels;
- user or system intent;
- fixture requirements and setup evidence;
- required trace sources;
- accepted evidence codes;
- rejected evidence codes;
- required workflow outcomes;
- forbidden tools, events, and claims;
- channel-specific evidence requirements;
- harness metadata for the target adapter.

In a standalone observed repo, prefer one bundle per scenario:

```text
.pagoda/scenarios/<scenario-slug>/
  scenario.json
  evidence-map.json
```

Legacy flat `*.scenario.json` and `*.evidence-map.json` files are still
supported. Generated contracts live under `.pagoda/contracts/`.

## Evidence Maps

Evidence maps describe how trusted observations prove or disprove the outcome.
Use nodes for actors, intents, authorities, facts, evidence, side effects,
oracle decisions, recovery paths, and outcomes. Use edges to describe causal or
proof relationships.

## Contracts

Do not hand-edit outcome contracts. In a standalone observed repo, run:

```bash
pagoda compile
```

Then validate freshness:

```bash
pagoda validate
```

From the Pagoda development workspace:

```bash
yarn workspace @petitbon/pagoda-cli pagoda compile
yarn workspace @petitbon/pagoda-cli pagoda validate
```

## First Scenario Workflow

Start from the generated scenario created by:

```bash
pagoda init
```

For an additional scenario, prefer the generator:

```bash
pagoda scenario create --root .pagoda \
  --id PRODUCT-AGENT-LOCATION-ANSWER-001 \
  --title "Location answer" \
  --channel browser-chat \
  --domain business-info \
  --outcome location-answered \
  --risk low
```

The generator creates the scenario bundle, evidence map, generated outcome
contract, and evidence-registry entries. Then:

1. Rename the scenario id and title to the behavior being validated.
2. Describe the user or system intent.
3. Declare fixture and setup evidence.
4. Declare required trace sources and accepted evidence codes.
5. Declare rejected evidence and forbidden side effects.
6. Update the evidence map so every required proof has a trusted source.
7. Run `pagoda compile`, then `pagoda validate`.
8. Run `pagoda adapter check --adapter <adapter-id> --scenario <scenario-id>`.
9. Replace or extend the adapter observation with real evidence collection
   for any missing evidence codes.

`pagoda run` performs the same adapter capability check before execution. If
the adapter manifest does not declare the required scenario evidence codes,
Pagoda stops before driving the target.
