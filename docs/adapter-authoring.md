# Adapter Authoring

Adapters connect Pagoda to an observed agentic platform. They translate normal
platform behavior into canonical evidence observations.

Pagoda core is target-agnostic. Adapters are intentionally target-specific.
That boundary is what lets the same Pagoda model work for many projects:

```text
Observed platform APIs, logs, events, traces, state
  -> target-specific adapter
  -> canonical Pagoda observation
  -> target-agnostic oracle
```

For example, one adapter may know about browser-chat sessions, phone webhooks,
call-session ids, and startup facts. Another adapter may know about graph runs,
node traces, assistant run steps, Playwright traces, or DOM state. Pagoda core
should not know about any of those platform details.

## Lifecycle

Adapters implement `PagodaTargetAdapter` from `@petitbon/pagoda-adapter-sdk`:

```text
healthCheck -> prepare -> execute -> collectObservations -> cleanup
```

- `healthCheck`: report whether the adapter can run.
- `prepare`: create target fixtures, sessions, users, or seed data.
- `execute`: run the target scenario.
- `collectObservations`: normalize target output into canonical evidence.
- `cleanup`: remove temporary state when needed.

Pagoda fully awaits observation collection and any raw report read before it
starts cleanup. Cleanup is also fully awaited before oracle evaluation and
artifact writing. A cleanup error does not erase collected evidence or change
the deterministic oracle result, but it does make the aggregate run status
`SETUP_FAILED` and adds a `cleanup` diagnostic. If any lifecycle method throws,
Pagoda converts the error into a failed target result and still writes an
artifact whenever a run plan can be created. Adapters whose `prepare` or
interactive startup completed should therefore tolerate `collectObservations`
receiving a failed result and should keep cleanup idempotent.

## Rules

- Do not make oracle decisions in adapters.
- Do not push target-specific concepts into Pagoda core. Keep those details in
  the project pack adapter.
- Do not depend on framework internals outside published package exports.
- In a standalone `.pagoda` pack, keep the adapter package-free unless the
  observed repo already provides a stable runtime dependency you intentionally
  call.
- Return `SETUP_FAILED` collector status when the target cannot be prepared.
- Return `OBSERVABILITY_FAILED` collector status when required evidence cannot
  be observed.
- Keep credentials and private fixtures outside committed project packs.

## Standalone Project Packs

`pagoda init` creates a minimal `.pagoda/adapters/<project-id>-local/` adapter
bundle. The project id defaults to the observed repo directory name:

```text
.pagoda/adapters/<project-id>-local/
  pagoda.adapter.json
  index.mjs
```

The adapter module uses plain Node.js exports and does not import Pagoda
packages, so the observed repo does not need a package install.

Create another adapter bundle with:

```bash
pagoda adapter create --root .pagoda --id product-agent-experimental --channel browser-chat
```

The generated `pagoda.adapter.json` declares the adapter id, channel,
entrypoint, produced evidence codes, and required environment variables.
Pagoda uses `producesEvidenceCodes` as a preflight contract: a scenario will
not run through an adapter unless the adapter declares every required setup,
outcome, workflow, common, and channel evidence code for that scenario. Check a
specific scenario before execution:

```bash
pagoda adapter check --root .pagoda --adapter product-agent-experimental --scenario PRODUCT-AGENT-LOCATION-ANSWER-001
```

The run plan passed to the adapter includes:

- `run.projectRoot`: the observed repo root, which is the parent directory of
  `.pagoda/`.
- `run.targetRoot`: the `.pagoda/` directory.
- `run.scenario`: the canonical scenario being executed.
- `run.channel`: the selected interaction channel.
- `run.interaction`: optional materialized generated user turns for this run.

Use those paths to launch product code, call local services, read logs, inspect
state, or collect traces. Return one canonical observation object from
`collectObservations`; the oracle evaluates that observation against the
generated outcome contract.

When `run.interaction` exists, adapters should drive the target channel with
`run.interaction.turns` rather than inventing prompts from harness metadata.
Adapters still own channel mechanics such as waiting for readiness, sending
browser-chat messages, placing phone calls, collecting platform evidence, and
normalizing that evidence. Interaction text alone does not prove PASS.

Interactive adapters should return only newly observed target turns from
`observeTarget` and `sendCallerTurn` for efficiency. Pagoda also accepts full
transcript snapshots and dedupes target turns by stable `PagodaTargetTurn.id`.
If target text is materially revised, emit a new target turn id rather than
reusing an old id.

An interactive adapter can optionally supply a target-specific caller policy:

```ts
const adapter: PagodaInteractiveTargetAdapter = {
  // ...the normal adapter and interactive methods...
  async createCallerAgentProvider({ run, interaction }) {
    return {
      id: `${run.targetId}-caller-policy`,
      model: 'target-policy-v1',
      deterministic: true,
      async decide({ observedTurns, previousDecisions }) {
        return decideForTarget(interaction, observedTurns, previousDecisions);
      }
    };
  }
};
```

Use this hook for domain vocabulary, policy lookup, or model-backed decisions.
Without it, Pagoda uses a conservative target-neutral provider driven by goal
facts, acceptable alternatives, intervention triggers, and explicit
`termination.stopOn` phrases.

## Canonical Observation

Every adapter, regardless of platform, normalizes raw behavior to this shape:

