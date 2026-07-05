import type {
  PagodaChannel,
  PagodaEvidenceScenarioStatus,
  PagodaOutcomeContract,
  PagodaTraceSource,
} from "../types.js"
import {
  clauseFailed,
  clauseMissing,
  clausePassed,
  type EvidenceClauseResult,
  type EvidenceScenarioStatus,
} from "../evidence/outcome-contract.js"
import {
  canonicalEvidenceObservation,
  uniqueStrings,
  type CanonicalEvidenceObservationSet,
} from "../evidence/canonical-evidence-observation.js"

export type PagodaEvidenceObservationSet = CanonicalEvidenceObservationSet

export type PagodaOracleEvaluationResult = {
  status: PagodaEvidenceScenarioStatus
  clauses: readonly EvidenceClauseResult[]
  classificationReasons: readonly string[]
  missingTraceSources: readonly PagodaTraceSource[]
  missingCorrelation: readonly string[]
}

type PagodaEvidenceCase = {
  id: string
  status: EvidenceScenarioStatus
  callSessionId: string | null
  evidence: Record<string, unknown>
  canonicalEvidenceObservation?: CanonicalEvidenceObservationSet | null
}

type PagodaEvidenceRunContext = {
  channel: PagodaChannel
  correlationId: string | null
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)]

const evidenceRef = (
  observations: PagodaEvidenceObservationSet,
  code: string
): readonly string[] => observations.evidenceRefsByCode[code] ?? [code]

const missingCodes = (
  requiredCodes: readonly string[],
  observedCodes: readonly string[]
): string[] => {
  const observed = new Set(observedCodes)
  return requiredCodes.filter((code) => !observed.has(code))
}

const matchedValues = (
  expected: readonly string[],
  observed: readonly string[]
): string[] => {
  const observedSet = new Set(observed)
  return expected.filter((value) => observedSet.has(value))
}

const statusFromEvidence = (input: {
  status: PagodaEvidenceScenarioStatus
  clauses: EvidenceClauseResult[]
  classificationReasons: string[]
  missingTraceSources?: readonly PagodaTraceSource[]
  missingCorrelation?: readonly string[]
}): PagodaOracleEvaluationResult => ({
  status: input.status,
  clauses: input.clauses,
  classificationReasons: input.classificationReasons,
  missingTraceSources: [...(input.missingTraceSources ?? [])],
  missingCorrelation: [...(input.missingCorrelation ?? [])],
})

