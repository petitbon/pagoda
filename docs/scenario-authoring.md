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
- harness metadata for the target adapter;
- optional generated or agentic interaction input for user turns.

## Interaction

Scenarios may define optional `interaction` intent. Interaction is execution
input and artifact context; it is not oracle proof.

### Generated Interaction

With `mode: "generated"`, Pagoda materializes deterministic user turns from
templates and slots before handing a run to the adapter:

```json
{
  "interaction": {
    "mode": "generated",
    "slots": {
      "urgency": { "values": ["standard", "time-sensitive"] },
      "request": { "values": ["safe proposal", "next step"] }
    },
    "turns": [
      {
        "id": "request-proposal",
        "actor": "user",
        "after": "channel-ready",
        "templates": ["Please give me a {urgency} {request}."]
      }
    ],
    "coverage": { "strategy": "seeded-pairwise" }
  }
}
```

Case ids such as `case-001` identify stable slot combinations. `--seed`
controls default selection, all-case ordering, and template choice, but it does
not change what a case id means.

### Agentic Interaction

With `mode: "agentic"`, the scenario declares a caller persona, private goal,
knowledge boundaries, intervention policy, and termination policy. Pagoda
materializes a stable caller plan from the same slot/case machinery, and an
interactive adapter or caller runtime can use that plan to generate realistic
caller turns.

```json
{
  "interaction": {
    "mode": "agentic",
    "persona": {
      "id": "booking-caller",
      "traits": ["natural", "{flexibility}"]
    },
    "slots": {
      "flexibility": { "values": ["strict", "within one hour"] },
      "service": { "values": ["barber haircut", "beard trim"] }
    },
    "goal": {
      "summary": "Book a {flexibility} {service} with Norman tomorrow around 2 PM.",
      "facts": {
        "service": "{service}",
        "staff": "Norman"
      },
      "acceptableAlternatives": ["Norman within one hour of 2 PM."],
      "successCriteria": ["A bookable {service} option is explicitly offered."]
    },
    "knowledge": {
      "knownFacts": ["The caller wants Norman for a {service}."],
      "unknownFacts": ["The caller does not know backend availability."],
      "disclosureRules": ["Only accept explicit bookable options."]
    },
    "interventionPolicy": {
      "triggers": [
        "answer-question",
        "ask-clarification",
        "correct-conflicting-fact",
        "accept-valid-option",
        "verify-confirmation"
      ],
      "patience": "medium"
    },
    "termination": {
      "maxTurns": 6,
      "maxDurationMs": 90000
    },
    "coverage": { "strategy": "seeded-pairwise" }
  }
}
```

Adapters must declare `interactionModes: ["agentic"]` before Pagoda will run an
agentic scenario with them. Live agentic runs should persist the realized caller
decisions in `caller-session.json`; replay uses saved observations and does not
call the model again. Agentic slots use the same `{slot}` token syntax as
generated turns. Pagoda renders selected slot values into caller-facing strings
in `persona.traits`, `goal.summary`, string `goal.facts`, alternatives, success
criteria, and knowledge arrays before writing `interaction.json`; stable ids,
policy triggers, and termination fields are not rendered. `caller-session.json`
then records decisions and turns produced from that rendered caller plan.
`accept-valid-option` lets the caller approve an
acceptable proposal. For proposal-style scenarios that do not include
`end-when-complete`, that approval completes the caller session. Booking,
front-desk, and other side-effect workflows should include `end-when-complete`;
in those scenarios approval is not terminal, and Pagoda keeps observing until a
strong completion cue matches the scenario's declared facts or an explicit
`termination.stopOn` phrase. If a target confirms completion immediately after
an accepted option, Pagoda can end the caller session in that same runner loop.
Responses to answers, corrections, rejections, or verification requests do not
use that immediate post-send completion shortcut; a later observed target turn
must drive the next decision. Generic metadata such as the requested outcome or
channel should stay in the goal summary or knowledge, not in `goal.facts`.
Completion does not fire for generic language, consent/setup questions, or
negated confirmations. Courtesy phrases such as `No problem` are not treated as
negation. Those turns are verified, clarified, answered, or ignored according
to the intervention policy. `correct-conflicting-fact` applies when the target
explicitly assigns a value that conflicts with a declared goal fact; target
packs that need domain-specific interpretation should supply a caller provider
from their interactive adapter. `maxDurationMs`
covers interactive startup, target observation, caller decisions, caller turns,
and interactive finish. Interactive adapters receive an optional abort signal
for those operations and should stop pending channel work when the signal is
aborted.

`termination.stopOn` lists explicit target phrases that prove the caller goal
is terminal. Matching is case-insensitive and token based, and a nearby
negation prevents termination. Keep the phrases specific enough that an
unrelated status message cannot end the session.

In a standalone observed repo, prefer one bundle per scenario:

```text
.pagoda/scenarios/<scenario-slug>/
  scenario.json
  evidence-map.json
```

Flat `*.scenario.json` and `*.evidence-map.json` pairs are also a permanent
supported layout for compact target packs, including Pagoda's demo target.
Bundle layout is preferred when a target benefits from colocated scenario
assets. Generated contracts live under `.pagoda/contracts/`.

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

The generator creates generated interaction by default. Use
`--interaction none` for a permanently supported direct-observation scenario
without generated user turns, or `--interaction agentic` for a starter
caller-agent scenario. The target pack owns this choice; `none` is not a
compatibility fallback.
It also creates the scenario bundle, evidence map, generated outcome contract,
and evidence-registry entries. Then:

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