```js
return {
  acceptedEvidenceCodes: [
    "LOCATION_ANSWERED",
    "VISIBLE_RESPONSE",
    "SESSION_CONTEXT"
  ],
  rejectedEvidenceCodes: [],
  repairCodes: [],
  observedTraceSources: ["transcript"],
  observedCorrelation: ["channel"],
  observedOrdering: ["eventTime"],
  forbiddenToolNames: [],
  forbiddenEvents: [],
  forbiddenClaims: [],
  setupEvidenceCodes: ["SETUP_READY"],
  evidenceRefsByCode: {
    LOCATION_ANSWERED: ["transcript:assistant-final:msg_123"],
    VISIBLE_RESPONSE: ["trace:browser-chat:chat_123"],
    SESSION_CONTEXT: ["session:chat_123"],
    SETUP_READY: ["fixture:dev-location"]
  },
  collectorStatus: null
};
```

`observedOrdering` reports ordering guarantees actually established by the
collector. Do not copy the contract requirement blindly: use `[]` when the
available evidence cannot establish ordering. Missing required ordering is
classified as `OBSERVABILITY_FAILED`.

The evidence code names are local to the project pack. Use names that are
meaningful for the target, but avoid encoding transient implementation details
when a business outcome name is clearer.

Keep `.pagoda/evidence/registry.json` aligned with scenario and adapter
changes. `pagoda init`, `pagoda scenario create`, and `pagoda adapter create`
update it automatically for generated files. If you hand-edit evidence codes,
run `pagoda validate` to catch missing registry entries and stale contracts.

Good evidence names:

```text
LOCATION_ANSWERED
CANCELLATION_POLICY_ANSWERED
PROVIDER_SERVICES_ANSWERED
VISIBLE_RESPONSE
AUDIBLE_RESPONSE
NO_UNAPPROVED_BOOKING
```

Avoid making the code depend on a private route or product component name when
the outcome is broader:

```text
HTTP_API_SALON_CONFIG_ROUTE_200
MY_PRIVATE_EVALUATOR_123
```

Those details can still appear in `evidenceRefsByCode`.

## Multi-Channel Adapters

A scenario can support multiple channels. The adapter can branch on
`run.channel` while returning the same canonical observation shape.

```js
async execute(prepared) {
  const run = preparedRuns.get(prepared.runId);

  if (run.channel === "browser-chat") {
    return executeBrowserChat(prepared, run);
  }

  if (run.channel === "phone") {
    return executePhone(prepared, run);
  }

  return {
    runId: prepared.runId,
    status: "failed",
    stdout: "",
    stderr: `Unsupported channel: ${run.channel}`,
    exitCode: 1,
    metadata: { channel: run.channel }
  };
}
```

The browser-chat branch might collect:

```text
HTTP session response
SSE transcript events
assistant.final payload
browser-visible response
```

The phone branch might collect:

```text
call-session record
phone transcript
telephony events
runtime observations
audio or speech-turn metadata
```

For a live phone runtime, do not fake a browser text turn unless that is an
explicit supported test seam in the observed product. A good phone adapter
usually does one of these:

- starts or selects a real test call, then reads the product's call-session or
  debug-bundle export;
- replays a captured phone evidence bundle for deterministic regression;
- delegates call placement to a product-owned phone harness, then collects the
  resulting transcript and runtime observations.

The adapter should emit `AUDIBLE_RESPONSE` only when trusted phone evidence
shows the assistant response was actually available to the caller. Examples are
assistant speech-realization rows, heard-audio transcript policy, telephony
playback completion events, or another product-owned evidence source with the
same meaning.

Both branches can prove the same business outcome:

```js
{
  acceptedEvidenceCodes: [
    "LOCATION_ANSWERED",
    "SESSION_CONTEXT",
    run.channel === "phone" ? "AUDIBLE_RESPONSE" : "VISIBLE_RESPONSE"
  ],
  observedTraceSources: ["transcript"],
  observedCorrelation: ["channel"],
  observedOrdering: ["eventTime"],
  setupEvidenceCodes: ["SETUP_READY"],
  collectorStatus: null
}
```

The scenario and evidence map define what must be proven. The adapter decides
which target-native facts prove it for the selected channel.

## Raw Evidence And Debuggability

When an adapter fails to emit a required evidence code, the run artifact should
make the failure diagnosable. Include useful raw target data in the target run
result metadata or `reportFile`, such as:

```js
return {
  runId: prepared.runId,
  status: "completed",
  stdout: JSON.stringify({ sessionId, turnStatus }),
  stderr: "",
  exitCode: 0,
  metadata: {
    userText,
    session,
    turn,
    events,
    finalAssistantText,
    traceIds
  }
};
```

Pagoda writes that data into the run artifact so adapter authors can tune
evidence extraction without guessing what the target actually returned.

## Replay Adapter

Generated project packs include `adapters/replay/`. It does not drive the
observed platform. Instead, it loads an already-normalized
`canonical-observation.json` from `PAGODA_REPLAY_OBSERVATION`,
`PAGODA_REPLAY_ARTIFACT`, or `.pagoda/traces/`.

Use replay when you want deterministic oracle regression checks from a saved
artifact:

```bash
PAGODA_REPLAY_ARTIFACT=.pagoda/artifacts/runs/<run-dir> \
  pagoda run --root .pagoda --scenario PRODUCT-AGENT-SAFE-PROPOSAL-001 --adapter replay
```

The replay adapter declares `producesEvidenceCodes: ["*"]` because it consumes
canonical observations directly. Live adapters should declare concrete evidence
codes.

## Minimal Implementation

Use `targets/demo-agent/adapters/deterministic/index.ts` as the reference
adapter. It has no external dependencies and demonstrates every classification
path used by the demo target.
