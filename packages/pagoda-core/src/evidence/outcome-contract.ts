export type EvidenceScenarioStatus =
  | "PASS"
  | "FAIL"
  | "SETUP_FAILED"
  | "OBSERVABILITY_FAILED"
  | "SCENARIO_INVALID"

export type EvidenceClauseStatus = "PASSED" | "FAILED" | "MISSING"

export type EvidenceClauseResult = {
  readonly clause: string
  readonly status: EvidenceClauseStatus
  readonly evidenceRefs: readonly string[]
}

const statusPriority: Record<EvidenceScenarioStatus, number> = {
  SCENARIO_INVALID: 5,
  SETUP_FAILED: 4,
  OBSERVABILITY_FAILED: 3,
  FAIL: 2,
  PASS: 1,
}

export const aggregateEvidenceStatus = (
  statuses: readonly EvidenceScenarioStatus[]
): EvidenceScenarioStatus => {
  if (statuses.length === 0) return "SCENARIO_INVALID"
  return statuses.reduce((current, next) =>
    statusPriority[next] > statusPriority[current] ? next : current
  )
}

export const clausePassed = (
  clause: string,
  evidenceRefs: readonly string[]
): EvidenceClauseResult => ({
  clause,
  status: "PASSED",
  evidenceRefs,
})

export const clauseFailed = (
  clause: string,
  evidenceRefs: readonly string[] = []
): EvidenceClauseResult => ({
  clause,
  status: "FAILED",
  evidenceRefs,
})

export const clauseMissing = (clause: string): EvidenceClauseResult => ({
  clause,
  status: "MISSING",
  evidenceRefs: [],
})