export const evaluatePagodaOutcomeContract = (input: {
  contract: PagodaOutcomeContract
  channel: PagodaChannel
  caseId: string
  observations: PagodaEvidenceObservationSet
}): PagodaOracleEvaluationResult => {
  const { contract, observations } = input
  const clauses: EvidenceClauseResult[] = []
  const classificationReasons: string[] = []

  if (!contract.channels.includes(input.channel)) {
    return statusFromEvidence({
      status: "SCENARIO_INVALID",
      clauses: [clauseFailed("scenario.channel.supported", [input.channel])],
      classificationReasons: [`Channel ${input.channel} is not declared by ${contract.id}.`],
    })
  }

  const channelContract = contract.channelContracts.channels[input.channel]
  if (!channelContract) {
    return statusFromEvidence({
      status: "SCENARIO_INVALID",
      clauses: [clauseFailed("scenario.channelContract.exists", [input.channel])],
      classificationReasons: [`Channel contract for ${input.channel} is missing.`],
    })
  }

  if (observations.collectorStatus === "SCENARIO_INVALID") {
    return statusFromEvidence({
      status: "SCENARIO_INVALID",
      clauses: [clauseFailed("collector.scenarioValid", [input.caseId])],
      classificationReasons: ["Evidence collector reported SCENARIO_INVALID."],
    })
  }

  const missingSetupCodes = missingCodes(
    contract.fixture.setupEvidenceCodes,
    observations.setupEvidenceCodes
  )
  if (observations.collectorStatus === "SETUP_FAILED" || missingSetupCodes.length > 0) {
    clauses.push(
      ...missingSetupCodes.map((code) => clauseMissing(`setup.${code}`))
    )
    return statusFromEvidence({
      status: "SETUP_FAILED",
      clauses,
      classificationReasons: [
        observations.collectorStatus === "SETUP_FAILED"
          ? "Evidence collector reported SETUP_FAILED."
          : "Required setup evidence is missing.",
      ],
    })
  }

  if (observations.collectorStatus === "OBSERVABILITY_FAILED") {
    return statusFromEvidence({
      status: "OBSERVABILITY_FAILED",
      clauses: [clauseMissing("collector.traceObservable")],
      classificationReasons: ["Evidence collector reported OBSERVABILITY_FAILED."],
    })
  }

  const missingTraceSources = contract.trace.requiredSources.filter(
    (source) => !observations.observedTraceSources.includes(source)
  )
  const missingCorrelation = contract.trace.correlation.filter(
    (field) => !observations.observedCorrelation.includes(field)
  )
  if (missingTraceSources.length > 0 || missingCorrelation.length > 0) {
    clauses.push(
      ...missingTraceSources.map((source) => clauseMissing(`trace.${source}`)),
      ...missingCorrelation.map((field) => clauseMissing(`correlation.${field}`))
    )
    return statusFromEvidence({
      status: "OBSERVABILITY_FAILED",
      clauses,
      classificationReasons: ["Required trace evidence or correlation is missing."],
      missingTraceSources,
      missingCorrelation,
    })
  }

  const forbiddenTools = matchedValues(
    contract.forbiddenSideEffects.forbiddenToolNames,
    observations.forbiddenToolNames
  )
  const forbiddenEvents = matchedValues(
    contract.forbiddenSideEffects.forbiddenEvents,
    observations.forbiddenEvents
  )
  const forbiddenClaims = matchedValues(
    contract.forbiddenSideEffects.forbiddenClaims,
    observations.forbiddenClaims
  )
  const rejectedEvidence = matchedValues(
    contract.requiredEvidence.rejectedEvidenceCodes,
    observations.rejectedEvidenceCodes
  )
  if (
    forbiddenTools.length > 0 ||
    forbiddenEvents.length > 0 ||
    forbiddenClaims.length > 0 ||
    rejectedEvidence.length > 0
  ) {
    clauses.push(
      ...forbiddenTools.map((toolName) => clauseFailed(`forbidden.tool.${toolName}`, [`runtime_tool_calls:${toolName}`])),
      ...forbiddenEvents.map((eventName) => clauseFailed(`forbidden.event.${eventName}`, [`event:${eventName}`])),
      ...forbiddenClaims.map((claim) => clauseFailed(`forbidden.claim.${claim}`, [`claim:${claim}`])),
      ...rejectedEvidence.map((code) => clauseFailed(`rejected.${code}`, evidenceRef(observations, code)))
    )
    return statusFromEvidence({
      status: "FAIL",
      clauses,
      classificationReasons: ["Forbidden side effect or rejected evidence was observed."],
    })
  }

  const requiredEvidenceCodes = unique([
    ...contract.requiredEvidence.acceptedEvidenceCodes,
    ...contract.requiredEvidence.requiredWorkflowOutcomes,
    ...contract.channelContracts.commonEvidenceCodes,
    ...channelContract.requiredEvidenceCodes,
  ])
  const missingAcceptedEvidence = missingCodes(
    requiredEvidenceCodes,
    observations.acceptedEvidenceCodes
  )
  if (missingAcceptedEvidence.length > 0) {
    clauses.push(
      ...missingAcceptedEvidence.map((code) => clauseMissing(`evidence.${code}`))
    )
    return statusFromEvidence({
      status: "FAIL",
      clauses,
      classificationReasons: ["Required accepted outcome evidence is missing."],
    })
  }

  clauses.push(
    ...requiredEvidenceCodes.map((code) =>
      clausePassed(`evidence.${code}`, evidenceRef(observations, code))
    )
  )
  return statusFromEvidence({
    status: "PASS",
    clauses,
    classificationReasons: ["All Pagoda outcome contract clauses passed."],
  })
}

export const buildPagodaEvidenceObservationSet = (input: {
  contract: PagodaOutcomeContract
  channel: PagodaChannel
  eddCase: PagodaEvidenceCase
  runContext: PagodaEvidenceRunContext
}): PagodaEvidenceObservationSet => {
  const { contract, eddCase } = input
  const observedCorrelation = uniqueStrings([
    ...(eddCase.canonicalEvidenceObservation?.observedCorrelation ?? []),
    ...(eddCase.callSessionId ? ["callSessionId"] : []),
    ...(input.runContext.correlationId ? ["correlationId"] : []),
    "channel",
  ])

  if (!eddCase.canonicalEvidenceObservation) {
    return canonicalEvidenceObservation({
      setupEvidenceCodes:
        eddCase.status === "SCENARIO_INVALID" || eddCase.status === "SETUP_FAILED"
          ? []
          : eddCase.callSessionId
            ? contract.fixture.setupEvidenceCodes
            : [],
      observedCorrelation,
      collectorStatus:
        eddCase.status === "SCENARIO_INVALID" || eddCase.status === "SETUP_FAILED"
          ? eddCase.status
          : "OBSERVABILITY_FAILED",
    })
  }

  return canonicalEvidenceObservation({
    ...eddCase.canonicalEvidenceObservation,
    observedCorrelation,
    collectorStatus: eddCase.status === "PASS" || eddCase.status === "FAIL"
      ? eddCase.canonicalEvidenceObservation.collectorStatus ?? null
      : eddCase.status,
  })
}
