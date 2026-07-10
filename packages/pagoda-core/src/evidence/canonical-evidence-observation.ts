import type { PagodaTraceSource } from "../types.js"
import type { EvidenceScenarioStatus } from "./outcome-contract.js"

export type CanonicalEvidenceObservationSet = {
  acceptedEvidenceCodes: readonly string[]
  rejectedEvidenceCodes: readonly string[]
  repairCodes: readonly string[]
  observedTraceSources: readonly PagodaTraceSource[]
  observedCorrelation: readonly string[]
  observedOrdering: readonly string[]
  forbiddenToolNames: readonly string[]
  forbiddenEvents: readonly string[]
  forbiddenClaims: readonly string[]
  setupEvidenceCodes: readonly string[]
  evidenceRefsByCode: Readonly<Record<string, readonly string[]>>
  collectorStatus?: EvidenceScenarioStatus | null
}

type MutableCanonicalEvidenceObservation = {
  acceptedEvidenceCodes: string[]
  rejectedEvidenceCodes: string[]
  repairCodes: string[]
  observedTraceSources: PagodaTraceSource[]
  observedCorrelation: string[]
  observedOrdering: string[]
  forbiddenToolNames: string[]
  forbiddenEvents: string[]
  forbiddenClaims: string[]
  setupEvidenceCodes: string[]
  evidenceRefsByCode: Record<string, string[]>
  collectorStatus?: EvidenceScenarioStatus | null
}

export const uniqueStrings = (values: readonly string[]): string[] => [
  ...new Set(values),
]

const uniqueTraceSources = (
  values: readonly PagodaTraceSource[]
): PagodaTraceSource[] => [...new Set(values)]

const uniqueRefs = (
  refs: Readonly<Record<string, readonly string[]>> | undefined
): Record<string, string[]> => {
  const output: Record<string, string[]> = {}
  for (const [code, values] of Object.entries(refs ?? {})) {
    output[code] = uniqueStrings(values)
  }
  return output
}

export const canonicalEvidenceObservation = (
  input: Partial<CanonicalEvidenceObservationSet> = {}
): CanonicalEvidenceObservationSet => ({
  acceptedEvidenceCodes: uniqueStrings(input.acceptedEvidenceCodes ?? []),
  rejectedEvidenceCodes: uniqueStrings(input.rejectedEvidenceCodes ?? []),
  repairCodes: uniqueStrings(input.repairCodes ?? []),
  observedTraceSources: uniqueTraceSources(input.observedTraceSources ?? []),
  observedCorrelation: uniqueStrings(input.observedCorrelation ?? []),
  observedOrdering: uniqueStrings(input.observedOrdering ?? []),
  forbiddenToolNames: uniqueStrings(input.forbiddenToolNames ?? []),
  forbiddenEvents: uniqueStrings(input.forbiddenEvents ?? []),
  forbiddenClaims: uniqueStrings(input.forbiddenClaims ?? []),
  setupEvidenceCodes: uniqueStrings(input.setupEvidenceCodes ?? []),
  evidenceRefsByCode: uniqueRefs(input.evidenceRefsByCode),
  collectorStatus: input.collectorStatus ?? null,
})

export const mutableCanonicalEvidenceObservation = (
  input: Partial<CanonicalEvidenceObservationSet> = {}
): MutableCanonicalEvidenceObservation => ({
  acceptedEvidenceCodes: [...(input.acceptedEvidenceCodes ?? [])],
  rejectedEvidenceCodes: [...(input.rejectedEvidenceCodes ?? [])],
  repairCodes: [...(input.repairCodes ?? [])],
  observedTraceSources: [...(input.observedTraceSources ?? [])],
  observedCorrelation: [...(input.observedCorrelation ?? [])],
  observedOrdering: [...(input.observedOrdering ?? [])],
  forbiddenToolNames: [...(input.forbiddenToolNames ?? [])],
  forbiddenEvents: [...(input.forbiddenEvents ?? [])],
  forbiddenClaims: [...(input.forbiddenClaims ?? [])],
  setupEvidenceCodes: [...(input.setupEvidenceCodes ?? [])],
  evidenceRefsByCode: uniqueRefs(input.evidenceRefsByCode),
  collectorStatus: input.collectorStatus ?? null,
})

export const addCanonicalEvidenceCode = (
  observations: MutableCanonicalEvidenceObservation,
  code: string,
  evidenceRefs: readonly string[] = [code]
): void => {
  observations.acceptedEvidenceCodes.push(code)
  observations.evidenceRefsByCode[code] = uniqueStrings([
    ...(observations.evidenceRefsByCode[code] ?? []),
    ...evidenceRefs,
  ])
}

export const addCanonicalRejectedEvidenceCode = (
  observations: MutableCanonicalEvidenceObservation,
  code: string,
  evidenceRefs: readonly string[] = [code]
): void => {
  observations.rejectedEvidenceCodes.push(code)
  observations.evidenceRefsByCode[code] = uniqueStrings([
    ...(observations.evidenceRefsByCode[code] ?? []),
    ...evidenceRefs,
  ])
}

export const finalizeCanonicalEvidenceObservation = (
  observations: MutableCanonicalEvidenceObservation
): CanonicalEvidenceObservationSet => canonicalEvidenceObservation(observations)
